// La salle du Bal masqué : grand salon, tête-à-tête tournants et souhaits de fin de bal.
//
// Vidéo : Daily (clé DAILY_API_KEY, uniquement côté serveur).
// État du bal : une ligne privée platform_settings « bal_state », écrite seulement par Lamia (admin).
// Participants : ils entrent avec leur email et leur date de naissance ; le serveur vérifie
// leur inscription et leur remet un laissez-passer signé (HMAC), valable pour la soirée.
// Souhaits : une ligne platform_settings par personne (« bal_wish:<uid> »), donc pas de conflit d'écriture.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DATABASE_URL, json, serviceHeaders, userFromRequest, isAdmin } from './event-tickets.mjs';

const DAILY = 'https://api.daily.co/v1';
const STATE_KEY = 'bal_state';
const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

// ------------------------------------------------------------------ outils

function secret(env) {
  const base = env.BAL_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || '';
  return createHmac('sha256', 'bal-masque').update(base).digest();
}
const b64 = (buf) => Buffer.from(buf).toString('base64url');

export function signPass(env, payload) {
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(createHmac('sha256', secret(env)).update(body).digest())}`;
}
export function readPass(env, token, now = Date.now()) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || body.length > 2000) return null;
  const want = createHmac('sha256', secret(env)).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    return p.exp > now ? p : null;
  } catch { return null; }
}

function db(env, fetcher) {
  return (path, init = {}) => fetcher(`${DATABASE_URL}${path}`, { ...init, headers: serviceHeaders(env, init.headers), signal: AbortSignal.timeout(10000) });
}
function daily(env, fetcher) {
  return async (path, init = {}) => {
    const res = await fetcher(`${DAILY}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.DAILY_API_KEY}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(10000),
    });
    return res;
  };
}

async function loadState(call) {
  const r = await call(`/rest/v1/platform_settings?key=eq.${STATE_KEY}&select=value`);
  if (!r.ok) throw new Error('state_read_failed');
  return (await r.json())[0]?.value || null;
}
async function saveState(call, state) {
  const r = await call('/rest/v1/platform_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: STATE_KEY, value: state, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error('state_write_failed');
}

async function ensureRoom(api, name, { exp, max }) {
  const r = await api('/rooms', {
    method: 'POST',
    body: JSON.stringify({ name, privacy: 'private', properties: { exp, max_participants: max, enable_chat: false, eject_at_room_exp: true, enable_prejoin_ui: false } }),
  });
  if (r.ok) return r.json();
  const again = await api(`/rooms/${encodeURIComponent(name)}`);
  if (again.ok) return again.json();
  throw new Error(`room_failed_${r.status}`);
}

async function meetingToken(api, props) {
  const r = await api('/meeting-tokens', { method: 'POST', body: JSON.stringify({ properties: props }) });
  if (!r.ok) throw new Error(`token_failed_${r.status}`);
  return (await r.json()).token;
}

// Les inscrits de la soirée (tous salons), avec prénom et genre.
async function roster(call, eventIds) {
  const ids = eventIds.filter((x) => UUID.test(x));
  if (!ids.length) return [];
  const r = await call(`/rest/v1/event_registrations?event_id=in.(${ids.join(',')})&attendance_status=neq.cancelled&select=user_id,event_id`);
  const regs = r.ok ? await r.json() : [];
  if (!regs.length) return [];
  const p = await call(`/rest/v1/member_profiles?user_id=in.(${regs.map((x) => x.user_id).join(',')})&select=user_id,real_first_name,display_name,gender`);
  const prof = new Map((p.ok ? await p.json() : []).map((x) => [x.user_id, x]));
  return regs.map((x) => {
    const pr = prof.get(x.user_id) || {};
    return { uid: x.user_id, ev: x.event_id, name: pr.real_first_name || pr.display_name || 'Masque', gender: pr.gender || null };
  });
}

// ------------------------------------------------------------------ les tours de tête-à-tête

// Dans chaque salon, on forme des paires femme-homme qui ne se sont pas encore rencontrées.
export function pairRound(present, metPairs, rand = Math.random) {
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const key = (a, b) => [a, b].sort().join('|');
  const met = new Set(metPairs);
  const pairs = [], waiting = [];
  const bySalon = new Map();
  for (const p of present) { if (!bySalon.has(p.ev)) bySalon.set(p.ev, []); bySalon.get(p.ev).push(p); }
  for (const people of bySalon.values()) {
    const women = shuffle(people.filter((p) => p.gender === 'femme'));
    const men = shuffle(people.filter((p) => p.gender === 'homme'));
    const used = new Set();
    // Les personnes qui ont le moins de choix passent en premier.
    const [few, many] = women.length <= men.length ? [women, men] : [men, women];
    for (const a of few) {
      const b = many.find((m) => !used.has(m.uid) && !met.has(key(a.uid, m.uid)));
      if (b) { used.add(b.uid); pairs.push([a, b]); } else waiting.push(a);
    }
    for (const m of many) if (!used.has(m.uid)) waiting.push(m);
    for (const p of people) if (p.gender !== 'femme' && p.gender !== 'homme') waiting.push(p);
  }
  return { pairs, waiting };
}

// ------------------------------------------------------------------ point d'entrée

export async function handleBal(request, { env = process.env, fetcher = fetch, now = () => new Date() } = {}) {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return json({ error: 'not_configured' }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const action = clean(b?.action, 20);
  const call = db(env, fetcher);
  const api = daily(env, fetcher);
  const t = now().getTime();

  // ---------------------------------------------------------------- participants
  if (action === 'enter') {
    const email = clean(b.email, 254).toLowerCase();
    const birth = clean(b.birth_date, 10);
    if (!EMAIL.test(email) || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return json({ error: 'bad_request' }, 400);
    const state = await loadState(call);
    if (!state?.open) return json({ error: 'bal_closed' }, 409);
    // Retrouver le compte sans envoyer d'email (le lien de récupération n'est pas transmis).
    const link = await call('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'recovery', email }) });
    if (!link.ok) return json({ error: 'not_registered' }, 404);
    const data = await link.json();
    const uid = (data.user || data).id;
    if (!UUID.test(uid || '')) return json({ error: 'not_registered' }, 404);
    const ids = Object.keys(state.soiree.events);
    const reg = await call(`/rest/v1/event_registrations?user_id=eq.${uid}&event_id=in.(${ids.join(',')})&attendance_status=neq.cancelled&select=event_id`);
    const mine = reg.ok ? (await reg.json())[0] : null;
    if (!mine) return json({ error: 'not_registered' }, 404);
    const pr = await call(`/rest/v1/member_profiles?user_id=eq.${uid}&select=real_first_name,display_name,gender,birth_date`);
    const prof = (pr.ok ? (await pr.json())[0] : null) || {};
    if (prof.birth_date && prof.birth_date !== birth) return json({ error: 'not_registered' }, 404); // même réponse : on ne révèle rien
    const name = prof.real_first_name || prof.display_name || 'Masque';
    const pass = signPass(env, { uid, ev: mine.event_id, name, g: prof.gender || null, s: state.session, exp: t + 8 * 3600e3 });
    return json({ pass, name, salon: state.soiree.events[mine.event_id] || null });
  }

  if (action === 'state' || action === 'join' || action === 'wish') {
    const pass = readPass(env, b.pass, t);
    if (!pass) return json({ error: 'pass_invalid' }, 401);
    const state = await loadState(call);
    if (!state?.open || state.session !== pass.s) return json({ error: 'bal_closed' }, 409);
    const a = state.assign?.[pass.uid];
    const inTat = state.phase === 'tour' && a && Date.parse(a.ends_at) > t;
    const where = inTat ? 'tat' : state.phase === 'tour' && !a ? 'attente' : 'grand';
    const key = inTat ? `tat:${a.room}` : `grand:${state.grand.name}`;

    if (action === 'state') {
      return json({
        phase: state.phase, round: state.round || 0, where, key,
        ends_at: inTat ? a.ends_at : state.phase === 'tour' ? state.ends_at : null,
        partner: inTat ? a.partner : null,
        met: state.phase === 'fin' ? (state.met?.[pass.uid] || []) : undefined,
        server_time: now().toISOString(),
      });
    }

    if (action === 'join') {
      if (!env.DAILY_API_KEY) return json({ error: 'video_not_configured' }, 503);
      const room = inTat ? { name: a.room, url: a.url } : state.grand;
      const exp = Math.floor((inTat ? Date.parse(a.ends_at) + 60e3 : t + 6 * 3600e3) / 1000);
      const token = await meetingToken(api, { room_name: room.name, user_id: pass.uid, user_name: pass.name, exp, eject_at_token_exp: inTat, is_owner: false, enable_screenshare: false });
      return json({ url: room.url, token, key });
    }

    // Souhaits de fin de bal : uniquement parmi les personnes rencontrées.
    const metIds = new Set((state.met?.[pass.uid] || []).map((m) => m.uid));
    const wished = (Array.isArray(b.wished) ? b.wished : []).filter((x) => metIds.has(x)).slice(0, 50);
    const r = await call('/rest/v1/platform_settings?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: `bal_wish:${state.session}:${pass.uid}`, value: { uid: pass.uid, name: pass.name, ev: pass.ev, wished, message: clean(b.message, 500) || null, at: now().toISOString() } }),
    });
    if (!r.ok) throw new Error('wish_failed');
    return json({ ok: true, count: wished.length });
  }

  // ---------------------------------------------------------------- Lamia, maîtresse du bal
  const user = await userFromRequest(request, { fetcher });
  if (!isAdmin(user)) return json({ error: 'forbidden' }, 403);
  if (!env.DAILY_API_KEY && action !== 'admin_state') return json({ error: 'video_not_configured' }, 503);
  let state = await loadState(call);

  if (action === 'open') {
    const eventId = clean(b.event_id, 36);
    if (!UUID.test(eventId)) return json({ error: 'bad_request' }, 400);
    const er = await call(`/rest/v1/speed_dating_events?id=eq.${eventId}&select=title,starts_at`);
    const [ev] = er.ok ? await er.json() : [];
    if (!ev) return json({ error: 'event_unavailable' }, 404);
    const sib = await call(`/rest/v1/speed_dating_events?title=eq.${encodeURIComponent(ev.title)}&starts_at=eq.${encodeURIComponent(ev.starts_at)}&select=id,audience`);
    const events = Object.fromEntries((sib.ok ? await sib.json() : []).map((x) => [x.id, x.audience || 'Salon unique']));
    const session = randomBytes(3).toString('hex');
    const grand = await ensureRoom(api, `bal-${session}-grand`, { exp: Math.floor(t / 1000) + 8 * 3600, max: 200 });
    state = { open: true, session, phase: 'accueil', soiree: { title: ev.title, starts_at: ev.starts_at, events }, grand: { name: grand.name, url: grand.url }, round: 0, ends_at: null, assign: {}, met: {}, history: [], opened_at: now().toISOString() };
    await saveState(call, state);
  } else if (action === 'round') {
    if (!state?.open) return json({ error: 'bal_closed' }, 409);
    const minutes = Math.min(15, Math.max(2, Number(b.minutes) || 6));
    const pres = await api('/presence');
    const rooms = pres.ok ? await pres.json() : {};
    const here = new Set();
    for (const [name, list] of Object.entries(rooms)) if (name.startsWith(`bal-${state.session}-`)) for (const p of list) if (p.userId) here.add(p.userId);
    const everyone = await roster(call, Object.keys(state.soiree.events));
    const present = everyone.filter((p) => here.has(p.uid));
    const { pairs, waiting } = pairRound(present, state.history || []);
    const round = (state.round || 0) + 1;
    const ends = new Date(t + minutes * 60e3 + 15e3).toISOString(); // 15 s pour rejoindre la salle
    const assign = {};
    let i = 0;
    for (const [x, y] of pairs) {
      i++;
      const room = await ensureRoom(api, `bal-${state.session}-r${round}-${String(i).padStart(2, '0')}`, { exp: Math.floor(Date.parse(ends) / 1000) + 120, max: 3 });
      assign[x.uid] = { room: room.name, url: room.url, partner: y.name, partner_uid: y.uid, ends_at: ends };
      assign[y.uid] = { room: room.name, url: room.url, partner: x.name, partner_uid: x.uid, ends_at: ends };
      state.history = [...(state.history || []), [x.uid, y.uid].sort().join('|')];
      state.met[x.uid] = [...(state.met[x.uid] || []), { uid: y.uid, name: y.name, round }];
      state.met[y.uid] = [...(state.met[y.uid] || []), { uid: x.uid, name: x.name, round }];
    }
    Object.assign(state, { phase: 'tour', round, ends_at: ends, assign, last_round: { pairs: pairs.length, waiting: waiting.map((w) => w.name) } });
    await saveState(call, state);
  } else if (action === 'grand' || action === 'fin') {
    if (!state?.open) return json({ error: 'bal_closed' }, 409);
    Object.assign(state, { phase: action === 'fin' ? 'fin' : 'accueil', assign: {}, ends_at: null });
    await saveState(call, state);
  } else if (action === 'close') {
    if (state) { state.open = false; state.phase = 'ferme'; await saveState(call, state); }
  } else if (action === 'admin_join') {
    if (!state?.open) return json({ error: 'bal_closed' }, 409);
    const name = clean(b.room, 60) || state.grand.name;
    if (!name.startsWith(`bal-${state.session}-`)) return json({ error: 'bad_request' }, 400);
    const room = name === state.grand.name ? state.grand : Object.values(state.assign).find((x) => x.room === name);
    if (!room) return json({ error: 'bad_request' }, 400);
    const token = await meetingToken(api, { room_name: name, user_id: user.id, user_name: 'Lamia', is_owner: true, exp: Math.floor(t / 1000) + 6 * 3600 });
    return json({ url: `${room.url}?t=${encodeURIComponent(token)}` });
  } else if (action !== 'admin_state') {
    return json({ error: 'bad_request' }, 400);
  }

  // Vue d'ensemble pour Lamia
  if (!state) return json({ state: null, video: Boolean(env.DAILY_API_KEY) });
  let present = [];
  if (state.open && env.DAILY_API_KEY) {
    const pres = await api('/presence').catch(() => null);
    const rooms = pres?.ok ? await pres.json() : {};
    for (const [name, list] of Object.entries(rooms)) if (name.startsWith(`bal-${state.session}-`)) for (const p of list) present.push({ uid: p.userId, name: p.userName, room: name });
  }
  const everyone = await roster(call, Object.keys(state.soiree?.events || {}));
  const salons = Object.entries(state.soiree?.events || {}).map(([id, label]) => {
    const inscrits = everyone.filter((p) => p.ev === id);
    const ici = inscrits.filter((p) => present.some((x) => x.uid === p.uid));
    return { id, label, inscrits: inscrits.length, presents: ici.length, femmes: ici.filter((p) => p.gender === 'femme').length, hommes: ici.filter((p) => p.gender === 'homme').length };
  });
  // Souhaits et réciprocités
  let wishes = [];
  if (state.session) {
    const w = await call(`/rest/v1/platform_settings?key=like.bal_wish:${state.session}:*&select=value`);
    wishes = w.ok ? (await w.json()).map((x) => x.value) : [];
  }
  const wantsOf = new Map(wishes.map((w) => [w.uid, new Set(w.wished)]));
  const names = new Map(everyone.map((p) => [p.uid, p.name]));
  const mutual = [];
  for (const w of wishes) for (const other of w.wished) if (w.uid < other && wantsOf.get(other)?.has(w.uid)) mutual.push([{ uid: w.uid, name: names.get(w.uid) }, { uid: other, name: names.get(other) }]);
  const emailOf = async (uid) => {
    const r = await fetcher(`${DATABASE_URL}/auth/v1/admin/users/${uid}`, { headers: serviceHeaders(env), signal: AbortSignal.timeout(8000) }).catch(() => null);
    return r?.ok ? (await r.json()).email || null : null;
  };
  for (const pair of mutual.slice(0, 60)) for (const p of pair) p.email = await emailOf(p.uid);
  const tat = [...new Map(Object.values(state.assign || {}).map((x) => [x.room, x])).values()].map((x) => ({ room: x.room }));
  return json({
    video: Boolean(env.DAILY_API_KEY),
    state: { open: state.open, phase: state.phase, round: state.round, ends_at: state.ends_at, soiree: state.soiree, last_round: state.last_round || null },
    salons, present: present.length, tat, mutual, wishes_count: wishes.length,
  });
}
