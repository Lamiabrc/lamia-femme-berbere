/*!
 * LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
// Nouveautés de la Maison : fil public (/nouveautes/) et notifications des membres, chaque type avec sa couleur.
// Les produits mis en vente s'ajoutent tout seuls ; Lamia publie elle-même ses articles, actus et lives.
import { DATABASE_URL, serviceHeaders, json } from './event-tickets.mjs';
import { envoyerPush, genererClesVapid } from './webpush.mjs';

export const TYPES = {
  boutique: { nom: 'Nouveauté boutique', emoji: '', couleur: '#C9BCE8' },
  article: { nom: 'Nouvel article', emoji: '', couleur: '#6C5BA7' },
  actu: { nom: 'Actu de Lamia', emoji: '', couleur: '#2e9d5b' },
  live: { nom: 'Live', emoji: '', couleur: '#c8213f' },
};
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const lienPropre = (v) => { const l = clean(v, 300); return /^\/[\w\-/.#?=&%]*$/.test(l) || /^https:\/\/[\w.-]+\//.test(l) ? l : null; };

function base(env, fetcher) {
  const call = (path, init = {}) => fetcher(`${DATABASE_URL}${path}`, { ...init, headers: serviceHeaders(env, init.headers), signal: AbortSignal.timeout(8000) });
  const read = async (path) => { const r = await call(path); if (!r.ok) throw new Error(`read ${r.status}`); return r.json(); };
  return { call, read };
}

// Envoie les nouveautés pas encore envoyées : une notification par type (regroupée s'il y en a plusieurs).
export async function envoyerNouveautes({ env = process.env, fetcher = fetch, now = () => new Date(), ids = null } = {}) {
  const { call, read } = base(env, fetcher);
  const filtre = ids?.length ? `id=in.(${ids.join(',')})` : 'envoyee_at=is.null';
  const items = await read(`/rest/v1/nouveautes?${filtre}&order=created_at.asc&limit=100`);
  if (!items.length) return { envoyes: 0, nouveautes: 0 };
  // Les membres abonnés, et aussi les appareils de Lamia (pour qu'elle voie ce que reçoivent ses membres).
  // Les appareils de Lamia ne reçoivent ses propres nouveautés que si elle l'a choisi (tableau de bord › Application).
  const [ln] = await read('/rest/v1/platform_settings?key=eq.lamia_notifs&select=value').catch(() => []);
  const pour = ln?.value?.nouveautes === true ? 'in.(membre,lamia)' : 'eq.membre';
  const subs = await read(`/rest/v1/push_subscriptions?pour=${pour}&select=id,endpoint,p256dh,auth,prefs`).catch(() => []);
  const [k] = await read('/rest/v1/platform_settings?key=eq.vapid&select=value').catch(() => []);
  let keys = k?.value;
  if (!keys?.publicKey || !keys?.privateJwk) { keys = genererClesVapid(); await call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'vapid', value: keys, updated_at: now().toISOString() }) }).catch(() => {}); }
  let envoyes = 0;
  const parType = {};
  for (const it of items) (parType[it.type] ||= []).push(it);
  for (const [type, liste] of Object.entries(parType)) {
    const t = TYPES[type] || TYPES.actu;
    const un = liste.length === 1 ? liste[0] : null;
    const titre = un ? `${t.emoji} ${t.nom} · ${un.titre}` : `${t.emoji} ${liste.length} nouveautés : ${t.nom.toLowerCase()}`;
    const texte = un ? (un.texte || 'Découvre-la sur le site de Lamia.') : liste.slice(0, 3).map((x) => x.titre).join(' · ');
    const url = un?.lien || `/nouveautes/#${type}`;
    for (const s of subs) {
      if (s.prefs && s.prefs[type] === false) continue;
      const r = await envoyerPush({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, { title: titre.slice(0, 120), body: texte.slice(0, 200), url, tag: `nouveaute-${type}-${Date.now()}`, icon: `/images/marque/notif-${type}.png` }, keys, { fetcher }).catch(() => ({ ok: false }));
      if (r.ok) envoyes += 1;
      if (r.gone) call(`/rest/v1/push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }).catch(() => {});
    }
    await call(`/rest/v1/nouveautes?id=in.(${liste.map((x) => x.id).join(',')})`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ envoyee_at: now().toISOString(), nb_envoyes: envoyes }) }).catch(() => {});
  }
  return { envoyes, nouveautes: items.length };
}

// Actions : fil public, publication par Lamia, envoi des nouveautés en attente, choix des notifications d'un membre.
export async function actionNouveautes(action, b, { env = process.env, fetcher = fetch, now = () => new Date(), admin = false, user = null } = {}) {
  const { call, read } = base(env, fetcher);
  if (action === 'annonce_nouveautes') {
    const liste = await read('/rest/v1/nouveautes?select=id,type,titre,texte,lien,image,created_at&order=created_at.desc&limit=40').catch(() => []);
    return json({ ok: true, nouveautes: liste, types: TYPES });
  }
  // Bandeau du site : les soirées des prochaines 48 h, salon par salon, avec les places qui restent.
  if (action === 'annonce_places_bal') {
    const t = now(), fin = new Date(t.getTime() + 48 * 3600e3).toISOString();
    const evs = await read(`/rest/v1/speed_dating_events?status=in.(published,sold_out)&sur_invitation=eq.false&ends_at=gte.${encodeURIComponent(t.toISOString())}&starts_at=lte.${encodeURIComponent(fin)}&select=id,slug,title,audience,starts_at,ends_at,capacity,ticket_price_cents,status&order=starts_at`).catch(() => []);
    if (!evs.length) return json({ ok: true, soirees: [] });
    const ins = await read(`/rest/v1/event_registrations?event_id=in.(${evs.map((e) => e.id).join(',')})&attendance_status=neq.cancelled&select=event_id`).catch(() => []);
    return json({ ok: true, soirees: evs.map((e) => ({ titre: e.title, salon: e.audience, debut: e.starts_at, fin: e.ends_at, gratuit: !e.ticket_price_cents, complet: e.status === 'sold_out', places: Math.max(0, (e.capacity || 0) - ins.filter((x) => x.event_id === e.id).length) })) });
  }
  if (action === 'annonce_notif_prefs') {
    if (!user) return json({ error: 'login_required' }, 401);
    const endpoint = clean(b.endpoint, 1000);
    const prefs = Object.fromEntries(Object.keys(TYPES).map((t) => [t, b.prefs?.[t] !== false]));
    if (endpoint) await call(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${user.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ prefs }) });
    return json({ ok: true, prefs });
  }
  if (!admin) return json({ error: 'forbidden' }, 403);
  if (action === 'annonce_nouveautes_admin') {
    const liste = await read('/rest/v1/nouveautes?select=*&order=created_at.desc&limit=40').catch(() => []);
    const [{ count } = {}] = await read('/rest/v1/push_subscriptions?pour=eq.membre&select=count').catch(() => [{}]);
    return json({ ok: true, nouveautes: liste, abonnes: count || 0, types: TYPES });
  }
  if (action === 'annonce_nouveaute_publier') {
    const type = TYPES[b.type] ? b.type : null, titre = clean(b.titre, 140);
    if (!type || !titre) return json({ error: 'bad_request' }, 400);
    const r = await call('/rest/v1/nouveautes', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ type, titre, texte: clean(b.texte, 600) || null, lien: lienPropre(b.lien), source: 'lamia' }) });
    if (!r.ok) return json({ error: 'temporary_failure' }, 502);
    const [n] = await r.json();
    const envoi = b.envoyer === false ? { envoyes: 0 } : await envoyerNouveautes({ env, fetcher, now, ids: [n.id] });
    return json({ ok: true, nouveaute: n, ...envoi });
  }
  if (action === 'annonce_nouveautes_envoyer') return json({ ok: true, ...(await envoyerNouveautes({ env, fetcher, now })) });
  if (action === 'annonce_nouveaute_suppr') {
    const id = clean(b.id, 40);
    if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'bad_request' }, 400);
    await call(`/rest/v1/nouveautes?id=eq.${id}`, { method: 'DELETE' });
    return json({ ok: true });
  }
  return json({ error: 'unknown_action' }, 400);
}
