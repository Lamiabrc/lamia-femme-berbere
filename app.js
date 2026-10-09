const SUPABASE_URL = 'https://tybwvxinigahhntfeeur.supabase.co';
const SUPABASE_KEY = 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc';

const FALLBACK_PRODUCTS = [
  {id:'demo-book',slug:'werdi-ouvre-les-yeux',name:'Werdi, ouvre les yeux !',subtitle:'Collection Yemma Werdi',description:'Le petit manuel de la fille amoureuse, du virtuel au réel.',price_cents:1290,currency:'EUR',stock_qty:999,is_unique:false,product_type:'digital',featured:true,categories:{name:'Livres & guides',slug:'livres'}},
  {id:'demo-card',slug:'carte-postale-ancienne',name:'Carte postale ancienne',subtitle:'Pièce unique',description:'Une petite trouvaille choisie par Lamia. Exemplaire unique.',price_cents:500,currency:'EUR',stock_qty:1,is_unique:true,product_type:'physical',featured:true,categories:{name:'Les Trouvailles de Lamia',slug:'trouvailles'}},
  {id:'demo-ring',slug:'alliance-lfb',name:'Alliance Lamia Femme Berbère',subtitle:'Bijou symbolique',description:'Alliance simple pensée pour les couples de la communauté.',price_cents:4900,currency:'EUR',stock_qty:10,is_unique:false,product_type:'physical',featured:true,categories:{name:'Bijoux & créations',slug:'bijoux'}}
];

const state={products:[],cart:JSON.parse(localStorage.getItem('lfb_cart_v2')||'[]'),filter:'tous'};
const $=s=>document.querySelector(s);
const fmt=(cents,currency='EUR')=>new Intl.NumberFormat('fr-FR',{style:'currency',currency}).format((cents||0)/100);
const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
const saveCart=()=>localStorage.setItem('lfb_cart_v2',JSON.stringify(state.cart));

async function loadProducts(){
  const status=$('#catalogStatus');
  try{
    const endpoint=`${SUPABASE_URL}/rest/v1/products?select=id,slug,name,subtitle,description,price_cents,compare_at_price_cents,currency,stock_qty,is_unique,product_type,featured,cover_image_url,gallery,metadata,categories(name,slug)&status=eq.active&order=featured.desc,created_at.desc`;
    const res=await fetch(endpoint,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}});
    if(!res.ok) throw new Error(`Supabase ${res.status}`);
    state.products=await res.json();
    status.textContent=`${state.products.length} produit${state.products.length>1?'s':''} en ligne · catalogue synchronisé`;
  }catch(err){
    console.warn(err); state.products=FALLBACK_PRODUCTS;
    status.textContent='Aperçu local · synchronisation momentanément indisponible';
  }
  renderFilters(); renderProducts(); renderCart();
}

function categoryLabel(p){return p.categories?.name||'Lamia Femme Berbère'}
function categorySlug(p){return p.categories?.slug||'autres'}
function shortCategory(slug){return ({bijoux:'Bijoux',livres:'Livres',trouvailles:'Trouvailles','amour-communaute':'Communauté'})[slug]||'Maison'}

function renderFilters(){
  const cats=[...new Map(state.products.map(p=>[categorySlug(p),shortCategory(categorySlug(p))])).entries()];
  $('#filters').innerHTML=[['tous','Tout voir'],...cats].map(([slug,label])=>`<button class="${state.filter===slug?'active':''}" data-filter="${esc(slug)}">${esc(label)}</button>`).join('');
  $('#filters').querySelectorAll('[data-filter]').forEach(btn=>btn.onclick=()=>{state.filter=btn.dataset.filter;renderFilters();renderProducts();});
}

function renderProducts(){
  const products=state.filter==='tous'?state.products:state.products.filter(p=>categorySlug(p)===state.filter);
  $('#productGrid').innerHTML=products.map(p=>{
    const soldOut=p.stock_qty<=0;
    const image=p.cover_image_url?`<img src="${esc(p.cover_image_url)}" alt="${esc(p.name)}">`:`<div class="product-placeholder">${esc(shortCategory(categorySlug(p)))}<small>Lamia Femme Berbère</small></div>`;
    return `<article class="product-card">
      <button class="product-image product-view" data-view="${esc(p.id)}" aria-label="Voir ${esc(p.name)}">${image}${p.is_unique?'<span class="unique-badge">Pièce unique</span>':''}</button>
      <div class="product-body">
        <div class="product-meta"><span>${esc(categoryLabel(p))}</span><span>${soldOut?'Épuisé':p.is_unique?'1 exemplaire':`${p.stock_qty} en stock`}</span></div>
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description||p.subtitle||'')}</p>
        <button class="product-see" data-view="${esc(p.id)}">Voir le bijou</button><div class="product-footer"><span class="price">${p.compare_at_price_cents?`<del>${fmt(p.compare_at_price_cents,p.currency)}</del> `:""}${fmt(p.price_cents,p.currency)}</span><button class="add-btn" data-add="${esc(p.id)}" ${soldOut?'disabled':''}>${soldOut?'Épuisé':'Ajouter'}</button></div>
      </div>
    </article>`
  }).join('')||'<p>Aucun produit pour le moment dans cet univers.</p>';
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=e=>{e.stopPropagation();addToCart(b.dataset.add)});
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>openProduct(b.dataset.view));
}


function openProduct(id){
  const p=state.products.find(x=>x.id===id); if(!p)return;
  const gallery=(Array.isArray(p.gallery)&&p.gallery.length?p.gallery:[p.cover_image_url]).filter(Boolean);
  const main=$('#productGalleryMain');
  main.src=gallery[0]||''; main.alt=p.name||'Bijou Lamia Femme Berbère';
  $('#productDetailName').textContent=p.name||'';
  $('#productDetailSubtitle').textContent=p.subtitle||'';
  $('#productDetailDescription').textContent=p.description||'';
  $('#productDetailPrice').innerHTML=(p.compare_at_price_cents?`<del>${fmt(p.compare_at_price_cents,p.currency)}</del>`:'')+`<strong>${fmt(p.price_cents,p.currency)}</strong>`;
  const m=p.metadata||{};
  const specs=[
    m.weight_g?[`${m.weight_g} g`,'Poids']:null,
    m.main_medallion_diameter_cm?[`${m.main_medallion_diameter_cm} cm`,'Médaillon central']:null,
    m.side_medallion_diameter_cm?[`${m.side_medallion_diameter_cm} cm`,'Médaillons latéraux']:null,
    m.origin?[m.origin,'Origine']:null
  ].filter(Boolean);
  $('#productSpecs').innerHTML=specs.map(([v,l])=>`<div><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join('');
  $('#productThumbs').innerHTML=gallery.map((src,i)=>`<button class="product-thumb ${i===0?'active':''}" data-gallery-src="${esc(src)}"><img src="${esc(src)}" alt="${esc(p.name)} — vue ${i+1}"></button>`).join('');
  document.querySelectorAll('[data-gallery-src]').forEach(t=>t.onclick=()=>{main.src=t.dataset.gallerySrc;document.querySelectorAll('.product-thumb').forEach(x=>x.classList.remove('active'));t.classList.add('active')});
  const add=$('#productDetailAdd'); add.disabled=p.stock_qty<=0; add.textContent=p.stock_qty<=0?'Épuisé':'Ajouter au panier'; add.onclick=()=>{addToCart(p.id);closeProduct()};
  $('#productModal').classList.add('show'); $('#productModal').setAttribute('aria-hidden','false'); document.body.classList.add('modal-open');
}
function closeProduct(){
  $('#productModal')?.classList.remove('show'); $('#productModal')?.setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open');
}
$('#closeProductModal')?.addEventListener('click',closeProduct);
$('#productModal')?.addEventListener('click',e=>{if(e.target.id==='productModal')closeProduct()});

function addToCart(id){
  const p=state.products.find(x=>x.id===id); if(!p||p.stock_qty<=0)return;
  const row=state.cart.find(x=>x.id===id);
  if(row) row.qty=Math.min(row.qty+1,p.is_unique?1:p.stock_qty); else state.cart.push({id,qty:1});
  saveCart();renderCart();openCart();
}

function renderCart(){
  state.cart=state.cart.filter(row=>state.products.some(p=>p.id===row.id)); saveCart();
  let total=0,count=0;
  $('#cartItems').innerHTML=state.cart.map(row=>{
    const p=state.products.find(x=>x.id===row.id); if(!p)return'';
    total+=p.price_cents*row.qty;count+=row.qty;
    return `<div class="cart-row"><div><strong>${esc(p.name)}</strong><br><small>${row.qty} × ${fmt(p.price_cents,p.currency)}</small></div><button data-remove="${esc(p.id)}">Retirer</button></div>`;
  }).join('')||'<p>Votre panier est vide.</p>';
  $('#cartTotal').textContent=fmt(total);$('#cartCount').textContent=count;
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{state.cart=state.cart.filter(x=>x.id!==b.dataset.remove);saveCart();renderCart();});
}
function openCart(){$('#cartDrawer').classList.add('open');$('#overlay').classList.add('show')}function closeCart(){$('#cartDrawer').classList.remove('open');$('#overlay').classList.remove('show')}

function jumpToFilter(slug){state.filter=slug;renderFilters();renderProducts();$('#boutique').scrollIntoView({behavior:'smooth'});}
document.querySelectorAll('[data-filter-target]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();jumpToFilter(el.dataset.filterTarget)}));
$('#cartButton').onclick=openCart;$('#cartClose').onclick=closeCart;$('#overlay').onclick=closeCart;$('.menu-toggle').onclick=()=>$('.main-nav').classList.toggle('open');
$('#checkoutBtn').onclick=()=>{alert('La boutique et le panier sont branchés. Stripe sera activé dès que le compte Stripe Lamia Femme Berbère sera confirmé.');};
$('#newsletterForm').onsubmit=e=>{e.preventDefault();alert('Merci ! L’inscription sera reliée à la base clients dans la prochaine étape.');e.target.reset();};
loadProducts();
