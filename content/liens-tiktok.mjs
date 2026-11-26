// Accepte un profil TikTok ou son pseudo, jamais une URL de redirection à suivre.
export function pseudoDepuisTikTok(valeur){
 const s=String(valeur||'').trim();let nom=s;
 if(!/^@?[\w.]{2,30}$/.test(s)){
  let u;try{u=new URL(/^[a-z]+:/i.test(s)?s:`https://${s}`);}catch{return '';}
  if(!['http:','https:'].includes(u.protocol)||!['tiktok.com','www.tiktok.com','m.tiktok.com'].includes(u.hostname.toLowerCase())||u.username||u.password)return '';
  const m=u.pathname.match(/^\/@([\w.]{2,30})(?:\/|$)/);if(!m)return '';nom=m[1];
 }
 nom=nom.replace(/^@/,'').replace(/\.+$/,'').toLowerCase();return /^[\w.]{2,30}$/.test(nom)?nom:'';
}
export const urlDepuisTikTok=valeur=>{const p=pseudoDepuisTikTok(valeur);return p?`https://www.tiktok.com/@${p}`:'';};
