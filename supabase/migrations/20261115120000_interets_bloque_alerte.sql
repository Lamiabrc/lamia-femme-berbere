-- Paires « les deux ont dit oui » bloquées (15 nov. 2026, demande de Lamia : « tu dois les alerter ») :
-- on retient la raison déjà annoncée aux deux personnes, pour ne prévenir qu'une fois par raison.
alter table public.annonce_interets add column if not exists bloque_alerte text;
alter table public.annonce_interets add column if not exists bloque_alerte_at timestamptz;
