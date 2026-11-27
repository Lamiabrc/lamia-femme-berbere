// Sous-ensemble PostgREST partagé par les tests et la recette locale.
const decouper=s=>{const out=[];let debut=0,niveau=0,guillemets=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='\\'){i++;continue;}if(c==='"')guillemets=!guillemets;if(guillemets)continue;if(c==='(')niveau++;if(c===')')niveau--;if(c===','&&!niveau){out.push(s.slice(debut,i));debut=i+1;}}out.push(s.slice(debut));return out;};
const valeur=s=>s.startsWith('"')?JSON.parse(s):s;
function correspond(row,expression){
 const groupe=expression.match(/^(and|or)\((.*)\)$/s);if(groupe){const resultats=decouper(groupe[2]).map(x=>correspond(row,x));return groupe[1]==='and'?resultats.every(Boolean):resultats.some(Boolean);}
 const m=expression.match(/^([\w]+)\.(not\.)?(eq|lt|gt|like|is|in)\.(.*)$/s);if(!m)throw Error('Filtre non simulé : '+expression);
 const [,col,non,op,v]=m,cell=row[col];if(cell==null&&op!=='is')return false;
 let ok;if(op==='eq')ok=String(cell)===valeur(v);else if(op==='lt')ok=cell<Number(v);else if(op==='gt')ok=cell>Number(v);else if(op==='is')ok=v==='null'?cell==null:String(cell)===v;else if(op==='in')ok=decouper(v.slice(1,-1)).map(valeur).includes(String(cell));else {const motif=valeur(v).split('*').map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*');ok=new RegExp('^'+motif+'$').test(String(cell));}return non?!ok:ok;
}
export function lireFiches(path,{fiches=[],contacts=[],empreintes=[],annonces=[]}){
 const u=new URL(path,'https://recette.invalid'),q=u.searchParams;
 const table=u.pathname.split('/').pop(),source=table==='profils_outil'?fiches:table==='contacts_lamia'?contacts:table==='outil_tiktok'?empreintes:table==='annonces'?annonces:[];
 let rows=source.filter(row=>[...q].every(([k,v])=>['select','order','limit','on_conflict'].includes(k)||correspond(row,k==='and'||k==='or'?k+v:k+'.'+v)));
 const ordre=q.get('order');if(ordre){const [col,direction]=ordre.split('.');rows=[...rows].sort((a,b)=>(direction==='desc'?-1:1)*(typeof a[col]==='number'?a[col]-b[col]:String(a[col]||'').localeCompare(String(b[col]||''))));}
 if(q.has('limit'))rows=rows.slice(0,Number(q.get('limit')));
 const cols=q.get('select');return rows.map(row=>structuredClone(cols&&cols!=='*'?Object.fromEntries(cols.split(',').map(k=>[k,row[k]])):row));
}
