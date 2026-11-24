// « Match en direct » : liste des profils + compatibles selon le moteur de Quick Pair Pro.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function monterMatchDirect({ appel, voirProfil }) {
  const panel = document.querySelector('[data-panel="match-direct"]');
  if (!panel) return { ouvrir() {}, matcher() {} };
  const $ = (s) => panel.querySelector(s);
  let profils = [], charge = false;

  const remplir = (sel, valeurs) => { const cur = sel.value; sel.querySelectorAll('option:not(:first-child)').forEach((o) => o.remove()); valeurs.forEach((v) => sel.insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(v)}</option>`)); sel.value = cur; };
  const uniques = (k) => [...new Set(profils.map((p) => p[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));

  const carte = (p) => `<article class="md-carte${p.payant ? ' md-payant' : ''}">
    <div><b>${esc(p.prenom)}</b> · ${esc(p.age ?? '?')} ans${p.payant ? ' <span class="md-badge">Abonné</span>' : ''}${p.live ? ' <span class="md-badge md-live">Live</span>' : ''}${p.statut === 'En match' ? ' <span class="md-badge">En match</span>' : ''}
    <br><small>n° ${esc(p.ref)} · ${esc([p.ville, p.pays].filter(Boolean).join(', '))}${p.religion ? ' · ' + esc(p.religion) : ''}</small></div>
    <span class="md-actions"><button type="button" class="btn btn-line" data-md-profil="${esc(p.ref)}">Profil</button><button type="button" class="btn" data-md-matcher="${esc(p.ref)}">Matcher</button></span></article>`;

  const filtrer = () => {
    const q = norm($('[data-md-q]').value), sexe = $('[data-md-sexe]').value, pays = $('[data-md-pays]').value, rel = $('[data-md-religion]').value, enf = $('[data-md-enfants]').value;
    const mn = Number($('[data-md-age-min]').value) || 0, mx = Number($('[data-md-age-max]').value) || 200, pay = $('[data-md-payants]').checked;
    const r = profils.filter((p) => (!q || norm(`${p.prenom} ${p.ville} ${p.pays} ${p.ref}`).includes(q)) && (!sexe || p.sexe === sexe) && (!pays || p.pays === pays) && (!rel || p.religion === rel)
      && (!enf || p.enfants === enf) && (p.age == null || (p.age >= mn && p.age <= mx)) && (!pay || p.payant))
      .sort((a, b) => Number(b.payant) - Number(a.payant) || Number(b.live) - Number(a.live) || String(a.prenom).localeCompare(String(b.prenom), 'fr'));
    $('[data-md-etat]').textContent = `${r.length} profil${r.length > 1 ? 's' : ''}${r.length > 60 ? ' (les 60 premiers affichés : précise ta recherche)' : ''}`;
    $('[data-md-liste]').innerHTML = r.slice(0, 60).map(carte).join('');
  };

  const ligne = (m, tag) => `<li class="md-match"><div><b>${esc(m.prenom)}</b> · ${esc(m.age ?? '?')} ans${m.payant ? ' <span class="md-badge">Abonné</span>' : ''} <span class="md-score">${esc(m.score)} %</span>
    <br><small>n° ${esc(m.ref)} · ${esc([m.ville, m.pays].filter(Boolean).join(', '))}${m.palier ? ' · ' + esc(m.palier) : ''}</small>
    ${(tag ? m.blocages : m.raisons).length ? `<br><small class="${tag ? 'md-non' : 'md-oui'}">${tag ? 'Bloque : ' : ''}${esc((tag ? m.blocages : m.raisons).join(' · '))}</small>` : ''}
    ${!tag && m.reserves?.length ? `<br><small class="md-non">À voir : ${esc(m.reserves.join(' · '))}</small>` : ''}</div>
    <span class="md-actions"><button type="button" class="btn btn-line" data-md-profil="${esc(m.ref)}">Profil</button><button type="button" class="btn btn-line" data-md-matcher="${esc(m.ref)}">Matcher</button></span></li>`;

  async function matcher(ref) {
    const box = $('[data-md-resultat]'); box.hidden = false; box.innerHTML = '<p>Recherche en cours…</p>'; box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const d = await appel({ action: 'match_direct_compatibles', ref: Number(ref) });
      box.innerHTML = `<h2>Pour ${esc(d.cible.prenom)}${d.cible.age ? `, ${esc(d.cible.age)} ans` : ''} <small>(n° ${esc(d.cible.ref)})</small></h2>
        <p><button type="button" class="btn btn-line" data-md-profil="${esc(d.cible.ref)}">Voir son profil</button></p>
        <p class="aide">${d.total} profils examinés.</p>
        <h3>Compatibles (${d.compatibles.length})</h3>${d.compatibles.length ? `<ul class="md-ul">${d.compatibles.map((m) => ligne(m, false)).join('')}</ul>` : '<p>Personne de compatible pour le moment.</p>'}
        ${d.unCritere.length ? `<h3>À un critère près (${d.unCritere.length})</h3><ul class="md-ul">${d.unCritere.map((m) => ligne(m, true)).join('')}</ul>` : ''}`;
    } catch (e) { box.innerHTML = `<p class="is-error">${e.code === 'not_found' ? 'Ce profil n’est pas dans la liste (retiré ou pas encore validé).' : 'Le calcul n’a pas abouti. Réessaie dans un instant.'}</p>`; }
  }

  panel.addEventListener('input', (e) => { if (e.target.closest('.md-recherche')) filtrer(); });
  panel.addEventListener('change', (e) => { if (e.target.closest('.md-recherche')) filtrer(); });
  panel.addEventListener('click', (e) => {
    const pr = e.target.closest('[data-md-profil]'); if (pr) return voirProfil?.(pr.dataset.mdProfil);
    const b = e.target.closest('[data-md-matcher]'); if (b) matcher(b.dataset.mdMatcher);
  });

  async function ouvrir(ref) {
    if (!charge) {
      try {
        const d = await appel({ action: 'match_direct_liste' }); profils = d.profils; charge = true;
        remplir($('[data-md-pays]'), uniques('pays')); remplir($('[data-md-religion]'), uniques('religion'));
      } catch { $('[data-md-etat]').textContent = 'La liste n’a pas pu être chargée. Réessaie dans un instant.'; return; }
    }
    filtrer();
    if (ref) matcher(ref);
  }
  return { ouvrir, matcher, recharger() { charge = false; } };
}
