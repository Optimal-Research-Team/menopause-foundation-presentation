# Foundation Graduation Deck

A presentation route for the Offboarding ("Graduation") visit: Cheryl transcribes ~25
summary-level values from the two Hormone Questionnaire reports in the chart, generates a
personalized 9-slide before/after deck, presents it, optionally prints it to PDF for the
chart, and closes the tab. **Nothing is ever saved by this tool.**

Lives inside the `menopause-foundation-presentation` project and reuses its slide engine
(`../deck-stage.js`) and brand tokens (`../colors_and_type.css`).

| File | Purpose |
|---|---|
| `index.html` | Prep form ("slide 0") + the 9 deck slides |
| `app.js` | Form logic, live derivations, validation, deck rendering. `CONFIG` at the top is the single source of truth for prices, clinic contact, and the template version |
| `cue-card.html` | Printable presenter cue card (static, no PHI). **Presenter notes never render on the deck screen — it is shared with the patient** |
| `fonts/` | Self-hosted Castoro + Public Sans (this route may not touch a CDN) |

## Operator flow (Cheryl)

1. ~10 min before the visit, open the route → prep form
2. Transcribe summary values from the two chart reports (side-by-side)
3. **Generate** → present slides 1–9 with the printed cue card in hand
4. Optional: `Cmd/Ctrl+P` → Save as PDF → file into the chart → **delete the local copy immediately**
5. Record the patient's decision in the booking system (this tool records nothing)
6. Clear & close — refresh also wipes everything

Keyboard: `←`/`→` navigate · click left ⅓ back / right ⅔ forward · `Esc` returns to the
prep form (form state kept until refresh/close).

### Modes

- **Then-test** (no intake questionnaire on file): intake-side values are the retrospective
  ratings captured at the offboarding survey. Labels change, category rows hide, and the
  hormone-picture slide auto-skips. The deck stays complete-feeling — 8 slides, no gaps.
- **Strong / Modest** (§5.4): Modest changes copy only — slide 3 headline becomes
  "Your progress — and what's next", the delta chip goes neutral, and slide 5's bridge leads
  with "Hormone care is iterative — the first 12 weeks tell us what to adjust next."
- **Worsening guard**: if final flagged ≥ intake flagged, the form warns and suggests
  Modest; presenting Strong anyway requires ticking an explicit override.
- **Bucket** (§5.5): Standard → Ongoing Care vs pay-per-visit. Longevity → Optimal
  Women's as the NP's recommendation (first-month-free line) vs condensed Ongoing Care.

### Demo mode

**Load sample data** fills the FAKE "Alex Sample" set (31→9 flagged, four categories, five
symptom wins including one deliberate non-mover to demo neutral styling). All demo values
live in `app.js` under `SAMPLE` and are marked FAKE.

**Modest-mode example** (for training): load sample data, then set intake 18 / final 14,
results mode Modest, categories e.g. Decreased Estrogen 46→31, Decreased Progesterone
41→28, Increased Cortisol 39→33 — a real-looking partial responder. Note the neutral delta
chip and the "what to adjust next" bridge.

### PDF export (§5.8)

Print produces one slide per page with an identifying footer on every page:
`{first name} · {visit date} · {template version}` — so the filed PDF is identifiable in
the chart and auditable against the template that produced it. Pages are the deck's native
16:9 size (the slide engine's print system); they scale cleanly onto Letter landscape via
the print dialog's fit-to-page. PHI in the printed PDF is fine — its only home is the chart.

## PHIPA constraints — audit checklist (N1–N6)

Re-verifiable in ~5 minutes. Run quarterly.

- [ ] **N1 — Zero PHI in the repository, ever.** Placeholder data is clearly marked FAKE.
  Check the working tree and full history for anything patient-like (swap in real first
  names if any are ever suspected):

  ```bash
  git grep -in --all-match -e "" -- graduation | grep -iv "alex sample" | grep -iE "\b(dob|date of birth|ohip|health card)\b" ; \
  git log --all -p -- graduation | grep -icE "\b(dob|ohip|health card)\b"
  ```

  Both should return nothing / `0`. Also confirm `SAMPLE` in `app.js` still says
  `Alex Sample` and is commented `FAKE`.

- [ ] **N2 — Zero network requests after page load; no runtime CDNs.**
  DevTools → Network → load `/graduation/`, fill + generate + navigate all slides.
  Every request must be same-origin (fonts come from `graduation/fonts/`). Filter by
  "3rd-party requests": must be empty.

- [ ] **N3 — No storage.** DevTools → Application → Local Storage / Session Storage /
  IndexedDB / Cookies for this origin: all empty after a full prep+present run. Also:

  ```bash
  grep -rniE "localStorage|sessionStorage|indexedDB|document\.cookie|serviceWorker|CacheStorage" graduation --include="*.js" --include="*.html"
  ```

  Must return no matches (this README mentions the words; code must not).

- [ ] **N4 — No analytics, error-reporting SDKs, or form POST targets on this route.**
  There is no `<form action>`, no `fetch`/`XMLHttpRequest`/`sendBeacon` anywhere:

  ```bash
  grep -rniE "fetch\(|XMLHttpRequest|sendBeacon|action=" graduation --include="*.js" --include="*.html"
  ```

- [ ] **N5 — All state in JS memory only; unload destroys it.** Refresh mid-prep: the form
  must come back empty (deadline reset to today+7).

- [ ] **N6 — The artifact is a form, not a record.** The chart is the sole system of record
  via the printed PDF. This tool has no save, no export other than print, no outcome
  tracking (decisions are recorded in the booking system).

## Template version

`CONFIG.TEMPLATE_VERSION` in `app.js` (shown in the prep header and stamped into every
printed page's footer). **Bump it on any change that alters rendered output**, so filed
PDFs stay auditable against the template that produced them. The cue card's slide-7 price
line is static text — if prices change in `CONFIG`, update `cue-card.html` too and reprint.

## Open items (from the PRD)

- Severity-chip hex values (`--sev-*` in `../colors_and_type.css`) are harmonized with the
  brand but **pending confirmation against the branded PDF report's exact palette** (PRD
  open question 3). Swap the four values there if they differ.
- v2 auto-fill depends on the report generator exporting structured data (open question 1).
