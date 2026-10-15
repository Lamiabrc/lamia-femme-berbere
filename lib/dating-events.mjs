import {DATABASE_URL,serviceHeaders,userFromRequest,isAdmin,json} from './event-tickets.mjs';
const UUID=/^[0-9a-f-]{36}$/i;
export async function manageDatingEvents(request,{env=process.env,fetcher=fetch,now=()=>new Date()}={}) {
 const user=await userFromRequest(request,{fetcher});
 if(!isAdmin(user))return json({error:'forbidden'},403);
 if(!(env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_SECRET_KEY))return json({error:'not_configured'},503);
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 let b;try{b=await request.json();}catch{return json({error:'bad_request'},400);}
 const id=String(b.id||'');
 if(id&&!UUID.test(id))return json({error:'bad_request'},400);
 const row={title:String(b.title||'').trim().slice(0,150),description:String(b.description||'').trim().slice(0,2000),audience:String(b.audience||'').trim().slice(0,150),
 starts_at:b.starts_at,ends_at:b.ends_at,capacity:Number(b.capacity),min_age:Number(b.min_age),max_age:Number(b.max_age),status:b.status,currency:'EUR'};
 if(!row.title||!row.audience||!['draft','published','cancelled','completed'].includes(row.status)||!Number.isInteger(row.capacity)||row.capacity<2||row.capacity>20||
 !Number.isInteger(row.min_age)||!Number.isInteger(row.max_age)||row.min_age<18||row.max_age>99||row.min_age>row.max_age||
 !Number.isFinite(Date.parse(row.starts_at))||!Number.isFinite(Date.parse(row.ends_at))||Date.parse(row.ends_at)<=Date.parse(row.starts_at)||
 (['draft','published'].includes(row.status)&&Date.parse(row.starts_at)<=now().getTime()))return json({error:'invalid_event'},400);
 const r=await fetcher(DATABASE_URL+'/rest/v1/rpc/manage_dating_event',{method:'POST',headers:serviceHeaders(env),body:JSON.stringify({p_id:id||null,p_data:row}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)return json({error:'event_update_failed'},503);
 const result=await r.json();return json(result,result.error?409:200);
}
