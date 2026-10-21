# Ongoing Care Deck (Foundation graduation visit)

The deck for the **Ongoing Care** Menopause & Perimenopause Program — presented at the
Offboarding ("Graduation") visit that closes the Foundation Program.

> **Current state (Oct 21, 2026) — v6.2, "The Graduate Close", seven slides:**
> 1 Congratulations (the brand forest plate plays once, fog to sun) · 2 None of this was luck
> (three receipts + her Foundation Program receipt, six of six steps, stamped) · 3 The moving
> target (the A2 hypothalamus in real-time 3-D) · 4 Your choice (fork: Ongoing Care vs
> pay-per-visit) · 5 The Transition Visit (year dial) · 6 Your graduate offer (price, graduate
> rate with a "Save $380" sticker, value stack) · 7 Thank you (a living dot-matrix over the
> green gradient). The year comes before the price, then the close (Peter, Oct 21).
>
> Prep needs only **her first name + Strong/Modest** (`CONFIG.MINIMAL_PREP`). The
> questionnaire-driven results slides and their transcription fields are **paused** behind
> `CONFIG.QUESTIONNAIRE_SECTION` (currently `false`); flip it to `true` and uncomment the three
> paused cues in `cue-card.html` once questionnaire data can be pulled directly. A reminder is
> scheduled for **Nov 18, 2026**.

The deck for the Offboarding ("Graduation") visit: Cheryl types the patient's first name,
picks Strong or Modest, generates a personalized deck, presents it, optionally prints it to
PDF for the chart, and closes the tab. **Nothing is ever saved by this tool.**

Lives inside the `menopause-foundation-presentation` project and reuses its slide engine
(`../deck-stage.js`) and brand tokens (`../colors_and_type.css`).

| File | Purpose |
|---|---|
| `index.html` | Prep form ("slide 0") + the deck slides (markup and all CSS) |
| `app.js` | Form logic, derivations, deck rendering, the slide-1 forest video (`forestVideo`), the slide-2 receipt count, the slide-3 stepper sync (`stages35`), the year dial (`buildYearOrbitSVG`), the closing dot-matrix shader (`closingTexture`, WebGL; decorative, hidden in print). `CONFIG` at the top is the single source of truth for prices, clinic contact, and the template version |
| `hypo3d.js` | The 3-D hypothalamus (`<hypo-3d>` custom element) — a self-contained, tree-shaken Three.js r186.1 bundle. Built from `src/` by `tools/build-hypo3d.sh`; see `HYPO3D.md` |
| `cue-card.html` | Printable presenter cue card (static, no PHI). **Presenter notes never render on the deck screen — it is shared with the patient** |
| `optimal-logo.js` | Vendored `<optimal-logo>` brand mark (zero network) |
| `fonts/` | Self-hosted Castoro + Public Sans (this route may not touch a CDN) |

## Operator flow (Cheryl)

1. Before the visit, open the route → prep form
2. Type her first name; pick **Strong** or **Modest** (Modest softens the road-ahead line)
3. **Generate** → present slides 1–7 with the printed cue card in hand (the savings sticker on slide 6 is computed from `CONFIG`: visit-by-visit total − graduate rate)
4. Optional: `Cmd/Ctrl+P` → Save as PDF → file into the chart → **delete the local copy immediately**
5. Record the patient's decision in the booking system (this tool records nothing)
6. Clear & close — refresh also wipes everything

Keyboard: `←`/`→` navigate · click left ⅓ back / right ⅔ forward · `Esc` returns to the
prep form (form state kept until refresh/close).

### Modes

- **Then-test** (no intake questionnaire on file): intake-side values are the retrospective
  ratings captured at the offboarding survey. Labels change, category rows hide, and the
  hormone-picture slide auto-skips. The deck stays complete-feeling — 8 slides, no gaps.
- **Strong / Modest** (§5.4): Modest changes copy only — the road-ahead line on slide 3
  ("The moving target") leads with "Hormone care is iterative — the first 12 weeks tell us
  what to adjust next." (With the questionnaire section restored, Modest also retitles the
  results slide and neutralises its delta chip.)
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
  git grep -in --all-match -e "" -- graduation-ongoing-care | grep -iv "alex sample" | grep -iE "\b(dob|date of birth|ohip|health card)\b" ; \
  git log --all -p -- graduation-ongoing-care | grep -icE "\b(dob|ohip|health card)\b"
  ```

  Both should return nothing / `0`. Also confirm `SAMPLE` in `app.js` still says
  `Alex Sample` and is commented `FAKE`.

- [ ] **N2 — Zero network requests after page load; no runtime CDNs.**
  DevTools → Network → load `/graduation-ongoing-care/`, fill + generate + navigate all slides.
  Every request must be same-origin (fonts come from `graduation-ongoing-care/fonts/`; the 3-D
  model is the single local file `hypo3d.js` and generates every texture in code; slide 1's
  footage is `../assets/video/forest-dawn.mp4`, a crop of the logo sting's forest plate). Filter by
  "3rd-party requests": must be empty.

- [ ] **N3 — No storage.** DevTools → Application → Local Storage / Session Storage /
  IndexedDB / Cookies for this origin: all empty after a full prep+present run. Also:

  ```bash
  grep -rniE "localStorage|sessionStorage|indexedDB|document\.cookie|serviceWorker|CacheStorage" graduation-ongoing-care --include="*.js" --include="*.html"
  ```

  Must return no matches (this README mentions the words; code must not).

- [ ] **N4 — No analytics, error-reporting SDKs, or form POST targets on this route.**
  There is no `<form action>`, no `fetch`/`XMLHttpRequest`/`sendBeacon`/`WebSocket` anywhere:

  ```bash
  grep -rniE "\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|action=" graduation-ongoing-care --include="*.js" --include="*.html"
  ```

  (`\b` matters: Three.js's shader strings contain the GLSL function `texelFetch(`, which reads a
  texture on the GPU and is not a network call.)

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
