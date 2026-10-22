// Version anglaise : traduit les textes ajoutés dans la page après son chargement
// (catalogue, fiche produit, panier, espace membre, soirées…).
// Chargé uniquement sur les pages /en/. Les textes absents du dictionnaire restent en français.
(() => {
  if (document.documentElement.lang !== 'en') return;
  let D = null, PAGES = new Set(), MOTIFS = [], NOMS = [];
  const ATTRS = ['alt', 'title', 'aria-label', 'placeholder'];
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const fait = new WeakMap();

  function enTexte(brut) {
    const t = norm(brut);
    if (!t || !/[A-Za-zÀ-ÿ]{2}/.test(t)) return null;
    let en = D[t];
    if (typeof en !== 'string') {
      for (const [re, rep] of MOTIFS) if (re.test(t)) { en = t.replace(re, rep); break; }
    }
    if (typeof en !== 'string') {
      let x = t;
      for (const [fr, e] of NOMS) if (x.includes(fr)) x = x.split(fr).join(e);
      if (x !== t) en = x;
    }
    if (typeof en !== 'string' || en === t) return null;
    return brut.match(/^\s*/)[0] + en + brut.match(/\s*$/)[0];
  }

  function lien(a) {
    if (a.hasAttribute('hreflang')) return; // lien FR / EN
    const h = a.getAttribute('href');
    const m = h && h.match(/^(\/[^?#]*)([?#].*)?$/);
    if (!m || /^\/(en\/|images\/|assets\/|api\/)/.test(m[1])) return;
    if (m[1].startsWith('/produit/') || PAGES.has(m[1])) a.setAttribute('href', `/en${h}`);
  }

  function noeud(n) {
    if (n.nodeType === 3) {
      const p = n.parentNode;
      if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName) || p.isContentEditable) return;
      if (fait.get(n) === n.nodeValue) return;
      const en = enTexte(n.nodeValue);
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

  const obs = new MutationObserver((muts) => {
    if (!D) return;
    for (const m of muts) {
      if (m.type === 'characterData') noeud(m.target);
      else if (m.type === 'attributes') noeud(m.target);
      else m.addedNodes.forEach(noeud);
    }
  });

  fetch('/assets/i18n/en.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j) return;
      D = j.strings || {};
      PAGES = new Set(j.pages || []);
      MOTIFS = (j.motifs || []).map(([re, rep]) => [new RegExp(re), rep]);
      NOMS = (j.noms || []).sort((a, b) => b[0].length - a[0].length);
      obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS, 'href'] });
      noeud(document.body);
      const t = enTexte(document.title);
      if (t !== null) document.title = t;
      new MutationObserver(() => { const x = enTexte(document.title); if (x !== null) document.title = x; }).observe(document.querySelector('title'), { childList: true, characterData: true, subtree: true });
    })
    .catch(() => {});
})();
