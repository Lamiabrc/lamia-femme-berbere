// Les comptes du site, vus et gérés par Lamia depuis son tableau de bord (onglet « Comptes »).
// Chaque compte : son profil (prénom, genre, date de naissance, ville…), ses inscriptions aux soirées,
// ses annonces et ses fiches de l'outil. Réservé au rôle admin (vérifié dans handleAdmin avant l'appel).

const UUID = /^[0-9a-f-]{36}$/i;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
export const GENRES = ['femme', 'homme'];
export const STATUTS_PROFIL = ['draft', 'active', 'paused', 'suspended'];
const STATUTS_INSCRIPTION = ['registered', 'cancelled'];

// Une date de naissance AAAA-MM-JJ réelle, entre 18 et 110 ans.
export function dateNaissance(v, now = new Date()) {
  const s = clean(v, 10);
  if (!s) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false };
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return { ok: false };
  const age = (now.getTime() - d.getTime()) / (365.25 * 864e5);
  if (age < 18 || age > 110) return { ok: false };
  return { ok: true, value: s };
}

// Ce que Lamia peut modifier dans un profil. Seuls les champs envoyés changent.
export function profilPropre(b, now = new Date()) {
  const p = {};
  if ('real_first_name' in b) p.real_first_name = clean(b.real_first_name, 60) || null;
  if ('display_name' in b) p.display_name = clean(b.display_name, 60) || null;
  if ('city' in b) p.city = clean(b.city, 80) || null;
  if ('country' in b) p.country = clean(b.country, 80) || null;
  if ('gender' in b) {
    const g = clean(b.gender, 10);
    if (g && !GENRES.includes(g)) return { erreur: 'genre' };
    p.gender = g || null;
  }
  if ('profile_status' in b) {
    const s = clean(b.profile_status, 12);
    if (!STATUTS_PROFIL.includes(s)) return { erreur: 'statut' };
    p.profile_status = s;
  }
  if ('birth_date' in b) {
    const d = dateNaissance(b.birth_date, now);
    if (!d.ok) return { erreur: 'naissance' };
    p.birth_date = d.value;
  }
  return { profil: p };
}

// Assemble la fiche de chaque compte à partir des tables.
export function assembler({ users, profils, inscriptions, soirees, annonces, fiches }) {
  const ev = new Map(soirees.map((e) => [e.id, e]));
  const parUser = (list, key = 'user_id') => list.reduce((m, x) => { if (x[key]) { if (!m.has(x[key])) m.set(x[key], []); m.get(x[key]).push(x); } return m; }, new Map());
  const prof = new Map(profils.map((p) => [p.user_id, p]));
  const ins = parUser(inscriptions), fic = parUser(fiches);
  const annUser = parUser(annonces);
  const annMail = annonces.reduce((m, a) => { const k = String(a.email || '').toLowerCase(); if (k) { if (!m.has(k)) m.set(k, []); m.get(k).push(a); } return m; }, new Map());
  return users.map((u) => {
    const p = prof.get(u.id) || null;
    const mail = String(u.email || '').toLowerCase();
    const ann = [...new Map([...(annUser.get(u.id) || []), ...(annMail.get(mail) || [])].map((a) => [a.ref, a])).values()];
    return {
      id: u.id,
      email: u.email || null,
      cree_le: u.created_at || null,
      vu_le: u.last_sign_in_at || null,
      email_confirme: Boolean(u.email_confirmed_at),
      admin: u.app_metadata?.role === 'admin',
      source: u.user_metadata?.source_inscription || null,
      // Le prénom peut être dans le profil, dans l'inscription ou dans l'annonce : on prend le premier trouvé.
      prenom: p?.real_first_name || p?.display_name || u.user_metadata?.first_name || ann.find((a) => a.prenom)?.prenom || null,
      profil: p && {
        real_first_name: p.real_first_name, display_name: p.display_name, gender: p.gender, birth_date: p.birth_date,
        city: p.city, country: p.country, profile_status: p.profile_status,
      },
      inscriptions: (ins.get(u.id) || []).map((r) => {
        const e = ev.get(r.event_id) || {};
        return { event_id: r.event_id, titre: e.title || 'Soirée', salon: e.audience || null, date: e.starts_at || null, statut: r.attendance_status, paiement: r.payment_status };
      }).sort((a, c) => String(c.date).localeCompare(String(a.date))),
      annonces: ann.map((a) => ({ ref: a.ref, status: a.status, test: Boolean(a.test) })),
      fiches: (fic.get(u.id) || []).map((f) => ({ ref: f.ref, retiree: Boolean(f.retire_at), confirmee: Boolean(f.confirme_at) })),
    };
  }).sort((a, c) => String(c.cree_le).localeCompare(String(a.cree_le)));
}

export async function handleComptes(action, b, { call, read, json, now = () => new Date() }) {
  if (action === 'comptes_liste') {
    const users = [];
    for (let page = 1; page <= 10; page++) {
      const r = await call(`/auth/v1/admin/users?page=${page}&per_page=500`);
      if (!r.ok) break;
      const list = (await r.json()).users || [];
      users.push(...list);
      if (list.length < 500) break;
    }
    const [profils, inscriptions, soirees, annonces, fiches] = await Promise.all([
      read('/rest/v1/member_profiles?select=user_id,real_first_name,display_name,gender,birth_date,city,country,profile_status'),
      read('/rest/v1/event_registrations?select=user_id,event_id,attendance_status,payment_status'),
      read('/rest/v1/speed_dating_events?select=id,title,audience,starts_at,status,ticket_price_cents&order=starts_at.desc&limit=200'),
      read('/rest/v1/annonces?select=ref,status,user_id,email,test,prenom'),
      read('/rest/v1/profils_outil?select=ref,user_id,confirme_at,retire_at&user_id=not.is.null'),
    ]);
    const limite = new Date(now().getTime() - 864e5).toISOString();
    return json({
      comptes: assembler({ users, profils, inscriptions, soirees, annonces, fiches }),
      // Soirées où Lamia peut inscrire quelqu'un à la main : publiées ou en brouillon, pas encore passées.
      soirees: soirees.filter((e) => e.starts_at >= limite && ['published', 'draft', 'sold_out'].includes(e.status))
        .map((e) => ({ id: e.id, titre: e.title, salon: e.audience, date: e.starts_at, statut: e.status })).reverse(),
    });
  }

  const userId = clean(b.user_id, 36);
  if (!UUID.test(userId)) return json({ error: 'bad_request' }, 400);
  const existe = await call(`/auth/v1/admin/users/${userId}`);
  if (!existe.ok) return json({ error: 'compte_introuvable' }, 404);

  // Le profil doit exister avant une modification ou une inscription (lien obligatoire en base).
  const assurerProfil = () => call('/rest/v1/member_profiles?on_conflict=user_id', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ user_id: userId }),
  });

  if (action === 'comptes_modifier') {
    const { profil, erreur } = profilPropre(b.profil || {}, now());
    if (erreur) return json({ error: `bad_${erreur}` }, 400);
    if (!Object.keys(profil).length) return json({ ok: true });
    await assurerProfil();
    const r = await call(`/rest/v1/member_profiles?user_id=eq.${userId}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ...profil, updated_at: now().toISOString() }),
    });
    if (!r.ok) return json({ error: 'save_failed' }, 502);
    return json({ ok: true });
  }

  if (action === 'comptes_inscription') {
    const eventId = clean(b.event_id, 36), statut = clean(b.statut, 12);
    if (!UUID.test(eventId) || !STATUTS_INSCRIPTION.includes(statut)) return json({ error: 'bad_request' }, 400);
    const [ev] = await read(`/rest/v1/speed_dating_events?id=eq.${eventId}&select=id,ticket_price_cents`);
    if (!ev) return json({ error: 'event_unavailable' }, 404);
    // Inscription existante : on ne change que la présence. Sinon on la crée (offerte par Lamia).
    const r = await call(`/rest/v1/event_registrations?event_id=eq.${eventId}&user_id=eq.${userId}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ attendance_status: statut }),
    });
    const maj = r.ok ? await r.json() : [];
    if (!maj.length) {
      if (statut === 'cancelled') return json({ ok: true });
      await assurerProfil();
      const c = await call('/rest/v1/event_registrations', {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ event_id: eventId, user_id: userId, attendance_status: 'registered', payment_status: 'waived' }),
      });
      if (!c.ok) return json({ error: 'save_failed' }, 502);
    }
    return json({ ok: true });
  }

  return json({ error: 'bad_request' }, 400);
}
