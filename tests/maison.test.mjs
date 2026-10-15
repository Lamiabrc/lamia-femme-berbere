// Vérifie que la Maison se génère correctement et ne contient aucun secret.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { rooms } from '../content/rooms.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
execFileSync(process.execPath, [join(ROOT, 'build/build.mjs')], { stdio: 'ignore' });

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));

test('chaque pièce a sa page', () => {
  for (const r of rooms) {
    const file = r.path === '/' ? join(DIST, 'index.html') : join(DIST, r.path, 'index.html');
    assert.ok(existsSync(file), `page manquante : ${r.path}`);
    const expected = r.headline || r.welcome;
    assert.match(readFileSync(file, 'utf8'), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/’/g, '&#39;|’')));
  }
});

test('les anciennes adresses publiques sont conservées', () => {
  for (const p of ['werdi-ouvre-les-yeux', 'lamia-brechet']) assert.ok(existsSync(join(DIST, p, 'index.html')));
  assert.ok(existsSync(join(DIST, 'admin.html')), 'tableau des alertes conservé');
});

test('aucun secret dans les fichiers publiés', () => {
  const forbidden = [/sk_(live|test)_[A-Za-z0-9]{10,}/, /service_role/i, /SUPABASE_SERVICE_ROLE_KEY/, /whsec_[A-Za-z0-9]{10,}/];
  for (const f of files(DIST).filter((x) => /\.(html|js|css|json|xml|txt)$/.test(x))) {
    const s = readFileSync(f, 'utf8');
    for (const re of forbidden) assert.doesNotMatch(s, re, `${f} contient ${re}`);
  }
});

test('les pièces prévues ne proposent rien à acheter', () => {
  for (const r of rooms.filter((x) => x.status === 'soon')) {
    const html = readFileSync(join(DIST, r.path, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /data-products=/);
  }
});
