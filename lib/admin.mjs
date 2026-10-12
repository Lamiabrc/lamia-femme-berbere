// Le tableau de bord de Lamia : chiffres, ventes, produits, photos, textes du site, visites.
// Toutes les actions (sauf « visit », le compteur de visites) sont réservées au rôle admin.

import { createHash } from 'node:crypto';
import { DATABASE_URL, json, serviceHeaders, userFromRequest, isAdmin } from './event-tickets.mjs';

const UUID = /^[0-9a-f-]{36}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const ORDER_STATUSES = ['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'];
const PRODUCT_STATUSES = ['draft', 'active', 'archived'];
const BUCKET = 'medias';
const parisDay = (d) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d); // AAAA-MM-JJ

export const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

// D'où vient la visite : réseau social, moteur de recherche, ou site.
export function sourceOf(ref, utm) {
  if (utm) return clean(utm, 40).toLowerCase();
  let host = '';
  try { host = new URL(ref).hostname.replace(/^www\.|^m\.|^l\./, ''); } catch { return 'direct'; }
  if (!host || host.endsWith('lamia-femme-berbere.com') || host.endsWith('vercel.app')) return 'interne';
  for (const [k, re] of [['tiktok', /tiktok/], ['facebook', /facebook|fb\.com/], ['instagram', /instagram/], ['youtube', /youtube|youtu\.be/], ['google', /google\./], ['bing', /bing\./], ['whatsapp', /whatsapp/], ['snapchat', /snapchat/]]) if (re.test(host)) return k;
  return host.slice(0, 60);
}

export async function handleAdmin(request, { env = process.env, fetcher = fetch, now = () => new Date() } = {}) {
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return json({ error: 'not_configured' }, 503);
  const call = (path, init = {}) => fetcher(`${DATABASE_URL}${path}`, { ...init, headers: serviceHeaders(env, init.headers), signal: AbortSignal.timeout(15000) });
  let b = {};
  if (request.method === 'POST') { try { b = await request.json(); } catch { return json({ error: 'bad_request' }, 400); } }
  const action = clean(b.action || new URL(request.url).searchParams.get('action'), 30);

  // ---------------------------------------------------------------- compteur de visites (public, sans cookie)
  if (action === 'visit') {
    const path = clean(b.path, 200);
    if (!path.startsWith('/') || /^\/(admin|tableau-de-bord|api)/.test(path)) return json({ ok: true });
    const ua = request.headers.get('user-agent') || '';
    if (/bot|crawl|spider|preview|headless|lighthouse/i.test(ua)) return json({ ok: true });
    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const day = parisDay(now());
    // Empreinte du jour, non réversible, qui change chaque jour : pas de suivi d'une personne dans le temps.
    const visitor = createHash('sha256').update(`${day}|${ip}|${ua}|${env.SUPABASE_SERVICE_ROLE_KEY || ''}`).digest('hex').slice(0, 32);
    const device = /ipad|tablet/i.test(ua) ? 'tablette' : /mobi|android|iphone/i.test(ua) ? 'mobile' : 'ordinateur';
    await call('/rest/v1/page_views', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ day, path, source: sourceOf(b.ref, b.utm), device, visitor }) }).catch(() => {});
    return json({ ok: true });
  }

  const user = await userFromRequest(request, { fetcher });
  if (!isAdmin(user)) return json({ error: 'forbidden' }, 403);
  const read = async (path) => { const r = await call(path); return r.ok ? r.json() : []; };

  // ---------------------------------------------------------------- vue d'ensemble
  if (action === 'dashboard') {
    const [orders, events, regs, reports, views] = await Promise.all([
      read('/rest/v1/orders?select=id,order_number,status,customer_name,customer_email,amount_total_cents,currency,notes,shipping_address,created_at,paid_at,fulfilled_at,order_items(product_name,quantity,total_price_cents)&order=created_at.desc&limit=200'),
      read(`/rest/v1/speed_dating_events?select=id,title,audience,starts_at,capacity,status&starts_at=gte.${encodeURIComponent(new Date(now().getTime() - 2 * 864e5).toISOString())}&order=starts_at`),
      read('/rest/v1/event_registrations?select=event_id,user_id,attendance_status,created_at&attendance_status=neq.cancelled'),
      read('/rest/v1/safety_reports?select=id,reported_label,reason,severity,status,created_at&order=created_at.desc&limit=20'),
      call('/rest/v1/rpc/visit_stats', { method: 'POST', body: JSON.stringify({ p_today: parisDay(now()) }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const sum = (list) => list.reduce((t, o) => t + (o.amount_total_cents || 0), 0);
    const live = orders.filter((o) => !['cancelled', 'refunded'].includes(o.status));
    const count = (list, f) => Object.entries(list.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, c) => c[1] - a[1]);
    const regsByEvent = count(regs, (r) => r.event_id);
    const newRegs7 = regs.filter((r) => r.created_at >= new Date(now().getTime() - 7 * 864e5).toISOString()).length;
    return json({
      ventes: {
        total_cents: sum(live), en_attente: live.filter((o) => o.status === 'pending').length, payees: live.filter((o) => o.status === 'paid').length,
        expediees: live.filter((o) => o.status === 'fulfilled').length, nombre: live.length, orders,
      },
      inscrits: {
        total: regs.length, nouveaux_7j: newRegs7,
        salons: events.map((e) => ({ ...e, inscrits: regsByEvent.find(([id]) => id === e.id)?.[1] || 0 })),
      },
      alertes: { nouvelles: reports.filter((r) => r.status === 'new').length, recentes: reports },
      visites: views || null,
    });
  }

  if (action === 'order_status') {
    const id = clean(b.id, 36), status = clean(b.status, 20);
    if (!UUID.test(id) || !ORDER_STATUSES.includes(status)) return json({ error: 'bad_request' }, 400);
    const patch = { status };
    if (status === 'paid') patch.paid_at = now().toISOString();
    if (status === 'fulfilled') patch.fulfilled_at = now().toISOString();
    const r = await call(`/rest/v1/orders?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Error('order_update_failed');
    return json({ ok: true });
  }

  // ---------------------------------------------------------------- produits
  if (action === 'products') {
    const [products, categories] = await Promise.all([
      read('/rest/v1/products?select=*,categories(slug,name)&order=status.asc,created_at.desc'),
      read('/rest/v1/categories?select=id,slug,name&is_active=eq.true&order=sort_order'),
    ]);
    return json({ products, categories });
  }

  if (action === 'product_save') {
    const p = b.product || {};
    const id = clean(p.id, 36);
    const name = clean(p.name, 140);
    if (!name) return json({ error: 'missing_name' }, 400);
    const price = Math.round(Number(p.price_cents));
    if (!Number.isFinite(price) || price < 0 || price > 10_000_000) return json({ error: 'bad_price' }, 400);
    const compare = p.compare_at_price_cents === '' || p.compare_at_price_cents == null ? null : Math.round(Number(p.compare_at_price_cents));
    const stock = Math.max(0, Math.min(100000, Math.round(Number(p.stock_qty) || 0)));
    const slug = SLUG.test(p.slug || '') ? p.slug : slugify(name);
    const gallery = (Array.isArray(p.gallery) ? p.gallery : []).map((g) => ({ url: clean(g?.url ?? g, 500), alt: clean(g?.alt, 200) || name })).filter((g) => /^https:\/\//.test(g.url) || g.url.startsWith('/images/')).slice(0, 12);
    const row = {
      name, slug,
      subtitle: clean(p.subtitle, 200) || null,
      description: clean(p.description, 6000) || null,
      price_cents: price,
      compare_at_price_cents: Number.isFinite(compare) && compare > 0 ? compare : null,
      stock_qty: stock,
      is_unique: Boolean(p.is_unique),
      product_type: ['physical', 'digital', 'service'].includes(p.product_type) ? p.product_type : 'physical',
      status: PRODUCT_STATUSES.includes(p.status) ? p.status : 'draft',
      featured: Boolean(p.featured),
      category_id: UUID.test(p.category_id || '') ? p.category_id : null,
      gallery,
      cover_image_url: gallery[0]?.url || null,
      updated_at: now().toISOString(),
    };
    if (p.metadata && typeof p.metadata === 'object') row.metadata = p.metadata;
    const r = id && UUID.test(id)
      ? await call(`/rest/v1/products?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) })
      : await call('/rest/v1/products', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      if (/duplicate|unique/i.test(t)) return json({ error: 'slug_taken' }, 409);
      throw new Error('product_save_failed');
    }
    return json({ product: (await r.json())[0] });
  }

  // ---------------------------------------------------------------- photos (bucket public « medias »)
  if (action === 'upload') {
    const type = clean(b.content_type, 40);
    if (!/^image\/(webp|jpeg|png)$/.test(type)) return json({ error: 'bad_type' }, 400);
    const data = Buffer.from(String(b.data || ''), 'base64');
    if (!data.length || data.length > 3_500_000) return json({ error: 'too_big' }, 413);
    const folder = ['produits', 'site'].includes(b.folder) ? b.folder : 'site';
    const ext = type.split('/')[1].replace('jpeg', 'jpg');
    const path = `${folder}/${parisDay(now())}-${createHash('sha1').update(data).digest('hex').slice(0, 12)}-${slugify(b.name || 'image').slice(0, 40) || 'image'}.${ext}`;
    const put = () => call(`/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { 'Content-Type': type, 'x-upsert': 'true', 'Cache-Control': 'public, max-age=31536000' }, body: data });
    let r = await put();
    if (r.status === 404 || r.status === 400) {
      // Premier envoi : on crée le dossier public des médias.
      await call('/storage/v1/bucket', { method: 'POST', body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 5_000_000, allowed_mime_types: ['image/webp', 'image/jpeg', 'image/png'] }) }).catch(() => {});
      r = await put();
    }
    if (!r.ok) throw new Error(`upload_failed_${r.status}`);
    return json({ url: `${DATABASE_URL}/storage/v1/object/public/${BUCKET}/${path}` });
  }

  // ---------------------------------------------------------------- textes et images du site
  if (action === 'content') {
    const rows = await read('/rest/v1/platform_settings?key=eq.site_content&select=value,updated_at');
    return json({ values: rows[0]?.value?.values || {}, published_at: rows[0]?.value?.published_at || null, updated_at: rows[0]?.updated_at || null, publish_ready: Boolean(env.VERCEL_DEPLOY_HOOK) });
  }

  if (action === 'content_save' || action === 'publish') {
    const rows = await read('/rest/v1/platform_settings?key=eq.site_content&select=value');
    const current = rows[0]?.value || {};
    let values = current.values || {};
    if (action === 'content_save') {
      values = {};
      for (const [k, v] of Object.entries(b.values || {})) if (/^(pages|rooms|images)\.[\w.-]+$/.test(k) && typeof v === 'string' && v.trim()) values[k] = v.slice(0, 4000);
    }
    const value = { ...current, values, saved_at: now().toISOString() };
    if (action === 'publish') {
      if (!env.VERCEL_DEPLOY_HOOK) return json({ error: 'publish_not_configured' }, 503);
      const hook = await fetcher(env.VERCEL_DEPLOY_HOOK, { method: 'POST', signal: AbortSignal.timeout(15000) });
      if (!hook.ok) throw new Error('deploy_hook_failed');
      value.published_at = now().toISOString();
    }
    const w = await call('/rest/v1/platform_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'site_content', value, updated_at: now().toISOString() }) });
    if (!w.ok) throw new Error('content_save_failed');
    return json({ ok: true, published: action === 'publish' });
  }

  return json({ error: 'bad_request' }, 400);
}
