import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSupabaseConfig, PRODUCTION_URL } from '../lib/supabase-config.mjs';

test('preview cannot silently connect to the production project or expose a secret key', () => {
  assert.equal(publicSupabaseConfig({}).url, PRODUCTION_URL);
  assert.throws(() => publicSupabaseConfig({ VERCEL_ENV: 'preview' }), /isolated/);
  assert.throws(() => publicSupabaseConfig({ VERCEL_ENV: 'preview', SUPABASE_URL: PRODUCTION_URL, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }), /isolated/);
  const env = { VERCEL_ENV: 'preview', SUPABASE_URL: 'https://isolatedfixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };
  assert.equal(publicSupabaseConfig(env).url, env.SUPABASE_URL);
  assert.throws(() => publicSupabaseConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_do_not_publish' }), /configuration_required/);
  assert.throws(() => publicSupabaseConfig({ ...env, SUPABASE_URL: 'https://attacker.invalid' }), /configuration_required/);
});
