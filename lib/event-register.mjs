// Inscription directe à une soirée gratuite, sans email de confirmation.
//
// Pourquoi : pendant le live, l'inscription par compte a buté sur la limite d'emails
// de Supabase et sur des liens de confirmation qui renvoyaient vers localhost.
// Ici, tout se fait côté serveur avec la clé de service (jamais dans le navigateur) :
//  1. on crée (ou retrouve) le compte de la personne, déjà confirmé ;
//  2. on complète son profil membre sans écraser ce qui existe déjà ;
//  3. on enregistre sa place, sans doublon (event_id + user_id).
// Seules les soirées publiées, gratuites et à venir sont concernées.

import { DATABASE_URL, json, serviceHeaders } from './event-tickets.mjs';

const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const GENDERS = new Set(['femme', 'homme']);
// Où la personne cherche son ou sa partenaire.
export const SEARCH_ZONES = { ville: 'Ma ville et alentours', region: 'Ma région', france: 'Toute la France', europe: 'France et Europe', algerie: 'En Algérie', monde: 'Peu importe' };
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

export function ageOn(birth, at) {
  const b = new Date(`${birth}T12:00:00Z`), d = new Date(at);
  let a = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) a--;
  return a;
}

function randomPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)) + 'aA1!';
}

export async function registerForEvent(request, { env = process.env, fetcher = fetch, now = () => new Date() } = {}) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return json({ error: 'not_configured' }, 503);

  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  if (b?.website) return json({ status: 'registered' }); // pot de miel : les robots croient avoir réussi

  const email = clean(b.email, 254).toLowerCase();
  const firstName = clean(b.first_name, 60);
  const gender = clean(b.gender, 10);
  const city = clean(b.city, 80);
  const birth = clean(b.birth_date, 10);
  const eventId = clean(b.event_id, 36);
  const zone = clean(b.search_zone, 10);

  if (!UUID.test(eventId)) return json({ error: 'bad_request' }, 400);
  if (!EMAIL.test(email)) return json({ error: 'invalid_email' }, 400);
  if (!firstName) return json({ error: 'missing_name' }, 400);
  if (!GENDERS.has(gender)) return json({ error: 'missing_gender' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || Number.isNaN(Date.parse(birth))) return json({ error: 'invalid_birth_date' }, 400);
  if (!city) return json({ error: 'missing_city' }, 400);
  if (!SEARCH_ZONES[zone]) return json({ error: 'missing_zone' }, 400);
  if (b.rules_accepted !== true) return json({ error: 'rules_required' }, 400);

  const h = (extra) => serviceHeaders(env, extra);
  const call = (path, init = {}) => fetcher(`${DATABASE_URL}${path}`, { ...init, headers: h(init.headers), signal: AbortSignal.timeout(10000) });

  // La soirée : publiée, gratuite, à venir, avec des places.
  const evRes = await call(`/rest/v1/speed_dating_events?id=eq.${eventId}&select=id,title,audience,starts_at,capacity,ticket_price_cents,status,min_age,max_age`);
  if (!evRes.ok) throw new Error('event_read_failed');
  const [ev] = await evRes.json();
  if (!ev || ev.status !== 'published') return json({ error: 'event_unavailable' }, 409);
  if (ev.ticket_price_cents > 0) return json({ error: 'paid_event' }, 409);
  if (new Date(ev.starts_at) <= now()) return json({ error: 'event_past' }, 409);

  const age = ageOn(birth, ev.starts_at);
  if (age < 18) return json({ error: 'too_young' }, 400);
  if (age > 99) return json({ error: 'invalid_birth_date' }, 400);
  if ((ev.min_age && age < ev.min_age) || (ev.max_age && age > ev.max_age)) return json({ error: 'age_out_of_range', min_age: ev.min_age, max_age: ev.max_age }, 409);

  // 1. Le compte : créé déjà confirmé, ou retrouvé s'il existe.
  let userId = null;
  const created = await call('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password: randomPassword(), email_confirm: true, user_metadata: { first_name: firstName, city, search_zone: zone, source: 'inscription-soiree' } }),
  });
  if (created.ok) {
    userId = (await created.json()).id;
  } else if (created.status === 422 || created.status === 400) {
    // Le compte existe : generate_link renvoie l'utilisateur sans envoyer d'email.
    const link = await call('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email }) });
    if (!link.ok) throw new Error('user_lookup_failed');
    const data = await link.json();
    const user = data.user || data;
    userId = user.id;
    if (UUID.test(userId || '')) {
      const update = { user_metadata: { ...(user.user_metadata || {}), city, search_zone: zone } };
      if (!user.email_confirmed_at) update.email_confirm = true;
      await call(`/auth/v1/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify(update) }).catch(() => {});
    }
  } else {
    throw new Error(`user_create_failed_${created.status}`);
  }
  if (!UUID.test(userId || '')) throw new Error('user_id_missing');

  // Déjà inscrite ? (avant de compter les places, pour ne pas bloquer une personne déjà inscrite)
  const mine = await call(`/rest/v1/event_registrations?event_id=eq.${eventId}&user_id=eq.${userId}&select=attendance_status`);
  const already = mine.ok ? (await mine.json())[0] : null;
  if (already && already.attendance_status !== 'cancelled') return json({ status: 'registered', title: ev.title, salon: ev.audience || null, starts_at: ev.starts_at }); // même réponse : on ne révèle pas qui est inscrit

  const count = await call(`/rest/v1/event_registrations?event_id=eq.${eventId}&attendance_status=neq.cancelled&select=user_id`, { headers: { Prefer: 'count=exact', Range: '0-0' } });
  const taken = Number((count.headers.get('content-range') || '*/0').split('/')[1]) || 0;
  if (ev.capacity && taken >= ev.capacity) return json({ error: 'event_full' }, 409);

  // Une seule place par soirée : si la personne était dans un autre salon de la même soirée, on l'y libère.
  const siblings = await call(`/rest/v1/speed_dating_events?title=eq.${encodeURIComponent(ev.title)}&starts_at=eq.${encodeURIComponent(ev.starts_at)}&id=neq.${eventId}&select=id`);
  const otherIds = siblings.ok ? (await siblings.json()).map((x) => x.id).filter((id) => UUID.test(id)) : [];
  if (otherIds.length) {
    await call(`/rest/v1/event_registrations?user_id=eq.${userId}&event_id=in.(${otherIds.join(',')})&attendance_status=eq.registered`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ attendance_status: 'cancelled' }),
    }).catch(() => {});
  }

  // 2. Le profil : on complète seulement les champs vides (on n'écrase jamais un profil existant).
  const pr = await call(`/rest/v1/member_profiles?user_id=eq.${userId}&select=user_id,display_name,real_first_name,gender,birth_date,city,community_rules_accepted_at`);
  const existing = pr.ok ? (await pr.json())[0] : null;
  const wanted = { display_name: firstName, real_first_name: firstName, gender, birth_date: birth, city: city || null, community_rules_accepted_at: now().toISOString() };
  if (!existing) {
    const ins = await call('/rest/v1/member_profiles', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ user_id: userId, ...wanted }) });
    if (!ins.ok) throw new Error('profile_failed');
  } else {
    const patch = Object.fromEntries(Object.entries(wanted).filter(([k, v]) => v && !existing[k]));
    if (Object.keys(patch).length) {
      await call(`/rest/v1/member_profiles?user_id=eq.${userId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }).catch(() => {});
    }
  }

  // 3. La place.
  const reg = already
    ? await call(`/rest/v1/event_registrations?event_id=eq.${eventId}&user_id=eq.${userId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ attendance_status: 'registered' }) })
    : await call('/rest/v1/event_registrations?on_conflict=event_id,user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ event_id: eventId, user_id: userId, payment_status: 'waived', attendance_status: 'registered' }),
    });
  if (!reg.ok) throw new Error('registration_failed');
  return json({ status: 'registered', title: ev.title, salon: ev.audience || null, starts_at: ev.starts_at });
}
