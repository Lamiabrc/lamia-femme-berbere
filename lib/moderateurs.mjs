// Modérateurs (badge + formule Passion offerte) et invitations au bêta-test de l'appli Google Play.
// La formule offerte ne passe pas par Stripe : rien n'est facturé et elle s'arrête quand le badge est retiré.
import { createHash, randomBytes } from 'node:crypto';
import { json } from './event-tickets.mjs';

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const mail = (s) => String(s || '').trim().toLowerCase();
const adresseOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 200;

export const MESSAGE_BETA = {
  titre: '{A}, l’appli TAYRI arrive sur Google Play',
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

const empreinte = (t) => createHash('sha256').update(`lfb-moderateur:${t}`).digest('hex');
export const lienInvitation = (t) => `https://lamia-femme-berbere.com/mon-espace/?moderateur=${t}`;

export const FORMULES_MODERATEUR = ['passion', 'prestige'];
export const ACTIONS_MODERATION = ['annonce_moderateur_etat', 'annonce_moderateur_definir', 'annonce_moderateur_formule', 'annonce_moderateur_inviter', 'annonce_moderateur_voir', 'annonce_moderateur_accepter', 'annonce_moderateur', 'annonce_moderateurs', 'annonce_beta_inviter', 'annonce_beta_liste', 'annonce_beta_moi', 'annonce_beta_repondre'];

export async function actionModeration(action, b, { read, insert, patch, call, now, user, admin, alerter, compteDeRef, prevenirMembre, refOutil, lienFiche }) {
  const maintenant = () => now().toISOString();

  // Lien d'invitation : la personne crée son accès ou se connecte, puis confirme (ou refuse) elle-même.
  if (action === 'annonce_moderateur_voir' || action === 'annonce_moderateur_accepter') {
    if (!user) return json({ error: 'login_required' }, 401);
    const h = empreinte(clean(b.t, 80));
    const [inv] = await read(`/rest/v1/moderateur_invitations?token_h=eq.${h}&select=token_h,ref,utilise_at`).catch(() => []);
    if (!inv || inv.utilise_at) return json({ error: 'lien_invalide' }, 404);
    if (action === 'annonce_moderateur_voir') return json({ ok: true, avec_fiche: Boolean(inv.ref) });
    const email = mail(user.email), oui = b.oui === true, t = maintenant();
    if (inv.ref) {
      const [f] = await read(`/rest/v1/profils_outil?ref=eq.${inv.ref}&select=ref,user_id`).catch(() => []);
      if (f?.user_id && f.user_id !== user.id) return json({ error: 'deja_liee' }, 409);
      if (oui && f) await patch('profils_outil', `ref=eq.${inv.ref}`, { user_id: user.id, moderateur_at: t });
      if (!oui && f) await patch('profils_outil', `ref=eq.${inv.ref}`, { moderateur_at: null });
    }
    if (oui) {
      await call(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' }).catch(() => {});
      await insert('formules_offertes', { email, formule: 'passion', raison: 'moderateur', ref: inv.ref || null });
    }
    await patch('moderateur_invitations', `token_h=eq.${h}`, { utilise_at: t, statut: oui ? 'accepte' : 'refuse', email });
    await alerter({ titre: oui ? 'Invitation modérateur acceptée' : 'Invitation modérateur refusée', lignes: [inv.ref ? `Fiche n° ${inv.ref}` : 'Compte sans annonce'], lien: '/tableau-de-bord#moderateurs', tag: 'moderateur' }).catch(() => {});
    return json({ ok: true, statut: oui ? 'accepte' : 'refuse' });
  }

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
    await alerter({ titre: oui ? `Nouveau testeur : profil n° ${r.ref || '?'}` : `Bêta-test refusé : profil n° ${r.ref || '?'}`, lignes: oui ? ['Son adresse est dans ton tableau de bord.'] : [], lien: '/tableau-de-bord#beta', tag: 'beta' }).catch(() => {});
    return json({ ok: true, statut: oui ? 'accepte' : 'refuse' });
  }

  if (!admin) return json({ error: 'forbidden' }, 403);

  if (action === 'annonce_moderateur_inviter') {
    const ref = Number.parseInt(b.ref, 10) || null, pseudo = clean(b.pseudo, 80).replace(/^@/, '') || null;
    if (!ref && !pseudo) return json({ error: 'bad_request' }, 400);
    const t = randomBytes(24).toString('base64url');
    await insert('moderateur_invitations', { token_h: empreinte(t), ref, pseudo });
    return json({ ok: true, lien: lienInvitation(t) });
  }
  if (action === 'annonce_moderateur' && b.email) {
    await call(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(mail(b.email))}&raison=eq.moderateur`, { method: 'DELETE' }).catch(() => {});
    return json({ ok: true, moderateur: false });
  }
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
  // Un profil par son numéro (Lamia, 15 nov. 2026) : où il en est, puis « Modérateur ? oui / non » et la formule offerte,
  // enregistrés ensemble. Le badge va sur son annonce et sur sa fiche du live si elles sont reliées ; la formule va sur son compte.
  if (action === 'annonce_moderateur_etat' || action === 'annonce_moderateur_definir') {
    const num = Number.parseInt(b.ref, 10);
    if (!(num > 0)) return json({ error: 'not_found', message: 'Écris un numéro de profil.' }, 404);
    const CH_A = 'ref,prenom,genre,birth_date,ville,pays,status,email,user_id,fiche_ref,moderateur_at,pause_at';
    const CH_F = 'ref,genre,age,ville,pays,user_id,retire_at,moderateur_at';
    let a = null, f = null;
    if (num < refOutil) {
      [a] = await read(`/rest/v1/annonces?ref=eq.${num}&select=${CH_A}`).catch(() => []);
      if (a?.fiche_ref) [f] = await read(`/rest/v1/profils_outil?ref=eq.${a.fiche_ref}&select=${CH_F}`).catch(() => []);
      else if (a?.user_id) [f] = await read(`/rest/v1/profils_outil?user_id=eq.${a.user_id}&select=${CH_F}&limit=1`).catch(() => []);
    } else {
      [f] = await read(`/rest/v1/profils_outil?ref=eq.${num}&select=${CH_F}`).catch(() => []);
      if (f?.user_id) [a] = await read(`/rest/v1/annonces?user_id=eq.${f.user_id}&select=${CH_A}&order=ref.asc&limit=1`).catch(() => []);
    }
    if (!a && !f) return json({ error: 'not_found', message: `Aucun profil n° ${num}.` }, 404);
    const compte = a?.email ? { email: a.email } : await compteDeRef(f?.ref || num).catch(() => null);
    const email = compte?.email ? mail(compte.email) : '';
    if (action === 'annonce_moderateur_definir') {
      const moderateur = b.moderateur === true, formule = String(b.formule || '');
      if (!['', ...FORMULES_MODERATEUR].includes(formule)) return json({ error: 'bad_request' }, 400);
      if (formule && !email) return json({ error: 'sans_compte', message: 'Cette personne n’a pas encore de compte sur le site : la formule ne peut pas lui être offerte. Le badge, lui, est enregistré.' }, 409);
      const t = moderateur ? maintenant() : null;
      if (a) await patch('annonces', `ref=eq.${a.ref}`, { moderateur_at: t });
      if (f) await patch('profils_outil', `ref=eq.${f.ref}`, { moderateur_at: t });
      if (email) {
        const [avant] = await read(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(email)}&select=formule,raison`).catch(() => []);
        if (avant || formule) {
          const del = await call(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' }).catch(() => null);
          if (!del?.ok) return json({ error: 'temporary_failure', message: 'La formule n’a pas pu être enregistrée. Réessaie.' }, 502);
          if (formule) await insert('formules_offertes', { email, formule, raison: moderateur ? 'moderateur' : 'lamia', ref: a?.ref || f?.ref || num });
        }
      }
    }
    const [offre] = email ? await read(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(email)}&select=formule,raison`).catch(() => []) : [];
    const [abo] = email ? await read(`/rest/v1/abonnements?email=ilike.${encodeURIComponent(email.replace(/[%_\\*(),]/g, ''))}&statut=in.(actif,impaye)&select=formule&limit=1`).catch(() => []) : [];
    const [a2] = a ? await read(`/rest/v1/annonces?ref=eq.${a.ref}&select=moderateur_at`).catch(() => []) : [];
    const [f2] = f ? await read(`/rest/v1/profils_outil?ref=eq.${f.ref}&select=moderateur_at`).catch(() => []) : [];
    const age = a?.birth_date ? Math.floor((now() - new Date(a.birth_date)) / (365.25 * 86400e3)) : f?.age ?? null;
    const etat = a ? ({ publiee: 'validé', a_verifier: 'à valider', brouillon: 'pas fini', refusee: 'à corriger', retiree: 'retiré' })[a.status] || a.status : f.retire_at ? 'fiche retirée' : 'fiche du live, sans annonce sur le site';
    return json({ ok: true, profil: {
      num: a?.ref || f.ref, fiche: f && a ? f.ref : null, prenom: clean(a?.prenom, 40), genre: (a || f).genre || '', age: Number.isFinite(age) ? age : null,
      ville: clean((a || f).ville, 60), pays: clean((a || f).pays, 60), etat, pause: Boolean(a?.pause_at), compte: Boolean(email),
      moderateur: Boolean(a2?.moderateur_at || f2?.moderateur_at), formule_offerte: offre?.formule || '', offerte_par: offre?.raison || '', abonnement: abo?.formule || '',
    } });
  }
  // Lamia choisit la formule offerte à un modérateur (Passion ou Prestige), ou la retire en gardant le badge.
  if (action === 'annonce_moderateur_formule') {
    const formule = String(b.formule || '');
    if (!['', ...FORMULES_MODERATEUR].includes(formule)) return json({ error: 'bad_request' }, 400);
    let email = '', cible = null;
    if (b.email) {
      // Modérateur sans annonce : sa formule est sa seule trace, on ne la retire qu'avec « Retirer le badge ».
      email = mail(b.email);
      const [o] = await read(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(email)}&raison=eq.moderateur&select=email`).catch(() => []);
      if (!o) return json({ error: 'not_found' }, 404);
      if (!formule) return json({ error: 'bad_request' }, 400);
    } else {
      const ref = Number.parseInt(b.ref, 10);
      if (!(ref > 0)) return json({ error: 'not_found' }, 404);
      const [a] = ref < refOutil ? await read(`/rest/v1/annonces?ref=eq.${ref}&select=ref,fiche_ref`).catch(() => []) : [];
      cible = a?.fiche_ref || ref;
      const [x] = await read(`/rest/v1/${cible < refOutil ? 'annonces' : 'profils_outil'}?ref=eq.${cible}&moderateur_at=not.is.null&select=ref`).catch(() => []);
      if (!x) return json({ error: 'not_found' }, 404);
      const compte = (await compteDeRef(ref).catch(() => null)) || (cible !== ref ? await compteDeRef(cible).catch(() => null) : null);
      if (!compte?.email) return json({ error: 'sans_compte' }, 409);
      email = mail(compte.email);
    }
    const del = await call(`/rest/v1/formules_offertes?email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' }).catch(() => null);
    if (!del?.ok) return json({ error: 'temporary_failure' }, 502);
    if (formule) await insert('formules_offertes', { email, formule, raison: 'moderateur', ref: cible });
    return json({ ok: true, formule });
  }
  if (action === 'annonce_moderateurs') {
    const [aa, ff, offres, invits] = await Promise.all([
      read('/rest/v1/annonces?moderateur_at=not.is.null&select=ref,prenom,genre,ville,email,user_id&limit=200').catch(() => []),
      read('/rest/v1/profils_outil?moderateur_at=not.is.null&select=ref,genre,ville,user_id&limit=200').catch(() => []),
      read('/rest/v1/formules_offertes?raison=eq.moderateur&select=ref,formule,email&limit=200').catch(() => []),
      read('/rest/v1/moderateur_invitations?statut=eq.accepte&select=email,pseudo&limit=200').catch(() => []),
    ]);
    // Une fiche du live reliée à un compte : le prénom et le numéro court viennent de son annonce, si elle en a une.
    const annonceDe = new Map(await Promise.all(ff.filter((f) => f.user_id).map(async (f) => [f.ref, (await read(`/rest/v1/annonces?user_id=eq.${f.user_id}&select=ref,prenom,email&order=ref.asc&limit=1`).catch(() => []))[0] || null])));
    const offre = (ref, email) => offres.find((o) => (ref && o.ref === ref) || (email && o.email === mail(email))) || null;
    const ligne = (p, a) => {
      const o = offre(p.ref, a?.email);
      return { ref: p.ref, num: a?.ref || p.ref, prenom: clean(a?.prenom, 40), genre: p.genre || '', ville: clean(p.ville, 60), compte: Boolean(p.user_id || a?.email), formule: o?.formule || '', lien: p.ref >= refOutil && !p.user_id && lienFiche ? lienFiche(p.ref) : null };
    };
    return json({ ok: true,
      // Seulement ceux qui ont validé : un compte relié à leur profil (Lamia, 15 nov. 2026).
      moderateurs: [...aa.map((a) => ligne(a, a)), ...ff.map((f) => ligne(f, annonceDe.get(f.ref) || null))].filter((x) => x.compte).filter((x, k, t) => t.findIndex((y) => y.num === x.num) === k) });
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
