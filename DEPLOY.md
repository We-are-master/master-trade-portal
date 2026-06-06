# Fixfy Trade Portal — go-live checklist

Next.js 16 app (API routes + middleware → needs a Node server, not static export).
Reuses the master-os Supabase project. Operational data keys off `public.partners`; the
signed-in user is an `external_partner` in `public.users`, linked to a partners row via
`ensure_partner_from_app_registration()` at sign-in.

## 1. Database
Apply the master-os migrations **in order**: `196, 197, 198, 199, 200, 201, 202, 203, 204, 205`.
- `196` Stripe subscription cols · `197` quote invitations partner read · `198` RLS hardening
- `199` lead distribution (table `service_request_partner_offers`) · `200` availability/preferences
- `201` job checklist · `202` job photos (creates a **private storage bucket** `job-photos`)
- `203` Stripe Connect cols (needs Connect enabled) · `204` profile/service-area cols
- `205` partner_service_prices RLS hardening

## 2. Host
Deploy to Railway or Vercel. Build `next build`, start `next start`, Node 20+.

## 3. Environment variables (set in the host — never commit)

**Vercel (portal):** Project → Settings → Environment Variables. Enable for **Production** and **Preview** (preview URLs like `*.vercel.app` need the same vars). After adding or changing vars, **Redeploy** the latest deployment.

**Smoke check:** `GET https://<portal-domain>/api/health/accept-config` should return `{ "ok": true, "acceptConfigured": true }`. If `503`, one of `INTERNAL_SYNC_SECRET`, `MASTER_OS_BASE_URL`, or `SERVICE_ROLE_KEY` is missing on that deployment.

**OS pairing:** `INTERNAL_SYNC_SECRET` must be **identical** on master-os production (`MASTER_OS_BASE_URL`, e.g. `https://app.getfixfy.com`). Generate once (e.g. `openssl rand -hex 32`) and paste the same value on both apps.
| Var | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | same Supabase project as master-os |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public anon key |
| `SERVICE_ROLE_KEY` | **secret** — server routes only (bypasses RLS) |
| `STRIPE_SECRET_KEY` | **LIVE** key in production |
| `STRIPE_WEBHOOK_SECRET` | from the portal's OWN webhook endpoint (below) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | live publishable key |
| `STRIPE_PRICE_FIXFY_PRO` | live £99/mo recurring price id |
| `RESEND_API_KEY` | partner OTP emails |
| `RESEND_FROM_EMAIL` | must be on a **verified** Resend domain |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | job-location map (My jobs → Map); same token as master-os |
| `MASTER_OS_BASE_URL` | **secret/server** — production OS URL (e.g. `https://app.getfixfy.com`) |
| `INTERNAL_SYNC_SECRET` | **secret** — must match the same value on master-os; required for **Accept job** (delegates to OS) |

## 4. Stripe
- Switch to **live** mode.
- Create the £99/mo Product+Price (see `scripts/create-stripe-price.mjs`) → `STRIPE_PRICE_FIXFY_PRO`.
- Create a webhook endpoint → `https://<domain>/api/stripe/webhook`, events `checkout.session.completed`, `customer.subscription.*` → signing secret → `STRIPE_WEBHOOK_SECRET`.
- **Enable Stripe Connect** (Express) on the platform account — required for self-bill payouts.

## 5. Resend
Verify the sending domain so OTP sign-in emails deliver (not spam).

## 6. Supabase Auth
Add the production domain to the Auth URL configuration (Site URL / redirect allow-list) so
session cookies work on the prod origin.

## 7. Partners can sign in
Only registered partners (`public.users.user_type = 'external_partner'`) receive an OTP.
Brand-new trades must first register in the partner app; the portal ensures their `partners`
row on first sign-in.

## 8. Smoke test (on the deployed URL, with a real external_partner)
Sign in (OTP) → dashboard → my jobs → accept an available job → submit a quote → leads →
save profile/trades/rate-card/availability → upload a job photo → sign a contract → start
payout onboarding.
