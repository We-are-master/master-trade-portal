# Trade Portal nomenclature

Use concise British English and sentence case. Keep route keys, database states,
financial calculations and user-provided text unchanged. Match Master OS terminology
where the same workflow is shown to both teams and trades.

## Navigation and screens

| Area | Display name | Purpose |
| --- | --- | --- |
| Home | Today | Jobs, reports, offers and upcoming payment |
| Available work | Offers | Jobs to accept and requests to quote |
| Assigned work | My jobs | Job status and calendar |
| Finance | Payments (formerly Money) | Payment details, statements and documents |
| Account | Account | Profile, trades, rates, availability, area and policies |

Offers, My jobs and Payments retain their existing tabs and route IDs. Each hub
has contextual help for its selected tab. Dates, counts and live status stay
visible; static page and settings-card explanations use the `!` help control.

## Terminology changes

| Previous | Current |
| --- | --- |
| Final checks | Final review |
| Done (completed job filter) | Completed |
| Your net | Your pay |
| Site reference photos | Site photos |
| Trades & skills | Trades and skills |
| Documents & certifications | Documents |
| Policies & contracts | Policies |
| Statements (payments page heading) | Payments |
| Payouts (bank details card) | Payment details |
| How you get paid (card/modal titles) | Payment terms |
| How many jobs | Daily capacity |
| Max jobs per day | Daily job limit |
| Max simultaneous active jobs | Active job limit |
| Easy example | Payment example |
| Public bio | Profile summary |
| Years experience | Years of experience |
| Tmrw | Tomorrow |

Keep Payouts for the payments tab and actual payout states. Documents includes
insurance, certificates and agreements, so the short name intentionally covers
more than compliance certificates. Do not label earnings as paid until paid.

## Help pattern

`HelpHint` is a labelled, non-submit button. Hover, keyboard focus or a tap opens
the explanation. Escape, blur or an outside pointer closes it. Hovering the popup
keeps it open. Popups render above clipping containers and fit narrow viewports.
The active tab help sits outside the tablist and never nests inside another button.

Keep required form labels, errors and operational instructions visible in the form.
Do not put interactive links or required actions inside a tooltip.

## Validation

- TypeScript: `npm run typecheck`.
- Existing payment tests: `npm test` (17 passed).
- Browser component harness: header and tab help; hover persistence, focus,
  Escape, click and outside dismissal; 320px viewport; no form submission,
  nested buttons or browser errors.
- Authenticated end-to-end portal flows were not exercised.
