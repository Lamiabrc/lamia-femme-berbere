// Bloquer et signaler un profil. Un blocage vaut dans les deux sens : les deux personnes ne se voient plus,
// ne peuvent plus se choisir et ne peuvent plus s'écrire. La personne bloquée n'en est pas prévenue.
import { json } from './event-tickets.mjs';

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const entiers = (refs) => [...new Set(refs.map(Number).filter((x) => Number.isInteger(x) && x > 0))];

// Les profils que ces références ne doivent plus voir, quel que soit le sens du blocage.
export async function refsCachees({ read }, refs) {
  const l = entiers(refs);
  if (!l.length) return new Set();
  const rows = await read(`/rest/v1/blocages?or=(auteur_ref.in.(${l.join(',')}),cible_ref.in.(${l.join(',')}))&select=auteur_ref,cible_ref&limit=2000`).catch(() => []);
  const moi = new Set(l), out = new Set();
  for (const r of rows) { if (moi.has(r.auteur_ref)) out.add(r.cible_ref); if (moi.has(r.cible_ref) && r.auteur_ref) out.add(r.auteur_ref); }
  return out;
}

export async function blocageEntre({ read }, x, y) {
  if (!(x > 0) || !(y > 0)) return false;
  const rows = await read(`/rest/v1/blocages?or=(and(auteur_ref.eq.${x},cible_ref.eq.${y}),and(auteur_ref.eq.${y},cible_ref.eq.${x}))&select=id&limit=1`).catch(() => []);
  return rows.length > 0;
}

export async function actionBlocage(action, b, { read, insert, patch, call, now, user, alerter, monProfil, mesRefs, compteDeRef, finirMatch, fermerDiscussion, REF_OUTIL }) {
  if (!user) return json({ error: 'login_required' }, 401);
  const t = now();

  if (action === 'annonce_mes_blocages') {
    const rows = await read(`/rest/v1/blocages?auteur_user=eq.${user.id}&select=cible_ref,created_at&order=created_at.desc&limit=200`).catch(() => []);
    return json({ ok: true, blocages: rows.map((r) => ({ ref: r.cible_ref, le: r.created_at })) });
  }

  const ref = Number.parseInt(b.ref, 10);
  if (!(ref > 0)) return json({ error: 'bad_request' }, 400);

  if (action === 'annonce_debloquer') {
    await call(`/rest/v1/blocages?auteur_user=eq.${user.id}&cible_ref=eq.${ref}`, { method: 'DELETE' });
    return json({ ok: true });
  }

  const refs = await mesRefs();
  if (refs.includes(ref)) return json({ error: 'bad_request' }, 400);
  const motif = clean(b.motif, 500);

  if (action === 'annonce_signaler_profil') {
    const recents = await read(`/rest/v1/signalements?auteur_user=eq.${user.id}&created_at=gte.${encodeURIComponent(new Date(t.getTime() - 86400e3).toISOString())}&select=id&limit=21`).catch(() => []);
    if (recents.length >= 20) return json({ error: 'rate_limited' }, 429);
    await insert('signalements', { auteur_user: user.id, auteur_ref: refs[0] ?? null, cible_ref: ref, motif: motif || null });
    await alerter({ titre: `🚩 Profil signalé · n° ${ref}${refs[0] ? ` par n° ${refs[0]}` : ''}`, lignes: [motif || 'Sans motif.', 'À regarder dès que possible : Google demande que les signalements soient traités.'], lien: '/tableau-de-bord#application', tag: 'reserve' }).catch(() => {});
    return json({ ok: true });
  }

  if (action !== 'annonce_bloquer') return json({ error: 'unknown_action' }, 400);

  const autre = await compteDeRef(ref).catch(() => null);
  await call('/rest/v1/blocages?on_conflict=auteur_user,cible_ref', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ auteur_user: user.id, auteur_ref: refs[0] ?? null, cible_ref: ref, cible_user: autre?.user_id ?? null, motif: motif || null }) });

  // Plus de discussion, plus de demande en attente, et le match s'arrête s'il y en avait un entre eux.
  const a = await monProfil();
  await patch('discussions', `or=(and(a_user.eq.${user.id},b_ref.eq.${ref}),and(b_user.eq.${user.id},a_ref.eq.${ref}))&close_raison=is.null`, { ferme_at: t.toISOString(), close_raison: 'bloque' }).catch(() => {});
  const miens = a ? await read(`/rest/v1/annonce_interets?demandeur_id=eq.${a.id}&cible_ref=eq.${ref}&select=id,statut`).catch(() => []) : [];
  const [c] = ref < REF_OUTIL ? await read(`/rest/v1/annonces?ref=eq.${ref}&select=id`).catch(() => []) : [];
  const siens = c && refs.length ? await read(`/rest/v1/annonce_interets?demandeur_id=eq.${c.id}&cible_ref=in.(${refs.join(',')})&select=id,statut`).catch(() => []) : [];
  const tous = [...miens, ...siens];
  for (const i of tous) if (['a_traiter', 'en_reserve'].includes(i.statut)) await patch('annonce_interets', `id=eq.${i.id}`, { statut: 'pas_compatible', updated_at: t.toISOString() }).catch(() => {});
  const enMatch = tous.filter((i) => i.statut === 'mis_en_relation');
  if (enMatch.length) {
    if (a) await finirMatch(a).catch(() => {});
    else for (const i of enMatch) {
      await fermerDiscussion({ patch, now }, i.id, 'bloque');
      await patch('annonce_interets', `id=eq.${i.id}`, { statut: 'dematche', updated_at: t.toISOString() }).catch(() => {});
      if (c) await patch('annonces', `id=eq.${c.id}`, { en_match: false }).catch(() => {});
    }
  }
  await alerter({ titre: `🚫 Blocage · n° ${refs[0] ?? '?'} a bloqué n° ${ref}`, lignes: [motif || 'Sans motif.', enMatch.length ? 'Leur match en cours est terminé.' : 'Ils ne se verront plus.'], lien: '/tableau-de-bord#application', tag: 'reserve' }).catch(() => {});
  return json({ ok: true });
}
