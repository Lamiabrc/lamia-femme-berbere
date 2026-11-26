// Composition du parcours court ; l'édition détaillée garde ses champs et ses données.
export function composerInscription(form, { optionsOrigine, esc }) {
  form.classList.add('inscription-courte');
  const reste=document.createElement('div');reste.hidden=true;reste.dataset.inscriptionReste='';
  [...form.children].forEach(el=>reste.append(el));form.append(reste);
  const cartes=['Toi','Ce que tu cherches','Tes photos et ton compte'].map((titre,i)=>{
    const c=document.createElement('section');c.className='annonce-etape inscription-carte';
    c.innerHTML=`<h3 tabindex="-1"><span>${i+1}</span> ${titre}</h3><div class="inscription-champs"></div>`;form.append(c);return c;
  });
  const f=form.elements, grille=i=>cartes[i].querySelector('.inscription-champs');
  const prendre=(nom,i,selector='label')=>{const el=form.querySelector(`[name=${nom}]`)?.closest(selector);if(el){el.hidden=false;el.removeAttribute('data-plus-tard');grille(i).append(el);}return el;};
  prendre('prenom',0).querySelector('small').remove();prendre('age',0);prendre('genre',0,'fieldset');prendre('ville',0);prendre('pays',0);
  const origine=document.createElement('label');origine.className='inscription-large';origine.innerHTML=`Ton origine<select name="origineCourte"><option value="">Choisis…</option>${optionsOrigine.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>`;grille(0).append(origine);
  origine.addEventListener('change',()=>{form.querySelectorAll('[name=origineTags]').forEach(x=>x.checked=x.value===f.origineCourte.value);});
  const ages=f.age_min.closest('.annonce-ages');ages.classList.add('inscription-large');grille(1).append(ages);
  const secteur=prendre('zoneGeo',1);secteur.dataset.champRecherche='';secteur.childNodes[0].textContent='Le secteur où tu cherches';
  const recherche=prendre('recherche',1);recherche.classList.add('inscription-large');recherche.childNodes[0].textContent='Qui aimerais-tu rencontrer ? ';recherche.querySelector('small').textContent='Une phrase, 20 caractères minimum';f.recherche.rows=3;
  const media=form.querySelector('[data-etape-medias]');[...media.children].filter(x=>x.tagName!=='H3').forEach(x=>grille(2).append(x));
  grille(2).querySelector('.annonce-aide').textContent='Deux photos récentes de toi, visage visible. Lamia les vérifie avant de proposer ton profil.';
  prendre('email',2);const mdp=document.createElement('label');mdp.dataset.inscriptionMdp='';mdp.innerHTML='Ton mot de passe <small>8 caractères minimum</small><input name="inscription_password" type="password" minlength="8" maxlength="72" autocomplete="new-password">';grille(2).append(mdp);
  const connecte=form.querySelector('[data-connecte]');connecte.classList.add('inscription-large');grille(2).append(connecte);
  prendre('majeur',2).querySelector('span').textContent='J’ai 18 ans ou plus et je cherche une rencontre sincère.';
  prendre('publication',2).querySelector('span').innerHTML='Je confie mon profil à Lamia pour vérification et mise en relation. <a href="/confidentialite/" target="_blank" rel="noopener">Confidentialité</a>';
  const accords=document.createElement('details');accords.className='inscription-large inscription-accords';accords.innerHTML='<summary>Mes choix de partage · facultatif</summary>';
  for(const nom of ['anonyme_ok','photo_partage'])accords.append(f[nom].closest('label'));grille(2).append(accords);
  const btn=form.querySelector('.annonce-envoyer');btn.textContent='Terminer';cartes[2].append(btn);
  form.append(form.querySelector('[data-annonce-statut]'));
  const note=document.createElement('p');note.className='inscription-confiance';note.textContent='ⵣ Vérifié par Lamia avant toute rencontre.';form.append(note);
  return {cartes,origine:f.origineCourte,connexion(s){
    mdp.hidden=Boolean(s);f.email.readOnly=Boolean(s);connecte.hidden=!s;
    if(s){f.email.value=s.user.email;connecte.textContent='Ton compte est connecté. Il reste à envoyer ton profil à Lamia.';}
  }};
}

// Brouillon privé sur cet appareil, supprimé au bout de 7 jours. Jamais de mot de passe.
const DB='tayri-inscription', STORE='brouillons';
const ouvrir=()=>new Promise((ok,non)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>ok(r.result);r.onerror=()=>non(r.error);});
export async function brouillonLocal(cle, valeur) {
  const db=await ouvrir();
  try{return await new Promise((ok,non)=>{
    const t=db.transaction(STORE,valeur===undefined?'readonly':'readwrite'),s=t.objectStore(STORE);
    const r=valeur===undefined?s.get(cle):valeur===null?s.delete(cle):s.put(valeur,cle);
    let resultat;r.onsuccess=()=>resultat=r.result;t.oncomplete=()=>ok(resultat);t.onerror=()=>non(t.error);t.onabort=()=>non(t.error);
  });}finally{db.close();}
}
export const perime=b=>!b||!Number.isFinite(b.savedAt)||Date.now()-b.savedAt>7*86400e3;
export function valeursBrouillon(form){
  const v={};for(const el of form.elements){
    if(!el.name||el.closest('[data-inscription-reste]')||['file','password','hidden'].includes(el.type)||['zz_site','email'].includes(el.name))continue;
    if(['checkbox','radio'].includes(el.type)){if(el.checked)v[el.name]=el.type==='radio'?el.value:true;}
    else v[el.name]=el.value;
  }return v;
}
