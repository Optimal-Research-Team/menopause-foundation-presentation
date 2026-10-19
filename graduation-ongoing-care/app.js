/**
 * Graduation Deck — prep form + deck renderer.
 *
 * PHIPA posture (see README.md):
 *   - All patient data lives in this module's `state` object and the form's
 *     DOM inputs — JS memory only. Refresh/close destroys it.
 *   - No browser persistence of any kind: no web storage, no client-side
 *     databases, no cookies, no offline caching workers.
 *   - No network calls of any kind. No analytics. No POST targets.
 */
(() => {
  'use strict';

  /* ════════════════════════════════════════════════════════════════════
     §5.6 Config constants — single source of truth.
     Derived figures are COMPUTED (slide-7 anchor = PRN30 + PRN45).
     Bump TEMPLATE_VERSION on any change that alters rendered output.
     ════════════════════════════════════════════════════════════════════ */
  const CONFIG = {
    PRICE_ANNUAL: 795,
    PRICE_EARLY: 695,
    PRICE_MEMBER_EXTRA: 195,
    PRICE_PRN30: 325,
    PRICE_PRN45: 425,
    PRICE_WOMENS_MONTHLY: 295,
    CLINIC: {
      name: 'Optimal Clinic',
      address: '630 Huronia Road, Unit 5, Barrie ON',
      email: 'care@beoptimal.ca',
      web: 'beoptimal.ca',
    },
    TEMPLATE_VERSION: 'ongoing-care-deck v5.0.3',
    /* Questionnaire/results section (slides 2–4 + their form fields).
       OFF until questionnaire data can be pulled directly — everything it
       gates is intact; flip to true to restore the full 9-slide deck.
       (Reminder scheduled for Nov 18, 2026.) */
    QUESTIONNAIRE_SECTION: false,
    /* Minimal prep: the form asks for the first name + Strong/Modest only.
       Program dates, offer deadline, bucket, and held slot derive
       automatically (graduation day = today; 12-week program; deadline
       today+7; Standard bucket; no held slot). */
    MINIMAL_PREP: true,
  };

  /* §2 — the instrument */
  const RATING_LABELS = ['Not present', 'Very mild', 'Mild', 'Moderate', 'Severe', 'Very severe'];

  const CATEGORIES = [
    'Decreased Estrogen', 'Increased Estrogen',
    'Decreased Progesterone', 'Increased Progesterone',
    'Decreased Testosterone', 'Increased Testosterone',
    'Decreased DHEA', 'Increased DHEA',
    'Decreased Cortisol', 'Increased Cortisol',
    'Decreased Thyroid', 'Increased Insulin',
  ];

  const SYMPTOMS = [
    'Acne', 'Anxiety/Nervousness', 'Apathy', 'Breast Tenderness', 'Brittle Nails',
    'Burned out feeling', 'Chemical sensitivities', 'Cold Body Temperature', 'Cold Extremities',
    'Confusion', 'Constipation', 'Cramping Abdominal', 'Cravings for Sweet',
    'Decreased Concentration', 'Decreased Sex Drive', 'Decreased Sexual Sensation',
    'Decreased Stamina', 'Deepening of Voice', 'Depressed Mood', 'Dry Eyes', 'Dry Skin/Hair',
    'Fatigue', 'Fibrocystic Breasts', 'Fluid Retention Abdomen', 'Fluid retention extremities',
    'Foggy thinking', 'Headaches', 'Heart palpitations', 'Heavy and irregular menses',
    'Hoarseness', 'Hot Flashes', 'Hypoglycemia', 'Increased Facial &/or Body Hair',
    'Increased Hair loss', 'Irritability', 'Joint Pain', 'Low Blood Pressure',
    'Memory Problems', 'Mood Swings', 'Muscle Pain', 'Night Sweats',
    'Numbness in hands &/or feet', 'Painful intercourse', 'Premenstrual syndrome',
    'Salt craving', 'Sleep disturbances', 'Swollen eyes', 'Tearfulness', 'Thinning skin',
    'Tired but wired', 'Urinary incontinence', 'Vaginal dryness',
    'Weight gain: Hips', 'Weight Gain: Waist',
  ];

  /* §5.7 — demo fill. Every value below is FAKE and clearly marked as such. */
  const SAMPLE = {  // FAKE — demo/training data only, never a real patient
    first: 'Alex Sample',
    weeksSpan: 12,
    quote: "I'm not myself anymore. I can't sleep, I can't think at work, and I have nothing left for my family by dinner.",
    win: "You're sleeping through the night — and your afternoons belong to you again.",
    intakeFlagged: 31,
    finalFlagged: 9,
    categories: [
      ['Decreased Estrogen', 57, 18],
      ['Decreased Testosterone', 71, 24],
      ['Decreased Progesterone', 46, 17],
      ['Increased Cortisol', 39, 22],
    ],
    wins: [
      ['Hot Flashes', 5, 1],
      ['Night Sweats', 4, 1],
      ['Sleep disturbances', 4, 2],
      ['Foggy thinking', 3, 1],
      ['Joint Pain', 2, 2],  // deliberate non-mover — demos neutral styling
    ],
  };

  /* ════════════════════════════════════════════════════════════════════
     Helpers
     ════════════════════════════════════════════════════════════════════ */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const money = (n) => '$' + Number(n).toLocaleString('en-CA');

  const sevBand = (pct) => {
    if (pct >= 60) return { key: 'high', label: 'High' };
    if (pct >= 40) return { key: 'modhigh', label: 'Mod-High' };
    if (pct >= 20) return { key: 'moderate', label: 'Moderate' };
    return { key: 'low', label: 'Low' };
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
  };
  const fmtRange = (aIso, bIso) => {
    if (!aIso || !bIso) return '';
    const [ay, am, ad] = aIso.split('-').map(Number);
    const [by, bm, bd] = bIso.split('-').map(Number);
    const a = new Date(ay, am - 1, ad), b = new Date(by, bm - 1, bd);
    const aTxt = a.toLocaleDateString('en-CA', ay === by ? { month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' });
    return `${aTxt} – ${b.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  };
  const fmtSlot = (dtLocal) => {
    if (!dtLocal) return '';
    const d = new Date(dtLocal);
    return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }) +
      ' at ' + d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
  };
  const isoFrom = (date) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  };
  const todayIso = () => isoFrom(new Date());
  const daysFromToday = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

  /* ════════════════════════════════════════════════════════════════════
     Elements
     ════════════════════════════════════════════════════════════════════ */
  const prep = $('#prep');
  const deck = $('#deck');
  const navzones = $('#navzones');
  const deckUtils = $('#deck-utils');
  let lastState = null;   // last rendered deck state (memory only, wiped on refresh)

  const fFirst = $('#f-first'), fStart = $('#f-start'), fEnd = $('#f-end');
  const fQuote = $('#f-quote'), fWin = $('#f-win'), fDeadline = $('#f-deadline');
  const fSlot = $('#f-slot'), fThenTest = $('#f-thentest'), fOverride = $('#f-override');
  const fIntakeFlagged = $('#f-intake-flagged'), fFinalFlagged = $('#f-final-flagged');

  const catRows = $('#cat-rows'), winRows = $('#win-rows');
  const slideHormone = $('.g4');
  const slideHormoneAnchor = document.createComment('slide-4-anchor');
  slideHormone.parentNode.insertBefore(slideHormoneAnchor, slideHormone);

  $('#ver-tag').textContent = CONFIG.TEMPLATE_VERSION;

  // Lock deck navigation while the prep form is up (deck-stage honors this).
  window.__deckLocked = true;

  /* ── Questionnaire section gate (see CONFIG.QUESTIONNAIRE_SECTION) ──
     With the gate off: slides 2–4 leave the deck, and every form element
     that needs chart transcription hides. Nothing is deleted — flipping
     the flag restores all of it. */
  if (!CONFIG.QUESTIONNAIRE_SECTION) {
    ['.g2', '.g3', '.g4'].forEach((sel) => { const s = $(sel); if (s) s.remove(); });
    ['#fs-summary', '#fs-categories', '#fs-wins'].forEach((sel) => { const s = $(sel); if (s) s.hidden = true; });
    [fQuote, fWin, fThenTest].forEach((el) => {
      const wrap = el && el.closest('.f');
      if (wrap) wrap.hidden = true;
    });
    ['#pp-2', '#pp-3', '#pp-4'].forEach((sel) => { const d = $(sel); if (d) d.hidden = true; });
  }

  /* ── Minimal prep (see CONFIG.MINIMAL_PREP) ──
     Name + Strong/Modest only. Dates, deadline, bucket, and the held slot
     derive automatically; their fields hide but stay in the DOM. */
  if (CONFIG.MINIMAL_PREP) {
    [fStart, fEnd, fDeadline, fSlot, $('#b-std')].forEach((el) => {
      const wrap = el && el.closest('.f');
      if (wrap) wrap.hidden = true;
    });
    const sub = $('.prep-sub');
    if (sub) sub.innerHTML = 'Type her first name, pick <b>Strong</b> or <b>Modest</b>, and hit <b>Generate</b> — everything else is automatic. Present with the printed cue card in hand.';
  }

  /* ════════════════════════════════════════════════════════════════════
     Dynamic rows
     ════════════════════════════════════════════════════════════════════ */
  const MAX_ROWS = 6, MIN_ROWS = 3;

  function makeSevChip() {
    const chip = document.createElement('span');
    chip.className = 'sev-chip';
    return chip;
  }
  function updateSevChip(chip, raw) {
    const v = parseFloat(raw);
    if (raw === '' || isNaN(v) || v < 0 || v > 100) { chip.className = 'sev-chip'; chip.textContent = ''; return; }
    const band = sevBand(v);
    chip.className = 'sev-chip on ' + band.key;
    chip.textContent = band.label;
  }

  function addCatRow(cat = '', intake = '', final_ = '') {
    if (catDataRows().length >= MAX_ROWS) return;
    const row = document.createElement('div');
    row.className = 'rowline cat';
    row.dataset.row = 'cat';

    const sel = document.createElement('select');
    sel.innerHTML = '<option value="">Select category…</option>' +
      CATEGORIES.map((c) => `<option${c === cat ? ' selected' : ''}>${c}</option>`).join('');

    const inIntake = document.createElement('input');
    inIntake.type = 'number'; inIntake.min = 0; inIntake.max = 100; inIntake.step = 'any';
    inIntake.placeholder = '%'; inIntake.value = intake;
    const chipIntake = makeSevChip();

    const inFinal = document.createElement('input');
    inFinal.type = 'number'; inFinal.min = 0; inFinal.max = 100; inFinal.step = 'any';
    inFinal.placeholder = '%'; inFinal.value = final_;
    const chipFinal = makeSevChip();

    const del = document.createElement('button');
    del.type = 'button'; del.className = 'del'; del.textContent = '×'; del.title = 'Remove row';
    del.addEventListener('click', () => { row.remove(); refreshAddButtons(); });

    inIntake.addEventListener('input', () => updateSevChip(chipIntake, inIntake.value));
    inFinal.addEventListener('input', () => updateSevChip(chipFinal, inFinal.value));
    updateSevChip(chipIntake, inIntake.value);
    updateSevChip(chipFinal, inFinal.value);

    row.append(sel, inIntake, chipIntake, inFinal, chipFinal, del);
    catRows.appendChild(row);
    refreshAddButtons();
    return row;
  }

  function addWinRow(symptom = '', intake = '', final_ = '', otherText = '') {
    if (winDataRows().length >= MAX_ROWS) return;
    const row = document.createElement('div');
    row.className = 'rowline win';
    row.dataset.row = 'win';

    const stackSym = document.createElement('div');
    stackSym.className = 'stack';
    const sel = document.createElement('select');
    sel.innerHTML = '<option value="">Select symptom…</option>' +
      SYMPTOMS.map((s) => `<option${s === symptom ? ' selected' : ''}>${s}</option>`).join('') +
      `<option value="__other"${symptom === '__other' ? ' selected' : ''}>Other — type below…</option>`;
    const other = document.createElement('input');
    other.type = 'text'; other.placeholder = 'Symptom, in her words'; other.maxLength = 60;
    other.value = otherText;
    other.style.display = symptom === '__other' ? '' : 'none';
    sel.addEventListener('change', () => {
      other.style.display = sel.value === '__other' ? '' : 'none';
      if (sel.value !== '__other') other.value = '';
    });
    stackSym.append(sel, other);

    const mkRating = (val) => {
      const stack = document.createElement('div');
      stack.className = 'stack';
      const s = document.createElement('select');
      s.innerHTML = '<option value="">—</option>' +
        RATING_LABELS.map((l, i) => `<option value="${i}"${String(i) === String(val) ? ' selected' : ''}>${i} · ${l}</option>`).join('');
      const lab = document.createElement('span');
      lab.className = 'rating-label';
      const update = () => {
        if (s.value === '') { lab.className = 'rating-label'; lab.textContent = ''; }
        else { lab.className = 'rating-label on'; lab.textContent = RATING_LABELS[Number(s.value)]; }
      };
      s.addEventListener('change', update);
      update();
      stack.append(s, lab);
      return { stack, select: s };
    };

    const rIntake = mkRating(intake);
    const rFinal = mkRating(final_);

    const del = document.createElement('button');
    del.type = 'button'; del.className = 'del'; del.textContent = '×'; del.title = 'Remove row';
    del.addEventListener('click', () => { row.remove(); refreshAddButtons(); });

    row.append(stackSym, rIntake.stack, rFinal.stack, del);
    winRows.appendChild(row);
    refreshAddButtons();
    return row;
  }

  const catDataRows = () => $$('#cat-rows .rowline.cat[data-row]');
  const winDataRows = () => $$('#win-rows .rowline.win[data-row]');

  function refreshAddButtons() {
    $('#add-cat').disabled = catDataRows().length >= MAX_ROWS;
    $('#add-win').disabled = winDataRows().length >= MAX_ROWS;
    refreshProgress();
  }

  /* Section-readiness dots (sticky bar). Passive — never marks .invalid.
     Shares the completeness predicates below with collectAndValidate. */
  const pctOk = (v) => v !== '' && !isNaN(parseFloat(v)) && parseFloat(v) >= 0 && parseFloat(v) <= 100;
  const flaggedVal = (el) => {
    const v = parseInt(el.value, 10);
    return el.value !== '' && Number.isInteger(v) && String(v) === el.value.trim() && v >= 0 && v <= 54 ? v : null;
  };
  const catRowComplete = (row) => {
    const [sel, inIntake, , inFinal] = row.children;
    return !!sel.value && pctOk(inIntake.value) && pctOk(inFinal.value);
  };
  const winRowComplete = (row) => {
    const sel = row.children[0].querySelector('select');
    const other = row.children[0].querySelector('input');
    const ri = row.children[1].querySelector('select');
    const rf = row.children[2].querySelector('select');
    const name = sel.value === '__other' ? other.value.trim() : sel.value;
    return !!name && ri.value !== '' && rf.value !== '';
  };

  function refreshProgress() {
    const s1 = CONFIG.MINIMAL_PREP
      ? !!fFirst.value.trim()
      : !!(fFirst.value.trim() && fStart.value && fEnd.value && fEnd.value > fStart.value &&
        (!CONFIG.QUESTIONNAIRE_SECTION || (fQuote.value.trim() && fWin.value.trim())) &&
        fDeadline.value && fDeadline.value >= todayIso());
    const s2 = flaggedVal(fIntakeFlagged) !== null && flaggedVal(fFinalFlagged) !== null;
    const nCats = catDataRows().filter(catRowComplete).length;
    const s3 = nCats >= MIN_ROWS && nCats <= MAX_ROWS;
    const nWins = winDataRows().filter(winRowComplete).length;
    const s4 = nWins >= MIN_ROWS && nWins <= MAX_ROWS;
    $('#pp-3').hidden = fThenTest.checked;
    $('#pp-1').classList.toggle('done', s1);
    $('#pp-2').classList.toggle('done', s2);
    $('#pp-3').classList.toggle('done', s3);
    $('#pp-4').classList.toggle('done', s4);
  }

  $('#add-cat').addEventListener('click', () => addCatRow());
  $('#add-win').addEventListener('click', () => addWinRow());

  /* ════════════════════════════════════════════════════════════════════
     Live guards & mode toggles
     ════════════════════════════════════════════════════════════════════ */
  function resultsMode() { return $('#m-modest').checked ? 'modest' : 'strong'; }
  function bucket() { return $('#b-lon').checked ? 'longevity' : 'standard'; }

  function updateDeltaPreview() {
    const a = parseInt(fIntakeFlagged.value, 10);
    const b = parseInt(fFinalFlagged.value, 10);
    const el = $('#delta-preview');
    if (isNaN(a) || isNaN(b)) { el.classList.remove('on'); return; }
    el.textContent = `${a} → ${b}`;
    el.classList.toggle('neutral', b >= a);
    el.classList.add('on');
  }

  function updateWorsenWarning() {
    const a = parseInt(fIntakeFlagged.value, 10);
    const b = parseInt(fFinalFlagged.value, 10);
    const worsening = !isNaN(a) && !isNaN(b) && b >= a;
    $('#worsen-warning').classList.toggle('show', worsening);
    $('#override-line').style.display = worsening && resultsMode() === 'strong' ? 'flex' : 'none';
    if (!worsening) fOverride.checked = false;
  }

  [fIntakeFlagged, fFinalFlagged].forEach((el) =>
    el.addEventListener('input', () => { updateDeltaPreview(); updateWorsenWarning(); }));
  $$('#seg-mode input').forEach((el) => el.addEventListener('change', updateWorsenWarning));
  $('#btn-suggest-modest').addEventListener('click', () => {
    $('#m-modest').checked = true;
    updateWorsenWarning();
  });

  function applyThenTest() {
    const tt = fThenTest.checked;
    $('#fs-categories').classList.toggle('tt-hidden', tt);
    $('#l-intake-flagged').textContent = tt ? 'Total flagged — looking back' : 'Total flagged — intake';
    $('#col-win-intake').textContent = tt ? 'Then (0–5)' : 'Intake (0–5)';
    $('#wins-hint').textContent = tt
      ? '3–6 biggest movers. "Then" ratings are the retrospective ones captured at the offboarding survey. Labels derive live.'
      : '3–6 biggest movers, biased toward the chief complaints. Ratings are the 0–5 questionnaire scale; labels derive live. One flat row is fine — honesty photographs well too.';
    refreshProgress();
  }
  fThenTest.addEventListener('change', applyThenTest);

  // char counters
  const bindCount = (input, countEl, max) => {
    const update = () => {
      countEl.textContent = String(input.value.length);
      countEl.parentElement.classList.toggle('over', input.value.length >= max);
    };
    input.addEventListener('input', update);
    update();
  };
  bindCount(fQuote, $('#quote-count'), 140);
  bindCount(fWin, $('#win-count'), 80);

  /* ════════════════════════════════════════════════════════════════════
     Defaults / demo / clear
     ════════════════════════════════════════════════════════════════════ */
  function setDefaults() {
    fDeadline.value = isoFrom(daysFromToday(7));   // §5.1: default today+7d
    fDeadline.min = todayIso();                     // ≥ today
    for (let i = 0; i < 4; i++) { addCatRow(); addWinRow(); }
  }

  function clearAll({ confirmFirst = true } = {}) {
    if (confirmFirst && !window.confirm('Clear everything? Nothing is saved — this cannot be undone.')) return;
    [fFirst, fQuote, fWin, fSlot, fIntakeFlagged, fFinalFlagged, fStart, fEnd].forEach((el) => { el.value = ''; });
    $('#b-std').checked = true; $('#m-strong').checked = true;
    fThenTest.checked = false; fOverride.checked = false;
    catDataRows().forEach((r) => r.remove());
    winDataRows().forEach((r) => r.remove());
    setDefaults();
    applyThenTest(); updateDeltaPreview(); updateWorsenWarning();
    $('#demo-tag').classList.remove('show');
    $$('.invalid').forEach((el) => el.classList.remove('invalid'));
    $$('.err.show, .rows-err.show').forEach((el) => el.classList.remove('show'));
    $('#form-err-summary').classList.remove('show');
    $('#quote-count').textContent = '0'; $('#win-count').textContent = '0';
    window.scrollTo(0, 0);
  }

  function loadSample() {
    clearAll({ confirmFirst: false });
    fFirst.value = SAMPLE.first;
    fEnd.value = todayIso();
    fStart.value = isoFrom(daysFromToday(-SAMPLE.weeksSpan * 7));
    fQuote.value = SAMPLE.quote;
    fWin.value = SAMPLE.win;
    fIntakeFlagged.value = SAMPLE.intakeFlagged;
    fFinalFlagged.value = SAMPLE.finalFlagged;
    const slot = daysFromToday(10); slot.setHours(14, 30, 0, 0);
    fSlot.value = isoFrom(slot) + 'T14:30';

    catDataRows().forEach((r) => r.remove());
    winDataRows().forEach((r) => r.remove());
    SAMPLE.categories.forEach(([c, a, b]) => addCatRow(c, a, b));
    SAMPLE.wins.forEach(([s, a, b]) => addWinRow(s, a, b));

    $('#quote-count').textContent = String(fQuote.value.length);
    $('#win-count').textContent = String(fWin.value.length);
    updateDeltaPreview(); updateWorsenWarning(); refreshProgress();
    $('#demo-tag').classList.add('show');
  }

  $('#btn-demo').addEventListener('click', loadSample);
  $('#btn-clear').addEventListener('click', () => clearAll());
  prep.addEventListener('input', (e) => {
    if (e.isTrusted) $('#demo-tag').classList.remove('show');
  });

  /* ════════════════════════════════════════════════════════════════════
     Validation (§5.1)
     ════════════════════════════════════════════════════════════════════ */
  function markInvalid(el, errEl, bad) {
    el.classList.toggle('invalid', bad);
    if (errEl) errEl.classList.toggle('show', bad);
    return bad;
  }

  function collectAndValidate() {
    let bad = false;
    const Q = CONFIG.QUESTIONNAIRE_SECTION;
    const M = CONFIG.MINIMAL_PREP;
    const tt = Q && fThenTest.checked;

    bad |= markInvalid(fFirst, $('#e-first'), !fFirst.value.trim());
    if (!M) {
      bad |= markInvalid(fStart, $('#e-start'), !fStart.value);
      const endBad = !fEnd.value || (fStart.value && fEnd.value <= fStart.value);
      bad |= markInvalid(fEnd, $('#e-end'), endBad);
      bad |= markInvalid(fDeadline, $('#e-deadline'), !fDeadline.value || fDeadline.value < todayIso());
    }
    if (Q) {
      bad |= markInvalid(fQuote, $('#e-quote'), !fQuote.value.trim());
      bad |= markInvalid(fWin, $('#e-win'), !fWin.value.trim());
    }

    const intVal = (el) => {
      const v = parseInt(el.value, 10);
      return el.value !== '' && Number.isInteger(v) && String(v) === el.value.trim() && v >= 0 && v <= 54 ? v : null;
    };
    const a = Q ? intVal(fIntakeFlagged) : 0, b = Q ? intVal(fFinalFlagged) : 0;
    if (Q) {
      bad |= markInvalid(fIntakeFlagged, $('#e-intake-flagged'), a === null);
      bad |= markInvalid(fFinalFlagged, $('#e-final-flagged'), b === null);
    }

    // §5.1 worsening guard: Strong over worsening numbers requires explicit override
    let guardBlocked = false;
    if (Q && a !== null && b !== null && b >= a && resultsMode() === 'strong' && !fOverride.checked) {
      guardBlocked = true;
      $('#worsen-warning').classList.add('show');
      $('#override-line').style.display = 'flex';
    }

    // category rows (hidden + skipped in then-test)
    const cats = [];
    if (Q && !tt) {
      catDataRows().forEach((row) => {
        const [sel, inIntake, , inFinal] = row.children;
        const cName = sel.value;
        const ci = parseFloat(inIntake.value), cf = parseFloat(inFinal.value);
        const filled = cName || inIntake.value !== '' || inFinal.value !== '';
        const complete = cName && !isNaN(ci) && ci >= 0 && ci <= 100 && !isNaN(cf) && cf >= 0 && cf <= 100;
        if (complete) cats.push({ name: cName, intake: ci, final: cf });
        else if (filled) { sel.classList.add('invalid'); inIntake.classList.add('invalid'); inFinal.classList.add('invalid'); }
      });
      const catBad = cats.length < MIN_ROWS || cats.length > MAX_ROWS;
      $('#e-cats').classList.toggle('show', catBad);
      bad |= catBad;
    }

    // symptom win rows
    const wins = [];
    if (Q) winDataRows().forEach((row) => {
      const sel = row.children[0].querySelector('select');
      const other = row.children[0].querySelector('input');
      const ri = row.children[1].querySelector('select');
      const rf = row.children[2].querySelector('select');
      const name = sel.value === '__other' ? other.value.trim() : sel.value;
      const filled = sel.value || ri.value !== '' || rf.value !== '';
      const complete = name && ri.value !== '' && rf.value !== '';
      if (complete) wins.push({ name, intake: Number(ri.value), final: Number(rf.value) });
      else if (filled) { sel.classList.add('invalid'); ri.classList.add('invalid'); rf.classList.add('invalid'); }
    });
    const winBad = Q && (wins.length < MIN_ROWS || wins.length > MAX_ROWS);
    $('#e-wins').classList.toggle('show', winBad);
    bad |= winBad;

    if (bad || guardBlocked) {
      $('#form-err-summary').textContent = guardBlocked && !bad
        ? 'Final ≥ intake: switch to Modest, or explicitly confirm the Strong override.'
        : 'Fix the highlighted fields to generate.';
      $('#form-err-summary').classList.add('show');
      const firstBad = $('.invalid') || $('#worsen-warning');
      if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return null;
    }
    $('#form-err-summary').classList.remove('show');

    return {
      first: fFirst.value.trim(),
      start: M ? isoFrom(daysFromToday(-84)) : fStart.value,   // 12-week program
      end: M ? todayIso() : fEnd.value,                        // graduation day = today
      quote: fQuote.value.trim(),
      win: fWin.value.trim(),
      deadline: M ? isoFrom(daysFromToday(7)) : fDeadline.value,
      bucket: M ? 'standard' : bucket(), mode: resultsMode(), thenTest: tt,
      heldSlot: M ? null : (fSlot.value || null),
      intakeFlagged: a, finalFlagged: b,
      categories: cats, wins,
    };
  }

  // clear invalid highlight as the operator fixes fields
  prep.addEventListener('input', (e) => {
    if (e.target.classList) e.target.classList.remove('invalid');
    refreshProgress();
  });
  prep.addEventListener('change', (e) => {
    if (e.target.classList) e.target.classList.remove('invalid');
    refreshProgress();
  });

  /* ════════════════════════════════════════════════════════════════════
     Deck render (§5.3–§5.5, Appendix A)
     ════════════════════════════════════════════════════════════════════ */
  function bind(name, text) {
    $$(`[data-bind="${name}"]`).forEach((el) => { el.textContent = text; });
  }
  // Fixed template strings only — never user input.
  function bindHTML(name, html) {
    $$(`[data-bind-html="${name}"]`).forEach((el) => { el.innerHTML = html; });
  }

  /* Slope-map SVG for slide 4 — full-width animated card in the same style
     as the main deck's hormone-map: bezier slopes, staggered draw-in,
     category names and severity chips inside the chart. */
  const CAT_COLORS = ['#5db882', '#70b8b0', '#c8a840', '#c88040', '#c06060', '#8fa8cc'];
  const CHIP_STYLE = {
    high:     { bg: '#F7E5E1', fg: '#B3402F' },
    modhigh:  { bg: '#F7EBDD', fg: '#8A5218' },
    moderate: { bg: '#F6EFD8', fg: '#7A611A' },
    low:      { bg: '#E6EFE4', fg: '#3F6B3A' },
  };

  function buildSlopeSVG(cats, startDate, endDate) {
    const W = 1660, H = 620;
    const xL = 620, xR = 1270, top = 84, plotH = 470;
    // dynamic ceiling: keep all three band lines visible, trim dead headroom
    const maxVal = Math.max(...cats.map((c) => c.intake), 0);
    const yMax = Math.max(80, Math.min(100, Math.ceil((maxVal + 8) / 10) * 10));
    const y = (pct) => top + ((yMax - Math.min(yMax, Math.max(0, pct))) / yMax) * plotH;
    const FF = 'Public Sans, Inter, system-ui, sans-serif';
    const FD = 'Castoro, Iowan Old Style, Palatino Linotype, Georgia, serif';
    const shortDate = (d) => (d || '').replace(/,\s*\d{4}$/, '').toUpperCase();
    const txt = (x, yy, str, size, weight, fill, anchor, ls = 0, opacity = 1, family = FF) =>
      `<text x="${x}" y="${yy}" font-family="${family}" font-size="${size}" font-weight="${weight}"` +
      ` fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls}" fill-opacity="${opacity}">${str}</text>`;
    const chip = (x, yy, bandKey, label, ghost) => {
      const w = label.length * 8.6 + 26;
      const st = CHIP_STYLE[bandKey];
      const body = ghost
        ? `<rect x="${x}" y="${yy - 13}" width="${w}" height="26" rx="13" fill="none" stroke="#F4EFE4" stroke-opacity="0.35"/>` +
          txt(x + w / 2, yy + 4.5, label, 12, 700, '#F4EFE4', 'middle', 1.2, 0.7)
        : `<rect x="${x}" y="${yy - 13}" width="${w}" height="26" rx="13" fill="${st.bg}"/>` +
          txt(x + w / 2, yy + 4.5, label, 12, 700, st.fg, 'middle', 1.2);
      return { markup: body, width: w };
    };

    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Category severity, intake versus today">`;
    svg += `<defs>` +
      `<linearGradient id="slBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2C4E25"/><stop offset="1" stop-color="#1C3118"/></linearGradient>` +
      `<linearGradient id="slSev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C05A3C" stop-opacity="0.08"/><stop offset="1" stop-color="#C05A3C" stop-opacity="0"/></linearGradient>` +
      `</defs>`;
    svg += `<rect width="${W}" height="${H}" fill="url(#slBg)"/>`;
    // faint severity wash over the upper (worse) region of the plot
    svg += `<rect x="56" y="${top}" width="${W - 112}" height="${Math.max(0, y(20) - top)}" fill="url(#slSev)"/>`;

    // in-card title + dated column headers + guides
    svg += `<g class="sl-lab" style="--d:0.05s">` +
      txt(56, 50, 'SHARE OF CATEGORY SYMPTOMS FLAGGED', 12.5, 700, '#87A482', 'start', 2) + '</g>';
    svg += txt(xL, 50, `INTAKE<tspan fill="#87A482" font-weight="600" letter-spacing="1.6"> · ${shortDate(startDate)}</tspan>`, 15, 700, '#F4EFE4', 'middle', 2.5, 0.85);
    svg += txt(xR, 50, `TODAY<tspan fill="#87A482" font-weight="600" letter-spacing="1.6"> · ${shortDate(endDate)}</tspan>`, 15, 700, '#F4EFE4', 'middle', 2.5, 0.85);
    svg += `<line x1="${xL}" y1="${top - 18}" x2="${xL}" y2="${top + plotH + 18}" stroke="#ffffff" stroke-opacity="0.08"/>`;
    svg += `<line x1="${xR}" y1="${top - 18}" x2="${xR}" y2="${top + plotH + 18}" stroke="#ffffff" stroke-opacity="0.16"/>`;

    // severity band guides
    [[60, 'HIGH'], [40, 'MOD-HIGH'], [20, 'MODERATE']].forEach(([pct, label], bi) => {
      svg += `<g class="sl-lab" style="--d:${0.1 + bi * 0.08}s">` +
        `<line x1="56" y1="${y(pct)}" x2="${W - 56}" y2="${y(pct)}" stroke="#ffffff" stroke-opacity="0.10" stroke-dasharray="3 7"/>` +
        txt(56, y(pct) - 8, `${label} · ${pct}%`, 11, 700, '#87A482', 'start', 1.8, 0.75) + '</g>';
    });
    svg += `<g class="sl-lab" style="--d:0.34s">` + txt(56, y(0) - 8, 'LOW', 11, 700, '#87A482', 'start', 1.8, 0.55) + '</g>';

    // greedy de-overlap per side so clustered values stay legible
    const spread = (entries) => {
      const MIN = 34;
      const sorted = entries.slice().sort((a, b) => a.y - b.y);
      let prev = -Infinity;
      sorted.forEach((e) => { e.ly = Math.max(e.y, prev + MIN); prev = e.ly; });
      const over = sorted.length ? sorted[sorted.length - 1].ly - (top + plotH + 10) : 0;
      if (over > 0) {
        sorted.forEach((e) => { e.ly -= over; });
        for (let i = sorted.length - 2; i >= 0; i--) {
          sorted[i].ly = Math.min(sorted[i].ly, sorted[i + 1].ly - MIN);
        }
      }
      return entries;
    };
    const left = spread(cats.map((c, i) => ({ y: y(c.intake), c, i })));
    const right = spread(cats.map((c, i) => ({ y: y(c.final), c, i })));

    // slopes + endpoint dots, staggered
    cats.forEach((c, i) => {
      const col = CAT_COLORS[i % CAT_COLORS.length];
      const d0 = 0.25 + i * 0.14;
      const y1 = y(c.intake), y2 = y(c.final);
      const xm = (xL + xR) / 2;
      svg += `<path class="sl-path" pathLength="1" style="--d:${d0}s"` +
        ` d="M ${xL} ${y1} C ${xm} ${y1} ${xm} ${y2} ${xR} ${y2}"` +
        ` stroke="${col}" stroke-width="2.5" stroke-opacity="0.85" fill="none"/>`;
      svg += `<circle class="sl-dot" style="--d:${d0}s" cx="${xL}" cy="${y1}" r="7" fill="#2C4E25" stroke="${col}" stroke-width="3"/>`;
      svg += `<circle class="sl-dot" style="--d:${d0 + 0.85}s" cx="${xR}" cy="${y2}" r="14" fill="${col}" fill-opacity="0.16"/>`;
      svg += `<circle class="sl-dot" style="--d:${d0 + 0.85}s" cx="${xR}" cy="${y2}" r="8" fill="${col}"/>`;
    });

    // left: category name · intake% (+ leader tick when displaced)
    left.forEach((e) => {
      const d0 = 0.25 + e.i * 0.14;
      svg += `<g class="sl-lab" style="--d:${d0}s">`;
      if (Math.abs(e.ly - e.y) > 5) {
        svg += `<line x1="${xL - 30}" y1="${e.ly - 5}" x2="${xL - 12}" y2="${e.y}" stroke="#ffffff" stroke-opacity="0.25"/>`;
      }
      svg += txt(xL - 38, e.ly + 3, `${e.c.name}<tspan font-family="${FF}" font-size="17" font-weight="700" fill="#87A482" letter-spacing="0.5"> · ${Math.round(e.c.intake)}%</tspan>`, 24, 400, '#F4EFE4', 'end', -0.4, 1, FD);
      svg += '</g>';
    });

    // right: final% + band transition chips (was → is)
    right.forEach((e) => {
      const d0 = 0.25 + e.i * 0.14 + 0.9;
      const bi = sevBand(e.c.intake), bf = sevBand(e.c.final);
      svg += `<g class="sl-lab" style="--d:${d0}s">`;
      if (Math.abs(e.ly - e.y) > 5) {
        svg += `<line x1="${xR + 12}" y1="${e.y}" x2="${xR + 30}" y2="${e.ly - 5}" stroke="#ffffff" stroke-opacity="0.25"/>`;
      }
      let x = xR + 38;
      svg += txt(x, e.ly + 2, `${Math.round(e.c.final)}%`, 21, 700, '#F4EFE4', 'start');
      x += 62;
      const from = chip(x, e.ly - 2, bi.key, bi.label.toUpperCase(), true);
      svg += from.markup;
      x += from.width + 12;
      svg += txt(x, e.ly + 3, '→', 15, 400, '#87A482', 'start');
      x += 24;
      svg += chip(x, e.ly - 2, bf.key, bf.label.toUpperCase(), false).markup;
      svg += '</g>';
    });

    return svg + '</svg>';
  }

  /* Year Orbit (slide 8) — the membership year as a self-drawing ring:
     twelve months, three visit nodes, a "today" marker at graduation. */
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function buildYearOrbitSVG(s) {
    const cx = 370, cy = 340, R = 224;
    const FF = 'Public Sans, Inter, system-ui, sans-serif';
    const FD = 'Castoro, Iowan Old Style, Palatino Linotype, Georgia, serif';
    const A = (f) => (f * 360 - 90) * Math.PI / 180;
    const pt = (f, r) => [cx + r * Math.cos(A(f)), cy + r * Math.sin(A(f))];
    const startM = Number(s.end.slice(5, 7)) - 1;
    const txt = (x, y, str, size, weight, fill, anchor, ls = 0, family = FF, extra = '') =>
      `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${family}" font-size="${size}" font-weight="${weight}"` +
      ` fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls}"${extra}>${str}</text>`;

    let svg = `<svg viewBox="0 0 740 660" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Your membership year — three visits">`;

    // the ring (hair-open full circle so the dash draw runs clockwise from top)
    svg += `<path class="yo-ring" pathLength="1" d="M 370 116 A 224 224 0 1 1 369.99 116" fill="none" stroke="#DFD7CA" stroke-width="1.6"/>`;

    // month ticks + labels (skip the two label slots adjacent to the top seam)
    for (let i = 0; i < 12; i++) {
      const [x1, y1] = pt(i / 12, R), [x2, y2] = pt(i / 12, R + 9);
      svg += `<g class="yo-lab" style="--d:${(0.5 + i * 0.05).toFixed(2)}s">` +
        `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#DFD7CA" stroke-width="1.5"/>`;
      if (i >= 1 && i <= 10) {
        const [lx, ly] = pt((i + 0.5) / 12, R + 30);
        svg += txt(lx, ly + 4, MONTHS[(startM + i) % 12], 12.5, 700, '#76736D', 'middle', 1.8);
      }
      svg += '</g>';
    }

    // visit nodes (fracs chosen for label clearance; the copy carries true timing)
    const node = (f, d) => {
      const [x, y] = pt(f, R);
      return { x, y, markup: `<g class="yo-node" style="--d:${d}s">` +
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="17" fill="#87A482" fill-opacity="0.22"/>` +
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10" fill="#2C4E25"/></g>` };
    };
    const n1 = node(0.07, 0.8), n2 = node(0.50, 1.35), n3 = node(0.96, 1.9);
    svg += n1.markup + n2.markup + n3.markup;

    // node labels with leader ticks
    const transMeta = s.heldSlot ? 'WEEKS 1–3 · HELD FOR YOU' : 'WEEKS 1–3 · 30 MIN';
    svg += `<g class="yo-lab" style="--d:0.95s">` +
      `<line x1="${(n1.x + 14).toFixed(1)}" y1="${(n1.y - 9).toFixed(1)}" x2="497" y2="117" stroke="#DFD7CA" stroke-width="1.2"/>` +
      txt(505, 112, 'Transition Visit', 25, 400, '#2C4E25', 'start', 0, FD) +
      txt(505, 138, transMeta, 12, 700, '#76736D', 'start', 1.5) + '</g>';
    if (s.heldSlot) svg += `<circle class="yo-pulse" cx="${n1.x.toFixed(1)}" cy="${n1.y.toFixed(1)}" r="16" stroke="#C05A3C" stroke-width="1.5" fill="none"/>`;
    svg += `<g class="yo-lab" style="--d:1.5s">` +
      txt(370, 604, 'Mid-Year Review', 25, 400, '#2C4E25', 'middle', 0, FD) +
      txt(370, 628, 'NP · SYMPTOMS, LABS, DOSE CHECK', 12, 700, '#76736D', 'middle', 1.5) + '</g>';
    svg += `<g class="yo-lab" style="--d:2.05s">` +
      `<line x1="${(n3.x - 14).toFixed(1)}" y1="${(n3.y - 9).toFixed(1)}" x2="282" y2="117" stroke="#DFD7CA" stroke-width="1.2"/>` +
      txt(274, 112, 'Annual Optimization', 25, 400, '#2C4E25', 'end', 0, FD) +
      txt(274, 138, 'NP · FULL REVIEW · 45 MIN', 12, 700, '#76736D', 'end', 1.5) + '</g>';

    // you-are-here at the top seam
    svg += `<circle class="yo-here" style="--d:2.2s" cx="370" cy="116" r="7" fill="#C05A3C"/>`;
    svg += `<circle class="yo-pulse" cx="370" cy="116" r="12" stroke="#C05A3C" stroke-width="1.3" fill="none"/>`;
    svg += `<g class="yo-lab" style="--d:2.3s">` + txt(370, 66, 'TODAY · GRADUATION', 12, 700, '#C05A3C', 'middle', 2) + '</g>';

    // center block
    svg += `<g class="yo-lab" style="--d:.4s">` + txt(370, cy - 58, 'YOUR OPTIMAL YEAR', 12.5, 700, '#87A482', 'middle', 2.2) + '</g>';
    svg += `<g class="yo-lab" style="--d:.5s">` + txt(370, cy - 8, 'Twelve months,', 42, 400, '#2C4E25', 'middle', 0, FD) + '</g>';
    svg += `<g class="yo-lab" style="--d:.55s">` + txt(370, cy + 40, 'three visits.', 42, 400, '#2C4E25', 'middle', 0, FD, ' font-style="italic"') + '</g>';
    svg += `<g class="yo-lab" style="--d:.65s">` + txt(370, cy + 86, `BEGINS ${MONTHS_FULL[startM].toUpperCase()} ${s.end.slice(0, 4)}`, 12, 700, '#76736D', 'middle', 1.8) + '</g>';

    return svg + '</svg>';
  }

  function fillPageNumbers() {
    const pad2 = (n) => String(n).padStart(2, '0');
    const sections = $$('#deck > section');
    sections.forEach((sec, i) => {
      const el = sec.querySelector('.pagenum');
      if (el) el.textContent = `${pad2(i + 1)} / ${pad2(sections.length)}`;
    });
  }

  function renderDeck(s) {
    // ── merge fields ──
    bind('first_name', s.first);
    // the ring-word ellipse stretches unflatteringly past ~10 characters
    const nameEl = document.querySelector('.g1 h1 .italic');
    if (nameEl) nameEl.classList.toggle('ring-word', s.first.length <= 10);
    // minimal prep derives approximate dates — the eyebrow says "Complete"
    // rather than printing fabricated-precise ones
    bind('daterange', CONFIG.MINIMAL_PREP ? 'Complete' : fmtRange(s.start, s.end));
    bind('grad_year', s.end.slice(0, 4));
    bind('intake_quote', s.quote);
    bind('headline_win', s.win);
    bind('intake_flagged', String(s.intakeFlagged));
    // authoritative count-up target — never trust mid-animation textContent
    $$('.g2 [data-bind="intake_flagged"]').forEach((el) => { el.dataset.final = String(s.intakeFlagged); });
    bind('delta_from', String(s.intakeFlagged));
    bind('delta_to', String(s.finalFlagged));
    bind('deadline_date', fmtDate(s.deadline));
    bind('deadline_date2', fmtDate(s.deadline));
    bind('clinic_address', CONFIG.CLINIC.address);
    bind('clinic_email', CONFIG.CLINIC.email);
    bind('clinic_web', CONFIG.CLINIC.web);

    // §5.6 — prices always from constants; anchor is computed
    bind('ANNUAL', money(CONFIG.PRICE_ANNUAL));
    bind('ANNUAL_NUM', Number(CONFIG.PRICE_ANNUAL).toLocaleString('en-CA'));
    // authoritative count-up target — never trust mid-animation textContent
    $$('.g7 [data-bind="ANNUAL_NUM"]').forEach((el) => { el.dataset.final = String(CONFIG.PRICE_ANNUAL); });
    bind('ANNUAL2', money(CONFIG.PRICE_ANNUAL));
    bind('EARLY', money(CONFIG.PRICE_EARLY));
    bind('MEMBER_EXTRA', money(CONFIG.PRICE_MEMBER_EXTRA));
    bind('PRN30', money(CONFIG.PRICE_PRN30));
    bind('PRN45', money(CONFIG.PRICE_PRN45));
    bind('PRN_SUM', money(CONFIG.PRICE_PRN30 + CONFIG.PRICE_PRN45));
    bind('PRN30_B', money(CONFIG.PRICE_PRN30));
    // value stack: Transition (30 min) + Mid-Year (30 min) + Annual (45 min), all from CONFIG
    bind('STACK_SUM', money(CONFIG.PRICE_PRN30 * 2 + CONFIG.PRICE_PRN45));
    bind('DAY_RATE', '$' + (CONFIG.PRICE_ANNUAL / 365).toFixed(2));
    bind('WOMENS_MONTHLY', money(CONFIG.PRICE_WOMENS_MONTHLY));

    // §5.8 — identifying print footer on every page
    bind('print_foot', `${s.first} · ${fmtDate(todayIso())} · ${CONFIG.TEMPLATE_VERSION}`);

    // ── slides 2–4 (questionnaire-driven; skipped while the gate is off) ──
    if (CONFIG.QUESTIONNAIRE_SECTION) {
    // ── slide 2 ──
    bind('s2_eyebrow', 'Where you started');
    bindHTML('s2_display', s.thenTest
      ? 'Looking back to when you <span class="italic ring-word">started</span>.'
      : 'It started with <span class="italic ring-word">your words</span>.');
    bind('s2_attr', s.thenTest ? 'you, thinking back to the start' : 'you, at your first visit');
    bind('s2_statcap', s.thenTest ? 'Symptoms moderate or worse, looking back' : 'Symptoms moderate or worse');
    bind('s2_phototag', `${s.thenTest ? 'Thinking back' : 'First visit'} · ${fmtDate(s.start)}`);
    const waffle = $('.g2 .waffle');
    waffle.innerHTML = '';
    for (let i = 0; i < 54; i++) {
      const cell = document.createElement('i');
      if (i < s.intakeFlagged) cell.className = 'on';
      cell.style.setProperty('--i', i);
      waffle.appendChild(cell);
    }
    $('.g2 .waffle-cap').innerHTML =
      `<span class="sw on"></span><span><b>${s.intakeFlagged}</b> moderate or worse</span>` +
      `<span class="lgap"></span>` +
      `<span class="sw"></span><span><b>${54 - s.intakeFlagged}</b> milder or clear</span>`;
    const catwrap = $('.g2 .catlist-wrap');
    const catlist = $('.g2 .catlist');
    catlist.innerHTML = '';
    catwrap.querySelector('.cat-kicker')?.remove();
    if (!s.thenTest && s.categories.length) {
      const kicker = document.createElement('div');
      kicker.className = 'cat-kicker';
      kicker.textContent = 'Top categories at intake';
      catwrap.insertBefore(kicker, catlist);
      s.categories.forEach((c) => {
        const band = sevBand(c.intake);
        const li = document.createElement('li');
        li.innerHTML = `<span class="cname">${c.name}</span>
          <span class="cval"><span class="cpct">${Math.round(c.intake)}%</span><span class="g-sev ${band.key}">${band.label}</span></span>`;
        catlist.appendChild(li);
      });
    }

    // ── slide 3 (⭐ + §5.4 Modest variants) ──
    const modest = s.mode === 'modest';
    $('.g3').classList.toggle('modest', modest);
    bindHTML('s3_headline', modest
      ? 'Your progress — and <span class="italic">what&rsquo;s next</span>.'
      : 'Where you are <span class="italic ring-word">now</span>.');
    bind('ds_label', 'Symptoms moderate or worse');
    const winsUl = $('.g3 .wins');
    winsUl.innerHTML = '';
    const pipLeft = (r) => `calc(9px + (100% - 18px) * ${r / 5})`;
    s.wins.forEach((w, wi) => {
      const improved = w.final < w.intake;
      const li = document.createElement('li');
      li.className = improved ? '' : 'flat';   // worsened / unchanged render neutral grey
      li.style.setProperty('--d', `${0.15 + wi * 0.13}s`);
      const lo = Math.min(w.intake, w.final), hi = Math.max(w.intake, w.final);
      let track = '<span class="track"><span class="rail"></span>';
      if (hi > lo) {
        track += `<span class="span" style="left:${pipLeft(lo)}; width:calc((100% - 18px) * ${(hi - lo) / 5})"></span>`;
      }
      for (let r = 0; r <= 5; r++) {
        if (r === w.intake || r === w.final) continue;
        track += `<span class="pip" style="left:${pipLeft(r)}"></span>`;
      }
      if (w.intake !== w.final) track += `<span class="pip was" style="left:${pipLeft(w.intake)}"></span>`;
      track += `<span class="pip is" style="left:${pipLeft(w.final)}"></span></span>`;
      li.innerHTML = `<div class="scell">
          <span class="sname">${w.name}</span>
          <span class="move"><span class="from">${RATING_LABELS[w.intake]}</span><span class="arrow">→</span><span class="to">${RATING_LABELS[w.final]}</span></span>
        </div>
        ${track}`;
      winsUl.appendChild(li);
    });

    // ── slide 4 (auto-skip: then-test, or no category rows) ──
    const skipS4 = s.thenTest || s.categories.length === 0;
    const inDom = slideHormone.parentNode === deck;
    if (skipS4 && inDom) slideHormone.remove();
    if (!skipS4) {
      if (!inDom) deck.insertBefore(slideHormone, slideHormoneAnchor.nextSibling);
      $('.g4 .map-card').innerHTML = buildSlopeSVG(s.categories, fmtDate(s.start), fmtDate(s.end));
    }
    }  // end questionnaire gate

    const modestCopy = s.mode === 'modest';
    // ── slide 5 (§5.4 bridge) ──
    bind('s5_bridge', modestCopy
      ? 'Hormone care is iterative — the first 12 weeks tell us what to adjust next.'
      : 'Hormone needs shift through perimenopause, menopause, and beyond. The plan that works today gets adjusted over time.');

    // ── slide 6 (§5.5 bucket variant) ──
    $('#paths-standard').style.display = s.bucket === 'standard' ? '' : 'none';
    $('#paths-longevity').style.display = s.bucket === 'longevity' ? '' : 'none';

    // ── slide 8 (held slot + year orbit) ──
    const held = $('#held-slot-box');
    if (s.heldSlot) { bind('held_slot', fmtSlot(s.heldSlot)); held.classList.add('show'); }
    else held.classList.remove('show');
    $('.g8 .orbit').innerHTML = buildYearOrbitSVG(s);
  }

  /* ════════════════════════════════════════════════════════════════════
     View switching
     ════════════════════════════════════════════════════════════════════ */
  function showDeck() {
    fillPageNumbers();
    prep.hidden = true;
    navzones.hidden = false;
    deckUtils.hidden = false;
    surfaceUtils();   // visible immediately on entry, then fades on idle
    deck.classList.add('ready');
    window.__deckLocked = false;
    deck.goTo(0);
    // goTo(0) fires no slidechange when the deck is already at index 0,
    // so kick slide 1's entry animation manually.
    $$('#deck > section.play').forEach((sec) => sec.classList.remove('play'));
    const first = $('#deck > section.g1');
    if (first) { void first.offsetWidth; first.classList.add('play'); playBrandLogos(first); }
  }
  function showPrep() {
    window.__deckLocked = true;
    prep.hidden = false;
    navzones.hidden = true;
    deckUtils.hidden = true;
    deck.classList.remove('ready');
  }

  $('#btn-generate').addEventListener('click', () => {
    const s = collectAndValidate();
    if (!s) return;
    lastState = s;
    renderDeck(s);
    showDeck();
  });

  // Esc → back to the prep form (form state is preserved) — §5.3
  // (when fullscreen, Esc only exits fullscreen — the deck stays up)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && prep.hidden && !document.fullscreenElement) showPrep();
  });

  /* ── Deck utilities: fullscreen + export PDF (Foundation-deck pattern) ── */
  const fsFab = $('#fs-fab');
  const exportFab = $('#export-fab');

  fsFab.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    const fs = !!document.fullscreenElement;
    fsFab.querySelector('.ic-expand').hidden = fs;
    fsFab.querySelector('.ic-compress').hidden = !fs;
    fsFab.setAttribute('title', fs ? 'Exit fullscreen' : 'Fullscreen');
  });

  // Export = print → Save as PDF (one slide per page, identifying footer).
  // Title swap gives the saved file an identifiable name; restored right after.
  exportFab.addEventListener('click', () => {
    const prev = document.title;
    const who = lastState ? lastState.first : 'Patient';
    document.title = `Optimal Ongoing Care Deck — ${who} — ${todayIso()}`;
    const cleanup = () => { document.title = prev; window.removeEventListener('afterprint', cleanup); };
    window.addEventListener('afterprint', cleanup);
    setTimeout(() => window.print(), 60);
  });

  // Surface the utilities on deck entry and mouse activity; fade when idle.
  let utilsTimer;
  function surfaceUtils() {
    deckUtils.classList.add('avail');
    clearTimeout(utilsTimer);
    utilsTimer = setTimeout(() => deckUtils.classList.remove('avail'), 3400);
  }
  window.addEventListener('mousemove', () => {
    if (prep.hidden === false) return;
    surfaceUtils();
  }, { passive: true });

  // Desktop click zones: left ⅓ back, right ⅔ forward — §5.3
  navzones.querySelector('.nz-back').addEventListener('click', () => deck.prev());
  navzones.querySelector('.nz-fwd').addEventListener('click', () => deck.next());

  // Count the slide-2 stat up from 0, synced to the waffle cascade.
  let cuRaf = 0;
  function countUpG2() {
    const el = document.querySelector('.g2 [data-bind="intake_flagged"]');
    if (!el) return;
    const target = parseInt(el.dataset.final || el.textContent, 10) || 0;
    if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = String(target); return; }
    cancelAnimationFrame(cuRaf);
    const dur = Math.min(1100, target * 13 + 480);   // matches wfPop: i*13ms stagger + 180ms delay + 300ms pop
    const t0 = performance.now() + 180;               // start with the first cell
    const tick = (now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      el.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3)))); // ease-out cubic
      if (p < 1) cuRaf = requestAnimationFrame(tick); else el.textContent = String(target);
    };
    cuRaf = requestAnimationFrame(tick);
  }

  // Count the slide-7 annual price up from 0, synced to its .ar rise (--d:.16s).
  let cuRaf7 = 0;
  function countUpG7() {
    const el = document.querySelector('.g7 [data-bind="ANNUAL_NUM"]');
    if (!el) return;
    const target = parseInt(el.dataset.final || '0', 10) || 0;
    const fmt = (n) => Number(n).toLocaleString('en-CA');
    if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(target); return; }
    cancelAnimationFrame(cuRaf7);
    const dur = 900;                        // lands just after the riseIn settles
    const t0 = performance.now() + 160;     // starts the frame the .ar rise begins
    const tick = (now) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      el.textContent = fmt(Math.round(target * (1 - Math.pow(1 - p, 3)))); // ease-out cubic
      if (p < 1) cuRaf7 = requestAnimationFrame(tick); else el.textContent = fmt(target);
    };
    cuRaf7 = requestAnimationFrame(tick);
  }

  // The living brand mark replays with its slide.
  const playBrandLogos = (root) => root.querySelectorAll('optimal-logo').forEach((el) => {
    if (typeof el.play === 'function') el.play();
  });

  // Printing must never capture a mid-animation state the CSS blocks can't reach.
  window.addEventListener('beforeprint', () => {
    cancelAnimationFrame(cuRaf7); cancelAnimationFrame(cuRaf);
    const p7 = document.querySelector('.g7 [data-bind="ANNUAL_NUM"]');
    if (p7 && p7.dataset.final) p7.textContent = Number(p7.dataset.final).toLocaleString('en-CA');
    const p2 = document.querySelector('.g2 [data-bind="intake_flagged"]');
    if (p2 && p2.dataset.final) p2.textContent = p2.dataset.final;
    document.querySelectorAll('optimal-logo').forEach((el) => { if (typeof el.finish === 'function') el.finish(); });
  });

  // Replay entry animations each time a slide becomes active.
  deck.addEventListener('slidechange', (e) => {
    $$('#deck > section.play').forEach((sec) => sec.classList.remove('play'));
    const sec = e.detail.slide;
    if (sec && /(^| )g\d+( |$)/.test(sec.className)) {
      void sec.offsetWidth;  // restart CSS animations
      sec.classList.add('play');
      playBrandLogos(sec);
      if (sec.classList.contains('g2')) countUpG2();
      if (sec.classList.contains('g7')) countUpG7();
    }
  });

  /* init */
  setDefaults();
  applyThenTest();
})();
