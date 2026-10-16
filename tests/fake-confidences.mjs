import { randomUUID } from 'node:crypto';

// Faux Supabase en mémoire : tables PostgREST, stockage, connexion, emails et services de notification.
export function backend({ users = {} } = {}) {
  const db = { confidence_threads: [], confidence_messages: [], confidence_files: [], push_subscriptions: [], platform_settings: [] };
  const storage = new Set();
  const mails = [], pushes = [];
  const match = (row, url) => {
    for (const [k, v] of url.searchParams) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const [op, ...rest] = v.split('.'); const val = rest.join('.');
      const cell = row[k];
      if (op === 'eq' && String(cell) !== val) return false;
      if (op === 'neq' && String(cell) === val) return false;
      if (op === 'gte' && !(String(cell) >= val)) return false;
      if (op === 'in' && !val.slice(1, -1).split(',').includes(String(cell))) return false;
    }
    return true;
  };
  const fetcher = async (u, init = {}) => {
    const url = new URL(u);
    const method = init.method || 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    const ok = (data, status = 200) => ({ ok: status < 300, status, json: async () => data, text: async () => JSON.stringify(data) });
    if (url.pathname === '/auth/v1/user') {
      const t = (init.headers.Authorization || '').slice(7);
      return users[t] ? ok(users[t]) : ok({}, 401);
    }
    if (url.hostname === 'api.resend.com') { mails.push(body); return ok({ id: 'm' }); }
    if (url.hostname === 'push.example') { pushes.push({ url: u, headers: init.headers }); return ok({}, 201); }
    if (url.pathname.startsWith('/storage/v1/object/upload/sign/confidences/')) {
      const path = url.pathname.replace('/storage/v1/object/upload/sign/confidences/', '');
      return ok({ url: `/object/upload/sign/confidences/${path}?token=t` });
    }
    if (url.pathname === '/storage/v1/object/list/confidences') return ok([...storage].filter((p) => p.startsWith(body.prefix)).map((p) => ({ name: p.slice(body.prefix.length) })));
    if (url.pathname === '/storage/v1/object/sign/confidences') return ok(body.paths.map((p) => ({ path: p, signedURL: `/object/sign/confidences/${p}?token=s` })));
    if (url.pathname === '/storage/v1/object/confidences' && method === 'DELETE') { body.prefixes.forEach((p) => storage.delete(p)); return ok([]); }
    const table = url.pathname.replace('/rest/v1/', '');
    const rows = db[table];
    if (!rows) return ok({ message: 'no table' }, 404);
    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const out = [];
      for (const r of list) {
        const key = table === 'platform_settings' ? 'key' : table === 'push_subscriptions' ? 'endpoint' : null;
        const existing = key && rows.find((x) => x[key] === r[key]);
        if (existing) { Object.assign(existing, r); out.push(existing); continue; }
        const row = { id: randomUUID(), created_at: new Date().toISOString(), ...(table === 'confidence_threads' ? { status: 'a_lire', unread_lamia: 0, unread_visitor: 0 } : {}), ...(table === 'confidence_messages' ? { ready: false } : {}), ...r };
        rows.push(row); out.push(row);
      }
      return ok(out, 201);
    }
    if (method === 'PATCH') { rows.filter((r) => match(r, url)).forEach((r) => Object.assign(r, body)); return ok([], 204); }
    if (method === 'DELETE') {
      const del = rows.filter((r) => match(r, url));
      db[table] = rows.filter((r) => !del.includes(r));
      if (table === 'confidence_threads') for (const t of ['confidence_messages', 'confidence_files']) db[t] = db[t].filter((r) => !del.some((d) => d.id === r.thread_id));
      if (table === 'confidence_messages') db.confidence_files = db.confidence_files.filter((r) => !del.some((d) => d.id === r.message_id));
      return ok([], 204);
    }
    let list = rows.filter((r) => match(r, url));
    const order = url.searchParams.get('order');
    if (order) { const [k, dir] = order.split('.'); list = [...list].sort((a, c) => (dir === 'desc' ? -1 : 1) * String(a[k]).localeCompare(String(c[k]))); }
    const limit = Number(url.searchParams.get('limit')); if (limit) list = list.slice(0, limit);
    return ok(list);
  };
  return { db, storage, mails, pushes, fetcher };
}
