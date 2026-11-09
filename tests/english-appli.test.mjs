/*!
 * LFB · Lamia Femme Berbère
 * © 2026 Lamia Bréchet Ighil. Tous droits réservés.
 * Code propriétaire : copie, modification ou diffusion interdites sans autorisation écrite. Voir LICENSE.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS } from '../build/english.mjs';

const lire = (f) => JSON.parse(readFileSync(new URL(`../content/en/${f}`, import.meta.url), 'utf8'));
const APPLI = lire('app-patterns.json');
const MOTIFS = [...APPLI.motifs, ...lire('patterns.json').motifs].map(([re, rep, groupes]) => [new RegExp(re), rep, groupes]);

// Même logique que src/i18n.js.
function traduire(t) {
  if (typeof STRINGS[t] === 'string') return STRINGS[t];
  for (const [re, rep, groupes] of MOTIFS) {
    if (!re.test(t)) continue;
    if (!groupes) return t.replace(re, rep);
    return t.replace(re, (...a) => rep.replace(/\$(\d)/g, (_, i) => (groupes.includes(+i) && typeof STRINGS[a[+i]] === 'string' ? STRINGS[a[+i]] : a[+i])));
  }
  return null;
}

test('motifs de l’appli : tout le nœud, et groupes existants', () => {
  for (const [re, , groupes] of APPLI.motifs) {
    assert.match(re, /^\^.*\$$/, re);
    const n = new RegExp(`${re}|`).exec('').length - 1;
    for (const g of groupes || []) assert.ok(g >= 1 && g <= n, re);
  }
});

test('textes variables des cartes et de Mon espace', () => {
  for (const [fr, en] of [
    ['Une femme, 31 ans', 'A woman, 31'],
    ['Profil n° 48', 'Profile no. 48'],
    ['Profil n° 48 · Vérifié avec pièce d’identité', 'Profile no. 48 · Verified with ID'],
    ['Originaire de Aït Yenni', 'From Aït Yenni'],
    ['études : universitaire', 'education: university'],
    ['Islam, pratique modérée', 'Islam, moderately practising'],
    ['3 profils à découvrir', '3 profiles to discover'],
    ['1 personne t’a choisi·e', '1 person chose you'],
    ['Formule Découverte', 'Discovery plan'],
    ['Raison : Localisation. Tu peux répondre, il te reste 2 messages.', 'Reason: Location. You can reply, you have 2 messages left.'],
  ]) assert.equal(traduire(fr), en);
});

test('un texte de membre reste protégé dans le navigateur', () => {
  assert.match(APPLI.membre, /\[data-membre\]/);
  assert.match(APPLI.membre, /\.disc-msg/);
  const swipe = readFileSync(new URL('../src/swipe.js', import.meta.url), 'utf8');
  assert.match(swipe, /<p data-membre>\$\{esc\(a\.profil\)\}/);
});
