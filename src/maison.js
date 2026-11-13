// Données vivantes de la Maison : catalogue, fiche produit, panier, prochaine soirée.
// Le navigateur n'utilise que la clé publique Supabase ; aucune donnée privée n'est lue ici.

import { SHIPPING_METHODS, shippingFor, MAX_QTY, tvaIncluse, reglagesPropres, taillesDe, supplementTaille, parLettre } from '/assets/shipping.mjs';
import { RUBRIQUES, rubriqueDe } from '/assets/rubriques.mjs';

// Frais d'envoi et TVA réglés par Lamia (le serveur recalcule toujours à la commande).
let REGLAGES = reglagesPropres();
const reglagesPrets = fetch('/api/admin?action=boutique').then((r) => (r.ok ? r.json() : null)).then((v) => { if (v) REGLAGES = reglagesPropres(v); }).catch(() => {});

export const SUPABASE_URL = 'https://tybwvxinigahhntfeeur.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
export const money = (cents, currency = 'EUR') => new Intl.NumberFormat(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { style: 'currency', currency }).format((cents || 0) / 100);

const ROOMS = {
  bijoux: { slug: 'ecrin', name: 'L’Écrin', path: '/ecrin/', accent: 'vert' },
  livres: { slug: 'bibliotheque', name: 'La Bibliothèque de Yemma', path: '/bibliotheque/', accent: 'cobalt' },
  trouvailles: { slug: 'grenier', name: 'Le Grenier des Trouvailles', path: '/grenier/', accent: 'safran' },
};
const roomOf = (p) => ROOMS[p.categories?.slug] || { slug: 'boutique', name: 'La Boutique', path: '/boutique/', accent: 'rouge' };

// Médias HD hébergés par la Maison, en attendant la table media_assets.
// kind : 'ambiance' (mise en scène) ou 'reel' (photo réelle de l'objet).
const MEDIA = {
  'collier-kabyle-argente-emaille-15g': ['hero', 'porte', 'detail', 'ecrin'].map((v) => ({
    src: `/images/collier/collier-kabyle-15g-${v}`,
    kind: 'ambiance',
    alt: {
      hero: 'Collier kabyle émaillé posé sur une pierre claire',
      porte: 'Collier kabyle émaillé porté',
      detail: 'Détail du médaillon central émaillé, cabochon de corail',
      ecrin: 'Collier kabyle dans son écrin Lamia Femme Berbère',
    }[v],
  })),
};
// Les photos ajoutées depuis le tableau de bord (gallery) passent avant les photos d'origine.
const mediaFor = (p) => {
  const fromDb = (Array.isArray(p.gallery) ? p.gallery : []).map((x) => (typeof x === 'string' ? { url: x } : x)).filter((x) => x?.url);
  if (fromDb.length) return fromDb.map((x) => ({ url: x.url, kind: 'reel', alt: x.alt || p.name }));
  return MEDIA[p.slug] || [p.cover_image_url].filter(Boolean).map((src) => ({ url: src, kind: 'inconnu', alt: p.name }));
};
const srcset = (m) => (m.src ? `${m.src}-320.webp 320w, ${m.src}-640.webp 640w, ${m.src}-1120.webp 1120w` : '');
const img = (m, sizes, attrs = '') =>
  m.src
    ? `<img src="${m.src}-640.webp" srcset="${srcset(m)}" sizes="${sizes}" alt="${esc(m.alt)}" ${attrs}>`
    : `<img src="${esc(m.url)}" alt="${esc(m.alt)}" ${attrs}>`;

// ---------------------------------------------------------------- Supabase (lecture publique)

async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

// Version anglaise (/en/…) : les fiches sont traduites depuis /assets/i18n/products-en.json.
const EN = document.documentElement.lang === 'en';
const enProduit = (p, t) => {
  if (!t) return p;
  const gallery = Array.isArray(p.gallery) ? p.gallery.map((g, i) => (g && typeof g === 'object' && t.alts?.[i] ? { ...g, alt: t.alts[i] } : g)) : p.gallery;
  const metadata = { ...(p.metadata || {}) };
  for (const k of ['craft', 'origin', 'designers']) if (t[k] && metadata[k]) metadata[k] = t[k];
  return { ...p, name: t.name || p.name, subtitle: p.subtitle && (t.subtitle || p.subtitle), description: p.description && (t.description || p.description), gallery, metadata };
};

let productsPromise;
export function loadProducts() {
  productsPromise ||= Promise.all([
    rest('products?select=id,slug,name,subtitle,description,price_cents,compare_at_price_cents,currency,stock_qty,is_unique,product_type,featured,cover_image_url,gallery,metadata,categories(name,slug)&status=eq.active&order=featured.desc,created_at.desc'),
    EN ? fetch('/assets/i18n/products-en.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})) : {},
  ]).then(([ps, tr]) => (EN ? ps.map((p) => enProduit(p, tr[p.slug])) : ps));
  return productsPromise;
}

// ---------------------------------------------------------------- grilles de produits

function card(p) {
  const room = roomOf(p);
  const media = mediaFor(p)[0];
  const sold = p.stock_qty <= 0;
  const badge = sold ? '<span class="badge is-sold">Déjà partie</span>' : p.is_unique ? '<span class="badge">Pièce unique</span>' : '';
  const visual = media ? img(media, '(max-width: 600px) 100vw, 320px', 'loading="lazy"') : `<div class="product-empty">Photo à venir</div>`;
  const price = `${p.compare_at_price_cents ? `<del>${money(p.compare_at_price_cents, p.currency)}</del>` : ''}${money(p.price_cents, p.currency)}`;
  return `<a class="product-card${sold ? ' is-sold' : ''}" href="/produit/${encodeURIComponent(p.slug)}/" data-accent="${room.accent}">
    <div class="product-media">${visual}${badge}</div>
    <h3>${esc(p.name)}</h3>
    <p class="product-price">${price}</p>
  </a>`;
}

// Sous-rubriques du Grenier : une rangée de boutons au-dessus de la grille.
// Le choix est gardé dans l'adresse (#musique…) pour pouvoir partager le lien.
function rubriques(g, items) {
  const ids = items.map(rubriqueDe);
  [...g.children].forEach((el, i) => (el.dataset.rubrique = ids[i]));
  const presentes = RUBRIQUES.filter((r) => ids.includes(r.id));
  if (presentes.length < 2) return;
  const dispo = (id) => items.filter((p, i) => ids[i] === id && (p.stock_qty > 0 || !p.is_unique)).length;
  const nav = document.createElement('nav');
  nav.className = 'rubriques';
  nav.setAttribute('aria-label', 'Rubriques du Grenier');
  const total = items.filter((p) => p.stock_qty > 0 || !p.is_unique).length;
  nav.innerHTML = `<button type="button" data-r="">Tout <span>${total}</span></button>` + presentes.map((r) => `<button type="button" data-r="${r.id}">${esc(r.nom)} <span>${dispo(r.id)}</span></button>`).join('');
  g.before(nav);
  const choisir = (id, garder) => {
    if (!presentes.some((r) => r.id === id)) id = '';
    nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === id)));
    [...g.children].forEach((el) => (el.hidden = !!id && el.dataset.rubrique !== id));
    if (garder) history.replaceState(null, '', id ? `#${id}` : location.pathname + location.search);
  };
  nav.addEventListener('click', (e) => { const b = e.target.closest('button[data-r]'); if (b) choisir(b.dataset.r, true); });
  window.addEventListener('hashchange', () => choisir(location.hash.slice(1)));
  choisir(location.hash.slice(1));
}

async function renderGrids() {
  const grids = $$('[data-products]');
  if (!grids.length) return;
  let products;
  try {
    products = await loadProducts();
  } catch {
    grids.forEach((g) => (g.innerHTML = '<p class="empty">Le catalogue ne répond pas pour le moment. Réessaie dans quelques minutes.</p>'));
    return;
  }
  for (const g of grids) {
    const cats = g.dataset.products.split(',');
    const showSold = g.hasAttribute('data-show-sold');
    const items = products.filter((p) => cats.includes(p.categories?.slug) && (showSold || p.stock_qty > 0 || !p.is_unique));
    if (!items.length) {
      g.innerHTML = '<p class="empty">Rien sur les étagères pour l’instant. Les prochaines pièces arrivent bientôt.</p>';
      continue;
    }
    if (g.hasAttribute('data-group-by-room')) {
      g.innerHTML = cats
        .map((c) => {
          const inRoom = items.filter((p) => p.categories?.slug === c);
          if (!inRoom.length) return '';
          const r = ROOMS[c];
          return `<h2 class="product-group" data-accent="${r.accent}"><span class="pip" aria-hidden="true"></span><a href="${r.path}">${esc(r.name)}</a></h2>${inRoom.map(card).join('')}`;
        })
        .join('');
    } else {
      // Les pièces vendues passent après celles disponibles.
      items.sort((a, b) => (a.stock_qty <= 0) - (b.stock_qty <= 0));
      g.innerHTML = items.map(card).join('');
      if (g.hasAttribute('data-rubriques')) rubriques(g, items);
    }
  }
}

// ---------------------------------------------------------------- fiche produit

const SPECS = [
  ['weight_g', 'Poids', (v) => `${v} g`],
  ['main_medallion_diameter_cm', 'Médaillon central', (v) => `${v} cm`],
  ['side_medallion_diameter_cm', 'Médaillons latéraux', (v) => `${v} cm`],
  ['craft', 'Savoir-faire', (v) => v],
  ['model_year', 'Modèle créé en', (v) => v],
  ['designers', 'Création', (v) => v],
  ['origin', 'Origine', (v) => v],
];

async function renderProductPage() {
  const box = $('[data-product-page]');
  if (!box) return;
  const slug = new URLSearchParams(location.search).get('p') || box.dataset.slug || (location.pathname.match(/^(?:\/en)?\/produit\/([a-z0-9-]+)\/?$/) || [])[1];
  let p;
  try {
    p = (await loadProducts()).find((x) => x.slug === slug);
  } catch {
    box.innerHTML = '<p class="empty">Le catalogue ne répond pas pour le moment. Réessaie dans quelques minutes.</p>';
    return;
  }
  if (!p) {
    box.innerHTML = '<div><h1>Cette pièce n’est plus là.</h1><p class="lead">Elle a peut-être trouvé une nouvelle maison.</p><p><a class="btn btn-ink" href="/boutique/">Voir la Boutique</a></p></div>';
    return;
  }
  const room = roomOf(p);
  document.body.dataset.accent = room.accent;
  document.title = `${p.name} · ${room.name} · Lamia Femme Berbère`;
  const media = mediaFor(p);
  const m = p.metadata || {};
  const specs = SPECS.filter(([k]) => m[k]).map(([k, label, f]) => `<div><strong>${esc(f(m[k]))}</strong><span>${label}</span></div>`).join('');
  const sold = p.stock_qty <= 0;
  const ambiance = media.some((x) => x.kind === 'ambiance');
  box.innerHTML = `
    <div class="gallery">
      <figure class="gallery-main">${media[0] ? img(media[0], '(max-width: 900px) 100vw, 55vw', 'data-main fetchpriority="high"') : '<div class="product-empty">Photo à venir</div>'}</figure>
      ${ambiance ? '<p class="fine" data-caption>Visuel d’ambiance. Des photos réelles de la pièce seront ajoutées.</p>' : ''}
      ${media.length > 1 ? `<div class="gallery-thumbs">${media.map((x, i) => `<button type="button" data-thumb="${i}" aria-label="Voir l’image ${i + 1}" aria-current="${i === 0}">${img(x, '76px', 'loading="lazy"')}</button>`).join('')}</div>` : ''}
    </div>
    <div class="product-info">
      <a class="back-room" href="${room.path}"><span class="pip" aria-hidden="true"></span>${esc(room.name)}</a>
      <h1>${esc(p.name)}</h1>
      ${p.subtitle ? `<p class="lead">${esc(p.subtitle)}</p>` : ''}
      <p class="product-price">${p.compare_at_price_cents ? `<del>${money(p.compare_at_price_cents, p.currency)}</del>` : ''}${money(p.price_cents, p.currency)}</p>
      ${p.description ? `<div class="product-desc">${String(p.description).split(/\n\s*\n/).map((b) => `<p>${b.split('\n').map(esc).join('<br>')}</p>`).join('')}</div>` : ''}
      ${specs ? `<div class="specs">${specs}</div>` : ''}
      ${Array.isArray(m.extrait) && m.extrait.length ? `<details class="extrait-livre" data-extrait><summary>Lire gratuitement les premières pages <small>(${m.extrait.length} pages)</small></summary>
        <div class="extrait-pages">${m.extrait.filter((u) => /^\/images\//.test(u)).map((u, i) => `<img src="${esc(u)}" alt="Extrait, page ${i + 1}" loading="lazy">`).join('')}</div>
        <p class="fine">La suite t’attend dans le livre complet.</p></details>` : ''}
      ${sold ? '<button class="btn btn-ink" type="button" disabled>Déjà partie</button>' : window.LFB_PLAY && p.product_type === 'digital' ? '<p>Ce livre numérique ne s’achète pas dans cette version de l’appli.</p>' : preorderForm(p)}
      ${p.product_type === 'digital' ? renvoiForm() : ''}
    </div>`;
  $$('[data-thumb]', box).forEach((b) =>
    b.addEventListener('click', () => {
      const x = media[Number(b.dataset.thumb)];
      const main = $('[data-main]', box);
      if (x.src) { main.srcset = srcset(x); main.src = `${x.src}-640.webp`; } else { main.removeAttribute('srcset'); main.src = x.url; }
      main.alt = x.alt;
      $$('[data-thumb]', box).forEach((t) => t.setAttribute('aria-current', String(t === b)));
    })
  );
  wirePreorder(p, box);
  wireRenvoi(box);
  if (new URLSearchParams(location.search).get('paiement') === 'annule') {
    const st = $('[data-preorder-status]', box);
    if (st) st.textContent = 'Le paiement a été annulé : rien n’a été débité. Tu peux réessayer quand tu veux.';
  }
}

// ---------------------------------------------------------------- livre numérique non reçu
function renvoiForm() {
  return `<details class="renvoi-ebook"><summary>Tu as déjà acheté ce livre et tu ne l’as pas reçu ?</summary>
    <form data-renvoi novalidate><p class="fine">Indique l’adresse email utilisée pour l’achat : on t’y renvoie ton lien de téléchargement.</p>
    <label>Email de l’achat<input name="email" type="email" autocomplete="email" required></label>
    <button class="btn btn-line" type="submit">Renvoyer mon livre</button><p class="form-status" role="status" data-renvoi-statut></p></form></details>`;
}
function wireRenvoi(box) {
  const f = $('[data-renvoi]', box);
  if (!f) return;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $('[data-renvoi-statut]', f), btn = f.querySelector('button');
    btn.disabled = true; st.textContent = 'Un instant…';
    let r = {};
    try { r = await (await fetch('/api/preorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'renvoyer_ebook', email: f.elements.email.value }) })).json(); } catch { /* réseau */ }
    btn.disabled = false;
    if (r.error === 'invalid_contact') { st.textContent = 'Vérifie ton adresse email.'; return; }
    st.textContent = r.email === false
      ? 'L’envoi automatique n’est pas encore activé : écris à Lamia (lamia.brechet@outlook.fr) avec ton numéro de commande, elle te renvoie ton livre au plus vite.'
      : 'C’est envoyé ! Si cette adresse a bien acheté le livre, tu reçois ton lien dans quelques minutes (pense aux courriers indésirables). Tu peux aussi le retrouver dans « Mon espace ».';
  });
}

// ---------------------------------------------------------------- précommande

// Délai annoncé selon la pièce : les bijoux sont faits par un artisan, le Grenier part tout de suite.
function delaiLivraison(p) {
  const piece = roomOf(p).slug;
  if (piece === 'ecrin') return '<strong>Délai :</strong> ce bijou est réalisé par un artisan. Le délai de livraison dépend de lui : <strong>entre 2 et 6 semaines</strong> après ton achat.';
  if (piece === 'grenier' && parLettre(p)) return '<strong>Délai :</strong> la pièce est déjà là. Elle part par lettre après ton achat : compte <strong>2 à 4 jours ouvrés</strong>.';
  if (piece === 'grenier') return '<strong>Délai :</strong> la pièce est déjà là, prête à partir. Elle est expédiée après ton achat : compte <strong>le temps d’une livraison Colissimo</strong> (2 à 3 jours ouvrés en général).';
  return '';
}

function preorderForm(p) {
  const digital = p.product_type === 'digital';
  const max = MAX_QTY(p);
  const delai = digital ? '' : delaiLivraison(p);
  return `<form class="preorder" data-preorder novalidate>
    <h2>Acheter</h2>
    ${p.is_unique ? '<p class="fine">Pièce unique : dès qu’elle est achetée, elle n’est plus disponible.</p>' : ''}
    ${delai ? `<p class="delai-livraison">${delai}</p>` : ''}
    ${taillesDe(p).length ? `<label>Taille de doigt<select name="taille" required><option value="">Choisis ta taille</option>${taillesDe(p).map((t) => `<option value="${t}">${t}${supplementTaille(p, t) ? ` (+${money(supplementTaille(p, t))})` : ''}</option>`).join('')}</select></label>
    <details class="guide-taille"><summary>Comment connaître ta taille ?</summary><p>La taille française correspond au <strong>tour de ton doigt en millimètres</strong>. Entoure la base de ton doigt avec un fil ou une bande de papier, marque l’endroit où il se rejoint, puis mesure la longueur à plat : 54 mm = taille 54. Mesure en fin de journée, quand les doigts sont un peu plus gros, et en cas d’hésitation choisis la taille au-dessus.</p><p>Tu as déjà une bague qui te va ? Mesure son diamètre intérieur en mm et multiplie par 3,14 : c’est ta taille.</p></details>` : ''}
    ${max > 1 ? `<label>Quantité<select name="qty">${Array.from({ length: max }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label>` : '<input type="hidden" name="qty" value="1">'}
    ${digital ? '' : `<fieldset><legend>Livraison</legend>
      <label class="check"><input type="radio" name="method" value="colissimo" checked><span>${SHIPPING_METHODS[parLettre(p) ? 'lettre' : 'colissimo'].label} <small data-ship-price></small><br><small>${SHIPPING_METHODS[parLettre(p) ? 'lettre' : 'colissimo'].delay}</small></span></label>
      <label class="check"><input type="radio" name="method" value="retrait"><span>${SHIPPING_METHODS.retrait.label} <small>(gratuit)</small><br><small>${SHIPPING_METHODS.retrait.delay}</small></span></label>
    </fieldset>`}
    <label>Prénom et nom<input name="name" autocomplete="name" required maxlength="120"></label>
    <label>Email<input name="email" type="email" autocomplete="email" required></label>
    <label>Téléphone (facultatif)<input name="phone" type="tel" autocomplete="tel" maxlength="30"></label>
    ${digital ? '' : `<div data-address>
      <label>Adresse<input name="line1" autocomplete="address-line1" maxlength="160"></label>
      <label>Complément (facultatif)<input name="line2" autocomplete="address-line2" maxlength="160"></label>
      <div class="two"><label>Code postal<input name="postal_code" inputmode="numeric" autocomplete="postal-code" maxlength="5"></label><label>Ville<input name="city" autocomplete="address-level2" maxlength="80"></label></div>
    </div>`}
    <label>Un mot pour Lamia (facultatif)<textarea name="message" rows="2" maxlength="600"></textarea></label>
    <input name="zz_hp" class="hp" tabindex="-1" autocomplete="new-password" aria-hidden="true">
    <div class="preorder-total"><span>Total</span><strong data-total></strong></div>
    <label class="check"><input type="checkbox" name="cgv"><span>J’accepte les <a href="/cgv/" target="_blank" rel="noopener">conditions de vente</a>${digital ? ' et je demande l’accès immédiat au livre numérique : je renonce ainsi à mon droit de rétractation une fois le téléchargement possible' : ''}.</span></label>
    <button class="btn btn-ink btn-payer" type="submit"><svg class="ico" aria-hidden="true"><use href="/icones.svg#lock"/></svg> Payer en toute sécurité</button>
    <div class="paiement-sur">
      <p><strong>Paiement 100 % sécurisé</strong> par Stripe : carte bancaire, Apple Pay ou Google Pay, avec validation 3D Secure de ta banque.</p>
      <p>Tes coordonnées bancaires sont saisies chez Stripe, sur une page chiffrée : Lamia ne les voit jamais.</p>
      ${digital ? '<p>Téléchargement immédiat après le paiement, puis à tout moment dans « Mon espace ».</p>' : '<p>Retour possible sous 14 jours · <a href="/retours/" target="_blank" rel="noopener">Livraison et retours</a></p>'}
    </div>
    <p class="form-status" role="status" data-preorder-status></p>
  </form>`;
}

function wirePreorder(p, box) {
  const form = $('[data-preorder]', box);
  if (!form) return;
  const update = () => {
    const qty = Number(form.elements.qty.value) || 1;
    const method = form.elements.method ? form.querySelector('[name=method]:checked').value : 'email';
    const ship = shippingFor(p, qty, method, REGLAGES.tarifs);
    const col = shippingFor(p, qty, 'colissimo', REGLAGES.tarifs);
    const sp = $('[data-ship-price]', form);
    if (sp) sp.textContent = `(${money(col.cents)})`;
    const addr = $('[data-address]', form);
    if (addr) addr.hidden = ship.method === 'retrait';
    const unit = p.price_cents + (form.elements.taille ? supplementTaille(p, form.elements.taille.value) : 0);
    const total = unit * qty + ship.cents, tva = tvaIncluse(total, REGLAGES.tva);
    $('[data-total]', form).textContent = `${money(total, p.currency)}${ship.cents ? ` dont ${money(ship.cents)} d’envoi` : ''}${tva ? ` · dont TVA ${String(REGLAGES.tva.taux).replace('.', ',')} % : ${money(tva)}` : ''}`;
  };
  form.addEventListener('change', update);
  update();
  reglagesPrets.then(update);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const st = $('[data-preorder-status]', form);
    const f = form.elements;
    const say = (m, err) => { st.textContent = m; st.classList.toggle('is-error', !!err); };
    const montre = (el) => { try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* */ } };
    window.lfbEvent?.('clic_payer');
    if (f.taille && !f.taille.value) { f.taille.focus(); montre(f.taille); return say('Choisis ta taille de doigt pour continuer.', true); }
    const nom = f.name.value.trim(), mail = f.email.value.trim();
    if (nom.length < 2) { window.lfbEvent?.('payer_contact_invalide'); f.name.focus(); montre(f.name); return say('Indique ton prénom et ton nom pour continuer.', true); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { window.lfbEvent?.('payer_contact_invalide'); f.email.focus(); montre(f.email); return say('Vérifie ton adresse email : elle doit ressembler à prenom@exemple.fr.', true); }
    if (!f.cgv.checked) {
      window.lfbEvent?.('payer_sans_cgv');
      const lab = f.cgv.closest('label'); lab?.classList.add('a-cocher'); montre(lab || f.cgv); f.cgv.focus();
      f.cgv.addEventListener('change', () => lab?.classList.remove('a-cocher'), { once: true });
      return say('Coche d’abord la case des conditions de vente (juste au-dessus du bouton), puis appuie de nouveau sur « Payer ».', true);
    }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Ouverture du paiement sécurisé…';
    const body = {
      slug: p.slug, qty: f.qty.value, taille: f.taille ? f.taille.value : undefined, name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value,
      method: f.method ? form.querySelector('[name=method]:checked').value : 'email',
      address: f.line1 ? { line1: f.line1.value, line2: f.line2.value, postal_code: f.postal_code.value, city: f.city.value } : null,
      message: f.message.value, website: f.zz_hp ? f.zz_hp.value : '', cgv_accepted: true, lang: EN ? 'en' : 'fr',
    };
    let r = {}, res;
    try { res = await fetch('/api/preorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); r = await res.json().catch(() => ({})); } catch { /* réseau */ }
    btn.disabled = false; btn.textContent = 'Payer en toute sécurité';
    if (res?.ok && r.ok && r.url) {
      window.lfbEvent?.('paiement_ouvert');
      btn.disabled = true; btn.textContent = 'Redirection vers le paiement…';
      location.assign(r.url);
      return;
    }
    if (res?.ok && r.ok) {
      window.lfbEvent?.('precommande');
      form.innerHTML = `<h2>Merci, ta commande est enregistrée.</h2><p>Numéro de commande : <strong>${esc(r.order_number)}</strong></p><p>${r.waitlist ? 'Cette pièce unique est déjà réservée : tu es inscrite en liste d’attente. Lamia te prévient si elle se libère.' : `Lamia t’envoie par email le lien de paiement sécurisé. Total : ${money(r.total_cents)}.${delaiLivraison(p) ? ` ${delaiLivraison(p).replace(/<[^>]+>/g, '')}` : ''}`}</p>`;
      return;
    }
    const msg = { invalid_contact: 'Vérifie ton nom et ton adresse email.', invalid_address: 'Vérifie ton adresse : rue, code postal à 5 chiffres et ville.', product_unavailable: 'Cette pièce vient d’être vendue, désolée.', paiement_en_cours: 'Quelqu’un est en train d’acheter cette pièce. Reviens dans 30 minutes : si le paiement n’aboutit pas, elle sera de nouveau disponible.', stock_insuffisant: `Il n’en reste que ${r.stock}. Choisis une quantité plus petite.`, paiement_indisponible: 'Le paiement sécurisé ne répond pas pour le moment. Réessaie dans un instant.', taille_requise: 'Choisis ta taille de doigt pour continuer.', fichier_absent: 'Le livre numérique arrive très bientôt : reviens dans quelques heures.' };
    window.lfbEvent?.('paiement_erreur');
    say(msg[r.error] || (res ? 'Le paiement n’a pas pu s’ouvrir. Réessaie dans un instant.' : 'Pas de connexion avec le site : vérifie ton réseau, ou ouvre cette page dans Chrome ou Safari, puis réessaie.'), true);
    montre(st);
  });
  // Navigateur intégré (Facebook, Instagram, TikTok…) : le paiement y échoue parfois, on propose d'ouvrir la page ailleurs.
  const ua = navigator.userAgent || '';
  const appli = [[/musical_ly|BytedanceWebview|TikTok|trill/i, 'TikTok'], [/Instagram/i, 'Instagram'], [/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i, 'Facebook'], [/Snapchat/i, 'Snapchat']].find(([re]) => re.test(ua));
  if (appli) {
    const android = /Android/i.test(ua);
    const note = document.createElement('div');
    note.className = 'appli-paiement';
    note.innerHTML = `<p>Tu es dans le navigateur de <strong>${esc(appli[1])}</strong>. Si le paiement ne s’ouvre pas, ouvre cette page dans ${android ? 'Chrome' : 'Safari'} : ${android ? 'menu ⋮ en haut à droite, puis « Ouvrir dans Chrome »' : 'bouton … ou Partager, puis « Ouvrir dans le navigateur »'}.</p><p class="appli-actions">${android ? `<a class="btn btn-line" href="intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end">Ouvrir dans Chrome</a>` : ''}<button type="button" class="btn btn-line" data-copier-lien>Copier le lien</button></p>`;
    form.querySelector('.btn-payer')?.before(note);
    note.querySelector('[data-copier-lien]').addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(location.href); } catch { const t = document.createElement('textarea'); t.value = location.href; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch { /* */ } t.remove(); }
      e.target.textContent = 'Lien copié : colle-le dans ton navigateur';
    });
  }
}

// ---------------------------------------------------------------- panier (local au navigateur)

const CART_KEY = 'lfb_cart_v3';
const readCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; } };
const writeCart = (c) => { try { localStorage.setItem(CART_KEY, JSON.stringify(c)); } catch { /* stockage indisponible */ } };

async function addToCart(id) {
  const products = await loadProducts();
  const p = products.find((x) => x.id === id);
  if (!p || p.stock_qty <= 0) return;
  const cart = readCart();
  const row = cart.find((x) => x.id === id);
  const max = p.is_unique ? 1 : p.stock_qty;
  if (row) row.qty = Math.min(row.qty + 1, max); else cart.push({ id, qty: 1 });
  writeCart(cart);
  await renderCart();
  openCart();
}

async function renderCart() {
  const box = $('[data-cart-items]');
  if (!box) return;
  let cart = readCart();
  let products = [];
  if (cart.length) {
    try { products = await loadProducts(); } catch { /* panier affiché sans prix */ }
    if (products.length) { cart = cart.filter((r) => products.some((p) => p.id === r.id && p.stock_qty > 0)); writeCart(cart); }
  }
  let total = 0, count = 0;
  box.innerHTML = cart.length
    ? cart
        .map((r) => {
          const p = products.find((x) => x.id === r.id);
          if (!p) return '';
          total += p.price_cents * r.qty; count += r.qty;
          const m = mediaFor(p)[0];
          return `<div class="cart-row">${m ? img(m, '64px') : '<span></span>'}<div><strong>${esc(p.name)}</strong><br><small>${r.qty} × ${money(p.price_cents, p.currency)}</small></div><button type="button" data-remove="${esc(p.id)}">Retirer</button></div>`;
        })
        .join('')
    : '<p>Ton panier est vide.</p>';
  $('[data-cart-total]').textContent = money(total);
  $$('[data-cart-count]').forEach((e) => (e.textContent = count));
  $$('[data-remove]', box).forEach((b) => b.addEventListener('click', () => { writeCart(readCart().filter((x) => x.id !== b.dataset.remove)); renderCart(); }));
}

function openCart() {
  $('[data-cart]').classList.add('is-open');
  $('[data-cart]').setAttribute('aria-hidden', 'false');
  $('.cart-overlay').hidden = false;
  document.body.classList.add('cart-open');
  $('[data-cart] [data-cart-close]').focus();
}
function closeCart() {
  $('[data-cart]').classList.remove('is-open');
  $('[data-cart]').setAttribute('aria-hidden', 'true');
  $('.cart-overlay').hidden = true;
  document.body.classList.remove('cart-open');
}
$$('[data-cart-open]').forEach((b) => b.addEventListener('click', openCart));
$$('[data-cart-close]').forEach((b) => b.addEventListener('click', closeCart));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCart(); });

// ---------------------------------------------------------------- soirées et réseaux

export async function loadEvents() {
  return rest('speed_dating_events?select=id,title,description,starts_at,min_age,max_age,capacity,ticket_price_cents,currency,status&status=in.(published,sold_out)&sur_invitation=eq.false&order=starts_at');
}
export const eventDate = (iso) => new Date(iso).toLocaleString(({ en: 'en-GB', ar: 'ar-DZ' }[document.documentElement.lang] || 'fr-FR'), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

async function renderNextEvent() {
  const cards = $$('[data-next-event]');
  if (!cards.length) return;
  try {
    const next = (await loadEvents()).find((e) => new Date(e.starts_at) > new Date());
    if (!next) return;
    cards.forEach((c) => {
      c.querySelector('h3').textContent = next.title;
      c.querySelector('p:not(.now-room)').textContent = eventDate(next.starts_at);
    });
  } catch { /* le texte par défaut reste affiché */ }
}

async function renderSocials() {
  const slots = $$('[data-social]');
  if (!slots.length) return;
  try {
    const [row] = await rest('platform_settings?select=value&key=eq.social_links');
    const links = row?.value || {};
    slots.forEach((el) => {
      const url = links[el.dataset.social];
      const a = el.tagName === 'A' ? el : el.querySelector('a');
      if (url && /^https:\/\//.test(url)) { a.href = url; el.hidden = false; }
      else if (url === null && el.tagName === 'A') el.hidden = true;
    });
    // Dernières vidéos YouTube (chargées seulement après un clic, sans cookie avant).
    const yt = document.querySelector('[data-youtube-videos]');
    if (yt && /^UC[\w-]{22}$/.test(links.youtube_chaine || '')) {
      yt.hidden = false;
      yt.querySelector('[data-youtube-charger]').addEventListener('click', () => {
        yt.querySelector('[data-youtube-cadre]').innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/videoseries?list=UU${links.youtube_chaine.slice(2)}" title="Les dernières vidéos de Lamia sur YouTube" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
      }, { once: true });
      // Si le visiteur a déjà accepté les cookies, les vidéos s'affichent directement.
      try { if (localStorage.getItem('lfb-cookies') === 'oui') yt.querySelector('[data-youtube-charger]').click(); } catch { /* */ }
    }
    const tt = document.querySelector('[data-tiktok-videos]');
    const tiktok = links.tiktok || 'https://www.tiktok.com/@lamiafemmeberbere';
    const pseudo = (tiktok.match(/@([\w.]+)/) || [])[1];
    if (tt && !pseudo) tt.hidden = true;
    tt?.querySelector('[data-tiktok-charger]')?.addEventListener('click', () => {
      tt.querySelector('[data-tiktok-cadre]').innerHTML = `<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@${pseudo}" data-unique-id="${pseudo}" data-embed-type="creator" style="max-width: 780px; min-width: 288px;"><section><a target="_blank" rel="noopener" href="https://www.tiktok.com/@${pseudo}">@${pseudo}</a></section></blockquote>`;
      const sc = document.createElement('script'); sc.async = true; sc.src = 'https://www.tiktok.com/embed.js'; document.body.appendChild(sc);
    }, { once: true });
  } catch { /* liens absents */ }
}

renderCart();
renderGrids();
renderProductPage();
renderNextEvent();
renderSocials();

// ---------------------------------------------------------------- l'entrée dans la Maison (effet de défilement)
// Encart « âme sœur » posé dans l'ouverture de la grande porte (calé sur la photo, quelle que soit la taille d'écran).
(function porteAme() {
  const a = document.querySelector('[data-porte-ame]');
  if (!a) return;
  const scene = a.closest('.entree-scene');
  const OUV = { l: 560, t: 552, r: 822 }; // plaque posée sur le seuil, sous la porte (image 1376 × 768)
  const place = () => {
    const vw = scene.clientWidth, vh = scene.clientHeight;
    const k = Math.max(vw / 1376, vh / 768), W = 1376 * k, H = 768 * k;
    const ox = (vw - W) * 0.43, oy = (vh - H) / 2;
    const w = (OUV.r - OUV.l) * k; a.style.left = `${Math.min(Math.max(8, ox + OUV.l * k), vw - w - 8)}px`; a.style.top = `${oy + OUV.t * k}px`;
    a.style.width = `${(OUV.r - OUV.l) * k}px`; a.style.height = 'auto';
    a.style.setProperty('--pw', `${(OUV.r - OUV.l) * k}px`);
    a.hidden = false;
  };
  place();
  addEventListener('resize', place);
})();

(function entree() {
  const box = document.querySelector('[data-entree]');
  if (!box || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cam = box.querySelector('[data-entree-cam]');
  const scene = box.querySelector('.entree-scene');
  const DOOR = { x: 0.504, y: 0.60 }; // la grande porte du Hall sur la photo
  let door = { x: 0, y: 0 }, vw = 0, vh = 0, ticking = false;
  function measure() {
    vw = scene.clientWidth; vh = scene.clientHeight;
    const k = Math.max(vw / 1376, vh / 768), W = 1376 * k, H = 768 * k;
    const ox = (vw - W) * 0.43, oy = (vh - H) / 2; // object-position 43% 50%
    door = { x: ox + DOOR.x * W, y: oy + DOOR.y * H };
    box.style.setProperty('--door-x', `${door.x}px`);
    box.style.setProperty('--door-y', `${door.y}px`);
  }
  function frame() {
    ticking = false;
    const total = box.offsetHeight - vh;
    const p = Math.min(1, Math.max(0, -box.getBoundingClientRect().top / total));
    const e = p * p * (3 - 2 * p); // douceur d'entrée et de sortie
    const zoom = 1 + e * 5;
    const tx = (vw / 2 - door.x) * e, ty = (vh * 0.55 - door.y) * e;
    cam.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${zoom})`;
    box.style.setProperty('--p', p.toFixed(4));
  }
  const ask = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  measure(); frame();
  addEventListener('scroll', ask, { passive: true });
  addEventListener('resize', () => { measure(); ask(); });
})();

// ---------------------------------------------------------------- lien « Se connecter » / « Mon espace » dans l'en-tête
(function compte() {
  const a = document.querySelector('[data-account-link]');
  if (!a) return;
  // Pas connecté·e : « Connexion » en haut et dans la barre du bas.
  try {
    if (!JSON.parse(localStorage.getItem('sb-tybwvxinigahhntfeeur-auth-token') || 'null')?.access_token) {
      const en = document.documentElement.lang === 'en';
      const t = a.querySelector('[data-account-texte]'); if (t) t.textContent = en ? 'Sign in' : 'Connexion';
      const moi = document.querySelector('[data-barre-compte] b'); if (moi) moi.textContent = en ? 'Sign in' : 'Connexion';
    }
  } catch { /* */ }
  try {
    const raw = localStorage.getItem('sb-tybwvxinigahhntfeeur-auth-token');
    if (raw && JSON.parse(raw)?.access_token) {
      const t = a.querySelector('[data-account-texte]'); if (t) t.textContent = 'Mon espace'; else a.textContent = 'Mon espace';
      // Déjà connecté·e : plus question de créer un profil ou de se connecter.
      const en = document.documentElement.lang === 'en', mienne = en ? 'My profile' : 'Mon profil';
      document.documentElement.classList.add('a-compte');
      document.querySelectorAll('.cta-profil span, [data-cta-profil] span').forEach((x) => { x.textContent = mienne; });
    }
  } catch { /* stockage indisponible */ }
  // Compte administratrice : l'application s'ouvre sur son tableau de bord, et l'onglet « Moi » devient « Gérer ».
  try {
    const role = JSON.parse(localStorage.getItem('sb-tybwvxinigahhntfeeur-auth-token') || 'null')?.user?.app_metadata?.role;
    if (role === 'admin') {
      if (location.pathname === '/' && new URLSearchParams(location.search).get('source') === 'app') location.replace('/tableau-de-bord');
      const moi = document.querySelector('[data-barre-compte]');
      if (moi) { moi.href = '/tableau-de-bord'; moi.querySelector('b').textContent = 'Gérer'; }
      document.querySelector('.cta-profil')?.setAttribute('hidden', '');
    } else if (role !== 'admin' && JSON.parse(localStorage.getItem('sb-tybwvxinigahhntfeeur-auth-token') || 'null')?.access_token) {
      // Membre connecté : l'appli s'ouvre directement sur les profils.
      const src = new URLSearchParams(location.search).get('source');
      if (location.pathname === '/' && (src === 'app' || src === 'play')) location.replace(`/rencontres/swipe/${src === 'play' ? '?source=play' : ''}`);
    }
  } catch { /* stockage indisponible */ }
  // Barre du bas (téléphone) : l'onglet de la page en cours.
  const ici = location.pathname + location.hash;
  const liens = [...document.querySelectorAll('.barre-app a')];
  const actif = liens.find((l) => l.getAttribute('href') === ici) || liens.filter((l) => !l.getAttribute('href').includes('#')).sort((x, y) => y.getAttribute('href').length - x.getAttribute('href').length).find((l) => location.pathname.startsWith(l.getAttribute('href')));
  if (actif) actif.setAttribute('aria-current', 'page');
})();

// ---------------------------------------------------------------- compteur de visites anonyme (sans cookie)
(function visite() {
  // Provenance de la première visite de la session (réseau social, Google…), réutilisée à l'inscription au bal.
  try {
    if (!sessionStorage.getItem('lfb-source')) {
      const utm = new URLSearchParams(location.search).get('utm_source');
      let src = utm || 'direct';
      if (!utm && document.referrer) {
        const h = new URL(document.referrer).hostname;
        src = /tiktok/.test(h) ? 'tiktok' : /facebook|fb\./.test(h) ? 'facebook' : /instagram/.test(h) ? 'instagram' : /youtube|youtu\.be/.test(h) ? 'youtube' : /google\./.test(h) ? 'google' : /lamia-femme-berbere/.test(h) ? 'direct' : h.replace(/^www\./, '');
      }
      sessionStorage.setItem('lfb-source', src.slice(0, 40));
    }
  } catch { /* */ }
  const envoyer = (extra = {}) => {
    try {
      if (!/lamia-femme-berbere\.com$/.test(location.hostname)) return;
      const utm = new URLSearchParams(location.search).get('utm_source') || '';
      const body = JSON.stringify({ action: 'visit', path: location.pathname, ref: document.referrer, utm, ...extra });
      if (!navigator.sendBeacon?.('/api/admin', new Blob([body], { type: 'application/json' }))) fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch { /* jamais bloquant */ }
  };
  envoyer();
  // Actions importantes (réservation, précommande…), comptées sans identifier personne.
  window.lfbEvent = (event) => {
    envoyer({ event });
    try { window.gtag?.('event', event); } catch { /* */ }
    // Pixel Meta (chargé seulement après accord) : événements standard quand ils existent, sinon personnalisés.
    try {
      const std = { inscription_bal: 'CompleteRegistration', annonce_deposee: 'Lead', paiement_ouvert: 'InitiateCheckout', clic_produit: 'ViewContent' }[event];
      if (window.fbq) std ? window.fbq('track', std) : window.fbq('trackCustom', event);
    } catch { /* */ }
  };
  // Temps passé sur la page, envoyé une seule fois quand on la quitte.
  const debut = Date.now();
  let tempsEnvoye = false;
  const temps = () => { if (tempsEnvoye) return; tempsEnvoye = true; envoyer({ event: 'temps', duration: Math.round((Date.now() - debut) / 1000) }); };
  addEventListener('pagehide', temps);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') temps(); });
  // Clics sur les boutons qui rapportent.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a,button');
    if (!a) return;
    const href = a.getAttribute('href') || '', txt = (a.textContent || '').toLowerCase();
    if (/r[ée]serv/.test(txt) || /speed-dating\/#/.test(href)) window.lfbEvent('clic_reserver');
    else if (/\/produit\//.test(href)) window.lfbEvent('clic_produit');
    else if (/^\/(boutique|ecrin|bibliotheque|grenier)\//.test(href)) window.lfbEvent('clic_boutique');
  }, { capture: true });
})();

// ---------------------------------------------------------------- prix du Hall lus dans la boutique (modifiables depuis le tableau de bord)
// Prestige : le prix de lancement et les places restantes, relus côté serveur.
(async function placesPrestige() {
  const prix = $$('[data-prestige-prix]'), lignes = $$('[data-prestige-places]');
  if (!prix.length && !lignes.length) return;
  try {
    const r = await fetch('/api/preorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'abonnement_places' }) });
    const d = await r.json();
    if (!d.ok) return;
    const eur = (c) => `${(c / 100).toLocaleString('fr-FR')} €`;
    if (d.restantes > 0) { lignes.forEach((l) => { l.textContent = `Plus que ${d.restantes} place${d.restantes > 1 ? 's' : ''} à ${eur(d.prix)}, un prix que tu gardes. Ensuite, ${eur(d.prix_normal)} par mois pour les nouvelles inscriptions.`; }); return; }
    lignes.forEach((l) => { l.hidden = true; });
    prix.forEach((p) => { const an = p.dataset.prestigePrix === 'an'; const em = p.querySelector('em'); p.innerHTML = `${eur(an ? d.prix_an : d.prix)}<small> / ${an ? 'an' : 'mois'}</small>${em ? em.outerHTML : ''}`; });
  } catch { /* le prix réel reste décidé par le serveur au moment du paiement */ }
})();

(async function prixDuHall() {
  const one = document.querySelectorAll('[data-prix]'), werdi = document.querySelector('[data-prix-werdi]');
  if (!one.length && !werdi) return;
  try {
    const list = await rest('products?select=slug,price_cents,currency,status&status=eq.active');
    const by = Object.fromEntries(list.map((p) => [p.slug, p]));
    one.forEach((el) => { const p = by[el.dataset.prix]; if (p) el.textContent = ` · ${money(p.price_cents, p.currency || 'EUR')}`; });
    const b = by['werdi-ouvre-les-yeux-broche'], e = by['werdi-ouvre-les-yeux'];
    if (werdi && (b || e)) werdi.textContent = [b && `Livre broché ${money(b.price_cents)}`, e && `ebook ${money(e.price_cents)}`].filter(Boolean).join(' · ');
  } catch { /* le texte sans prix reste affiché */ }
})();

// ---------------------------------------------------------------- navigateurs intégrés (TikTok, Instagram, Facebook…) : la caméra y est souvent bloquée
(function navigateurIntegre() {
  const box = document.querySelector('[data-appli]');
  if (!box) return;
  const ua = navigator.userAgent || '';
  const apps = [[/musical_ly|BytedanceWebview|TikTok|trill/i, 'TikTok'], [/Instagram/i, 'Instagram'], [/FBAN|FBAV|FB_IAB|FBIOS|Messenger/i, 'Facebook'], [/Snapchat/i, 'Snapchat'], [/LinkedInApp/i, 'LinkedIn'], [/Twitter/i, 'X']];
  const found = apps.find(([re]) => re.test(ua));
  if (!found) return;
  box.hidden = false;
  box.querySelector('[data-appli-nom]').textContent = found[1];
  const android = /Android/i.test(ua);
  box.querySelector(android ? '[data-appli-android]' : '[data-appli-ios]').hidden = false;
  if (android) {
    const chrome = box.querySelector('[data-appli-chrome]');
    chrome.href = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
    chrome.hidden = false;
  }
  box.querySelector('[data-appli-copier]').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(location.href); }
    catch {
      const t = document.createElement('textarea'); t.value = location.href; document.body.append(t); t.select();
      try { document.execCommand('copy'); } catch { /* */ }
      t.remove();
    }
    e.target.textContent = 'Lien copié : colle-le dans Safari ou Chrome';
  });
})();

// ---------------------------------------------------------------- Google Analytics et pixel Meta, seulement avec l'accord du visiteur (RGPD)
(function analytics() {
  const GA = 'G-YZ486LN6LV';
  const PIXEL = '1472644064811166'; // pixel Meta « LFB – site lamia-femme-berbere.com » (compte publicitaire Femme berbère)
  const KEY = 'lfb-cookies';
  if (!/lamia-femme-berbere\.com$/.test(location.hostname)) return;
  const lire = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const ecrire = (v) => { try { localStorage.setItem(KEY, v); } catch { /* */ } };
  function charger() {
    if (window.gtag) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA, { anonymize_ip: true });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA}`;
    document.head.appendChild(s);
    pixel();
  }
  function pixel() {
    if (window.fbq) return;
    const f = window.fbq = function fbq() { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
    if (!window._fbq) window._fbq = f;
    f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
    window.fbq('init', PIXEL);
    window.fbq('track', 'PageView');
  }
  function effacer() {
    // Retire les cookies Google Analytics et Meta déjà posés.
    for (const c of document.cookie.split(';')) {
      const nom = c.split('=')[0].trim();
      if (/^_ga|^_fb[pc]$/.test(nom)) for (const d of ['', location.hostname, '.' + location.hostname.replace(/^www\./, '')]) document.cookie = `${nom}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
    }
  }
  function bandeau() {
    if (document.querySelector('[data-cookies]')) return;
    const b = document.createElement('div');
    b.className = 'cookies';
    b.setAttribute('data-cookies', '');
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Mesure d’audience');
    b.innerHTML = `<p>Avec ton accord, la Maison utilise Google Analytics et le pixel Meta pour savoir comment le site est visité, l’améliorer et mesurer ses publicités sur Facebook et Instagram. <a href="/confidentialite/">En savoir plus</a></p>
      <div><button type="button" class="btn btn-line" data-refuser>Refuser</button><button type="button" class="btn btn-ink" data-accepter>Accepter</button></div>`;
    b.querySelector('[data-accepter]').addEventListener('click', () => { ecrire('oui'); b.remove(); charger(); });
    b.querySelector('[data-refuser]').addEventListener('click', () => { ecrire('non'); b.remove(); effacer(); });
    document.body.appendChild(b);
  }
  const choix = lire();
  if (choix === 'oui') charger();
  else if (choix !== 'non') bandeau();
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-gerer-cookies]')) return;
    e.preventDefault();
    try { localStorage.removeItem(KEY); } catch { /* */ }
    effacer();
    bandeau();
  });
})();

// ---------------------------------------------------------------- menu « La Maison » : se referme en cliquant ailleurs ou avec Échap
(function menuMaison() {
  const m = document.querySelector('[data-maison-menu]');
  if (!m) return;
  document.addEventListener('click', (e) => { if (m.open && !m.contains(e.target)) m.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.open) { m.open = false; m.querySelector('summary').focus(); } });
})();


// ---------------------------------------------------------------- retour du paiement d'une commande
(async () => {
  const box = document.querySelector('[data-merci-commande]');
  if (!box) return;
  const id = new URLSearchParams(location.search).get('session_id') || '';
  const titre = box.querySelector('h1'), texte = box.querySelector('[data-merci-text]');
  const dire = (h, t) => { titre.textContent = h; texte.textContent = t; };
  for (let essai = 0; essai < 6; essai++) {
    let r = {};
    try { r = await (await fetch(`/api/event-fulfill?type=commande&session_id=${encodeURIComponent(id)}`)).json(); } catch { /* réseau */ }
    if (r.status === 'paid') {
      window.lfbEvent?.('achat');
      try { window.gtag?.('event', 'purchase', { transaction_id: id }); } catch { /* */ }
      try { window.fbq?.('track', 'Purchase', {}, { eventID: id }); } catch { /* */ }
      if (r.telechargements?.length) {
        dire('Merci, ton livre est à toi !', `Commande n° ${r.order_number}. Tu reçois le reçu de paiement par email. Télécharge ton livre maintenant : tu le retrouveras aussi à tout moment dans « Mon espace », connectée avec la même adresse email.`);
        texte.insertAdjacentHTML('afterend', r.telechargements.map((t) => `<p><a class="btn btn-ink btn-telecharger" href="${esc(t.url)}"><svg class="ico" aria-hidden="true"><use href="/icones.svg#download"/></svg> Télécharger « ${esc(t.nom)} »</a></p>`).join(''));
        return;
      }
      return dire('Merci, ton achat est confirmé !', `Commande n° ${r.order_number}. Tu reçois le reçu de paiement par email. Lamia prépare ton colis et te tient au courant de l’expédition.`);
    }
    if (r.status === 'invalid' || r.status === 'not_an_order') return dire('Lien de confirmation incomplet', 'Si tu viens de payer, pas d’inquiétude : ta commande est bien enregistrée et tu reçois le reçu par email.');
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  dire('Paiement en cours de vérification', 'Ta banque n’a pas encore confirmé le paiement. Tu recevras le reçu par email dès que c’est fait. Une question ? Écris à Lamia.');
})();

// ---------------------------------------------------------------- application installable
// Le bouton « Installer » marche partout : fenêtre d'installation quand le navigateur la propose,
// sinon les étapes exactes pour CE téléphone (iPhone, Android, navigateur de TikTok / Instagram…).
(() => {
  if ('serviceWorker' in navigator) addEventListener('load', () => { navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {}); });
  const installee = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const boutons = () => document.querySelectorAll('[data-installer-bouton]');
  if (installee) { document.querySelectorAll('[data-installee]').forEach((e) => { e.hidden = false; }); boutons().forEach((b) => { b.hidden = true; }); return; }
  boutons().forEach((b) => { b.hidden = false; });
  let invite = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); invite = e; });
  const ua = navigator.userAgent;
  const dansAppli = /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Bytedance|Snapchat|Line\/|Pinterest/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iosAutre = ios && /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  const samsung = /SamsungBrowser/i.test(ua);
  const android = /Android/i.test(ua);
  function etapes() {
    if (dansAppli) return { titre: 'Ouvre d’abord le site dans ton vrai navigateur', liste: [
      'Tu es dans le navigateur de TikTok, Instagram ou Facebook : il ne permet pas d’installer d’application.',
      ios ? 'Touche les « … » (ou ⋯) en haut à droite, puis « Ouvrir dans Safari » (ou « Ouvrir dans le navigateur »).' : 'Touche les « ⋮ » en haut à droite, puis « Ouvrir dans Chrome » (ou « Ouvrir dans le navigateur »).',
      'Une fois dans ' + (ios ? 'Safari' : 'Chrome') + ', reviens sur cette page et touche à nouveau « Installer l’application ».'], copier: true };
    if (ios) return { titre: 'Sur iPhone, en quelques gestes', liste: [
      iosAutre ? 'Le plus simple : ouvre ce site dans Safari (l’application Safari, la boussole bleue).' : 'Tu es bien dans Safari : parfait.',
      'Touche le bouton Partager : le carré avec une flèche vers le haut (en bas de l’écran, ou en haut à droite sur iPad).',
      'Fais défiler et choisis « Sur l’écran d’accueil », puis touche « Ajouter » en haut à droite.',
      'L’icône « Tayri » apparaît sur ton écran d’accueil : ouvre-la depuis là.'], copier: iosAutre };
    if (samsung) return { titre: 'Sur Samsung Internet', liste: ['Touche le menu ≡ en bas à droite.', 'Choisis « Ajouter page à », puis « Écran d’accueil ».', 'Confirme : l’icône « Tayri » apparaît sur ton écran d’accueil.'] };
    if (android) return { titre: 'Sur Android (Chrome)', liste: ['Touche les « ⋮ » en haut à droite de Chrome.', 'Choisis « Installer l’application » (ou « Ajouter à l’écran d’accueil »).', 'Confirme : l’icône « Tayri » apparaît avec tes autres applications.', 'Si rien de tout ça n’apparaît, mets Chrome à jour dans le Play Store, puis réessaie.', 'Tu viens de désinstaller l’appli ? Ferme Chrome complètement, rouvre cette page, puis recommence : Chrome met parfois quelques minutes à proposer de nouveau l’installation.'] };
    return { titre: 'Sur ordinateur', liste: ['Dans Chrome ou Edge : clique sur l’icône d’installation (un écran avec une flèche) à droite de la barre d’adresse.', 'Ou ouvre le menu ⋮ puis « Installer Tayri… ».', 'Sur téléphone, c’est encore mieux : ouvre lamia-femme-berbere.com/application/ depuis ton téléphone.'] };
  }
  function aide() {
    document.querySelector('.install-aide')?.remove();
    const { titre, liste, copier } = etapes();
    const d = document.createElement('div');
    d.className = 'install-aide'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', titre);
    d.innerHTML = `<div class="install-boite"><button type="button" class="install-fermer" aria-label="Fermer">×</button><p class="install-icone"><img src="/images/marque/lfb-icone-192.png" width="64" height="64" alt=""></p><h2>${titre}</h2><ol>${liste.map((x) => `<li>${x}</li>`).join('')}</ol>${copier ? '<button type="button" class="btn btn-ink" data-copier-lien>Copier le lien du site</button><p class="install-copie" data-copie hidden>Lien copié : colle-le dans ' + (ios ? 'Safari' : 'Chrome') + '.</p>' : ''}</div>`;
    document.body.appendChild(d);
    const fermer = () => d.remove();
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('.install-fermer')) fermer(); });
    addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { fermer(); removeEventListener('keydown', esc); } });
    d.querySelector('[data-copier-lien]')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(`${location.origin}/application/`); } catch { /* */ }
      d.querySelector('[data-copie]').hidden = false;
    });
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-installer-bouton], a[data-installer]');
    if (!b) return;
    e.preventDefault();
    if (!invite) return aide();
    invite.prompt();
    const { outcome } = await invite.userChoice.catch(() => ({}));
    invite = null;
    if (outcome === 'accepted') boutons().forEach((x) => { x.hidden = true; });
  });
  addEventListener('appinstalled', () => { boutons().forEach((x) => { x.hidden = true; }); document.querySelectorAll('[data-installee]').forEach((x) => { x.hidden = false; }); });
})();

// Choix de la langue : garde la même page quand elle existe dans cette langue, et s'en souvient sur ce téléphone.
{
  const PAGES_LANGUES = ['/', '/rencontres/', '/rencontres/swipe/', '/rencontres/confirmer/', '/rencontres/visio/', '/mon-espace/', '/abonnement/', '/abonnement/merci/', '/application/', '/hors-ligne/', '/speed-dating/', '/speed-dating/inscription/', '/speed-dating/merci/', '/speed-dating/bal/', '/speed-dating/salle/', '/speed-dating/souhaits/', '/salon/', '/confidences/', '/nouveautes/', '/rencontre-kabyle-algerie/', '/rencontre-kabyle-canada/', '/rencontre-kabyle-europe/', '/lamia-brechet/', '/guides/mariage-kabyle/', '/guides/france-algerie/'];
  const ici = location.pathname.replace(/^\/(en|ar|kab)(?=\/)/, '');
  const langueIci = document.documentElement.lang;
  const memoire = { lire() { try { return localStorage.getItem('lfb_langue'); } catch { return null; } }, ecrire(l) { try { localStorage.setItem('lfb_langue', l); } catch { /* stockage indisponible */ } } };
  const existe = (l) => l === 'fr' || (l === 'en' ? !/^\/(admin|pilotage|tableau-de-bord|confidences-lamia)/.test(ici) : PAGES_LANGUES.includes(ici));
  document.querySelectorAll('.lang-link, .maison-menu-langues a').forEach((a) => {
    const l = a.hreflang;
    if (existe(l)) a.setAttribute('href', `${l === 'fr' ? '' : `/${l}`}${ici}${location.search}${location.hash}`);
    a.addEventListener('click', () => memoire.ecrire(l));
  });
  document.querySelectorAll('.maison-menu-langues a').forEach((a) => { if (a.hreflang === langueIci) a.setAttribute('aria-current', 'true'); });
  // À l'ouverture de l'appli ou d'une page française du parcours : on revient à la langue choisie.
  const choisie = memoire.lire();
  if (choisie && ['en', 'ar', 'kab'].includes(choisie) && langueIci === 'fr' && PAGES_LANGUES.includes(ici) && !/^\/(tableau-de-bord|confidences-lamia)/.test(ici)) location.replace(`/${choisie}${ici}${location.search}${location.hash}`);
}

// ---------------------------------------------------------------- cloche des nouveautés : un point rouge s'il y a du nouveau depuis la dernière visite
(function cloche() {
  const point = document.querySelector('[data-cloche-point]');
  if (!point || location.pathname.startsWith('/nouveautes')) return;
  let vu = 0, cache = null;
  try { vu = Number(localStorage.getItem('lfb-nouveautes-vu') || 0); cache = JSON.parse(sessionStorage.getItem('lfb-nouveautes-der') || 'null'); } catch { /* */ }
  const montrer = (der) => { if (der && new Date(der).getTime() > vu) point.hidden = false; };
  if (cache && Date.now() - cache.t < 600000) return montrer(cache.d);
  fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'annonce_nouveautes' }) })
    .then((r) => r.json()).then((r) => { const d = r.nouveautes?.[0]?.created_at || null; try { sessionStorage.setItem('lfb-nouveautes-der', JSON.stringify({ t: Date.now(), d })); } catch { /* */ } montrer(d); }).catch(() => {});
})();

// ---------------------------------------------------------------- bandeau d'alerte : soirée de speed dating imminente, places restantes par salon
(function bandeauSoiree() {
  if (/^\/(confidences-lamia|admin|tableau)/.test(location.pathname)) return;
  try { if (sessionStorage.getItem('lfb-bandeau-ferme')) return; } catch { /* */ }
  fetch('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'annonce_places_bal' }) })
    .then((r) => r.json()).then(({ soirees = [] }) => {
      if (!soirees.length) return;
      const s0 = soirees[0], d = new Date(s0.debut), maintenant = new Date();
      const memeJour = d.toDateString() === maintenant.toDateString();
      const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).replace(':00', ' h').replace(':', ' h ');
      const quand = maintenant >= d ? 'En ce moment' : memeJour ? `Ce soir ${heure}` : `${d.toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'Europe/Paris' })} ${heure}`;
      const salons = soirees.map((x) => `<span class="bandeau-salon">${(x.salon || '').replace(/^Grand salon · /, '')} : <b>${x.complet || !x.places ? 'complet' : `plus que ${x.places} place${x.places > 1 ? 's' : ''}`}</b></span>`).join('');
      const b = document.createElement('div');
      b.className = 'bandeau-soiree'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Soirée de speed dating');
      b.innerHTML = `<p><span class="bandeau-masque" aria-hidden="true"></span><strong>${quand} · ${s0.titre}</strong><span class="bandeau-detail">Speed dating en visio${s0.gratuit ? ', gratuit' : ''}</span>${salons}</p><a class="bandeau-btn" href="/speed-dating/#events-title">Je m’inscris</a><button type="button" class="bandeau-fermer" aria-label="Fermer">×</button>`;
      document.querySelector('.site-header')?.after(b);
      b.querySelector('.bandeau-fermer').addEventListener('click', () => { b.remove(); try { sessionStorage.setItem('lfb-bandeau-ferme', '1'); } catch { /* */ } });
    }).catch(() => {});
})();

// Message de Lamia pas encore lu : bandeau dans l'appli et le site, qui ouvre la conversation privée.
(function messageLamia() {
  try {
    if (location.pathname.startsWith('/confidences') || location.pathname.startsWith('/tableau-de-bord')) return;
    const jeton = JSON.parse(localStorage.getItem('sb-tybwvxinigahhntfeeur-auth-token') || 'null')?.access_token;
    if (!jeton) return;
    fetch('/api/confidences', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` }, body: JSON.stringify({ action: 'mes_non_lus' }) })
      .then((r) => (r.ok ? r.json() : null)).then((r) => {
        if (!r?.non_lus) return;
        const d = document.createElement('div');
        d.className = 'lfb-testeur-play';
        d.innerHTML = `<p><strong>Lamia t’a écrit.</strong> ${r.non_lus > 1 ? `${r.non_lus} messages t’attendent` : 'Un message t’attend'} dans ta conversation privée.</p><p><a class="btn btn-ink" href="/confidences/#conversation">Lire</a> <button type="button" class="btn btn-line" data-plus-tard>Plus tard</button></p>`;
        d.querySelector('[data-plus-tard]').onclick = () => d.remove();
        setTimeout(() => document.body.append(d), 1500);
      }).catch(() => {});
  } catch { /* */ }
})();

// Test Google Play : proposé une fois à tous les membres connectés (pas dans la version Play elle-même).
(function testeurPlay() {
  try {
    if (window.LFB_PLAY) return;
    const jeton = JSON.parse(localStorage.getItem('sb-tybwvxinigahhntfeeur-auth-token') || 'null')?.access_token;
    const installee = matchMedia('(display-mode: standalone)').matches;
    const envoyer = async () => {
      const r = await fetch('/api/confidences', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` }, body: JSON.stringify({ action: 'testeur_play', installee, android: /Android/i.test(navigator.userAgent) }) });
      if (r.ok) localStorage.setItem('lfb_testeur_play_ok', '1');
    };
    // Un « Oui » déjà donné mais pas enregistré (le serveur ne connaissait pas l'action) : renvoyé discrètement.
    if (localStorage.getItem('lfb_testeur_play') === 'oui' && !localStorage.getItem('lfb_testeur_play_ok')) { if (jeton) envoyer().catch(() => {}); return; }
    if (localStorage.getItem('lfb_testeur_play')) return;
    if (!jeton || location.pathname.startsWith('/tableau-de-bord')) return;
    const d = document.createElement('div');
    d.className = 'lfb-testeur-play';
    d.innerHTML = '<p><strong>Tayri arrive sur Google Play.</strong> Tu veux la tester en avant-première ?</p><p><button type="button" class="btn btn-ink" data-oui>Oui</button> <button type="button" class="btn btn-line" data-non>Non</button> <button type="button" class="btn btn-line" data-iphone>Non, je suis sur iPhone</button></p>';
    const fin = (v) => { try { localStorage.setItem('lfb_testeur_play', v); } catch { /* */ } };
    d.querySelector('[data-non]').onclick = () => { fin('non'); d.remove(); };
    d.querySelector('[data-iphone]').onclick = () => { fin('iphone'); d.remove(); };
    d.querySelector('[data-oui]').onclick = async () => {
      fin('oui');
      try { await envoyer(); } catch { /* */ }
      d.innerHTML = '<p><strong>Merci !</strong> Tu recevras le lien de Google Play sur ton adresse email. Il faut un téléphone Android avec cette adresse Gmail.</p>';
      setTimeout(() => d.remove(), 4000);
    };
    setTimeout(() => document.body.append(d), 4000);
  } catch { /* */ }
})();

// Lamia en direct (12 nov. 2026) : pastille sur l'onglet Live et fenêtre à l'ouverture de l'appli, une fois par live.
// L'état vient de /api/live/ (public, gardé 20 s par Vercel) et chaque appareil ne le relit qu'une fois par minute.
(async function lamiaEnDirect() {
  try {
    if (/^\/(confidences-lamia|tableau-de-bord|admin|pilotage)/.test(location.pathname)) return;
    let etat = null;
    try { const c = JSON.parse(localStorage.getItem('lfb-live-etat') || 'null'); if (c && Date.now() - c.lu < 60000) etat = c.etat; } catch { /* */ }
    if (!etat) {
      const r = await fetch('/api/live/');
      if (!r.ok) return;
      etat = await r.json();
      try { localStorage.setItem('lfb-live-etat', JSON.stringify({ lu: Date.now(), etat })); } catch { /* */ }
    }
    if (!etat?.actif) return;
    document.querySelectorAll('a[href="/salon/"]').forEach((a) => a.classList.add('lien-en-direct'));
    if (location.pathname.startsWith('/salon')) return;
    let vu = '';
    try { vu = localStorage.getItem('lfb-live-vu') || ''; } catch { /* */ }
    if (vu === etat.debut) return;
    try { localStorage.setItem('lfb-live-vu', etat.debut); } catch { /* */ }
    const d = document.createElement('dialog');
    d.className = 'live-fenetre';
    d.setAttribute('aria-labelledby', 'live-fenetre-titre');
    d.innerHTML = `<p class="live-badge"><span aria-hidden="true"></span> En direct</p>
      <h2 id="live-fenetre-titre">Lamia est en live</h2>
      ${etat.titre ? `<p class="live-fenetre-theme">${esc(etat.titre)}</p>` : ''}
      <p>Tu peux lui poser tes questions : elle te répond en direct.</p>
      <p class="live-fenetre-actions"><a class="po-btn" href="/salon/#en-direct">Poser ma question</a><a class="po-btn-verre" href="/salon/#en-direct">Regarder le live</a></p>
      <button type="button" class="live-fenetre-fermer" data-fermer>Plus tard</button>`;
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-fermer]')) d.close(); });
    d.addEventListener('close', () => d.remove());
    setTimeout(() => { document.body.append(d); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }, 1200);
  } catch { /* */ }
})();
