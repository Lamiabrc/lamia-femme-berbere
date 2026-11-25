import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { modererPhotos } from '../../lib/moderation-photos.mjs';
import { handleAnnonces } from '../../lib/annonces.mjs';

export const ADMIN = {id:randomUUID(),app_metadata:{role:'admin'}}, MEMBRE = {id:randomUUID(),email:'recette-photos@fictif.invalid',app_metadata:{}};
export async function basePhotos() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create table annonces(id uuid primary key,ref integer unique,user_id uuid,status text,test boolean default false,email text,prenom text,genre text,photos_refusees_at timestamptz,bloque_at text,pause_at text,visible_anonyme boolean default true,published_at timestamptz,identite_verifiee_at timestamptz,note_lamia text);
    create table annonce_files(id uuid primary key default gen_random_uuid(),annonce_id uuid,kind text,storage_path text,position integer,mime text,size_bytes integer);`);
  const migration = await readFile(new URL('../../supabase/migrations/20261120101829_moderation_photos_progressive.sql',import.meta.url),'utf8');
  await db.exec(migration);
  const id=randomUUID(), p1=randomUUID(),p2=randomUUID(),identite=randomUUID(),video=randomUUID(), autre=randomUUID();
  await db.query('insert into annonces(id,ref,user_id,status,email,prenom,genre) values($1,42,$2,\'publiee\',$3,\'Recette\',\'femme\')',[id,MEMBRE.id,MEMBRE.email]);
  const objets=new Set(), appels=[], notifications=[]; let panneStorage=false,panneMetadata=false,panneAck=false,temps=0;
  for(const [fid,kind,pos] of [[p1,'photo',1],[p2,'photo',2],[identite,'identite',3],[video,'video',4]]){
    const path=`${id}/${kind}-${pos}.jpg`; objets.add(path);
    await db.query('insert into annonce_files(id,annonce_id,kind,storage_path,position) values($1,$2,$3,$4,$5)',[fid,id,kind,path,pos]);
  }
  const ou = (q,params) => {
    const out=[];
    for(const [k,v] of q) {
      if(['select','limit','order','offset','or'].includes(k))continue;
      if(!/^(id|ref|user_id|annonce_id|kind|status|photos_moderation->>revision|photos_moderation->>terminee_at|photos_moderation->>notification_at|photos_moderation)$/.test(k))throw new Error(`Filtre de recette inconnu : ${k}`);
      const col=k.includes('->>') ? `photos_moderation->>'${k.split('->>')[1]}'` : `"${k}"`;
      if(v==='is.null')out.push(`${col} is null`);
      else if(v.startsWith('eq.')){params.push(v.slice(3));out.push(`${col}=$${params.length}`);}
      else if(v.startsWith('in.(')){const l=v.slice(4,-1).split(',');out.push(`${col} in (${l.map((x)=>{params.push(x);return '$'+params.length;}).join(',')})`);}
      else throw new Error(`Opérateur de recette inconnu : ${v}`);
    }
    // Le seul propriétaire de cette recette : simuler le filtre OR de monProfil.
    if(q.has('or')){params.push(MEMBRE.id);out.push(`user_id=$${params.length}`);}
    return out.length?' where '+out.join(' and '):'';
  };
  const rest=(rows)=>rows.map((r)=>({...r,...(r.photos_refusees_at?{photos_refusees_at:new Date(r.photos_refusees_at).toISOString().replace('Z','+00:00')}:{})}));
  const read=async(path)=>{
    appels.push({path}); const u=new URL(path,'https://recette.invalid'),table=u.pathname.split('/').at(-1);
    if(!['annonces','annonce_files'].includes(table))return [];
    const params=[],filter=ou(u.searchParams,params);return rest((await db.query(`select * from ${table}${filter}`,params)).rows);
  };
  const call=async(path,opt={})=>{
    appels.push({path,...opt}); const u=new URL(path,'https://recette.invalid'),body=JSON.parse(opt.body||'{}');
    if(path==='/storage/v1/object/annonces'){
      if(panneStorage)return Response.json({error:'panne'}, {status:503});
      body.prefixes.forEach((p)=>objets.delete(p)); return Response.json([]);
    }
    if(path==='/storage/v1/object/list/annonces')return Response.json([...objets].filter((p)=>p.startsWith(body.prefix)).map((p)=>({name:p.slice(body.prefix.length)})));
    if(path.startsWith('/storage/v1/object/upload/sign/annonces/'))return Response.json({url:'/faux-upload/'+path.split('/annonces/')[1]});
    const table=u.pathname.split('/').at(-1);
    if(!['annonces','annonce_files'].includes(table))return Response.json([]);
    const params=[];
    if(opt.method==='DELETE'){
      if(panneMetadata)return Response.json({}, {status:503});
      await db.query(`delete from ${table}${ou(u.searchParams,params)}`,params);return Response.json([]);
    }
    if(opt.method==='PATCH'){
      const changes=Object.entries(body).map(([k,v])=>{if(!/^[a-z_]+$/.test(k))throw new Error('colonne');params.push(k==='photos_moderation'?JSON.stringify(v):v);return `"${k}"=$${params.length}`;});
      const rows=(await db.query(`update ${table} set ${changes.join(',')}${ou(u.searchParams,params)} returning *`,params)).rows;
      if(panneAck){panneAck=false;throw new Error('réponse perdue après écriture');}
      return Response.json(rows);
    }
    throw new Error('Appel non prévu dans la recette');
  };
  const insert=async(table,row)=>{
    const keys=Object.keys(row),r=await db.query(`insert into ${table}(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(row));return r.rows[0];
  };
  const ctx=(user=ADMIN)=>({admin:user?.app_metadata?.role==='admin',user,read,call,now:()=>new Date(Date.UTC(2026,10,20,11,0,temps++)),prevenir:async(...n)=>notifications.push(n),insert,
    patch:(table,filter,row)=>call(`/rest/v1/${table}?${filter}`,{method:'PATCH',body:JSON.stringify(row)}),env:{},email:async()=>true,alerter:async()=>{}});
  const a=async()=> rest((await db.query('select * from annonces where id=$1',[id])).rows)[0];
  const envoyer=async(body,user=ADMIN)=>{const r=await modererPhotos(body,ctx(user));return {status:r.status,...await r.json()};};
  const action=async(n,b={},user=MEMBRE)=>{const r=await handleAnnonces(n,b,ctx(user));return {status:r.status,...await r.json()};};
  const commande=(extra={})=>({ref:42,requete_id:randomUUID(),operation:'avertir',revision:null,commentaire:'Merci de corriger cette photo.',photos:[{id:p1,commentaire:'Ton visage doit être visible.',supprimer:false}],...extra});
  return {db,id,p1,p2,identite,video,autre,objets,notifications,appels,read,call,ctx,a,envoyer,action,commande,
    panneStorage:(v)=>{panneStorage=v;},panneMetadata:(v)=>{panneMetadata=v;},perdreAck:()=>{panneAck=true;}};
}
