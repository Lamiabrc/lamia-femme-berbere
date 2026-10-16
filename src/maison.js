// Données vivantes de la Maison : catalogue, fiche produit, panier, prochaine soirée.
// Le navigateur n'utilise que la clé publique Supabase ; aucune donnée privée n'est lue ici.

import { SHIPPING_METHODS, shippingFor, MAX_QTY, tvaIncluse, reglagesPropres } from '/assets/shipping.mjs';

// Frais d'envoi et TVA réglés par Lamia (le serveur recalcule toujours à la commande).
let REGLAGES = reglagesPropres();
const reglagesPrets = fetch('/api/admin?action=boutique').then((r) => (r.ok ? r.json() : null)).then((v) => { if (v) REGLAGES = reglagesPropres(v); }).catch(() => {});

export const SUPABASE_URL = 'https://tybwvxinigahhntfeeur.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
export const money = (cents, currency = 'EUR') => new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format((cents || 0) / 100);

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

let productsPromise;
export function loadProducts() {
  productsPromise ||= rest(
    'products?select=id,slug,name,subtitle,description,price_cents,compare_at_price_cents,currency,stock_qty,is_unique,product_type,featured,cover_image_url,gallery,metadata,categories(name,slug)&status=eq.active&order=featured.desc,created_at.desc'
  );
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
  return `<a class="product-card${sold ? ' is-sold' : ''}" href="/produit/?p=${encodeURIComponent(p.slug)}" data-accent="${room.accent}">
    <div class="product-media">${visual}${badge}</div>
    <h3>${esc(p.name)}</h3>
    <p class="product-price">${price}</p>
  </a>`;
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
  const slug = new URLSearchParams(location.search).get('p');
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
      ${p.description ? `<p>${esc(p.description)}</p>` : ''}
      ${specs ? `<div class="specs">${specs}</div>` : ''}
      ${sold ? '<button class="btn btn-ink" type="button" disabled>Déjà partie</button>' : preorderForm(p)}
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
}

// ---------------------------------------------------------------- précommande

function preorderForm(p) {
  const digital = p.product_type === 'digital';
  const max = MAX_QTY(p);
  return `<form class="preorder" data-preorder novalidate>
    <h2>Précommander</h2>
    <p class="fine">${p.is_unique ? 'Pièce unique : la première précommande la réserve.' : 'Réserve ton exemplaire dès maintenant.'} Rien n’est payé ici : Lamia te confirme ta précommande par email et t’envoie le moyen de paiement.</p>
    ${max > 1 ? `<label>Quantité<select name="qty">${Array.from({ length: max }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label>` : '<input type="hidden" name="qty" value="1">'}
    ${digital ? '' : `<fieldset><legend>Livraison</legend>
      <label class="check"><input type="radio" name="method" value="colissimo" checked><span>${SHIPPING_METHODS.colissimo.label} <small data-ship-price></small><br><small>${SHIPPING_METHODS.colissimo.delay}</small></span></label>
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
    <input name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
    <div class="preorder-total"><span>Total à régler à la confirmation</span><strong data-total></strong></div>
    <label class="check"><input type="checkbox" name="cgv"><span>J’accepte les <a href="/cgv/" target="_blank" rel="noopener">conditions de vente</a> (précommande sans paiement immédiat).</span></label>
    <button class="btn btn-ink" type="submit">Envoyer ma précommande</button>
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
    if (addr) addr.hidden = ship.method !== 'colissimo';
    const total = p.price_cents * qty + ship.cents, tva = tvaIncluse(total, REGLAGES.tva);
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
    if (!f.cgv.checked) return say('Coche la case des conditions de vente pour continuer.', true);
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Envoi…';
    const body = {
      slug: p.slug, qty: f.qty.value, name: f.name.value, email: f.email.value, phone: f.phone.value,
      method: f.method ? form.querySelector('[name=method]:checked').value : 'email',
      address: f.line1 ? { line1: f.line1.value, line2: f.line2.value, postal_code: f.postal_code.value, city: f.city.value } : null,
      message: f.message.value, website: f.website.value, cgv_accepted: true,
    };
    let r = {}, res;
    try { res = await fetch('/api/preorder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); r = await res.json().catch(() => ({})); } catch { /* réseau */ }
    btn.disabled = false; btn.textContent = 'Envoyer ma précommande';
    if (res?.ok && r.ok) {
      window.lfbEvent?.('precommande');
      form.innerHTML = `<h2>Merci, ta précommande est enregistrée.</h2><p>Numéro de précommande : <strong>${esc(r.order_number)}</strong></p><p>${r.waitlist ? 'Cette pièce unique est déjà réservée : tu es inscrite en liste d’attente. Lamia te prévient si elle se libère.' : `Lamia te confirme ta précommande par email et t’envoie le moyen de paiement. Total : ${money(r.total_cents)}.`}</p>`;
      return;
    }
    const msg = { invalid_contact: 'Vérifie ton nom et ton adresse email.', invalid_address: 'Vérifie ton adresse : rue, code postal à 5 chiffres et ville.', product_unavailable: 'Cette pièce n’est plus disponible.' };
    say(msg[r.error] || 'La précommande n’est pas partie. Réessaie dans un instant.', true);
  });
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
  return rest('speed_dating_events?select=id,title,description,starts_at,min_age,max_age,capacity,ticket_price_cents,currency,status&status=in.(published,sold_out)&order=starts_at');
}
export const eventDate = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

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
    const tiktok = links.tiktok || 'https://www.tiktok.com/@lamiaberbere';
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
  try {
    const raw = localStorage.getItem('sb-tybwvxinigahhntfeeur-auth-token');
    if (raw && JSON.parse(raw)?.access_token) a.textContent = 'Mon espace';
  } catch { /* stockage indisponible */ }
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
  window.lfbEvent = (event) => { envoyer({ event }); try { window.gtag?.('event', event); } catch { /* */ } };
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

// ---------------------------------------------------------------- Google Analytics, seulement avec l'accord du visiteur (RGPD)
(function analytics() {
  const GA = 'G-YZ486LN6LV';
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
  }
  function effacer() {
    // Retire les cookies Google Analytics déjà posés.
    for (const c of document.cookie.split(';')) {
      const nom = c.split('=')[0].trim();
      if (/^_ga/.test(nom)) for (const d of ['', location.hostname, '.' + location.hostname.replace(/^www\./, '')]) document.cookie = `${nom}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`;
    }
  }
  function bandeau() {
    if (document.querySelector('[data-cookies]')) return;
    const b = document.createElement('div');
    b.className = 'cookies';
    b.setAttribute('data-cookies', '');
    b.setAttribute('role', 'dialog');
    b.setAttribute('aria-label', 'Mesure d’audience');
    b.innerHTML = `<p>Avec ton accord, la Maison utilise Google Analytics pour savoir comment le site est visité et l’améliorer. Aucune publicité. <a href="/confidentialite/">En savoir plus</a></p>
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
