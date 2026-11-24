// « Match en direct » : liste des profils + compatibles selon le moteur de Quick Pair Pro.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function monterMatchDirect({ appel, voirProfil }) {
  const panel = document.querySelector('[data-panel="match-direct"]');
  if (!panel) return { ouvrir() {}, matcher() {} };
  const $ = (s) => panel.querySelector(s);
  let profils = [], charge = false, cibleCourante = { ref: 0, prenom: '' };

  const remplir = (sel, valeurs) => { const cur = sel.value; sel.querySelectorAll('option:not(:first-child)').forEach((o) => o.remove()); valeurs.forEach((v) => sel.insertAdjacentHTML('beforeend', `<option value="${esc(v)}">${esc(v)}</option>`)); sel.value = cur; };
  const uniques = (k) => [...new Set(profils.map((p) => p[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));

  const badgesMatch = (p) => `${p.placesPleines ? ' <span class="md-badge md-rouge">En match</span>' : ''}${p.matchLive === 'refuse' ? ' <span class="md-badge md-gris">Non au live</span>' : p.matchLive === 'accepte' ? ' <span class="md-badge md-vert">OK pour le live</span>' : ''}`;
  const carte = (p) => `<article class="md-carte${p.payant ? ' md-payant' : ''}">
    <div><b>${esc(p.prenom)}</b> · ${esc(p.age ?? '?')} ans${p.payant ? ' <span class="md-badge">Abonné</span>' : ''}${p.live ? ' <span class="md-badge md-live">Live</span>' : ''}${badgesMatch(p)}
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

  const DEJA = { relation: 'Déjà en relation avec lui/elle', dematche: 'A déjà matché puis dématché', pas_compatible: 'Déjà jugé non compatible', propose: 'Déjà proposé' };
  const CTRL = { ok: '✓', hors: '✗', inconnu: '?' };
  const controles = (m) => (m.controles ? `<br><small class="md-ctrl">Âge (±2 ans) ${CTRL[m.controles.age.etat]} · Secteur ${CTRL[m.controles.secteur.etat]}${m.controles.age.etat === 'inconnu' || m.controles.secteur.etat === 'inconnu' ? ' <span class="md-non">(information manquante)</span>' : ''}</small>` : '');
  const manques = (m) => (m.manques?.length ? `<br><small class="md-alerte">Infos manquantes (valeur par défaut utilisée) : ${esc(m.manques.join(', '))} — <a href="#" data-md-profil="${esc(m.ref)}">compléter</a></small>` : '');
  const ligne = (m, tag) => `<li class="md-match${m.deja ? ' md-deja' : ''}" data-ref="${esc(m.ref)}"><div><b>${esc(m.prenom)}</b> · ${esc(m.age ?? '?')} ans${m.payant ? ' <span class="md-badge">Abonné</span>' : ''}${badgesMatch(m)} <span class="md-score">${esc(m.score)} %</span>${m.deja ? ` <span class="md-badge md-orange">${esc(DEJA[m.deja] || 'Déjà matché')}</span>` : ''}
    <br><small>n° ${esc(m.ref)} · ${esc([m.ville, m.pays].filter(Boolean).join(', '))}${m.palier ? ' · ' + esc(m.palier) : ''}</small>
    ${controles(m)}${manques(m)}
    ${(tag ? m.blocages : m.raisons).length ? `<br><small class="${tag ? 'md-non' : 'md-oui'}">${tag ? 'Bloque : ' : ''}${esc((tag ? m.blocages : m.raisons).join(' · '))}</small>` : ''}
    ${!tag && m.reserves?.length ? `<br><small class="md-non">À voir : ${esc(m.reserves.join(' · '))}</small>` : ''}
    ${tag ? '' : `<p class="md-envoi"><button type="button" class="btn btn-ink" data-md-envoyer data-pour="${esc(m.ref)}" data-cible="${esc(cibleCourante.ref)}"${m.deja ? ' disabled' : ''}>Envoyer à ${esc(m.prenom)}${m.placesPleines ? ' (en match)' : ''}</button> <button type="button" class="btn btn-line" data-md-envoyer data-pour="${esc(cibleCourante.ref)}" data-cible="${esc(m.ref)}"${m.deja ? ' disabled' : ''}>Envoyer à ${esc(cibleCourante.prenom)}</button></p>`}
    </div>
    <span class="md-actions"><button type="button" class="btn btn-line" data-md-profil="${esc(m.ref)}">Profil</button><button type="button" class="btn btn-line" data-md-matcher="${esc(m.ref)}">Matcher</button><button type="button" class="btn btn-line" data-md-ecarter="${esc(m.ref)}">Enlever ce match</button></span></li>`;

  const MSG = { pas_de_compte: 'Cette personne n’a pas de compte : impossible de lui envoyer la proposition. Contacte-la sur ses réseaux.', refuse_match_live: 'Cette personne a dit non au match en live tant qu’elle est en match.', deja_repondu: 'Cette personne a déjà répondu pour ce profil.' };
  async function envoyer(btn) {
    const pour = Number(btn.dataset.pour), cible = Number(btn.dataset.cible);
    const nom = (r) => (r === cibleCourante.ref ? cibleCourante.prenom : (panel.querySelector(`[data-md-resultat] [data-md-matcher="${r}"]`)?.closest('li')?.querySelector('b')?.textContent || `n° ${r}`));
    if (!confirm(`Envoyer la compatibilité à ${nom(pour)} (n° ${pour}) ?\n\nElle/il reçoit une notification, voit la fiche anonyme de ${nom(cible)} (n° ${cible}) et répond : oui, non, ou « laisse-moi le temps de dématcher ». Si c'est oui, une discussion s'ouvre tout de suite.`)) return;
    btn.disabled = true;
    try { await appel({ action: 'match_direct_proposer', pour, cible }); btn.textContent = '✓ Envoyée'; }
    catch (e) { btn.disabled = false; alert(e.texte || MSG[e.code] || 'L’envoi n’a pas abouti. Réessaie dans un instant.'); }
  }
  async function ecarter(ref, annuler) {
    try {
      await appel({ action: 'match_direct_ecarter', pour: cibleCourante.ref, cible: Number(ref), annuler: Boolean(annuler) });
      if (annuler) return matcher(cibleCourante.ref);
      panel.querySelector(`[data-md-resultat] li[data-ref="${ref}"]`)?.remove();
    } catch { alert('L’opération n’a pas abouti. Réessaie dans un instant.'); }
  }
  async function demander(envoi) {
    const zone = $('[data-md-demande]');
    try {
      const d = await appel({ action: 'match_direct_demander', confirmer: envoi });
      if (!envoi) { zone.innerHTML = d.personnes ? `<p><b>${d.personnes} personne${d.personnes > 1 ? 's' : ''} en match</b> n’${d.personnes > 1 ? 'ont' : 'a'} pas encore été interrogée${d.personnes > 1 ? 's' : ''}${d.exemples.length ? ` (par exemple : ${esc(d.exemples.map((x) => x.prenom).join(', '))})` : ''}.</p><p><button type="button" class="btn btn-ink" data-md-demander="envoi">Envoyer la question à ${d.personnes} personne${d.personnes > 1 ? 's' : ''}</button></p>` : '<p>Tout le monde a déjà reçu la question.</p>'; return; }
      zone.innerHTML = `<p>✓ Question envoyée à ${d.envoyes} personne${d.envoyes > 1 ? 's' : ''}.</p>`;
    } catch { zone.innerHTML = '<p class="is-error">L’opération n’a pas abouti. Réessaie dans un instant.</p>'; }
  }
  async function matcher(ref) {
    const box = $('[data-md-resultat]'); box.hidden = false; box.innerHTML = '<p>Recherche en cours…</p>'; box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const d = await appel({ action: 'match_direct_compatibles', ref: Number(ref) });
      cibleCourante = { ref: d.cible.ref, prenom: d.cible.prenom, placesPleines: d.cible.placesPleines, matchLive: d.cible.matchLive };
      box.innerHTML = `<h2>Pour ${esc(d.cible.prenom)}${d.cible.age ? `, ${esc(d.cible.age)} ans` : ''} <small>(n° ${esc(d.cible.ref)})</small></h2>
        <p><button type="button" class="btn btn-line" data-md-profil="${esc(d.cible.ref)}">Voir son profil</button> ${badgesMatch(d.cible)}</p>
        ${d.cible.placesPleines ? `<p class="md-non"><b>${esc(d.cible.prenom)} est en match.</b> ${d.cible.matchLive === 'refuse' ? 'Elle/il a dit non au match en live : ne lui envoie rien.' : d.cible.matchLive === 'accepte' ? 'Elle/il a accepté d’être prévenu(e) en live.' : 'Elle/il n’a pas encore répondu à la question « match en direct ».'} Veux-tu lui envoyer la compatibilité ? Utilise « Envoyer à ${esc(d.cible.prenom)} » sur un match ci-dessous.</p>` : ''}
        ${d.cible.manques?.length ? `<p class="md-alerte"><b>Infos manquantes pour ${esc(d.cible.prenom)}</b> (l’outil a pris une valeur par défaut) : ${esc(d.cible.manques.join(', '))}. <a href="#" data-md-profil="${esc(d.cible.ref)}">Compléter son profil</a></p>` : ''}
        <p class="aide">${d.total} profils examinés. Règles strictes : âge à ±2 ans de ce qui est demandé, et secteur recherché.</p>
        <h3>Compatibles (${d.compatibles.length})</h3>${d.compatibles.length ? `<ul class="md-ul">${d.compatibles.map((m) => ligne(m, false)).join('')}</ul>` : '<p>Personne de compatible pour le moment.</p>'}
        ${d.refusent?.length ? `<p class="aide">${d.refusent.length} personne${d.refusent.length > 1 ? 's' : ''} en match ${d.refusent.length > 1 ? 'ont' : 'a'} dit non au live (jamais proposée${d.refusent.length > 1 ? 's' : ''}) : ${esc(d.refusent.map((x) => x.prenom).join(', '))}.</p>` : ''}
        ${d.horsRegles?.length ? `<p class="aide">${d.horsRegles.length} profil${d.horsRegles.length > 1 ? 's' : ''} écarté${d.horsRegles.length > 1 ? 's' : ''} car hors âge (±2 ans) ou hors secteur : ${esc(d.horsRegles.map((x) => x.prenom).join(', '))}.</p>` : ''}
        ${d.ecartes?.length ? `<p class="aide">Enlevés par toi : ${d.ecartes.map((x) => `${esc(x.prenom)} <button type="button" class="btn btn-line" data-md-remettre="${esc(x.ref)}">Remettre</button>`).join(' ')}</p>` : ''}
        ${d.unCritere.length ? `<h3>À un critère près (${d.unCritere.length})</h3><ul class="md-ul">${d.unCritere.map((m) => ligne(m, true)).join('')}</ul>` : ''}`;
    } catch (e) { box.innerHTML = `<p class="is-error">${e.code === 'not_found' ? 'Ce profil n’est pas dans la liste (retiré ou pas encore validé).' : 'Le calcul n’a pas abouti. Réessaie dans un instant.'}</p>`; }
  }

  panel.addEventListener('input', (e) => { if (e.target.closest('.md-recherche')) filtrer(); });
  panel.addEventListener('change', (e) => { if (e.target.closest('.md-recherche')) filtrer(); });
  panel.addEventListener('click', (e) => {
    const pr = e.target.closest('[data-md-profil]'); if (pr) { e.preventDefault(); } if (pr) return voirProfil?.(pr.dataset.mdProfil);
    const en = e.target.closest('[data-md-envoyer]'); if (en) return envoyer(en);
    const ec = e.target.closest('[data-md-ecarter]'); if (ec) return ecarter(ec.dataset.mdEcarter, false);
    const re = e.target.closest('[data-md-remettre]'); if (re) return ecarter(re.dataset.mdRemettre, true);
    const dm = e.target.closest('[data-md-demander]'); if (dm) return demander(dm.dataset.mdDemander === 'envoi');
    const b = e.target.closest('[data-md-matcher]'); if (b) matcher(b.dataset.mdMatcher);
  });

  async function ouvrir(ref) {
    {
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
