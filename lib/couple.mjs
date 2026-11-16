// « Notre couple » (Lamia, 16 nov. 2026) : un espace à part des rencontres, pour les personnes en couple.
// Sur le modèle de l'espace Famille de QVT Box : l'un crée l'espace, invite l'autre par un code,
// et les deux partagent un planning d'activités de couple. Autour : coaching, lives, boutique, écrire à Lamia,
// et « faire plaisir » (bijou, chocolat, fleurs), en attendant les partenariats de Lamia.
import { DATABASE_URL, json } from './event-tickets.mjs';

export const TYPES_ACTIVITE = {
  rendez_vous: 'Rendez-vous à deux', balade: 'Balade', repas: 'Repas', rituel: 'Rituel du couple',
  gratitude: 'Moment de gratitude', famille: 'Avec la famille', coaching: 'Coaching avec Lamia', autre: 'Autre',
};
// La liste de cadeaux de couple (Lamia, 16 nov. 2026), en attendant ses partenariats.
export const CADEAUX = {
  bijou: 'Un bijou', parfum: 'Un parfum', fleurs: 'Des fleurs', chocolat: 'Des chocolats',
  diner: 'Un dîner au restaurant', spa: 'Un spa ou un massage à deux', weekend: 'Un week-end à deux',
  coffret: 'Un coffret beauté', photo: 'Une séance photo de couple', autre: 'Une autre idée',
};
// Plus riche, sur le modèle de l'espace Famille de QVT Box (Lamia, 16 nov. 2026) :
// la météo du cœur de chacun (humeur + besoin, partagée), la question du jour, le défi de la semaine,
// des idées de moments et le bocal à souvenirs. Tout tient dans couple_activites (types en plus), sans nouvelle table.
export const HUMEURS = { 1: ['😔', 'Pas bien'], 2: ['😕', 'Bof'], 3: ['🙂', 'Ça va'], 4: ['😊', 'Bien'], 5: ['🥰', 'Au top'] };
export const BESOINS = {
  tendresse: 'De la tendresse', ecoute: 'Être écouté·e', temps: 'Du temps à deux', calme: 'Du calme, un peu d’espace',
  aide: 'Un coup de main', rire: 'Rire ensemble', rien: 'Rien de spécial',
};
// Ce qui ferait du bien à l'autre, selon son besoin du jour : un geste, qu'on peut ajouter au planning.
export const SUGGESTIONS = {
  tendresse: [['Un câlin de 20 secondes, sans rien dire', 'rituel'], ['Lui envoyer un mot doux dans la journée', 'rituel'], ['Une soirée film blottis l’un contre l’autre', 'rendez_vous']],
  ecoute: [['10 minutes rien que pour l’écouter, téléphone posé', 'rituel'], ['Lui demander : « Qu’est-ce qui te pèse en ce moment ? »', 'rituel'], ['Une balade pour parler tranquillement', 'balade']],
  temps: [['Un dîner à deux, sans écran', 'repas'], ['Bloquer une soirée rien que pour vous', 'rendez_vous'], ['Un café ensemble ce week-end', 'rendez_vous']],
  calme: [['Lui laisser une heure pour soi, sans question', 'autre'], ['Prendre une tâche à sa place ce soir', 'autre'], ['Un thé ensemble, en silence et au calme', 'rituel']],
  aide: [['Lui demander : « Qu’est-ce que je peux faire pour toi ? »', 'rituel'], ['Faire les courses ou le repas à sa place', 'repas'], ['S’occuper ensemble de ce qui traîne', 'autre']],
  rire: [['Regarder une comédie ensemble', 'rendez_vous'], ['Se raconter vos pires souvenirs gênants', 'rituel'], ['Un jeu de société à deux', 'rendez_vous']],
};
export const IDEES = {
  'Créer des moments qui comptent': [['Refaire votre premier rendez-vous', 'rendez_vous'], ['Un pique-nique au coucher du soleil', 'balade'], ['Cuisiner ensemble un plat de vos familles', 'repas'], ['Une journée sans téléphone', 'rituel']],
  'Se parler vraiment': [['Le bilan du dimanche : ce qui a été, ce qui n’a pas été', 'rituel'], ['Se dire trois choses qu’on admire chez l’autre', 'gratitude'], ['Parler de vos rêves pour dans 5 ans', 'rituel'], ['Une séance de coaching de couple avec Lamia', 'coaching']],
  'Prendre soin de l’autre': [['Un petit-déjeuner surprise', 'repas'], ['Un massage des épaules après le travail', 'rituel'], ['Écrire une lettre à la main', 'gratitude'], ['Une visite ensemble à la famille', 'famille']],
};
export const QUESTIONS = [
  'Quel est ton plus beau souvenir avec moi ?', 'Qu’est-ce qui t’a fait sourire aujourd’hui ?', 'De quoi aurais-tu besoin de ma part cette semaine ?',
  'Quel petit geste de moi te touche le plus ?', 'Où aimerais-tu qu’on parte tous les deux ?', 'Qu’est-ce que tu as appris de moi ?',
  'Quelle tradition de ta famille aimerais-tu garder chez nous ?', 'Quel moment de notre histoire revivrais-tu ?', 'Qu’est-ce qui te rassure chez moi ?',
  'Quel rêve as-tu que je ne connais pas encore ?', 'Qu’est-ce qui te fatigue en ce moment ?', 'Une chose que tu aimerais qu’on fasse plus souvent ?',
  'Quelle chanson te fait penser à nous ?', 'Qu’as-tu pensé de moi la première fois ?', 'De quoi es-tu fier ou fière cette semaine ?',
  'Qu’est-ce qui ferait de demain une belle journée ?', 'Quelle qualité de moi aimerais-tu que nos enfants aient ?', 'Quel plat te rappelle ton enfance ?',
  'Qu’est-ce que je fais qui t’agace un peu (avec tendresse) ?', 'Comment aimes-tu qu’on te console ?', 'Quel est ton endroit préféré quand on est ensemble ?',
  'Qu’aimerais-tu qu’on construise tous les deux ?', 'Qu’est-ce qui te donne confiance en nous ?', 'Pour quoi me dirais-tu merci aujourd’hui ?',
  'Quelle petite folie aimerais-tu qu’on fasse ?', 'Qu’est-ce qui t’a manqué de moi cette semaine ?', 'Quel conseil de tes parents te sert encore ?',
  'Qu’est-ce que l’amour veut dire pour toi ?', 'Quel moment simple avec moi préfères-tu ?', 'Si on avait une journée libre demain, on ferait quoi ?',
];
export const DEFIS = [
  'Se dire « merci » pour une chose précise chaque jour.', 'Un repas par jour sans téléphone sur la table.', 'Un compliment sincère chaque matin.',
  'Une balade de 20 minutes ensemble, au moins deux fois.', 'Se raconter sa journée le soir, chacun 5 minutes, sans interrompre.', 'Faire une surprise à l’autre avant dimanche.',
  'Écrire un souvenir dans votre bocal chaque jour.', 'Un câlin avant de partir le matin, tous les jours.',
];
// Jeux d'amour à distance (Lamia, 16 nov. 2026) : simples, ou un peu piquants, toujours entre vous deux.
// On tire une carte, on l'envoie à l'autre, l'autre répond.
export const JEUX = {
  preferes: { nom: 'Tu préfères…', sous: 'Simple et drôle', cartes: [
    'Un dîner aux chandelles ou un pique-nique sous les étoiles ?', 'Un week-end à la mer ou à la montagne en Kabylie ?', 'Recevoir une lettre d’amour ou un message vocal ?',
    'Un slow sur notre chanson ou un fou rire en cuisine ?', 'Un réveil avec le petit-déjeuner ou avec un câlin ?', 'Un voyage surprise ou un voyage qu’on prépare ensemble ?',
    'Danser au mariage toute la nuit ou s’éclipser tous les deux ?', 'Un mot doux le matin ou un mot doux le soir ?', 'Le henné en petit comité ou la grande fête ?',
    'Me regarder dans les yeux une minute sans rire, ou me faire rire en une minute ?'] },
  verites: { nom: 'Vérités tendres', sous: 'Pour se découvrir', cartes: [
    'Quel a été ton premier vrai coup de cœur pour moi ?', 'Qu’est-ce que tu n’as jamais osé me dire ?', 'À quel moment as-tu su que c’était sérieux entre nous ?',
    'Qu’est-ce qui te fait te sentir aimé·e ?', 'Quelle est ta plus grande peur pour notre couple ?', 'Quel souvenir de nous te fait encore sourire ?',
    'Qu’imagines-tu de notre vie dans dix ans ?', 'Quelle habitude de moi trouves-tu adorable ?', 'Qu’est-ce que tu aimerais que je fasse plus souvent ?'] },
  piquant: { nom: 'Un peu piquant', sous: 'Un peu intime, rien que pour vous deux', cartes: [
    'Décris le moment où tu as eu le plus envie de m’embrasser.', 'Qu’est-ce que tu me murmurerais à l’oreille si j’étais là ce soir ?', 'Quel vêtement préfères-tu me voir porter ?',
    'Raconte-moi ton rêve le plus romantique avec moi.', 'Quelle partie de ma voix, de mon sourire ou de mon regard te fait craquer ?', 'Envoie-moi un message vocal de ta voix la plus douce.',
    'Décris notre premier soir de mariés, en trois mots.', 'Où aimerais-tu que je t’embrasse la prochaine fois qu’on se voit ?', 'Quel parfum de moi te manque le plus ?',
    'Dis-moi ce qui te fait rougir chez moi.'] },
  quiz: { nom: 'Le quiz de nous', sous: 'Est-ce que tu me connais bien ?', cartes: [
    'Quel est mon plat préféré ?', 'Quelle est ma chanson préférée ?', 'Quel est mon plus grand rêve ?', 'De quoi ai-je le plus peur ?',
    'Quel prénom j’aimerais donner à notre premier enfant ?', 'Quelle est ma couleur préférée ?', 'Quel est mon souvenir d’enfance préféré ?', 'Qu’est-ce qui me met de mauvaise humeur ?'] },
  defis: { nom: 'Défis à distance', sous: 'Quand vous êtes loin l’un de l’autre', cartes: [
    'Envoie-moi une photo de ce que tu vois, là, maintenant.', 'Un message vocal de 30 secondes pour me souhaiter bonne nuit.', 'Ce soir, on regarde le même film, chacun chez soi, en s’écrivant.',
    'Écris-moi trois mots qui te font penser à moi.', 'Choisis une chanson que je dois écouter en pensant à toi.', 'Décris ta journée idéale avec moi, du réveil au coucher.',
    'Prends un café « avec moi » en visio demain matin.', 'Écris-moi une lettre, une vraie, et envoie-la par la poste.'] },
};
// L'univers des fiançailles (Lamia, 16 nov. 2026) : tout commence par un bouton magique, « Et si on se mariait ? ».
// Quand l'autre dit oui, le parcours s'ouvre, étape par étape, chacune avec sa photo, sa date et ce qu'il y a à préparer.
// Les photos viennent d'Unsplash (licence libre, usage commercial permis), affichées depuis leur serveur.
export const ETAPES = [
  { cle: 'familles', nom: 'Nos deux familles', image: 'https://images.unsplash.com/photo-1774660811278-3a9710b375cd?auto=format&fit=crop&w=900&q=70', texte: 'Se présenter, demander la main, partager un repas.', prepa: ['familles', 'budget'] },
  { cle: 'fiancailles', nom: 'Les fiançailles', image: 'https://images.unsplash.com/photo-1484876632310-ddb3b48133cc?auto=format&fit=crop&w=900&q=70', texte: 'La bague, la petite fête, et la date du mariage.', prepa: ['bague', 'date'] },
  { cle: 'henne', nom: 'Le henné', image: 'https://images.unsplash.com/photo-1623217509141-6f735087b50c?auto=format&fit=crop&w=900&q=70', texte: 'La veille, en famille, en chants et en youyous.', prepa: ['henne'] },
  { cle: 'tenues', nom: 'La robe et les bijoux', image: 'https://images.unsplash.com/photo-1720718517204-a66cc17a1052?auto=format&fit=crop&w=900&q=70', texte: 'La robe kabyle, le burnous, les bijoux d’Ath Yenni.', prepa: ['robe', 'bijoux'] },
  { cle: 'civil', nom: 'Le mariage civil', image: 'https://images.unsplash.com/photo-1761671613933-159512988cb3?auto=format&fit=crop&w=900&q=70', texte: 'Les papiers, la mairie, les témoins.', prepa: ['papiers'] },
  { cle: 'mariage', nom: 'Le grand jour', image: 'https://images.unsplash.com/photo-1648154164366-d067faecdc51?auto=format&fit=crop&w=900&q=70', texte: 'La salle, le traiteur, la musique, les photos.', prepa: ['salle', 'traiteur', 'musique', 'photo', 'invitations'] },
  { cle: 'voyage', nom: 'Le voyage de noces', image: 'https://images.unsplash.com/photo-1759139757888-5a546427f90f?auto=format&fit=crop&w=900&q=70', texte: 'Rien que vous deux.', prepa: ['voyage'] },
];
export const JALONS = { demande: 'La demande', ...Object.fromEntries(ETAPES.map((e) => [e.cle, e.nom])) };
export const PREPA = {
  familles: 'Présenter nos deux familles', budget: 'Fixer notre budget', bague: 'Choisir la bague', date: 'Choisir la date du mariage',
  henne: 'Organiser le henné', robe: 'La robe kabyle et la tenue du marié', bijoux: 'Les bijoux (Ath Yenni ?)', papiers: 'Les papiers du mariage civil',
  salle: 'Réserver la salle', traiteur: 'Choisir le traiteur', musique: 'La musique et les danses', photo: 'Le ou la photographe',
  invitations: 'Envoyer les invitations', voyage: 'Réserver le voyage de noces',
};
const EXTRAS = ['mot', 'humeur', 'souvenir', 'question', 'jeu', 'jalon', 'prepa', 'demande'];
const lireJson = (titre) => { try { return JSON.parse(titre) || {}; } catch { return {}; } };
// Le jour à Paris (la question du jour change à minuit en France, pas à minuit UTC).
const jourParis = (t) => t.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
const indexJour = (j) => Math.floor((Date.parse(`${j}T00:00:00Z`) - Date.parse('2026-01-01T00:00:00Z')) / 86400e3);
const lireHumeur = (titre) => { try { const x = JSON.parse(titre); return { h: Number(x.h) || 3, b: BESOINS[x.b] ? x.b : null, n: clean(x.n, 200) }; } catch { return null; } };
const CODE_JOURS = 14;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const nouveauCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

// Deux personnes qui se disent « en couple » à la fin de leur discussion : leur espace s'ouvre tout seul.
// Si l'un des deux a déjà un espace (seul·e, en attente), l'autre le rejoint ; sinon un nouvel espace est créé.
export async function ouvrirCoupleDuo({ read, insert, patch }, [x, y], discussionId = null) {
  const liens = await read(`/rest/v1/couple_membres?user_id=in.(${x.user_id},${y.user_id})&select=couple_id,user_id`).catch(() => []);
  const deX = liens.find((l) => l.user_id === x.user_id), deY = liens.find((l) => l.user_id === y.user_id);
  if (deX && deY) return deX.couple_id === deY.couple_id ? deX.couple_id : null; // chacun a déjà un autre espace : on ne touche à rien
  const existant = deX || deY;
  if (existant) {
    const membres = await read(`/rest/v1/couple_membres?couple_id=eq.${existant.couple_id}&select=user_id`).catch(() => [{}, {}]);
    if (membres.length >= 2) return null;
    const nouveau = deX ? y : x;
    await insert('couple_membres', { couple_id: existant.couple_id, user_id: nouveau.user_id, prenom: nouveau.prenom || null });
    await patch('couples', `id=eq.${existant.couple_id}`, { code: null, code_expire_at: null, ...(discussionId ? { discussion_id: discussionId } : {}) });
    return existant.couple_id;
  }
  const c = await insert('couples', { created_by: x.user_id, discussion_id: discussionId });
  await insert('couple_membres', { couple_id: c.id, user_id: x.user_id, prenom: x.prenom || null });
  await insert('couple_membres', { couple_id: c.id, user_id: y.user_id, prenom: y.prenom || null });
  return c.id;
}

// Mots doux tout prêts (Lamia, 16 nov. 2026) : un geste, et l'autre reçoit une notification.
// Les plus envoyés sont réservés à l'abonnement Couple, avec leur animation tendre ; le mot écrit soi-même aussi (Lamia, 16 nov. 2026).
export const MOTS_DOUX = ['Je t’aime ❤️', 'Tu me manques 🥺', 'J’ai hâte de te retrouver 🤗', 'J’ai hâte de t’avoir à mes côtés 💞', 'Je pense à toi 💭', 'Merci d’être là 🌸', 'Bonne nuit mon cœur 🌙', 'Bonne journée mon amour ☀️'];
export const MOTS_PAYANTS = ['Je t’aime ❤️', 'Tu me manques 🥺', 'J’ai hâte de te retrouver 🤗', 'J’ai hâte de t’avoir à mes côtés 💞'];
// L'animation qui accompagne un mot (dans le fil) : « je t'aime » un cœur qui bat, « tu me manques » deux cœurs qui se cherchent…
export const ANIMATION = { 'Je t’aime ❤️': 'coeur', 'Tu me manques 🥺': 'manque', 'J’ai hâte de te retrouver 🤗': 'retrouver', 'J’ai hâte de t’avoir à mes côtés 💞': 'retrouver' };

export async function actionCouple(action, b, { read, insert, patch, call, now, user, alerter = async () => {}, pousser = async () => 0, journal = async () => {} }) {
  // L'abonnement Couple d'un des deux vaut pour les deux.
  const premium = async (coupleId) => {
    const membres = await read(`/rest/v1/couple_membres?couple_id=eq.${coupleId}&select=user_id`).catch(() => []);
    const emails = [String(user.email || '').toLowerCase()];
    for (const m of membres) if (m.user_id !== user.id) { try { const r = await call(`/auth/v1/admin/users/${m.user_id}`); const u = r?.ok && r.json ? await r.json() : null; if (u?.email) emails.push(String(u.email).toLowerCase()); } catch { /* sans l'email de l'autre, on regarde seulement le mien */ } }
    const abos = (await read(`/rest/v1/abonnements?formule=in.(couple,couple_prestige)&statut=in.(actif,impaye)&select=email,formule&limit=200`).catch(() => [])).filter((a) => emails.includes(String(a.email || '').toLowerCase()));
    // Le niveau du couple : Prestige si l'un des deux l'a, sinon Amour, sinon rien.
    return abos.some((a) => a.formule === 'couple_prestige') ? 'prestige' : abos.length ? 'amour' : null;
  };
  if (!user) return json({ error: 'login_required' }, 401);
  const t = now();
  const prenom = clean(user.user_metadata?.first_name, 40) || 'Moi';
  const monLien = async () => (await read(`/rest/v1/couple_membres?user_id=eq.${user.id}&select=couple_id`).catch(() => []))[0] || null;
  const etat = async () => {
    const lien = await monLien();
    if (!lien) return { couple: null };
    const vus = `couple_id=eq.${lien.couple_id}&or=(visibilite.eq.nous,auteur.eq.${user.id})&select=id,auteur,titre,type,quand,visibilite,fait_at,created_at`;
    const DURABLES = ['jalon', 'prepa', 'demande'], FIL = EXTRAS.filter((x) => !DURABLES.includes(x));
    const [[c], membres, plan, extras, durables] = await Promise.all([
      read(`/rest/v1/couples?id=eq.${lien.couple_id}&select=id,nom,created_by,code,code_expire_at`),
      read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id,prenom,joined_at&order=joined_at`),
      read(`/rest/v1/couple_activites?${vus}&type=not.in.(${EXTRAS})&order=quand.asc.nullslast&limit=200`),
      read(`/rest/v1/couple_activites?${vus}&type=in.(${FIL})&order=created_at.desc&limit=300`).catch(() => []),
      // Les dates, la liste du mariage et la demande ne doivent jamais sortir de la fenêtre des 300 derniers gestes.
      read(`/rest/v1/couple_activites?${vus}&type=in.(${DURABLES})&order=created_at.desc&limit=200`).catch(() => []),
    ]);
    if (!c) return { couple: null };
    const seul = membres.length < 2;
    const acts = [...plan.filter((x) => !EXTRAS.includes(x.type)), ...extras.filter((x) => FIL.includes(x.type)), ...durables.filter((x) => DURABLES.includes(x.type))];
    const recents = (type) => acts.filter((x) => x.type === type).sort((p, q) => String(q.created_at).localeCompare(String(p.created_at)));
    const lui = membres.find((m) => m.user_id !== user.id);
    // La météo du cœur : la dernière de chacun (moins de 2 jours), et les 7 derniers jours en petits visages.
    const aujourdhui = jourParis(t);
    const jours = Array.from({ length: 7 }, (_, i) => jourParis(new Date(t.getTime() - (6 - i) * 86400e3)));
    const meteo = (uid) => {
      const siennes = recents('humeur').filter((x) => x.auteur === uid).map((x) => ({ ...lireHumeur(x.titre), partage: x.visibilite !== 'moi', le: x.created_at, jour: jourParis(new Date(x.created_at || t)) })).filter((x) => x.h);
      const d = siennes[0] && t - new Date(siennes[0].le) < 2 * 86400e3 ? siennes[0] : null;
      return {
        derniere: d ? { humeur: d.h, emoji: HUMEURS[d.h][0], mot: HUMEURS[d.h][1], besoin: d.b, besoin_nom: d.b ? BESOINS[d.b] : null, note: d.n || null, partage: d.partage, aujourdhui: d.jour === aujourdhui, le: d.le } : null,
        semaine: jours.map((j) => siennes.find((h) => h.jour === j)?.h || null),
      };
    };
    // La question du jour : la même pour les deux ; la réponse de l'autre se découvre après avoir répondu soi-même.
    const qJour = `${aujourdhui}T00:00:00Z`, reponses = recents('question').filter((x) => new Date(x.quand).getTime() === new Date(qJour).getTime());
    const maRep = reponses.find((x) => x.auteur === user.id), saRep = lui ? reponses.find((x) => x.auteur === lui.user_id) : null;
    return {
      couple: {
        id: c.id, nom: c.nom || 'Notre couple',
        membres: membres.map((m) => ({ prenom: m.prenom || 'Partenaire', moi: m.user_id === user.id })),
        code: seul && c.code && new Date(c.code_expire_at) > t ? c.code : null,
        niveau: await premium(c.id),
        // Passion ou Prestige en cours : on lui propose de le transformer en abonnement Couple (avec son accord).
        conversion: await (async () => { const [x] = await read(`/rest/v1/abonnements?email=ilike.${encodeURIComponent(String(user.email || '').replace(/[%*,()]/g, ''))}&formule=in.(passion,prestige)&statut=in.(actif,impaye)&select=formule,periode,prix_centimes&order=created_at.desc&limit=1`).catch(() => []); return x ? { formule: x.formule, annuel: x.periode !== 'mois', prix: x.prix_centimes, vers: x.formule === 'prestige' ? 'Couple Prestige' : 'Couple Amour', vers_prix: x.formule === 'prestige' ? 3800 : 1800 } : null; })(),
        meteo: { moi: meteo(user.id), lui: lui ? meteo(lui.user_id) : null, jours },
        question: { texte: QUESTIONS[((indexJour(aujourdhui) % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length], ma_reponse: maRep?.titre || null, a_repondu: Boolean(saRep), sa_reponse: maRep && saRep ? saRep.titre : null },
        defi: DEFIS[((Math.floor(indexJour(aujourdhui) / 7) % DEFIS.length) + DEFIS.length) % DEFIS.length],
        souvenirs: recents('souvenir').slice(0, 60).map((x) => ({ id: x.id, texte: x.titre, quand: x.quand, de_moi: x.auteur === user.id, le: x.created_at })),
        jeux: recents('jeu').slice(0, 30).map((x) => { const j = lireJson(x.titre); const jeu = JEUX[j.j]; return jeu && jeu.cartes[j.i] ? { id: x.id, jeu: j.j, jeu_nom: jeu.nom, carte: jeu.cartes[j.i], de_moi: x.auteur === user.id, reponse: j.r || null, le: x.created_at } : null; }).filter(Boolean),
        jalons: Object.fromEntries(recents('jalon').filter((x) => JALONS[x.titre] && x.quand).reverse().map((x) => [x.titre, String(x.quand).slice(0, 10)])),
        prepa: [...new Set(recents('prepa').map((x) => x.titre).filter((k) => PREPA[k]))],
        demande: (() => { const [d] = recents('demande'); if (!d) return null; const x = lireJson(d.titre); return { de_moi: d.auteur === user.id, message: x.m || null, statut: ['attente', 'oui', 'reflexion'].includes(x.s) ? x.s : 'attente', le: d.created_at }; })(),
        mots: recents('mot').slice(0, 20).map((x) => ({ id: x.id, texte: x.titre, de_moi: x.auteur === user.id, le: x.created_at, animation: ANIMATION[x.titre] || null })),
        activites: acts.filter((x) => !EXTRAS.includes(x.type)).map((x) => ({ id: x.id, titre: x.titre, type: x.type, type_nom: TYPES_ACTIVITE[x.type] || x.type, quand: x.quand, pour_nous: x.visibilite === 'nous', de_moi: x.auteur === user.id, fait: Boolean(x.fait_at) })),
      },
    };
  };

  // Pour le menu : le lien « Notre couple » n'est montré qu'aux membres qui ont un espace de couple.
  if (action === 'couple_suis_je') return json({ ok: true, en_couple: Boolean(await monLien()) });
  if (action === 'couple_etat') return json({ ok: true, ...(await etat()), types: TYPES_ACTIVITE, cadeaux: CADEAUX, mots_doux: MOTS_DOUX, mots_payants: MOTS_PAYANTS, humeurs: HUMEURS, besoins: BESOINS, suggestions: SUGGESTIONS, idees: IDEES, jeux: JEUX, jalons: JALONS, prepa: PREPA, etapes: ETAPES });

  if (action === 'couple_creer') {
    if (await monLien()) return json({ ok: true, ...(await etat()) });
    const c = await insert('couples', { nom: clean(b.nom, 60) || null, created_by: user.id, code: nouveauCode(), code_expire_at: new Date(t.getTime() + CODE_JOURS * 86400e3).toISOString() });
    await insert('couple_membres', { couple_id: c.id, user_id: user.id, prenom });
    return json({ ok: true, ...(await etat()) });
  }

  if (action === 'couple_rejoindre') {
    if (await monLien()) return json({ error: 'deja_en_couple' }, 409);
    const code = clean(b.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) return json({ error: 'code_invalide' }, 400);
    const [c] = await read(`/rest/v1/couples?code=eq.${code}&select=id,code_expire_at`).catch(() => []);
    if (!c || new Date(c.code_expire_at) <= t) return json({ error: 'code_invalide' }, 404);
    const membres = await read(`/rest/v1/couple_membres?couple_id=eq.${c.id}&select=user_id`).catch(() => []);
    if (membres.length >= 2) return json({ error: 'complet' }, 409);
    await insert('couple_membres', { couple_id: c.id, user_id: user.id, prenom });
    await patch('couples', `id=eq.${c.id}`, { code: null, code_expire_at: null });
    return json({ ok: true, ...(await etat()) });
  }

  const lien = await monLien();
  if (!lien) return json({ error: 'pas_de_couple' }, 404);

  if (action === 'couple_code') {
    const membres = await read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id`).catch(() => []);
    if (membres.length >= 2) return json({ error: 'complet' }, 409);
    await patch('couples', `id=eq.${lien.couple_id}`, { code: nouveauCode(), code_expire_at: new Date(t.getTime() + CODE_JOURS * 86400e3).toISOString() });
    return json({ ok: true, ...(await etat()) });
  }

  if (action === 'couple_activite_ajouter') {
    const titre = clean(b.titre, 120);
    if (titre.length < 2) return json({ error: 'titre_requis' }, 400);
    const type = TYPES_ACTIVITE[b.type] ? b.type : 'autre';
    const quand = b.quand && !Number.isNaN(new Date(b.quand).getTime()) ? new Date(b.quand).toISOString() : null;
    await insert('couple_activites', { couple_id: lien.couple_id, auteur: user.id, titre, type, quand, visibilite: b.pour_nous === false ? 'moi' : 'nous' });
    return json({ ok: true, ...(await etat()) });
  }

  if (action === 'couple_activite_fait' || action === 'couple_activite_suppr') {
    const id = clean(b.id, 40);
    if (!UUID.test(id)) return json({ error: 'bad_request' }, 400);
    const [x] = await read(`/rest/v1/couple_activites?id=eq.${id}&couple_id=eq.${lien.couple_id}&or=(visibilite.eq.nous,auteur.eq.${user.id})&select=id,auteur`).catch(() => []);
    if (!x) return json({ error: 'not_found' }, 404);
    if (action === 'couple_activite_fait') await patch('couple_activites', `id=eq.${id}`, { fait_at: b.fait === false ? null : t.toISOString() });
    else {
      if (x.auteur !== user.id) return json({ error: 'forbidden' }, 403);
      await call(`/rest/v1/couple_activites?id=eq.${id}`, { method: 'DELETE' });
    }
    return json({ ok: true, ...(await etat()) });
  }

  if (action === 'couple_mot') {
    const texte = clean(b.texte, 200);
    if (texte.length < 2) return json({ error: 'titre_requis' }, 400);
    const gratuit = MOTS_DOUX.includes(texte) && !MOTS_PAYANTS.includes(texte);
    if (!gratuit && !(await premium(lien.couple_id))) return json({ error: 'couple_requis' }, 402);
    await insert('couple_activites', { couple_id: lien.couple_id, auteur: user.id, titre: texte, type: 'mot', visibilite: 'nous', fait_at: t.toISOString() });
    const autres = (await read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id`).catch(() => [])).filter((m) => m.user_id !== user.id);
    for (const m of autres) await pousser(m.user_id, { titre: `💌 ${prenom}`, texte }).catch(() => 0);
    return json({ ok: true, envoye: autres.length > 0, ...(await etat()) });
  }

  // La météo du cœur : une par jour et par personne (la nouvelle remplace celle du jour), partagée ou gardée pour soi.
  if (action === 'couple_humeur') {
    const h = Math.round(Number(b.humeur));
    if (!HUMEURS[h]) return json({ error: 'bad_request' }, 400);
    const besoin = BESOINS[b.besoin] ? b.besoin : null, note = clean(b.note, 200), partage = b.partage !== false;
    const veille = new Date(t.getTime() - 86400e3).toISOString();
    const duJour = (await read(`/rest/v1/couple_activites?couple_id=eq.${lien.couple_id}&auteur=eq.${user.id}&type=eq.humeur&created_at=gte.${veille}&select=id,created_at`).catch(() => [])).filter((x) => jourParis(new Date(x.created_at || t)) === jourParis(t));
    for (const x of duJour) await call(`/rest/v1/couple_activites?id=eq.${x.id}`, { method: 'DELETE' }).catch(() => {});
    await insert('couple_activites', { couple_id: lien.couple_id, auteur: user.id, titre: JSON.stringify({ h, b: besoin, n: note }), type: 'humeur', visibilite: partage ? 'nous' : 'moi', fait_at: t.toISOString() });
    if (partage) {
      const autres = (await read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id`).catch(() => [])).filter((m) => m.user_id !== user.id);
      for (const m of autres) await pousser(m.user_id, { titre: `${HUMEURS[h][0]} ${prenom}`, texte: besoin && besoin !== 'rien' ? `Aujourd’hui : ${BESOINS[besoin].toLowerCase()}. Regarde ce qui lui ferait du bien 💞` : `${prenom} a partagé comment ça va aujourd’hui.` }).catch(() => 0);
    }
    return json({ ok: true, ...(await etat()) });
  }

  // La question du jour : chacun répond ; la réponse se change jusqu'à minuit.
  if (action === 'couple_reponse') {
    const texte = clean(b.texte, 400);
    if (texte.length < 1) return json({ error: 'titre_requis' }, 400);
    const quand = `${jourParis(t)}T00:00:00Z`;
    const [deja] = await read(`/rest/v1/couple_activites?couple_id=eq.${lien.couple_id}&auteur=eq.${user.id}&type=eq.question&quand=eq.${quand}&select=id`).catch(() => []);
    if (deja) await patch('couple_activites', `id=eq.${deja.id}`, { titre: texte });
    else {
      await insert('couple_activites', { couple_id: lien.couple_id, auteur: user.id, titre: texte, type: 'question', quand, visibilite: 'nous', fait_at: t.toISOString() });
      const autres = (await read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id`).catch(() => [])).filter((m) => m.user_id !== user.id);
      for (const m of autres) await pousser(m.user_id, { titre: `💬 ${prenom} a répondu`, texte: 'À la question du jour. Réponds à ton tour pour découvrir sa réponse.' }).catch(() => 0);
    }
    return json({ ok: true, ...(await etat()) });
  }

  // Le bocal à souvenirs : un moment à garder, avec sa date si on veut.
  if (action === 'couple_souvenir') {
    const texte = clean(b.texte, 300);
    if (texte.length < 2) return json({ error: 'titre_requis' }, 400);
    const quand = b.quand && /^\d{4}-\d{2}-\d{2}$/.test(b.quand) ? `${b.quand}T00:00:00Z` : null;
    await insert('couple_activites', { couple_id: lien.couple_id, auteur: user.id, titre: texte, type: 'souvenir', quand, visibilite: 'nous', fait_at: t.toISOString() });
    return json({ ok: true, ...(await etat()) });
  }

  const autresMembres = async () => (await read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id`).catch(() => [])).filter((m) => m.user_id !== user.id);

  // Jeux : on envoie une carte à l'autre ; seul l'autre y répond.
  if (action === 'couple_jeu') {
    const jeu = JEUX[b.jeu], i = Number(b.i);
    if (!jeu || !Number.isInteger(i) || !jeu.cartes[i]) return json({ error: 'bad_request' }, 400);
    await insert('couple_activites', { couple_id: lien.couple_id, auteur: user.id, titre: JSON.stringify({ j: b.jeu, i }), type: 'jeu', visibilite: 'nous' });
    for (const m of await autresMembres()) await pousser(m.user_id, { titre: `🎲 ${prenom} te lance une carte`, texte: `${jeu.nom} : ${jeu.cartes[i]}` }).catch(() => 0);
    return json({ ok: true, ...(await etat()) });
  }
  if (action === 'couple_jeu_repondre') {
    const id = clean(b.id, 40), texte = clean(b.texte, 400);
    if (!UUID.test(id) || !texte) return json({ error: 'bad_request' }, 400);
    const [x] = await read(`/rest/v1/couple_activites?id=eq.${id}&couple_id=eq.${lien.couple_id}&type=eq.jeu&select=id,auteur,titre`).catch(() => []);
    if (!x) return json({ error: 'not_found' }, 404);
    if (x.auteur === user.id) return json({ error: 'forbidden' }, 403);
    const j = lireJson(x.titre);
    await patch('couple_activites', `id=eq.${id}`, { titre: JSON.stringify({ ...j, r: texte }), fait_at: t.toISOString() });
    if (!j.r) await pousser(x.auteur, { titre: `💬 ${prenom} a répondu`, texte: texte.slice(0, 120) }).catch(() => 0);
    return json({ ok: true, ...(await etat()) });
  }

  // « Et si on se mariait ? » : la demande part chez l'autre, qui répond oui (le parcours s'ouvre) ou prend le temps d'y réfléchir.
  // Déjà fiancés : on ouvre le parcours tout de suite (deja: true).
  const poserJalon = async (cle, date) => {
    await call(`/rest/v1/couple_activites?couple_id=eq.${lien.couple_id}&type=eq.jalon&titre=eq.${cle}`, { method: 'DELETE' }).catch(() => {});
    if (date) await insert('couple_activites', { couple_id: lien.couple_id, auteur: user.id, titre: cle, type: 'jalon', quand: `${date}T00:00:00Z`, visibilite: 'nous' });
  };
  const derniereDemande = async () => (await read(`/rest/v1/couple_activites?couple_id=eq.${lien.couple_id}&type=eq.demande&select=id,auteur,titre,created_at&order=created_at.desc&limit=1`).catch(() => []))[0] || null;
  if (action === 'couple_demande') {
    const autres = await autresMembres();
    if (!autres.length) return json({ error: 'seul' }, 409);
    const d = await derniereDemande(), s0 = d ? lireJson(d.titre).s : null;
    if (s0 === 'oui' || (s0 === 'attente' && d.auteur === user.id)) return json({ ok: true, ...(await etat()) });
    const deja = b.deja === true;
    await insert('couple_activites', { couple_id: lien.couple_id, auteur: user.id, titre: JSON.stringify({ m: clean(b.message, 600) || null, s: deja ? 'oui' : 'attente' }), type: 'demande', visibilite: 'nous', fait_at: deja ? t.toISOString() : null });
    if (deja) await poserJalon('demande', jourParis(t));
    for (const m of autres) await pousser(m.user_id, deja ? { titre: '💍 Votre parcours de fiançailles est ouvert', texte: `${prenom} l’a ouvert dans votre espace de couple.` } : { titre: `💍 ${prenom} a une question pour toi…`, texte: 'Ouvre votre espace de couple 💞' }).catch(() => 0);
    return json({ ok: true, ...(await etat()) });
  }
  if (action === 'couple_demande_repondre') {
    const d = await derniereDemande(), x = d ? lireJson(d.titre) : {};
    if (!d || d.auteur === user.id || !['attente', 'reflexion'].includes(x.s)) return json({ error: 'not_found' }, 404);
    const oui = b.oui === true;
    await patch('couple_activites', `id=eq.${d.id}`, { titre: JSON.stringify({ ...x, s: oui ? 'oui' : 'reflexion' }), fait_at: oui ? t.toISOString() : null });
    if (oui) {
      await poserJalon('demande', jourParis(t));
      await pousser(d.auteur, { titre: `💍 ${prenom} a dit oui !`, texte: 'Félicitations à vous deux : votre parcours de fiançailles est ouvert.' }).catch(() => 0);
      const membres = await read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=prenom`).catch(() => []);
      await alerter({ titre: `💍 ${membres.map((m) => m.prenom || 'Partenaire').join(' et ')} se fiancent`, lignes: [`${prenom} a dit oui à la demande en mariage, dans leur espace de couple.`], tag: 'fiancailles' }).catch(() => {});
    } else await pousser(d.auteur, { titre: `🌙 ${prenom} prend le temps d’y réfléchir`, texte: 'Ta demande est bien arrivée. Laisse-lui un peu de temps 💞' }).catch(() => 0);
    return json({ ok: true, ...(await etat()) });
  }

  // Fiançailles : une date par grande étape (la nouvelle remplace l'ancienne ; vide pour l'effacer).
  if (action === 'couple_jalon') {
    if (!JALONS[b.cle]) return json({ error: 'bad_request' }, 400);
    await poserJalon(b.cle, /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? b.date : null);
    return json({ ok: true, ...(await etat()) });
  }
  // La liste pour préparer le mariage : cochée par l'un, cochée pour les deux.
  if (action === 'couple_prepa') {
    if (!PREPA[b.cle]) return json({ error: 'bad_request' }, 400);
    await call(`/rest/v1/couple_activites?couple_id=eq.${lien.couple_id}&type=eq.prepa&titre=eq.${b.cle}`, { method: 'DELETE' }).catch(() => {});
    if (b.fait !== false) await insert('couple_activites', { couple_id: lien.couple_id, auteur: user.id, titre: b.cle, type: 'prepa', visibilite: 'nous', fait_at: t.toISOString() });
    return json({ ok: true, ...(await etat()) });
  }

  if (action === 'couple_cadeau') {
    if (!CADEAUX[b.type]) return json({ error: 'bad_request' }, 400);
    const note = clean(b.note, 300);
    await insert('cadeaux_demandes', { user_id: user.id, couple_id: lien.couple_id, type: b.type, note: note || null });
    await alerter({ titre: `Faire plaisir · ${CADEAUX[b.type].toLowerCase()}`, lignes: [`${prenom} (${user.email}) voudrait offrir ${CADEAUX[b.type].toLowerCase()} à son ou sa partenaire.`, ...(note ? [`« ${note} »`] : []), 'À traiter à la main en attendant les partenariats.'], lien: '/tableau-de-bord#accueil', tag: 'cadeau' }).catch(() => {});
    return json({ ok: true });
  }

  // « On s'est mariés » (Lamia, 16 nov. 2026) : avec une photo du mariage, Lamia leur offre un cadeau.
  // La photo va dans le stockage privé (jamais publiée) ; Lamia reçoit une alerte avec un lien privé de 7 jours et l'adresse.
  if (action === 'couple_mariage_photo') {
    const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };
    if (!EXT[b.mime] || !(Number(b.size) > 0 && Number(b.size) <= 15 * 1024 * 1024)) return json({ error: 'photo_invalide' }, 400);
    const path = `mariages/${lien.couple_id}/${t.getTime()}.${EXT[b.mime]}`;
    const r = await call(`/storage/v1/object/upload/sign/annonces/${path}`, { method: 'POST', body: '{}' });
    if (!r.ok) return json({ error: 'temporary_failure' }, 502);
    const { url } = await r.json();
    return json({ ok: true, upload: { url: `${DATABASE_URL}/storage/v1${url}`, type: b.mime, path } });
  }
  if (action === 'couple_mariage') {
    const path = clean(b.path, 200);
    if (!path.startsWith(`mariages/${lien.couple_id}/`)) return json({ error: 'photo_requise' }, 400);
    const adresse = clean(b.adresse, 400), date = clean(b.date, 20);
    if (adresse.length < 10) return json({ error: 'adresse_requise' }, 400);
    let lienPhoto = '';
    try { const r = await call('/storage/v1/object/sign/annonces', { method: 'POST', body: JSON.stringify({ expiresIn: 7 * 86400, paths: [path] }) }); const [x] = r.ok ? await r.json() : []; if (x?.signedURL) lienPhoto = `${DATABASE_URL}/storage/v1${x.signedURL}`; } catch { /* le lien se redemande plus tard */ }
    const membres = await read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id,prenom`).catch(() => []);
    const noms = membres.map((m) => m.prenom || 'Partenaire').join(' et ');
    const lignes = [`${noms} se sont mariés${date ? ` le ${date}` : ''} 🎉`, `Adresse pour le cadeau : ${adresse}`, `Contact : ${user.email}`, lienPhoto ? `Photo (lien privé, 7 jours) : ${lienPhoto}` : `Photo dans le stockage : ${path}`];
    await journal({ titre: `💍 Mariage · ${noms}`, lignes, categorie: 'profil' }).catch(() => {});
    await alerter({ titre: `💍 ${noms} se sont mariés`, lignes: [...lignes, 'Un cadeau de Lamia à leur envoyer.'], tag: 'mariage' }).catch(() => {});
    for (const m of membres) if (m.user_id !== user.id) await pousser(m.user_id, { titre: '💍 Félicitations !', texte: 'Lamia a bien reçu votre photo de mariage : votre cadeau arrive.' }).catch(() => 0);
    return json({ ok: true });
  }

  if (action === 'couple_quitter') {
    await call(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&user_id=eq.${user.id}`, { method: 'DELETE' });
    const reste = await read(`/rest/v1/couple_membres?couple_id=eq.${lien.couple_id}&select=user_id`).catch(() => [{}]);
    if (!reste.length) await call(`/rest/v1/couples?id=eq.${lien.couple_id}`, { method: 'DELETE' }).catch(() => {});
    return json({ ok: true, couple: null });
  }

  return json({ error: 'unknown_action' }, 400);
}
