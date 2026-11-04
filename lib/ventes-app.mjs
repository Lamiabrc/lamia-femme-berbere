// L'onglet Ventes de Lamia : tout ce qui se vend dans l'appli, à côté de la boutique.
// Abonnements (ce qui est réellement encaissé), achats à l'unité et places de soirées.
import { formule, unite } from '../content/abonnements.mjs';

const moisParis = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).format(new Date(d)).slice(0, 7);

export async function ventesApp({ read, now = () => new Date() }) {
  const t = now();
  const [abos, enc, achats, regs, events] = await Promise.all([
    read('/rest/v1/abonnements?select=email,nom,formule,periode,statut,prix_centimes,stripe_subscription_id,created_at&order=created_at.desc&limit=1000'),
    read('/rest/v1/encaissements?select=stripe_subscription_id,email,montant_centimes,paye_at&order=paye_at.desc&limit=5000'),
    read('/rest/v1/achats_unite?select=id,email,nom,type,quantite,utilisees,montant_centimes,stripe_session_id,created_at&order=created_at.desc&limit=5000').then((l) => l.filter((u) => !String(u.stripe_session_id || '').startsWith('offert-'))), // les cadeaux de Lamia ne sont pas des ventes
    read('/rest/v1/event_registrations?payment_status=eq.paid&select=event_id,user_id,created_at&limit=5000'),
    read('/rest/v1/speed_dating_events?ticket_price_cents=gt.0&select=id,title,ticket_price_cents&limit=1000'),
  ]);
  const aboDe = new Map(abos.map((a) => [a.stripe_subscription_id, a]));
  const evDe = new Map(events.map((e) => [e.id, e]));
  const lignes = [
    ...enc.map((e) => { const a = aboDe.get(e.stripe_subscription_id); return { date: e.paye_at, famille: 'abonnement', service: `Abonnement ${formule(a?.formule)?.nom || ''}`.trim(), client: a?.nom || a?.email || e.email || '', montant: e.montant_centimes }; }),
    ...achats.map((u) => { const d = unite(u.type); return { date: u.created_at, famille: 'unite', service: d?.nom || u.type, quantite: u.quantite, client: u.nom && u.nom !== u.email ? u.nom : u.email, montant: u.montant_centimes ?? (d?.prix || 0) * u.quantite }; }),
    ...regs.filter((r) => evDe.has(r.event_id)).map((r) => ({ date: r.created_at, famille: 'soiree', service: 'Place de soirée', detail: evDe.get(r.event_id).title, client: '', montant: evDe.get(r.event_id).ticket_price_cents })),
  ].sort((x, y) => String(y.date).localeCompare(String(x.date)));

  const ce = moisParis(t);
  const somme = (l) => l.reduce((n, x) => n + (x.montant || 0), 0);
  const parService = new Map();
  for (const l of lignes) { const s = parService.get(l.service) || { service: l.service, ventes: 0, montant: 0, mois: 0 }; s.ventes += l.quantite || 1; s.montant += l.montant || 0; if (moisParis(l.date) === ce) s.mois += l.montant || 0; parService.set(l.service, s); }

  // Abonnés en cours et ce qu'ils rapportent par mois (une formule annuelle compte pour 1/12).
  const actifs = abos.filter((a) => a.statut === 'actif');
  const parMois = (a) => { const f = formule(a.formule); const p = a.prix_centimes ?? (a.periode === 'an' ? 0 : f?.mois || 0); return a.periode === 'an' ? Math.round(p / 12) : p; };
  const formules = ['passion', 'prestige'].map((id) => { const l = actifs.filter((a) => a.formule === id); return { id, nom: formule(id)?.nom, abonnes: l.length, par_mois: l.reduce((n, a) => n + parMois(a), 0) }; });

  return {
    total: somme(lignes), mois: somme(lignes.filter((l) => moisParis(l.date) === ce)),
    abonnes: actifs.length, par_mois: actifs.reduce((n, a) => n + parMois(a), 0), formules,
    a_traiter: abos.filter((a) => a.statut === 'impaye').length,
    services: [...parService.values()].sort((a, b) => b.montant - a.montant),
    lignes: lignes.slice(0, 300),
    // Ce que Lamia doit encore faire à la main.
    a_livrer: achats.filter((u) => u.type === 'live_priorite' && u.utilisees < u.quantite).map((u) => ({ id: u.id, service: unite(u.type)?.nom, client: u.nom && u.nom !== u.email ? `${u.nom} · ${u.email}` : u.email, reste: u.quantite - u.utilisees, date: u.created_at })),
  };
}
