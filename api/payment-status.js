// Read-only readiness probe. Never returns credentials or account/customer details.
module.exports = async function paymentStatus(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({error: 'Method not allowed'});
  }
  const key = process.env.STRIPE_SECRET_KEY;
  const checkoutEnabled = process.env.CHECKOUT_ENABLED === 'true';
  const config = {
    stripeConfigured: Boolean(key),
    databaseConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY),
    webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    checkoutEnabled,
    checkoutReady: false
  };
  // Si la configuration locale est présente mais Stripe ne répond pas, l'état
  // est inconnu : ne pas confondre une vérification impossible avec un arrêt.
  if (checkoutEnabled && config.stripeConfigured && config.databaseConfigured && config.webhookConfigured) config.checkoutReady = null;
  if (!key) return res.status(200).json({...config, stripeConnection: 'missing'});
  try {
    const response = await fetch('https://api.stripe.com/v1/account', {
      headers: {Authorization: `Bearer ${key}`},
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      return res.status(200).json({...config, ...(response.status === 401 ? {checkoutReady:false} : {}), stripeConnection:
        response.status === 401 ? 'invalid_key' :
        response.status === 403 ? 'account_read_permission_missing' : 'unavailable'});
    }
    const account = await response.json();
    const expectedAccount = account.id === 'acct_1OB0kuAiy7hcxWtQ';
    const liveKey = /^(sk|rk)_live_/.test(key);
    return res.status(200).json({...config,
      stripeConnection: 'connected',
      checkoutReady: checkoutEnabled && config.databaseConfigured && config.webhookConfigured && expectedAccount && liveKey && account.charges_enabled === true,
      expectedAccount,
      liveKey,
      chargesEnabled: account.charges_enabled === true,
      payoutsEnabled: account.payouts_enabled === true
    });
  } catch {
    return res.status(200).json({...config, stripeConnection: 'unavailable'});
  }
};
