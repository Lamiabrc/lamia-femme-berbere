// Cockpit de pilotage — Lamia Femme Berbère. Données stockées localement (navigateur).
const STORE = 'lfb_pilotage_v1';

const DOMAINS = {
  tech: { label: 'Technique', cls: 't' },
  ux: { label: 'UX / Design', cls: '' },
  mkt: { label: 'Marketing', cls: 'm' }
};

// p = priorité (1 critique, 2 important, 3 confort) · h = horizon en jours
const TASKS = [
  { id: 't1', d: 'tech', p: 1, h: 30, t: 'Auditer les règles RLS Supabase (signalements, preuves audio, membres)', why: 'Ce sont des données sensibles : la vérification du rôle admin côté navigateur ne protège rien, seules les règles serveur comptent.' },
  { id: 't2', d: 'tech', p: 1, h: 30, t: 'Brancher Stripe Checkout (compte dédié à la marque)', why: 'Sans paiement, le panier ne génère aucun chiffre d’affaires.' },
  { id: 't3', d: 'tech', p: 1, h: 30, t: 'Valider le stock côté serveur (webhook Stripe)', why: 'Évite de vendre deux fois une pièce unique.' },
  { id: 't4', d: 'tech', p: 1, h: 30, t: 'Publier mentions légales, CGV, politique de confidentialité (RGPD)', why: 'Obligatoire pour vendre, et indispensable pour collecter profils et audios.' },
  { id: 't5', d: 'tech', p: 2, h: 30, t: 'Mettre en place des statistiques respectueuses (Plausible ou similaire)', why: 'Impossible de piloter sans mesurer visites, ajouts au panier et achats.' },
  { id: 't6', d: 'tech', p: 3, h: 30, t: 'Centraliser l’URL et la clé Supabase dans un seul fichier config.js', why: 'Aujourd’hui dupliquées dans 3 fichiers.' },
  { id: 't7', d: 'tech', p: 2, h: 60, t: 'Versionner le schéma SQL et les politiques RLS dans le dépôt (dossier supabase/)', why: 'Permet de reconstruire et relire la sécurité à tout moment.' },
  { id: 't8', d: 'tech', p: 2, h: 60, t: 'E-mail de confirmation de commande + suivi', why: 'Premier signe de confiance après l’achat.' },
  { id: 't9', d: 'tech', p: 2, h: 60, t: 'Optimiser les images (WebP, chargement différé)', why: 'Le vitesse mobile conditionne la conversion.' },
  { id: 't10', d: 'tech', p: 2, h: 90, t: 'Sauvegardes Supabase et alerte en cas de panne', why: 'Une panne un soir de live coûte cher en confiance.' },

  { id: 'u1', d: 'ux', p: 1, h: 30, t: 'Ne plus afficher les produits de démonstration comme achetables en cas de panne', why: 'Le repli actuel permet d’ajouter au panier des articles fictifs.' },
  { id: 'u2', d: 'ux', p: 1, h: 30, t: 'Ajouter un bandeau de réassurance : livraison, retours, paiement sécurisé', why: 'Lève les doutes juste avant le clic sur « Ajouter ».' },
  { id: 'u3', d: 'ux', p: 2, h: 30, t: 'Remplacer le curseur personnalisé (cursor:none) par le curseur normal', why: 'Il gêne l’accessibilité et la précision, surtout pour les personnes moins à l’aise avec le numérique.' },
  { id: 'u4', d: 'ux', p: 1, h: 30, t: 'Tester le parcours complet sur de vrais téléphones (3 personnes, sans les guider)', why: 'La majorité de ton audience arrive depuis les réseaux sociaux, donc sur mobile.' },
  { id: 'u5', d: 'ux', p: 2, h: 60, t: 'Créer une page par produit avec plusieurs photos et une histoire', why: 'Les pièces uniques et les livres se vendent par le récit.' },
  { id: 'u6', d: 'ux', p: 2, h: 60, t: 'Expliquer le matching et la sécurité en 3 étapes avant l’inscription', why: 'Un public prudent s’inscrit quand il comprend ce qui arrive à ses données.' },
  { id: 'u7', d: 'ux', p: 2, h: 60, t: 'Passer un audit accessibilité : contrastes, focus clavier, textes alternatifs', why: 'Plus de personnes peuvent acheter, et le référencement s’améliore.' },
  { id: 'u8', d: 'ux', p: 3, h: 90, t: 'Ajouter une page « Mon histoire » plus visible dans la navigation', why: 'Ta personne est ton principal atout face aux grandes boutiques.' },

  { id: 'm1', d: 'mkt', p: 1, h: 30, t: 'Écrire la promesse de marque en une phrase et la cible en un portrait', why: 'Tout le reste (posts, offres, site) s’aligne dessus.' },
  { id: 'm2', d: 'mkt', p: 1, h: 30, t: 'Créer un cadeau pour la newsletter (extrait de « Werdi, ouvre les yeux ! »)', why: 'Un inscrit coûte beaucoup moins cher qu’un acheteur, et le public est déjà là.' },
  { id: 'm3', d: 'mkt', p: 1, h: 30, t: 'Tenir 3 publications par semaine pendant 4 semaines (voir l’onglet Contenus)', why: 'La régularité compte plus que la perfection.' },
  { id: 'm4', d: 'mkt', p: 2, h: 30, t: 'Fixer un rendez-vous récurrent pour le Live Mariage Kabyle', why: 'Un rituel fidélise mieux qu’une publicité.' },
  { id: 'm5', d: 'mkt', p: 2, h: 60, t: 'Collecter 10 avis ou témoignages et les afficher', why: 'La preuve sociale rassure surtout pour les rencontres.' },
  { id: 'm6', d: 'mkt', p: 2, h: 60, t: 'Lancer un coffret livre + bijou à prix de lancement', why: 'Augmente le panier moyen avec des produits que tu as déjà.' },
  { id: 'm7', d: 'mkt', p: 2, h: 60, t: 'Écrire titres et descriptions pour chaque catégorie (référencement)', why: 'Trafic gratuit sur « bijoux kabyles », « livre amour communauté »…' },
  { id: 'm8', d: 'mkt', p: 2, h: 90, t: 'Organiser un speed dating pilote de 10 personnes', why: 'On valide l’expérience à petite échelle avant de grandir.' },
  { id: 'm9', d: 'mkt', p: 3, h: 90, t: 'Proposer 3 partenariats avec des créatrices ou associations de la diaspora', why: 'Accès à des communautés déjà engagées.' }
];

const HORIZONS = { 30: '30 premiers jours', 60: 'Jours 31 à 60', 90: 'Jours 61 à 90' };

// ---------- Contenus ----------
const PILLARS = [
  { name: 'Yemma Werdi', formats: ['Carrousel', 'Reel', 'Citation'], hooks: [
    'Le conseil que j’aurais voulu entendre avant mes premiers messages…',
    '3 signaux d’un « virtuel » qui ne deviendra jamais réel',
    'Werdi, ouvre les yeux : ce qu’on ne dit pas aux filles amoureuses' ],
    body: 'Une idée, un exemple vécu, une phrase à retenir. Ton : une grande sœur bienveillante, jamais moralisatrice.', cta: 'Le livre est dans la boutique, lien en bio.' },
  { name: 'Les Trouvailles', formats: ['Photo', 'Reel', 'Story'], hooks: [
    'Pièce unique du jour : il n’en existe qu’un exemplaire',
    'Cette carte postale a une histoire…',
    'Ce que j’ai déniché ce week-end' ],
    body: 'Montre l’objet de près, raconte d’où il vient, précise « exemplaire unique » pour créer l’urgence juste.', cta: 'Premier arrivé, premier servi : lien en bio.' },
  { name: 'Bijoux & créations', formats: ['Photo portée', 'Reel', 'Carrousel'], hooks: [
    'Un bijou simple qui parle de nous',
    'L’alliance pensée pour les couples de la communauté',
    'Comment porter le turquoise cette semaine' ],
    body: 'Photo portée en lumière naturelle, un détail de fabrication, une occasion de l’offrir.', cta: 'À découvrir dans la boutique.' },
  { name: 'Amour & communauté', formats: ['Live', 'Témoignage', 'Story sondage'], hooks: [
    'Question de la semaine : qu’est-ce qui compte le plus dans un mariage kabyle ?',
    'Live Mariage Kabyle : on en parle ce soir',
    'Ce que le matching kabyle change, vraiment' ],
    body: 'Pose une vraie question, réponds en direct aux commentaires, rappelle les règles de respect et de sécurité.', cta: 'Crée ton espace membre pour être prévenu(e) du prochain rendez-vous.' },
  { name: 'Coulisses', formats: ['Story', 'Photo', 'Reel'], hooks: [
    'Préparation de commande avec moi',
    'Une journée dans l’univers de Lamia',
    'Pourquoi j’ai créé cette maison' ],
    body: 'Du vrai, du simple, du chaleureux. C’est ce qui te distingue d’une boutique anonyme.', cta: 'Dis-moi en commentaire ce que tu veux voir.' }
];
const SLOTS = [
  { day: 'Mardi', pillar: 0 }, { day: 'Jeudi', pillar: 3 }, { day: 'Samedi', pillar: 1 }
];
const ROTATE = [[0, 3, 1], [2, 3, 4], [0, 3, 1], [2, 3, 4]]; // pilier par créneau et par semaine

// ---------- KPI ----------
const KPI_FIELDS = [
  ['visitors', 'Visiteurs du site'], ['carts', 'Ajouts au panier'], ['orders', 'Commandes'],
  ['revenue', 'Chiffre d’affaires (€)'], ['ads', 'Dépenses pub (€)'], ['subs', 'Inscrits newsletter'], ['members', 'Nouveaux membres']
];

// ---------- État ----------
const blank = () => ({ done: {}, kpi: {}, kpiNote: '', start: nextMonday(), filter: { d: 'all', h: 'all' } });
function nextMonday() {
  const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}
let S;
try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { S = blank(); }
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* stockage indisponible */ } };

// ---------- Outils DOM ----------
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => { if (c != null) el.append(c.nodeType ? c : document.createTextNode(c)); });
  return el;
}
const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
const eur = n => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0);
const pct = n => (isFinite(n) ? n.toFixed(1).replace('.', ',') : '0') + ' %';
const progress = (done, total, cls) => h('div', { class: 'bar ' + (cls || '') }, h('i', { style: `width:${total ? Math.round(done / total * 100) : 0}%` }));

// ---------- Onglets ----------
const TABS = [['today', 'Aujourd’hui'], ['road', 'Feuille de route'], ['kpi', 'Chiffres'], ['edit', 'Contenus']];
let current = 'today';
function renderTabs() {
  const box = clear($('#tabs'));
  TABS.forEach(([id, label]) => box.append(h('button', {
    role: 'tab', 'aria-selected': id === current, onclick: () => { current = id; renderAll(); }
  }, label)));
  TABS.forEach(([id]) => $('#tab-' + id).classList.toggle('hidden', id !== current));
}

// ---------- Aujourd’hui ----------
function kpiMetrics() {
  const k = S.kpi, v = key => Number(k[key]) || 0;
  return {
    cartRate: v('visitors') ? v('carts') / v('visitors') * 100 : null,
    conv: v('visitors') ? v('orders') / v('visitors') * 100 : null,
    basket: v('orders') ? v('revenue') / v('orders') : null,
    cac: v('orders') && v('ads') ? v('ads') / v('orders') : null,
    subRate: v('visitors') ? v('subs') / v('visitors') * 100 : null,
    roas: v('ads') ? v('revenue') / v('ads') : null
  };
}
function diagnose() {
  const m = kpiMetrics(), out = [];
  if (m.conv === null) return [{ lvl: 'warn', text: 'Renseigne tes chiffres de la semaine dans l’onglet « Chiffres » pour obtenir un diagnostic.' }];
  if (m.cartRate < 5) out.push({ lvl: 'bad', text: `Seulement ${pct(m.cartRate)} des visiteurs ajoutent au panier : travaille la réassurance, les photos et la clarté des prix (tâches UX).` });
  else out.push({ lvl: 'ok', text: `${pct(m.cartRate)} d’ajouts au panier : les produits donnent envie.` });
  if (m.cartRate !== null && m.conv < m.cartRate / 3) out.push({ lvl: 'warn', text: 'Beaucoup de paniers n’aboutissent pas : simplifie le paiement et affiche livraison et retours avant l’étape finale.' });
  if (m.conv < 1) out.push({ lvl: 'warn', text: `Conversion de ${pct(m.conv)} : en dessous de 1 %, la priorité est la confiance (avis, mentions légales, paiement sécurisé).` });
  else if (m.conv >= 2) out.push({ lvl: 'ok', text: `Conversion de ${pct(m.conv)} : très bien pour une petite boutique, augmente maintenant le trafic.` });
  if (m.roas !== null && m.roas < 2) out.push({ lvl: 'bad', text: `Chaque euro de pub rapporte ${m.roas.toFixed(1).replace('.', ',')} € : arrête ou ajuste avant d’augmenter le budget.` });
  if (m.subRate !== null && m.subRate < 2) out.push({ lvl: 'warn', text: 'Peu d’inscriptions à la newsletter : mets le cadeau (extrait du livre) en avant.' });
  return out;
}
// Une priorité par domaine (technique, UX, marketing) pour avancer sur tous les fronts
function nextTasks() {
  const open = TASKS.filter(t => !S.done[t.id]).sort((a, b) => a.p - b.p || a.h - b.h);
  return Object.keys(DOMAINS).map(d => open.find(t => t.d === d)).filter(Boolean);
}
function renderToday() {
  const box = clear($('#tab-today'));
  const total = TASKS.length, done = TASKS.filter(t => S.done[t.id]).length;
  const next = nextTasks();
  const brief = h('div', { class: 'brief' },
    h('span', { class: 'tag' }, 'Le point du manager'),
    h('h2', {}, done === total ? 'Tout est fait. Bravo.' : `Voici tes ${next.length} priorités`),
    h('p', {}, `${done} tâche${done > 1 ? 's' : ''} terminée${done > 1 ? 's' : ''} sur ${total}. Ne fais que celles-ci avant de passer à la suite : on avance mieux en finissant qu’en éparpillant.`),
    ...next.map((t, i) => h('p', {}, h('strong', {}, `${i + 1}. [${DOMAINS[t.d].label}] ${t.t}`), h('br'), t.why)));
  box.append(brief);

  const stats = h('div', { class: 'grid g3' });
  Object.entries(DOMAINS).forEach(([key, dom]) => {
    const list = TASKS.filter(t => t.d === key), dn = list.filter(t => S.done[t.id]).length;
    stats.append(h('div', { class: 'card' }, h('h3', {}, dom.label), h('span', { class: 'sub' }, `${dn} / ${list.length}`), progress(dn, list.length, dom.cls)));
  });
  box.append(stats);

  const diag = h('div', { class: 'card', style: 'margin-top:16px' }, h('h2', {}, 'Diagnostic des chiffres'));
  diagnose().forEach(d => diag.append(h('div', { class: 'verdict ' + d.lvl }, d.text)));
  box.append(diag);
}

// ---------- Feuille de route ----------
function renderRoad() {
  const box = clear($('#tab-road'));
  const f = S.filter;
  const mk = (label, val, key) => h('button', { class: f[key] === val ? 'on' : '', onclick: () => { f[key] = val; save(); renderRoad(); } }, label);
  box.append(h('div', { class: 'filters' },
    mk('Tout', 'all', 'd'), ...Object.entries(DOMAINS).map(([k, d]) => mk(d.label, k, 'd'))),
    h('div', { class: 'filters' }, mk('Tous horizons', 'all', 'h'), ...[30, 60, 90].map(x => mk(x + ' jours', x, 'h'))));

  [30, 60, 90].filter(x => f.h === 'all' || f.h === x).forEach(hz => {
    const list = TASKS.filter(t => t.h === hz && (f.d === 'all' || t.d === f.d)).sort((a, b) => a.p - b.p);
    if (!list.length) return;
    const dn = list.filter(t => S.done[t.id]).length;
    const card = h('div', { class: 'card', style: 'margin-bottom:16px' }, h('h2', {}, HORIZONS[hz]), h('span', { class: 'sub' }, `${dn} / ${list.length} terminées`), progress(dn, list.length));
    list.forEach(t => {
      const id = 'chk-' + t.id;
      card.append(h('div', { class: 'task' + (S.done[t.id] ? ' done' : '') },
        h('input', { type: 'checkbox', id, checked: !!S.done[t.id], onchange: e => { S.done[t.id] = e.target.checked; save(); renderAll(); } }),
        h('label', { for: id }, t.t, h('small', {}, `${DOMAINS[t.d].label} · ${t.why}`)),
        h('span', { class: 'pill p' + t.p }, ['', 'Critique', 'Important', 'Confort'][t.p])));
    });
    box.append(card);
  });
  box.append(h('button', { class: 'soft', onclick: () => { if (confirm('Tout décocher ?')) { S.done = {}; save(); renderAll(); } } }, 'Réinitialiser la feuille de route'));
}

// ---------- Chiffres ----------
function renderKpi() {
  const box = clear($('#tab-kpi'));
  const form = h('div', { class: 'card' }, h('h2', {}, 'Chiffres de la semaine'), h('p', { class: 'sub' }, 'Remplis une fois par semaine, le même jour. Tout est calculé automatiquement.'));
  const grid = h('div', { class: 'grid g4' });
  KPI_FIELDS.forEach(([key, label]) => grid.append(h('label', { class: 'f' }, label,
    h('input', { type: 'number', min: '0', step: 'any', value: S.kpi[key] ?? '', oninput: e => { S.kpi[key] = e.target.value; save(); renderKpiResults(); renderToday(); } }))));
  form.append(grid);
  box.append(form, h('div', { id: 'kpiResults', style: 'margin-top:16px' }));
  renderKpiResults();
}
function renderKpiResults() {
  const box = $('#kpiResults'); if (!box) return; clear(box);
  const m = kpiMetrics();
  const tiles = [
    ['Taux d’ajout au panier', m.cartRate === null ? '—' : pct(m.cartRate), 'Objectif : plus de 5 %'],
    ['Taux de conversion', m.conv === null ? '—' : pct(m.conv), 'Objectif : 1 à 3 %'],
    ['Panier moyen', m.basket === null ? '—' : eur(m.basket), 'Le coffret livre + bijou le fait monter'],
    ['Coût par commande (pub)', m.cac === null ? '—' : eur(m.cac), 'Doit rester sous la marge'],
    ['Retour sur pub', m.roas === null ? '—' : m.roas.toFixed(1).replace('.', ',') + ' ×', 'Objectif : plus de 3 ×'],
    ['Inscription newsletter', m.subRate === null ? '—' : pct(m.subRate), 'Objectif : plus de 3 %']
  ];
  const g = h('div', { class: 'grid g3' });
  tiles.forEach(([l, v, hint]) => g.append(h('div', { class: 'card' }, h('div', { class: 'kpi' }, v, h('small', {}, l)), h('div', { class: 'sub', style: 'font-size:13px;margin-top:8px' }, hint))));
  box.append(g);
}

// ---------- Contenus ----------
function buildPlan() {
  const start = new Date(S.start + 'T00:00:00');
  const dayIdx = { Mardi: 1, Jeudi: 3, Samedi: 5 };
  const plan = [];
  for (let w = 0; w < 4; w++) {
    SLOTS.forEach((slot, i) => {
      const p = PILLARS[ROTATE[w][i]];
      const date = new Date(start); date.setDate(start.getDate() + w * 7 + dayIdx[slot.day]);
      const hook = p.hooks[(w + i) % p.hooks.length];
      plan.push({
        week: w + 1, day: slot.day, date, pillar: p.name, format: p.formats[(w + i) % p.formats.length], hook,
        text: `${hook}\n\n${p.body}\n\n${p.cta}\n\n#LamiaFemmeBerbere #Kabyle #Amazigh`
      });
    });
  }
  return plan;
}
function renderEdit() {
  const box = clear($('#tab-edit'));
  box.append(h('div', { class: 'card' }, h('h2', {}, 'Plan de contenus sur 4 semaines'),
    h('p', { class: 'sub' }, '3 publications par semaine, en alternant tes univers. Chaque idée est un point de départ : réécris-la avec ta voix.'),
    h('label', { class: 'f', style: 'max-width:240px' }, 'Début du plan (un lundi)',
      h('input', { type: 'date', value: S.start, onchange: e => { if (e.target.value) { S.start = e.target.value; save(); renderEdit(); } } }))));
  const plan = buildPlan();
  for (let w = 1; w <= 4; w++) {
    const card = h('div', { class: 'card', style: 'margin-top:16px' }, h('h3', {}, 'Semaine ' + w));
    plan.filter(p => p.week === w).forEach(p => {
      const pre = h('pre', {}, p.text);
      card.append(h('div', { class: 'post' },
        h('div', { class: 'meta' }, h('span', { class: 'pill' }, p.pillar), h('span', { class: 'pill p3' }, p.format),
          h('strong', {}, `${p.day} ${p.date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`)),
        pre,
        h('button', { class: 'soft', onclick: async ev => {
          try { await navigator.clipboard.writeText(p.text); ev.target.textContent = 'Copié ✓'; setTimeout(() => ev.target.textContent = 'Copier', 1500); }
          catch (e) { ev.target.textContent = 'Copie impossible'; }
        } }, 'Copier')));
    });
    box.append(card);
  }
}

function renderAll() { renderTabs(); renderToday(); renderRoad(); renderKpi(); renderEdit(); }
renderAll();
