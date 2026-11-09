/*!
 * LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
// Version anglaise : traduit les textes ajoutés dans la page après son chargement
// (catalogue, fiche produit, panier, espace membre, soirées…).
// Chargé uniquement sur les pages /en/. Les textes absents du dictionnaire restent en français.
(() => {
  const LANGUE = document.documentElement.lang;
  if (!['en', 'ar', 'kab'].includes(LANGUE)) return;
  let D = null, PAGES = new Set(), MOTIFS = [], NOMS = [], MEMBRE = null, SEGMENTS = null;
  const ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const fait = new WeakMap();

  // Motif : [regex, remplacement, groupes à repasser par le dictionnaire (facultatif)].
  function parMotif(t) {
    for (const [re, rep, groupes] of MOTIFS) {
      if (!re.test(t)) continue;
      if (!groupes) return t.replace(re, rep);
      return t.replace(re, (...a) => rep.replace(/\$(\d)/g, (_, i) => {
        const v = a[+i];
        return groupes.includes(+i) && typeof D[v] === 'string' ? D[v] : v;
      }));
    }
    return null;
  }

  // Liste « a · b · c » (ville, pays, situation…) : chaque morceau connu est traduit, le reste ne bouge pas.
  function parSegments(t) {
    return t.split(' · ').map((x) => (typeof D[x] === 'string' ? D[x] : parMotif(x) ?? x)).join(' · ');
  }

  function enTexte(brut, segments = false) {
    const t = norm(brut);
    if (!t || (typeof D[t] !== 'string' && !/[A-Za-zÀ-ÿ]{2}/.test(t))) return null;
    let en = D[t];
    if (typeof en !== 'string') en = parMotif(t);
    if (typeof en !== 'string' && segments && t.includes(' · ')) en = parSegments(t);
    if (typeof en !== 'string' || en === t) {
      let x = t;
      for (const [fr, e] of NOMS) if (x.includes(fr)) x = x.split(fr).join(e);
      if (x !== t) en = x;
    }
    if (typeof en !== 'string' || en === t) return null;
    return brut.match(/^\s*/)[0] + en + brut.match(/\s*$/)[0];
  }

  function lien(a) {
    if (a.hasAttribute('hreflang')) return; // lien vers une autre langue
    const h = a.getAttribute('href');
    const m = h && h.match(/^(\/[^?#]*)([?#].*)?$/);
    if (!m || /^\/(en\/|ar\/|kab\/|images\/|assets\/|api\/)/.test(m[1])) return;
    if ((LANGUE === 'en' && m[1].startsWith('/produit/')) || PAGES.has(m[1])) a.setAttribute('href', `/${LANGUE}${h}`);
  }

  function noeud(n) {
    if (n.nodeType === 3) {
      const p = n.parentNode;
      if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName) || p.isContentEditable) return;
      if (MEMBRE && p.closest?.(MEMBRE)) return; // ce qu'un membre a écrit reste tel quel
      if (fait.get(n) === n.nodeValue) return;
      const en = enTexte(n.nodeValue, Boolean(SEGMENTS && p.closest?.(SEGMENTS)));
      if (en !== null) n.nodeValue = en;
      fait.set(n, n.nodeValue);
      return;
    }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(n.nodeName)) return;
    for (const el of [n, ...n.querySelectorAll('*')]) {
      for (const a of ATTRS) if (el.hasAttribute(a)) { const en = enTexte(el.getAttribute(a)); if (en !== null) el.setAttribute(a, en); }
      if (el.nodeName === 'A') lien(el);
      if ((el.nodeName === 'INPUT') && /^(submit|button)$/.test(el.type) && el.value) { const en = enTexte(el.value); if (en !== null) el.value = en; }
    }
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
    for (let t = w.nextNode(); t; t = w.nextNode()) noeud(t);
  }

  // Messages du navigateur (alert, confirm, prompt) : paragraphe par paragraphe, les sauts de ligne restent.
  for (const f of ['alert', 'confirm', 'prompt']) {
    const natif = window[f];
    window[f] = (m, ...reste) => natif.call(window, D && typeof m === 'string' ? m.split(/(\n+)/).map((x) => enTexte(x) ?? x).join('') : m, ...reste);
  }

  const obs = new MutationObserver((muts) => {
    if (!D) return;
    for (const m of muts) {
      if (m.type === 'characterData') noeud(m.target);
      else if (m.type === 'attributes') noeud(m.target);
      else m.addedNodes.forEach(noeud);
    }
  });

  fetch(`/assets/i18n/${LANGUE}.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j) return;
      D = j.strings || {};
      PAGES = new Set(j.pages || []);
      MOTIFS = (j.motifs || []).map(([re, rep, groupes]) => [new RegExp(re), rep, groupes]);
      NOMS = (j.noms || []).sort((a, b) => b[0].length - a[0].length);
      MEMBRE = j.membre || null;
      SEGMENTS = j.segments || null;
      obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS, 'href'] });
      noeud(document.body);
      const t = enTexte(document.title);
      if (t !== null) document.title = t;
      new MutationObserver(() => { const x = enTexte(document.title); if (x !== null) document.title = x; }).observe(document.querySelector('title'), { childList: true, characterData: true, subtree: true });
    })
    .catch(() => {});
})();
