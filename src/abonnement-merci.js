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
        box.textContent = d.type === 'prolonger_discussion' ? '✓ Votre discussion est prolongée de 7 jours.' : d.type === 'profil_avant' ? '✓ Ton profil passe en tête du swipe pendant 7 jours.' : d.type === 'qui_choisi' ? '✓ Pendant 24 heures, les profils qui t’ont choisi·e sont visibles dans ton espace.' : d.type === 'coaching' ? '✓ Ta visio est achetée : choisis ton créneau dans Mon espace, section Coaching.' : d.type === 'live_priorite' ? '✓ C’est noté : Lamia présentera ton annonce en priorité à son prochain live.' : d.type === 'photo_match' ? '✓ La photo de ton match est visible pendant 1 heure dans ton espace.' : d.kind === 'abonnement' ? `✓ Ta formule ${d.nom} est active${d.periode === 'an' ? ' pour un an' : ''}. Tu la retrouves dans ton espace${d.nom === 'Prestige' ? ', où tu peux réserver ta visio avec Lamia' : ''}.` : `✓ Achat confirmé : ${d.quantite || 1} × ${d.nom.toLowerCase()}.`;
        return;
      }
    } catch { /* nouvel essai */ }
    await new Promise((res) => setTimeout(res, 2500));
  }
  box.textContent = 'Ton paiement est en cours de confirmation. Tu recevras ton reçu par email ; si besoin, écris à Lamia depuis les Confidences.';
})();
