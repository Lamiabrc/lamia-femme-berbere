// Only the public URL and publishable key may be emitted into browser assets.
export const PRODUCTION_URL = 'https://tybwvxinigahhntfeeur.supabase.co';
const PRODUCTION_KEY = 'sb_publishable_hhPNMz5NsJJQW5OVEXG19A_ApmOIAzc';

export function publicSupabaseConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || PRODUCTION_URL).replace(/\/$/, '');
  const key = env.SUPABASE_PUBLISHABLE_KEY || (url === PRODUCTION_URL ? PRODUCTION_KEY : '');
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('supabase_public_configuration_required');
  }
  if (env.VERCEL_ENV === 'preview' && (!env.SUPABASE_URL || url === PRODUCTION_URL || !env.SUPABASE_PUBLISHABLE_KEY || key === PRODUCTION_KEY)) {
    throw new Error('preview_requires_isolated_supabase_project');
  }
  return { url, key };
}

const config = publicSupabaseConfig();
export const DATABASE_URL = config.url;
export const PUBLIC_KEY = config.key;
