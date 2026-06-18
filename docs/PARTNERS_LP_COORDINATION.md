# Partners LP coordination (getfixfy.com/partners)

The marketing landing page lives outside this repo. Wire each plan CTA to the trade portal signup with a `plan` query param:

| Plan | Price | CTA URL |
|------|-------|---------|
| Starter | £69/mo | `https://partners.getfixfy.com/signup?plan=starter` |
| Pro | £99/mo | `https://partners.getfixfy.com/signup?plan=pro` |
| VIP Annual | £499/yr | `https://partners.getfixfy.com/signup?plan=vip` |

**VIP** should be the hero card with copy: **Save £689/year vs Pro monthly** (£99×12 − £499).

Self-signup without `?plan=` redirects users back to https://www.getfixfy.com/partners to choose a plan.

OS-invited partners (express `/invite` flow) default to **Pro** unless a plan is passed at claim time.
