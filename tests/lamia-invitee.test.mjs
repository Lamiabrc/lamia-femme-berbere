// Inviter Lamia (20 €) dans une discussion de match : elle n'écrit que là où elle a été invitée.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lamiaEcrit } from '../lib/discussions.mjs';

test('Lamia écrit seulement dans une discussion où on l’a invitée, et les deux sont prévenus', async () => {
  const D = '11111111-1111-4111-8111-111111111111';
  const discussions = [{ id: D, a_user: 'u-a', b_user: 'u-b', lamia_invitee_at: null }];
  const messages = [], pousses = [];
  const read = async (u) => discussions.filter((d) => u.includes(`id=eq.${d.id}`) && (!u.includes('lamia_invitee_at=not.is.null') || d.lamia_invitee_at));
  const insert = async (t, row) => { messages.push(row); return row; };
  const pousserMembre = async (uid) => { pousses.push(uid); return 1; };
  assert.deepEqual(await lamiaEcrit({ read, insert, pousserMembre }, D, 'Bonjour à vous deux'), { error: 'non_invitee' });
  discussions[0].lamia_invitee_at = '2026-11-16T10:00:00Z';
  assert.deepEqual(await lamiaEcrit({ read, insert, pousserMembre }, D, 'Bonjour à vous deux'), { ok: true });
  assert.deepEqual([messages[0].role, messages[0].auteur], ['lamia', null]);
  assert.deepEqual(pousses, ['u-a', 'u-b']);
  assert.deepEqual(await lamiaEcrit({ read, insert, pousserMembre }, 'pas-un-id', 'x'), { error: 'bad_request' });
});
