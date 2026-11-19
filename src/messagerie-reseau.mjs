// Transport borné pour Mon espace. Aucune relance aveugle des écritures.
const LECTURES = new Set(['annonce_discussions', 'annonce_mon_profil']);
const ACTIONS_SESSION = new Set([...LECTURES, 'annonce_discussion_envoyer']);
const erreur = (code, status = 0) => Object.assign(new Error(code), { code, status });

export function creerAppelProfil({ fetcher = fetch, getSession, refreshSession, delai = 20000 }) {
  const lectures = new Map(), controles = new Set();
  let renouvellement = null;
  const renouveler = () => {
    if (!renouvellement) {
      renouvellement = Promise.resolve().then(refreshSession);
      renouvellement.then(() => { renouvellement = null; }, () => { renouvellement = null; });
    }
    return renouvellement;
  };
  const lancer = async (body, session) => {
    const controle = new AbortController(); controles.add(controle);
    let minuterie, interrompre;
    const interruption = new Promise((_, reject) => {
      interrompre = () => reject(controle.signal.reason);
      controle.signal.addEventListener('abort', interrompre, { once: true });
      minuterie = setTimeout(() => controle.abort(erreur('delai_depasse')), delai);
    });
    const executer = async () => {
      const actuelle = await getSession();
      if (!actuelle?.access_token || actuelle.user?.id !== session?.user?.id) throw erreur('login_required', 401);
      const appeler = (token) => fetcher('/api/confidences/', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: controle.signal });
      let rep = await appeler(actuelle.access_token);
      if (rep.status === 401 && ACTIONS_SESSION.has(body.action) && refreshSession) {
        let fraiche = await getSession();
        if (!fraiche?.access_token || fraiche.user?.id !== actuelle.user.id) throw erreur('login_required', 401);
        if (fraiche.access_token === actuelle.access_token) fraiche = await renouveler();
        if (controle.signal.aborted) throw controle.signal.reason;
        if (!fraiche?.access_token || fraiche.user.id !== actuelle.user.id) throw erreur('login_required', 401);
        rep = await appeler(fraiche.access_token);
      }
      let data;
      try { data = await rep.json(); } catch { throw erreur(rep.ok ? 'reponse_invalide' : 'service_indisponible', rep.status); }
      if (!rep.ok || data?.error) throw erreur(data?.error || 'service_indisponible', rep.status);
      if (!data || typeof data !== 'object' || (ACTIONS_SESSION.has(body.action) && data.ok !== true)) throw erreur('reponse_invalide', rep.status);
      if ((await getSession())?.user?.id !== actuelle.user.id) throw erreur('login_required', 401);
      return data;
    };
    try { return await Promise.race([executer(), interruption]); }
    catch (e) { throw typeof e?.code === 'string' ? e : erreur('reseau_indisponible'); }
    finally { clearTimeout(minuterie); controle.signal.removeEventListener('abort', interrompre); controles.delete(controle); }
  };
  const appel = (body, session) => {
    if (!LECTURES.has(body.action)) return lancer(body, session);
    const cle = `${session?.user?.id || ''}|${JSON.stringify(body)}`;
    if (lectures.has(cle)) return lectures.get(cle);
    const p = lancer(body, session); lectures.set(cle, p);
    const finir = () => { if (lectures.get(cle) === p) lectures.delete(cle); };
    p.then(finir, finir);
    return p;
  };
  appel.annuler = () => {
    for (const c of controles) c.abort(erreur('session_changee'));
    lectures.clear();
  };
  return appel;
}

// Une tentative garde son identifiant après une coupure. Un nouvel envoi confirmé en reçoit un autre.
export function creerEnvoisDiscussion({ uuid = () => crypto.randomUUID() } = {}) {
  const tentatives = new Map();
  return {
    occupe: (id) => id == null ? [...tentatives.values()].some((t) => t.enCours) : Boolean(tentatives.get(id)?.enCours),
    async envoyer(id, texte, appel) {
      let t = tentatives.get(id);
      if (t?.enCours) throw erreur('envoi_en_cours');
      if (!t || t.texte !== texte) { t = { texte, client_message_id: uuid(), enCours: false }; tentatives.set(id, t); }
      t.enCours = true;
      try {
        const r = await appel({ action: 'annonce_discussion_envoyer', id, texte, client_message_id: t.client_message_id });
        tentatives.delete(id);
        return r;
      } finally { t.enCours = false; }
    },
  };
}

export function messageErreurMessagerie(err) {
  if (err?.code === 'login_required') return 'Ta session a expiré. Reconnecte-toi pour retrouver tes discussions.';
  if (err?.code === 'delai_depasse') return 'Le site met trop de temps à répondre. Tu peux réessayer dans un instant.';
  if (err?.code === 'reseau_indisponible') return 'La connexion a été interrompue. Vérifie ton réseau puis réessaie.';
  return 'Le site ne répond pas correctement. Réessaie dans un instant.';
}
