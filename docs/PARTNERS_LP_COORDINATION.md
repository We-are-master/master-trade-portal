# Partners LP coordination (getfixfy.com/partners)

The marketing landing page lives outside this repo.

Paid partner plans (Starter, Pro, VIP) were retired on 6 October 2026. Joining and using
Fixfy is free: Fixfy's only charges to a partner are its commission on Platform Bookings and
the £50 late-withdrawal fee (Partner Agreement, version 2026-10-06, clause 8).

- Every "Join" CTA points to `https://partners.getfixfy.com/get-started` (no `plan` param).
  Old `/signup?plan=...` links still redirect there and the `plan` param is dropped.
- The LP must not show plan prices, trials or "7 days free" copy.
- OS-invited partners (express `/invite` flow) get no plan either.
