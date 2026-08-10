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
    TEMPLATE_VERSION: 'grad-deck v1.5.0',
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
    if (isNaN(a) || isNaN(b)) { el.style.visibility = 'hidden'; return; }
    el.textContent = `${a} → ${b}`;
    el.classList.toggle('neutral', b >= a);
    el.style.visibility = 'visible';
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
    updateDeltaPreview(); updateWorsenWarning();
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
    const tt = fThenTest.checked;

    bad |= markInvalid(fFirst, $('#e-first'), !fFirst.value.trim());
    bad |= markInvalid(fStart, $('#e-start'), !fStart.value);
    const endBad = !fEnd.value || (fStart.value && fEnd.value <= fStart.value);
    bad |= markInvalid(fEnd, $('#e-end'), endBad);
    bad |= markInvalid(fQuote, $('#e-quote'), !fQuote.value.trim());
    bad |= markInvalid(fWin, $('#e-win'), !fWin.value.trim());
    bad |= markInvalid(fDeadline, $('#e-deadline'), !fDeadline.value || fDeadline.value < todayIso());

    const intVal = (el) => {
      const v = parseInt(el.value, 10);
      return el.value !== '' && Number.isInteger(v) && String(v) === el.value.trim() && v >= 0 && v <= 54 ? v : null;
    };
    const a = intVal(fIntakeFlagged), b = intVal(fFinalFlagged);
    bad |= markInvalid(fIntakeFlagged, $('#e-intake-flagged'), a === null);
    bad |= markInvalid(fFinalFlagged, $('#e-final-flagged'), b === null);

    // §5.1 worsening guard: Strong over worsening numbers requires explicit override
    let guardBlocked = false;
    if (a !== null && b !== null && b >= a && resultsMode() === 'strong' && !fOverride.checked) {
      guardBlocked = true;
      $('#worsen-warning').classList.add('show');
      $('#override-line').style.display = 'flex';
    }

    // category rows (hidden + skipped in then-test)
    const cats = [];
    if (!tt) {
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
    winDataRows().forEach((row) => {
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
    const winBad = wins.length < MIN_ROWS || wins.length > MAX_ROWS;
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
      start: fStart.value, end: fEnd.value,
      quote: fQuote.value.trim(),
      win: fWin.value.trim(),
      deadline: fDeadline.value,
      bucket: bucket(), mode: resultsMode(), thenTest: tt,
      heldSlot: fSlot.value || null,
      intakeFlagged: a, finalFlagged: b,
      categories: cats, wins,
    };
  }

  // clear invalid highlight as the operator fixes fields
  prep.addEventListener('input', (e) => {
    if (e.target.classList) e.target.classList.remove('invalid');
  });
  prep.addEventListener('change', (e) => {
    if (e.target.classList) e.target.classList.remove('invalid');
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

  function buildSlopeSVG(cats) {
    const W = 1660, H = 620;
    const xL = 620, xR = 1270, top = 84, plotH = 470;
    // dynamic ceiling: keep all three band lines visible, trim dead headroom
    const maxVal = Math.max(...cats.map((c) => c.intake), 0);
    const yMax = Math.max(80, Math.min(100, Math.ceil((maxVal + 8) / 10) * 10));
    const y = (pct) => top + ((yMax - Math.min(yMax, Math.max(0, pct))) / yMax) * plotH;
    const FF = 'Public Sans, Inter, system-ui, sans-serif';
    const txt = (x, yy, str, size, weight, fill, anchor, ls = 0, opacity = 1, extra = '') =>
      `<text x="${x}" y="${yy}" font-family="${FF}" font-size="${size}" font-weight="${weight}"` +
      ` fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls}" fill-opacity="${opacity}"${extra}>${str}</text>`;
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
    svg += `<rect width="${W}" height="${H}" fill="#2C4E25"/>`;

    // in-card title + column headers + guides
    svg += `<g class="sl-lab" style="--d:0.05s">` +
      txt(56, 50, 'SHARE OF CATEGORY SYMPTOMS FLAGGED', 12.5, 700, '#87A482', 'start', 2) + '</g>';
    svg += txt(xL, 50, 'INTAKE', 15, 700, '#F4EFE4', 'middle', 2.5, 0.85);
    svg += txt(xR, 50, 'TODAY', 15, 700, '#F4EFE4', 'middle', 2.5, 0.85);
    svg += `<line x1="${xL}" y1="${top - 18}" x2="${xL}" y2="${top + plotH + 18}" stroke="#ffffff" stroke-opacity="0.08"/>`;
    svg += `<line x1="${xR}" y1="${top - 18}" x2="${xR}" y2="${top + plotH + 18}" stroke="#ffffff" stroke-opacity="0.08"/>`;

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
      svg += txt(xL - 38, e.ly + 2, `${e.c.name} <tspan fill="#87A482" font-weight="700"> · ${Math.round(e.c.intake)}%</tspan>`, 21, 500, '#F4EFE4', 'end');
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
    bind('daterange', fmtRange(s.start, s.end));
    bind('grad_year', s.end.slice(0, 4));
    bind('intake_quote', s.quote);
    bind('headline_win', s.win);
    bind('intake_flagged', String(s.intakeFlagged));
    bind('delta_from', String(s.intakeFlagged));
    bind('delta_to', String(s.finalFlagged));
    bind('deadline_date', fmtDate(s.deadline));
    bind('deadline_date2', fmtDate(s.deadline));
    bind('clinic_address', CONFIG.CLINIC.address);
    bind('clinic_email', CONFIG.CLINIC.email);
    bind('clinic_web', CONFIG.CLINIC.web);

    // §5.6 — prices always from constants; anchor is computed
    bind('ANNUAL', money(CONFIG.PRICE_ANNUAL));
    bind('ANNUAL2', money(CONFIG.PRICE_ANNUAL));
    bind('EARLY', money(CONFIG.PRICE_EARLY));
    bind('MEMBER_EXTRA', money(CONFIG.PRICE_MEMBER_EXTRA));
    bind('PRN30', money(CONFIG.PRICE_PRN30));
    bind('PRN45', money(CONFIG.PRICE_PRN45));
    bind('PRN_SUM', money(CONFIG.PRICE_PRN30 + CONFIG.PRICE_PRN45));
    bind('WOMENS_MONTHLY', money(CONFIG.PRICE_WOMENS_MONTHLY));

    // §5.8 — identifying print footer on every page
    bind('print_foot', `${s.first} · ${fmtDate(todayIso())} · ${CONFIG.TEMPLATE_VERSION}`);

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
      $('.g4 .map-card').innerHTML = buildSlopeSVG(s.categories);
    }

    // ── slide 5 (§5.4 bridge) ──
    bind('s5_bridge', modest
      ? 'Hormone care is iterative — the first 12 weeks tell us what to adjust next.'
      : 'Hormone needs shift through perimenopause, menopause, and beyond. The plan that works today gets adjusted over time.');

    // ── slide 6 (§5.5 bucket variant) ──
    $('#paths-standard').style.display = s.bucket === 'standard' ? '' : 'none';
    $('#paths-longevity').style.display = s.bucket === 'longevity' ? '' : 'none';

    // ── slide 8 (held slot) ──
    const held = $('#held-slot-box');
    if (s.heldSlot) { bind('held_slot', fmtSlot(s.heldSlot)); held.classList.add('show'); }
    else held.classList.remove('show');
  }

  /* ════════════════════════════════════════════════════════════════════
     View switching
     ════════════════════════════════════════════════════════════════════ */
  function showDeck() {
    fillPageNumbers();
    prep.hidden = true;
    navzones.hidden = false;
    deck.classList.add('ready');
    window.__deckLocked = false;
    deck.goTo(0);
  }
  function showPrep() {
    window.__deckLocked = true;
    prep.hidden = false;
    navzones.hidden = true;
    deck.classList.remove('ready');
  }

  $('#btn-generate').addEventListener('click', () => {
    const s = collectAndValidate();
    if (!s) return;
    renderDeck(s);
    showDeck();
  });

  // Esc → back to the prep form (form state is preserved) — §5.3
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && prep.hidden) showPrep();
  });

  // Desktop click zones: left ⅓ back, right ⅔ forward — §5.3
  navzones.querySelector('.nz-back').addEventListener('click', () => deck.prev());
  navzones.querySelector('.nz-fwd').addEventListener('click', () => deck.next());

  // Replay infographic entry animations each time their slide becomes active.
  deck.addEventListener('slidechange', (e) => {
    $$('#deck > section.play').forEach((sec) => sec.classList.remove('play'));
    const sec = e.detail.slide;
    if (sec && /(^| )(g2|g3|g4)( |$)/.test(sec.className)) {
      void sec.offsetWidth;  // restart CSS animations
      sec.classList.add('play');
    }
  });

  /* init */
  setDefaults();
  applyThenTest();
})();
