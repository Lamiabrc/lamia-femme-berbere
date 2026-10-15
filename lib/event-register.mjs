// Only the authenticated owner can reserve. Capacity and profile updates are atomic in PostgreSQL.
import { json, serviceHeaders, userFromRequest, DATABASE_URL } from './event-tickets.mjs';
export const SEARCH_ZONES = { ville:'Ma ville', region:'Ma région', france:'France', europe:'Europe', canada:'Canada', algerie:'Algérie', monde:'Peu importe' };
export function ageOn(birth, at) {
  const b = new Date(`${birth}T12:00:00Z`), d = new Date(at);
  return d.getUTCFullYear() - b.getUTCFullYear() - Number(d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate()));
}
export async function registerForEvent(request, { env = process.env, fetcher = fetch } = {}) {
  if (request.method !== 'POST') return json({error:'method_not_allowed'},405);
  if (!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)) return json({error:'not_configured'},503);
  const user = await userFromRequest(request,{fetcher});
  if (!user) return json({error:'login_required'},401);
  if (!user.email_confirmed_at) return json({error:'email_not_confirmed'},403);
  let b; try { b = await request.json(); } catch { return json({error:'bad_request'},400); }
  if (!/^[0-9a-f-]{36}$/i.test(b.event_id || '')) return json({error:'bad_request'},400);
  if (b.rules_accepted !== true) return json({error:'rules_required'},400);
  const name = String(b.first_name || '').trim().slice(0,60);
  const city = String(b.city || '').trim().slice(0,80);
  if (!name || !city || !['femme','homme'].includes(b.gender)) return json({error:'profile_required'},400);
  const birth = String(b.birth_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || Number.isNaN(Date.parse(birth)) || new Date(birth).toISOString().slice(0,10) !== birth) return json({error:'invalid_birth_date'},400);
  const genders = [...new Set(Array.isArray(b.preferred_genders) ? b.preferred_genders : [])];
  if (!genders.length || genders.some(g => !['femme','homme'].includes(g)) || !Number.isInteger(b.min_age) || !Number.isInteger(b.max_age) || b.min_age < 18 || b.max_age > 99 || b.min_age > b.max_age) return json({error:'preferences_required'},400);
  const r = await fetcher(`${DATABASE_URL}/rest/v1/rpc/reserve_dating_event`,{
    method:'POST', headers:serviceHeaders(env), signal:AbortSignal.timeout(10000),
    body:JSON.stringify({p_user:user.id,p_event:b.event_id,p_name:name,p_birth:birth,p_gender:b.gender,p_city:city,p_genders:genders,p_min:b.min_age,p_max:b.max_age})
  });
  if (!r.ok) return json({error:'registration_failed'},503);
  const result = await r.json();
  return json(result,result.error ? 409 : 200);
}
