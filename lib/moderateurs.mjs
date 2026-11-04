// Modérateurs (badge + formule Passion offerte) et invitations au bêta-test de l'appli Google Play.
// La formule offerte ne passe pas par Stripe : rien n'est facturé et elle s'arrête quand le badge est retiré.
import { json } from './event-tickets.mjs';

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const mail = (s) => String(s || '').trim().toLowerCase();
const adresseOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 200;

export const MESSAGE_BETA = {
  titre: '📱 {A}, l’appli LFB arrive sur Google Play',
  texte: 'Lamia cherche des testeurs : il faut un téléphone Android, installer l’appli depuis un lien et rester inscrit·e 14 jours, sans perdre ton compte ni tes discussions. Si tu es d’accord, réponds oui dans ton espace et donne l’adresse Gmail de ton téléphone. Elle sert uniquement à t’inscrire au test.',
  bouton: 'Répondre à Lamia',
  lien: '/mon-espace/#beta',
  pied: 'Rien n’est obligatoire : tu peux aussi répondre non, ton compte reste le même.',
};

// Une fiche de modérateur vient d'être reliée à un compte : la formule offerte arrive avec.
export async function offrirSiModerateur({ read, call, insert }, ref, email) {
  const [f] = await read(`/rest/v1/profils_outil?ref=eq.${ref}&moderateur_at=not.is.null&select=ref`).catch(() => []);
  if (!f || !email) return false;
  const m = mail(email);
  await call(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(m)}`, { method: 'DELETE' }).catch(() => {});
  await insert('formules_offertes', { email: m, formule: 'passion', raison: 'moderateur', ref });
  return true;
}

export const ACTIONS_MODERATION = ['annonce_moderateur', 'annonce_moderateurs', 'annonce_beta_inviter', 'annonce_beta_liste', 'annonce_beta_moi', 'annonce_beta_repondre'];

export async function actionModeration(action, b, { read, insert, patch, call, now, user, admin, alerter, compteDeRef, prevenirMembre, refOutil, lienFiche }) {
  const maintenant = () => now().toISOString();

  if (action === 'annonce_beta_moi') {
    if (!user) return json({ error: 'login_required' }, 401);
    const [r] = await read(`/rest/v1/beta_testeurs?compte_email=eq.${encodeURIComponent(mail(user.email))}&select=statut,adresse_google`).catch(() => []);
    return json({ ok: true, beta: r || null, email: user.email });
  }
  if (action === 'annonce_beta_repondre') {
    if (!user) return json({ error: 'login_required' }, 401);
    const moi = mail(user.email);
    const [r] = await read(`/rest/v1/beta_testeurs?compte_email=eq.${encodeURIComponent(moi)}&select=compte_email,ref`).catch(() => []);
    if (!r) return json({ error: 'pas_invite' }, 404);
    const oui = b.oui === true;
    const adresse = oui ? mail(clean(b.adresse, 200)) : null;
    if (oui && !adresseOk(adresse)) return json({ error: 'adresse_invalide' }, 400);
    await patch('beta_testeurs', `compte_email=eq.${encodeURIComponent(moi)}`, { statut: oui ? 'accepte' : 'refuse', adresse_google: adresse, repondu_at: maintenant() });
    await alerter({ titre: oui ? `📱 Nouveau testeur : profil n° ${r.ref || '?'}` : `📱 Bêta-test refusé : profil n° ${r.ref || '?'}`, lignes: oui ? ['Son adresse est dans ton tableau de bord.'] : [], lien: '/tableau-de-bord#beta', tag: 'beta' }).catch(() => {});
    return json({ ok: true, statut: oui ? 'accepte' : 'refuse' });
  }

  if (!admin) return json({ error: 'forbidden' }, 403);

  if (action === 'annonce_moderateur') {
    const ref = Number.parseInt(b.ref, 10);
    if (!(ref > 0)) return json({ error: 'not_found' }, 404);
    const [a] = ref < refOutil ? await read(`/rest/v1/annonces?ref=eq.${ref}&select=ref,fiche_ref`).catch(() => []) : [];
    const cible = a?.fiche_ref || ref;
    const table = cible < refOutil ? 'annonces' : 'profils_outil';
    const [x] = await read(`/rest/v1/${table}?ref=eq.${cible}&select=ref`).catch(() => []);
    if (!x) return json({ error: 'not_found' }, 404);
    const compte = (await compteDeRef(ref).catch(() => null)) || (cible !== ref ? await compteDeRef(cible).catch(() => null) : null);
    if (b.oui === false) {
      await patch(table, `ref=eq.${cible}`, { moderateur_at: null });
      await call(`/rest/v1/formules_offertes?ref=eq.${cible}&raison=eq.moderateur`, { method: 'DELETE' }).catch(() => {});
      return json({ ok: true, ref: cible, moderateur: false });
    }
    await patch(table, `ref=eq.${cible}`, { moderateur_at: maintenant() });
    // Sans compte, la formule attend : elle est offerte dès que la personne relie un compte à sa fiche.
    if (!compte?.email) return json({ ok: true, ref: cible, moderateur: true, formule: null });
    const email = mail(compte.email);
    await call(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' }).catch(() => {});
    await insert('formules_offertes', { email, formule: 'passion', raison: 'moderateur', ref: cible });
    return json({ ok: true, ref: cible, moderateur: true, formule: 'passion' });
  }
  if (action === 'annonce_moderateurs') {
    const [aa, ff, offres] = await Promise.all([
      read('/rest/v1/annonces?moderateur_at=not.is.null&select=ref,genre,ville&limit=200').catch(() => []),
      read('/rest/v1/profils_outil?moderateur_at=not.is.null&select=ref,genre,ville,user_id&limit=200').catch(() => []),
      read('/rest/v1/formules_offertes?raison=eq.moderateur&select=ref,formule&limit=200').catch(() => []),
    ]);
    const offertes = new Set(offres.map((o) => o.ref));
    return json({ ok: true, moderateurs: [...aa, ...ff].map(({ user_id: u, ...p }) => ({ ...p, formule: offertes.has(p.ref), lien: p.ref >= refOutil && !u && lienFiche ? lienFiche(p.ref) : null })) });
  }
  if (action === 'annonce_beta_inviter') {
    const refs = [...new Set((Array.isArray(b.refs) ? b.refs : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
    const invites = [], sansCompte = [], deja = [];
    for (const ref of refs) {
      const compte = await compteDeRef(ref).catch(() => null);
      if (!compte?.email) { sansCompte.push(ref); continue; }
      const email = mail(compte.email);
      const [r] = await read(`/rest/v1/beta_testeurs?compte_email=eq.${encodeURIComponent(email)}&select=statut`).catch(() => []);
      if (r) { deja.push(ref); continue; }
      await insert('beta_testeurs', { compte_email: email, ref });
      await prevenirMembre(compte, MESSAGE_BETA).catch(() => {});
      invites.push(ref);
    }
    return json({ ok: true, invites, sansCompte, deja });
  }
  if (action === 'annonce_beta_liste') {
    const liste = await read('/rest/v1/beta_testeurs?select=ref,statut,adresse_google,invite_at,repondu_at&order=invite_at.desc&limit=300').catch(() => []);
    return json({ ok: true, liste });
  }
  return json({ error: 'action_inconnue' }, 400);
}
