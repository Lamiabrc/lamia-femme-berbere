-- Empreinte du lien de réseau social du profil (TikTok, Instagram, Facebook) : détecte un profil déjà existant.
alter table public.annonces add column if not exists lien_h text;
create index if not exists annonces_lien_h_idx on public.annonces (lien_h);
-- Les empreintes de l'outil passent au nouveau format (tous réseaux) : elles sont renvoyées à la prochaine synchro.
delete from public.outil_tiktok;
