// Données vivantes de la Maison : catalogue, fiche produit, panier, prochaine soirée.
// Le navigateur n'utilise que la clé publique Supabase ; aucune donnée privée n'est lue ici.

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
const mediaFor = (p) =>
  MEDIA[p.slug] ||
  (Array.isArray(p.gallery) && p.gallery.length ? p.gallery : [p.cover_image_url])
    .filter(Boolean)
    .map((src) => ({ url: src, kind: 'inconnu', alt: p.name }));
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
  ['craft', 'Technique', (v) => v],
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
      <button class="btn btn-ink" type="button" data-add="${esc(p.id)}" ${sold ? 'disabled' : ''}>${sold ? 'Déjà partie' : 'Ajouter au panier'}</button>
      ${p.is_unique && !sold ? '<p class="fine">Pièce unique : un seul exemplaire.</p>' : ''}
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
  $('[data-add]', box)?.addEventListener('click', () => addToCart(p.id));
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
    slots.forEach((li) => {
      const url = links[li.dataset.social];
      if (url && /^https:\/\//.test(url)) { li.querySelector('a').href = url; li.hidden = false; }
    });
  } catch { /* liens absents */ }
}

renderCart();
renderGrids();
renderProductPage();
renderNextEvent();
renderSocials();
