// Fil des nouveautés de la Maison : chaque type a sa couleur (boutique, article, actu, live).
import { api, esc } from './confidences-commun.js';

const zone = document.querySelector('[data-nouveautes]');
const filtres = document.querySelector('[data-nouveautes-filtres]');
let vu = 0;
try { vu = Number(localStorage.getItem('lfb-nouveautes-vu') || 0); } catch { /* */ }
const date = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
let liste = [], types = {}, type = (location.hash || '').slice(1);

function afficher() {
  filtres.innerHTML = [['', 'Tout', '#5c0f22'], ...Object.entries(types).map(([k, t]) => [k, `${t.emoji} ${t.nom}`, t.couleur])].map(([k, n, c]) => `<button type="button" data-type="${k}" style="--c:${c}" aria-pressed="${k === type}">${esc(n)}</button>`).join('');
  const l = liste.filter((x) => !type || x.type === type);
  zone.innerHTML = l.length ? l.map((x) => { const t = types[x.type] || {}; const nouveau = new Date(x.created_at).getTime() > vu; return `<article class="nouveaute" style="--c:${t.couleur || '#5c0f22'}">
    ${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy">` : `<span class="nouveaute-emoji" aria-hidden="true">${t.emoji || '✨'}</span>`}
    <div><p class="nouveaute-type">${t.emoji || ''} ${esc(t.nom || x.type)}${nouveau ? ' <b>Nouveau</b>' : ''} · <time>${esc(date(x.created_at))}</time></p>
    <h2>${esc(x.titre)}</h2>${x.texte ? `<p>${esc(x.texte)}</p>` : ''}${x.lien ? `<p><a class="po-btn-verre" href="${esc(x.lien)}">Voir</a></p>` : ''}</div></article>`; }).join('')
    : '<p class="annonce-vide">Pas encore de nouveauté ici. Active les notifications dans Mon espace pour être prévenu·e.</p>';
}
filtres.addEventListener('click', (e) => { const b = e.target.closest('[data-type]'); if (!b) return; type = b.dataset.type; history.replaceState(null, '', type ? `#${type}` : location.pathname); afficher(); });
api({ action: 'annonce_nouveautes' }).then((r) => { liste = r.nouveautes || []; types = r.types || {}; afficher(); try { localStorage.setItem('lfb-nouveautes-vu', String(Date.now())); } catch { /* */ } })
  .catch(() => { zone.innerHTML = '<p class="annonce-vide">Les nouveautés ne s’affichent pas pour le moment.</p>'; });
