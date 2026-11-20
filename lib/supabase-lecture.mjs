// Reprises strictement limitées aux lectures : ne jamais rejouer un message ou un paiement.
const TRANSITOIRES = new Set([429, 502, 503, 504]);
const attente = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function routeSansDonnees(url) {
  const p = new URL(url).pathname.split('/').filter(Boolean);
  return '/' + p.slice(0, p[0] === 'rest' && p[2] === 'rpc' ? 4 : 3).map((x) => /^[a-z_][a-z_0-9-]{0,60}$/i.test(x) ? x : ':id').join('/');
}
function echec(url, method, contexte, cause) {
  const timeout = cause?.name === 'TimeoutError' || cause?.name === 'AbortError';
  const e = new Error(`Supabase ${method} ${routeSansDonnees(url)} ${timeout ? 'timeout' : 'connexion indisponible'}${contexte && /^[a-z_]{1,40}$/.test(contexte) ? ` (${contexte})` : ''}`);
  e.code = timeout ? 'SUPABASE_TIMEOUT' : 'SUPABASE_UNAVAILABLE';
  return e;
}
export async function lectureFiable(url, init = {}, { fetcher = fetch, timeoutMs = 10000, contexte = '', horloge = Date.now, pause = attente } = {}) {
  const method = String(init.method || 'GET').toUpperCase(), lecture = method === 'GET' || method === 'HEAD';
  const fin = horloge() + timeoutMs;
  for (let tentative = 0; tentative < (lecture ? 2 : 1); tentative += 1) {
    if (tentative && horloge() >= fin) throw echec(url, method, contexte, { name:'TimeoutError' });
    const reste = Math.max(1, fin - horloge());
    // Réserver une partie du même budget au second essai, sans augmenter l'attente totale.
    const delai = lecture && tentative === 0 ? Math.max(1, Math.floor(reste * .55)) : reste;
    const signal = AbortSignal.timeout(delai);
    try {
      const r = await fetcher(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal });
      if (!lecture || tentative || !TRANSITOIRES.has(r.status) || fin - horloge() < 250 || init.signal?.aborted) return r;
      const apres = r.headers?.get?.('retry-after');
      const secondes = apres && /^\d+(\.\d+)?$/.test(apres) ? Number(apres) : null;
      const ms = apres ? Math.max(100, secondes === null ? Date.parse(apres) - horloge() || 100 : secondes * 1000) : 100;
      // Un service qui demande d'attendre plus longtemps ne doit pas être sollicité immédiatement.
      if (ms > fin - horloge() - 100) return r;
      await r.body?.cancel?.().catch(() => {});
      await pause(ms);
    } catch (cause) {
      if (init.signal?.aborted) throw cause;
      const transitoire = ['TimeoutError','AbortError','TypeError'].includes(cause?.name) || ['ECONNRESET','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT'].includes(cause?.code);
      if (!lecture || tentative || !transitoire || fin - horloge() < 250) throw echec(url, method, contexte, cause);
      await pause(100);
    }
  }
  throw echec(url, method, contexte, { name:'TimeoutError' });
}

// Mémo limité à UNE invocation. Toute écriture invalide les lectures, avant et après son exécution.
export function lecturesParRequete(appel) {
  const cache = new Map();
  const call = async (path, init = {}) => {
    const ecriture = !['GET','HEAD'].includes(String(init.method || 'GET').toUpperCase());
    if (ecriture) cache.clear();
    try { return await appel(path, init); } finally { if (ecriture) cache.clear(); }
  };
  const read = async (path) => {
    if (!cache.has(path)) {
      const p = call(path).then(async (r) => {
        if (!r.ok) throw new Error(`Supabase GET ${routeSansDonnees('https://base.invalid'+path)} HTTP ${r.status}`);
        return r.json();
      });
      cache.set(path, p);
      p.catch(() => { if (cache.get(path) === p) cache.delete(path); });
    }
    return structuredClone(await cache.get(path));
  };
  return { call, read };
}
