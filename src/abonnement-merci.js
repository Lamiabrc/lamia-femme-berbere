// Retour de paiement : confirme l'abonnement ou l'achat auprès du serveur (qui relit Stripe).
const box = document.querySelector('[data-abo-confirmation]');
const id = new URLSearchParams(location.search).get('session_id');
(async () => {
  if (!box) return;
  if (!id) { box.hidden = true; return; }
  for (let essai = 0; essai < 4; essai += 1) {
    try {
      const r = await fetch('/api/preorder/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'abonnement_confirmer', session_id: id }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.statut === 'paye') {
        box.textContent = d.kind === 'abonnement' ? `✓ Ta formule ${d.nom} est active${d.periode === 'an' ? ' pour un an' : ''}. Tu la retrouves dans ton espace.` : `✓ Achat confirmé : ${d.quantite || 1} × ${d.nom.toLowerCase()}.`;
        return;
      }
    } catch { /* nouvel essai */ }
    await new Promise((res) => setTimeout(res, 2500));
  }
  box.textContent = 'Ton paiement est en cours de confirmation. Tu recevras ton reçu par email ; si besoin, écris à Lamia depuis les Confidences.';
})();
