// One-off: create Fixfy Trade plan Products + Prices in Stripe (test mode).
// Run:  node --env-file=.env.local scripts/create-stripe-prices.mjs

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY missing.");
  process.exit(1);
}
if (!key.startsWith("sk_test_")) {
  console.error("Refusing to run: test mode only.");
  process.exit(1);
}

const stripe = new Stripe(key, { typescript: true });

const plans = [
  { env: "STRIPE_PRICE_STARTER_MONTHLY", name: "Fixfy Trade Starter", amount: 6900, interval: "month" as const },
  { env: "STRIPE_PRICE_PRO_MONTHLY", name: "Fixfy Trade Pro", amount: 9900, interval: "month" as const },
  { env: "STRIPE_PRICE_VIP_ANNUAL", name: "Fixfy Trade VIP Annual", amount: 49900, interval: "year" as const },
];

console.log("Created (test mode):\n");
for (const p of plans) {
  const product = await stripe.products.create({ name: p.name });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: p.amount,
    currency: "gbp",
    recurring: { interval: p.interval },
  });
  console.log(`${p.env}=${price.id}  (${p.name}, £${(p.amount / 100).toFixed(0)}/${p.interval})`);
}
