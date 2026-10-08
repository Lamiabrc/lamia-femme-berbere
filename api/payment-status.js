// Read-only readiness probe. Never returns credentials or account/customer details.
module.exports = async function paymentStatus(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({error: 'Method not allowed'});
  }
  const key = process.env.STRIPE_SECRET_KEY;
  const config = {
    stripeConfigured: Boolean(key),
    databaseConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    checkoutReady: false
  };
  if (!key) return res.status(200).json({...config, stripeConnection: 'missing'});
  try {
    const response = await fetch('https://api.stripe.com/v1/account', {
      headers: {Authorization: `Bearer ${key}`},
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      return res.status(200).json({...config, stripeConnection:
        response.status === 401 ? 'invalid_key' :
        response.status === 403 ? 'account_read_permission_missing' : 'unavailable'});
    }
    const account = await response.json();
    return res.status(200).json({...config,
      stripeConnection: 'connected',
      expectedAccount: account.id === 'acct_1R6UcrQqTigbk4Ts',
      liveKey: /^(sk|rk)_live_/.test(key),
      chargesEnabled: account.charges_enabled === true,
      payoutsEnabled: account.payouts_enabled === true
    });
  } catch {
    return res.status(200).json({...config, stripeConnection: 'unavailable'});
  }
};
