import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Une seule erreur de syntaxe et toute la page s'arrête, sans rien dire : le swipe est resté bloqué ainsi sur « Les profils arrivent… ».
test('tous les scripts du site se lisent sans erreur de syntaxe', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'syntaxe-'));
  for (const f of readdirSync(new URL('../src/', import.meta.url)).filter((x) => /\.m?js$/.test(x))) {
    const p = join(dossier, f.replace(/\.js$/, '.mjs'));
    writeFileSync(p, readFileSync(new URL(`../src/${f}`, import.meta.url)));
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }), f);
  }
});
