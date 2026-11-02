// Le démasquage : quand deux personnes se sont choisies dans leur carnet de bal (souhait réciproque),
// chacune confirme si elle veut se démasquer, c'est-à-dire être mise en relation par Lamia.
// - pendant le bal : Lamia lance un tour « Démasquage » qui ne réunit que les couples réciproques présents ;
// - après le bal : la question attend dans « Mon espace » (et une notification part).
// Le choix de l'autre n'est jamais montré avant la réponse ; un « non » reste discret (« pas cette fois »).
// Stockage : une ligne platform_settings par couple, « <prefixe>:<session>:<uidA>_<uidB> ».

const UUID = /^[0-9a-f-]{36}$/i;
export const pairKey = (a, b) => [a, b].sort().join('_');

// Couples réciproques d'une liste de souhaits { uid, name, ev, wished: [uid] }.
export function reciproques(wishes) {
  const par = new Map(wishes.map((w) => [w.uid, w]));
  const out = [];
  for (const w of wishes) {
    for (const o of w.wished || []) {
      const autre = par.get(o);
      if (w.uid < o && autre && (autre.wished || []).includes(w.uid)) out.push({ a: { uid: w.uid, name: w.name }, b: { uid: o, name: autre.name }, ev: w.ev || autre.ev || null });
    }
  }
  return out;
}

// État d'un couple vu par une personne : à répondre, en attente de l'autre, confirmé, ou pas cette fois.
export function etatPour(uid, rep = {}, other) {
  const moi = rep[uid], lui = rep[other];
  if (moi === false || lui === false) return moi === undefined ? 'a_repondre' : 'pas_cette_fois';
  if (moi === undefined) return 'a_repondre';
  if (lui === undefined) return 'attente';
  return 'confirme';
}
export function etatCouple(rep = {}, a, b) {
  if (rep[a] === false || rep[b] === false) return 'pas_cette_fois';
  if (rep[a] === true && rep[b] === true) return 'confirme';
  return 'en_cours';
}

export function outilsDemasque({ call, prefixeSouhaits, prefixeDemasque }) {
  const read = async (path) => { const r = await call(path); return r.ok ? r.json() : []; };
  async function souhaits(session) {
    const like = session ? `${prefixeSouhaits}:${session}:*` : `${prefixeSouhaits}:*`;
    const rows = await read(`/rest/v1/platform_settings?key=like.${encodeURIComponent(like)}&select=key,value`);
    // Le numéro de session est dans la clé : « bal_wish:<session>:<uid> ».
    return rows.map((r) => ({ ...r.value, session: r.key.split(':')[1] }));
  }
  async function reponses(session) {
    const like = session ? `${prefixeDemasque}:${session}:*` : `${prefixeDemasque}:*`;
    const rows = await read(`/rest/v1/platform_settings?key=like.${encodeURIComponent(like)}&select=key,value`);
    return new Map(rows.map((r) => [r.key, r.value]));
  }
  async function enregistrer(session, couple, uid, oui, now) {
    const key = `${prefixeDemasque}:${session}:${pairKey(couple.a.uid, couple.b.uid)}`;
    const [ancien] = await read(`/rest/v1/platform_settings?key=eq.${encodeURIComponent(key)}&select=value`);
    const value = { session, a: couple.a, b: couple.b, ev: couple.ev, rep: { ...(ancien?.value?.rep || {}), [uid]: Boolean(oui) }, maj: now.toISOString() };
    const r = await call('/rest/v1/platform_settings?on_conflict=key', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key, value, updated_at: now.toISOString() }),
    });
    if (!r.ok) throw new Error('demasque_failed');
    return value;
  }
  // Tous les couples réciproques d'une personne, toutes soirées confondues.
  async function mesCouples(uid) {
    if (!UUID.test(uid || '')) return [];
    const tous = await souhaits(null);
    const sessions = [...new Set(tous.map((w) => w.session))];
    const rep = await reponses(null);
    const out = [];
    for (const s of sessions) {
      for (const c of reciproques(tous.filter((w) => w.session === s))) {
        if (c.a.uid !== uid && c.b.uid !== uid) continue;
        const autre = c.a.uid === uid ? c.b : c.a;
        const r = rep.get(`${prefixeDemasque}:${s}:${pairKey(c.a.uid, c.b.uid)}`)?.rep || {};
        out.push({ session: s, autre: { uid: autre.uid, name: autre.name }, etat: etatPour(uid, r, autre.uid), ma_reponse: r[uid] ?? null, couple: c });
      }
    }
    return out;
  }
  return { souhaits, reponses, enregistrer, mesCouples };
}
