/* Mode navigation and interactive Play. All game outcomes come from BJEngine. */
'use strict';
(() => {
  const M = BJModes, E = BJEngine, L = BJLab, R = BJRules;
  const $ = id => document.getElementById(id), clone = M.clone;
  const titles = { play: 'Play', learn: 'Learn', laboratory: 'Laboratory', simulator: 'Simulator' };
  const el = (tag, attrs = {}, text) => { const node = document.createElement(tag); for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value; else if (key === 'checked') node.checked = value; else if (key === 'value') node.value = value; else node.setAttribute(key, value);
  } if (text != null) node.textContent = text; return node; };
  const money = cents => (cents < 0 ? '−' : '') + '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = value => value == null || !Number.isFinite(value) ? '—' : (100 * value).toFixed(2) + '%';
  const button = (text, handler, primary = false) => { const b = el('button', { type: 'button', class: 'button' + (primary ? ' primary' : '') }, text); b.onclick = () => guarded(handler); return b; };
  const notice = (text, error = false) => { $('modeNotice').textContent = text || ''; $('modeNotice').style.color = error ? 'var(--negative)' : ''; };
  function guarded(handler) { try { const result = handler(); if (result?.catch) result.catch(error => notice(error.message, true)); } catch (error) { notice(error.message, true); } }
  const infoText = {
    play: 'Play a real finite-shoe blackjack session. Manual wagers and legal hand decisions use the same rules, bankroll accounting, counting, opponents, and bet models as Simulator. Hints are optional; this mode does not grade decisions as exercises.',
    learn: 'Guided Learning gives configurable assistance during real hands. Training / Drills isolates counting, strategy, deviations, and wagers. Progress is stored separately from Play and Simulator. Feedback timing controls when answers are disclosed.',
    laboratory: 'Test a frozen strategy over a seeded design of randomized environments. All parallel runs advance in synchronized batches and retain their own paths. Sessions within an environment are dependent for inference; environments sharing a shoe seed are grouped into a common cluster.',
    simulator: 'The original controlled simulator retains its complete Standard/Advanced rules, strategy, betting, counting, opponent, playback, export, and results controls. Settings and runtime are separate from the other modes.',
    counting: 'Running count sums the values of revealed cards only. Hi-Lo: 2–6 are +1; 7–9 are 0; tens and aces are −1. Hi-Opt I: 3–6 are +1, tens are −1, and other cards are 0. No counting gives zero. Hi-Lo deviation indices are not calibrated to Hi-Opt I. Display visibility never changes card counting or outcomes.',
    strategy: 'Built-in, rule-adjusted, custom-table, deviation, and composition-dependent strategies share one legal-action system. Double/split stakes require available funds. EV-optimal uses finite-composition Monte Carlo estimates, not an exact global solver. Custom decision rules apply in custom/deviation mode and fall back legally when an action is unavailable.',
    betting: 'All existing bet-sizing models are available through the shared rules editor. Flat, running/true-count, lookup, piecewise, percentile, mathematical functions, Kelly approximations, bankroll, risk, penetration, and EV-lookup strategies all obey the same table, spread, chip, and bankroll constraints. Kelly uses an estimated edge/variance and does not guarantee growth.',
    statistics: 'Profit is net of all wagers, including doubles, splits and insurance. Return on wager divides net profit by total exposure. Maximum drawdown is the largest peak-to-trough fractional bankroll decline. Play accuracy is shown only if analysis/hints are enabled; count accuracy is collected only when manual entry is elected.',
    inference: 'The edge is total profit divided by total wager. Intervals use independent environment clusters, merge shared-seed environments, and use a Student-t critical value (approaching the normal z critical value for large samples). Fewer than two independent clusters cannot support an interval. Zero-event ruin intervals retain a nonzero upper bound using a conservative cluster-proportion adjustment. Winning/Losing require the entire edge interval above/below zero; Strongly Winning/Losing require the nearer bound beyond ±1%; Approximately Neutral requires the whole interval within ±0.1%; otherwise results remain uncertain. Variance classes use per-round SD divided by mean opening wager (<1, <2, or ≥2); drawdown classes use mean maximum drawdown (<10%, <30%, or ≥30%). Robustness is an approximate between-environment dispersion after subtracting repeated-session sampling variance, and needs at least ten independent completed environments with repeated sessions. It is not a guarantee for untested rules. Live intervals are provisional, not an optional-stopping guarantee. Bootstrap-positive frequency is resampling stability, not a posterior probability that the true edge is positive.',
    fits: 'Every individual run is drawn. Average is the cohort mean at each round; ended cumulative paths are carried forward. LR is ordinary least-squares linear regression of that mean. GAM is a Gaussian identity-link additive model with a penalized cubic regression spline, fixed knots and user-selected penalty. SMA is a trailing average of the cohort mean. Long paths use an evenly spaced display grid while retaining all raw points. Overlays fit that grid; the SMA window counts plotted samples. Fits describe observed paths and do not predict future profit.',
    storage: 'Each mode keeps its own setup, presets and results. Presets copy settings, not active deals. Configurations can be sent between modes without changing an existing session. Larger Laboratory result sets use IndexedDB; browser storage may be unavailable or limited. Export completed results to retain an external copy.',
    feedback: 'Immediate assistance can reveal a recommendation before the decision. After decision, after hand, after round, and session-end feedback defer grading until the selected boundary. Beginner through Expert presets select assistance defaults; individual switches remain adjustable. Instruction never changes deals or game state.',
    drills: 'Drills use seeded questions, explicit legal actions, the selected rule set, actual Hi-Lo arithmetic, and shared bet sizing. Timeouts count as errors. Numerical answers use the configured tolerance; running counts must be exact. Fab 4 and surrender exercises explicitly assume late surrender. Accuracy is measured per answered question; average response time excludes paused time.',
  };
  function math(name) {
    const f = {
      counting: ['<mrow><msub><mi>RC</mi><mrow><mi>t</mi><mo>+</mo><mn>1</mn></mrow></msub><mo>=</mo><msub><mi>RC</mi><mi>t</mi></msub><mo>+</mo><mi>v</mi><mo>(</mo><msub><mi>c</mi><mi>t</mi></msub><mo>)</mo><mo>,</mo><mspace width="1em"/><mi>TC</mi><mo>=</mo><mfrac><mi>RC</mi><msub><mi>D</mi><mtext>remaining</mtext></msub></mfrac></mrow>', 'RC_{t+1}=RC_t+v(c_t),\\quad TC=\\frac{RC}{D_{\\mathrm{remaining}}}'],
      hilo: ['<mrow><mi>v</mi><mo>(</mo><mi>c</mi><mo>)</mo><mo>=</mo><mo>{</mo><mtable><mtr><mtd><mo>+</mo><mn>1</mn></mtd><mtd><mtext>2, 3, 4, 5, 6</mtext></mtd></mtr><mtr><mtd><mn>0</mn></mtd><mtd><mtext>7, 8, 9</mtext></mtd></mtr><mtr><mtd><mo>−</mo><mn>1</mn></mtd><mtd><mtext>10, J, Q, K, A</mtext></mtd></mtr></mtable></mrow>', 'v(c)=\\begin{cases}+1&c\\in\\{2,3,4,5,6\\}\\\\0&c\\in\\{7,8,9\\}\\\\-1&c\\in\\{10,J,Q,K,A\\}\\end{cases}'],
      statistics: ['<mrow><mi>ROI</mi><mo>=</mo><mfrac><mrow><mo>∑</mo><msub><mi>P</mi><mi>i</mi></msub></mrow><mrow><mo>∑</mo><msub><mi>W</mi><mi>i</mi></msub></mrow></mfrac><mo>,</mo><mspace width="1em"/><mi>DD</mi><mo>=</mo><munder><mi>max</mi><mi>t</mi></munder><mfrac><mrow><msub><mi>B</mi><mtext>peak,t</mtext></msub><mo>−</mo><msub><mi>B</mi><mi>t</mi></msub></mrow><msub><mi>B</mi><mtext>peak,t</mtext></msub></mfrac></mrow>', '\\mathrm{ROI}=\\frac{\\sum_iP_i}{\\sum_iW_i},\\quad DD=\\max_t\\frac{B_{\\mathrm{peak},t}-B_t}{B_{\\mathrm{peak},t}}'],
      inference: ['<mrow><mover><mi>x</mi><mo>¯</mo></mover><mo>±</mo><msub><mi>z</mi><mrow><mn>1</mn><mo>−</mo><mi>α</mi><mo>/</mo><mn>2</mn></mrow></msub><mfrac><mi>s</mi><msqrt><mi>n</mi></msqrt></mfrac><mo>,</mo><mspace width="1em"/><mi>R</mi><mo>±</mo><msub><mi>t</mi><mrow><mn>1</mn><mo>−</mo><mi>α</mi><mo>/</mo><mn>2</mn><mo>,</mo><mi>n</mi><mo>−</mo><mn>1</mn></mrow></msub><mfrac><msub><mi>s</mi><mrow><mi>P</mi><mo>−</mo><mi>R</mi><mi>W</mi></mrow></msub><mrow><msqrt><mi>n</mi></msqrt><mover><mi>W</mi><mo>¯</mo></mover></mrow></mfrac></mrow>', '\\bar{x}\\pm z_{1-\\alpha/2}\\frac{s}{\\sqrt{n}},\\quad R\\pm t_{1-\\alpha/2,n-1}\\frac{s_{P-RW}}{\\sqrt{n}\\bar W}'],
      fits: ['<mrow><msub><mi>y</mi><mi>i</mi></msub><mo>=</mo><msub><mi>β</mi><mn>0</mn></msub><mo>+</mo><mi>f</mi><mo>(</mo><msub><mi>t</mi><mi>i</mi></msub><mo>)</mo><mo>+</mo><msub><mi>ε</mi><mi>i</mi></msub><mo>,</mo><mspace width="1em"/><msub><mi>SMA</mi><mi>t</mi></msub><mo>=</mo><mfrac><mn>1</mn><mi>k</mi></mfrac><munderover><mo>∑</mo><mrow><mi>j</mi><mo>=</mo><mn>0</mn></mrow><mrow><mi>k</mi><mo>−</mo><mn>1</mn></mrow></munderover><msub><mi>y</mi><mrow><mi>t</mi><mo>−</mo><mi>j</mi></mrow></msub></mrow>', 'y_i=\\beta_0+f(t_i)+\\epsilon_i,\\quad SMA_t=\\frac1k\\sum_{j=0}^{k-1}y_{t-j}'],
      betting: ['<mrow><mi>B</mi><mo>=</mo><msub><mi>B</mi><mn>0</mn></msub><mi>max</mi><mo>(</mo><mn>1</mn><mo>,</mo><mi>TC</mi><mo>−</mo><mi>c</mi><mo>)</mo><mo>,</mo><mspace width="1em"/><msup><mi>f</mi><mo>*</mo></msup><mo>≈</mo><mfrac><mi>μ</mi><msup><mi>σ</mi><mn>2</mn></msup></mfrac></mrow>', 'B=B_0\\max(1,TC-c),\\quad f^*\\approx\\mu/\\sigma^2'],
    };
    const pair = f[name] || f.statistics; return RuleSettings.math(pair[0], pair[1]);
  }
  const dialog = el('dialog', { id: 'modeHelp', class: 'mode-help', 'aria-labelledby': 'modeHelpTitle' }); document.body.append(dialog);
  function help(title, text, category = 'statistics', options = null) {
    dialog.replaceChildren(el('h2', { id: 'modeHelpTitle' }, title), el('p', {}, text || infoText[category] || infoText.statistics));
    if (options) { const dl = el('dl'); for (const [value, label] of Object.entries(options)) dl.append(el('dt', {}, label), el('dd', {}, optionHelp(value, title))); dialog.append(dl); }
    const formula = el('div', { class: 'learn-math' }); formula.innerHTML = math(category); if (category === 'counting') formula.insertAdjacentHTML('beforeend', math('hilo')); dialog.append(formula);
    dialog.append(el('p', { class: 'mode-copy' }, category === 'inference' ? 'x̄ is the sample mean; α = 1 − confidence; s is the sample SD; n counts independent clusters; z/t are critical values. For the ratio, P is cluster profit, W cluster wager and R = ΣP/ΣW. This is sampling uncertainty, not a guarantee for the next session.' : category === 'counting' ? 'RC is running count, c is a newly exposed card, v is its tag, and D is decks remaining. Floor, truncation, nearest and unrounded conventions differ for negative values. The hidden hole card is excluded until reveal.' : 'Definitions and assumptions apply to the selected feature. Current settings are frozen when a new session or experiment starts.'));
    const details = el('details'); details.append(el('summary', {}, 'Assumptions and interpretation'), el('p', {}, infoText[category] || infoText.statistics)); dialog.append(details, button('Close', () => dialog.close(), true));
    if (!dialog.open) dialog.showModal();
  }
  function optionHelp(value, title) {
    const options = { manual: 'You enter the wager or choose a legal action.', automatic: 'The shared configured strategy makes this choice.',
      none: 'No rounding / no extra assistance, as named in this control.', floor: 'Round toward negative infinity: −1.2 becomes −2.', trunc: 'Discard the fractional part toward zero: −1.2 becomes −1.', round: 'Round to nearest; exact half ties go toward +∞.',
      fixed: 'Use one specified value for every environment.', choice: 'Sample from the allowed values with the specified relative weights.', uniform: 'Sample evenly across the supported numeric range.', normal: 'Sample a normal distribution truncated to the specified range.', logUniform: 'Sample evenly in logarithmic space; both endpoints must be positive.',
      stop: 'End this run when your player cannot meet the minimum.', rebuy: 'Restart with the original bankroll after bankruptcy; prior losses remain in total equity and rebuys are recorded.', unlimited: 'Allow negative balances. Minimum crossings are hypothetical bankruptcy indicators, not forced termination.',
      peek: 'American hole card with a blackjack peek before player decisions.', nopeek: 'Hole card is dealt, but blackjack is not checked before player decisions.', european: 'The second dealer card is drawn after player decisions.', S17: 'Dealer stands on soft 17.', H17: 'Dealer hits soft 17.',
      immediate: 'Assistance may be shown before the choice.', afterDecision: 'Grade after the chosen action.', afterHand: 'Hold feedback until that player hand ends.', afterRound: 'Hold feedback until the dealer and all players settle.', sessionEnd: 'Hold feedback until the session is finished.',
      hiLo: infoText.counting, hiOptI: infoText.counting, hidden: 'Hide the display without changing count state or decisions.', both: 'Show both running and true counts.', running: 'Show running count only.', true: 'Show true count only.',
    };
    return options[value] || (R.BETS[value] ? 'Shared wager model: ' + R.BETS[value] + '. Use All rules & strategy for its parameters, equation, limits, and assumptions.' : R.PLAYS[value] ? 'Shared playing policy: ' + R.PLAYS[value] + '. All actions remain subject to the selected rules and available funds.' : `${value}: ${title.toLowerCase()} uses this selected option. The section explanation describes its effect; settings are stored separately for this mode.`);
  }
  const info = (title, text, category = 'statistics', options) => { const b = el('button', { type: 'button', class: 'info-button mode-info', 'aria-label': 'About ' + title, 'aria-haspopup': 'dialog' }, 'ⓘ'); b.onclick = () => help(title, text, category, options); return b; };
  const heading = (tag, text, category = 'statistics', detail) => { const h = el(tag, { class: 'mode-heading', 'aria-label': text }, text); h.append(info(text, detail, category)); return h; };
  function field(label, type, value, handler, settings = {}) {
    const wrap = el('div', { class: 'field' }), id = settings.id || 'mode-field-' + Math.random().toString(36).slice(2);
    const row = el('div', { class: 'field-label' }), text = el('label', { for: id }, label);
    const input = el(type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input', { id, ...(type !== 'select' && type !== 'textarea' ? { type } : {}) });
    if (type === 'select') for (const [v, name] of Object.entries(settings.options || {})) input.append(el('option', { value: v }, name));
    if (type === 'checkbox') input.checked = !!value; else input.value = value ?? '';
    for (const key of ['min', 'max', 'step', 'placeholder']) if (settings[key] != null) input.setAttribute(key, settings[key]);
    if (settings.disabled) input.disabled = true;
    row.append(text, info(label, settings.help, settings.category || 'statistics', settings.options)); wrap.append(row, input);
    if (settings.note) wrap.append(el('small', {}, settings.note));
    input.onchange = () => guarded(() => { if (!input.checkValidity()) { input.reportValidity(); return; } handler(type === 'checkbox' ? input.checked : type === 'number' || type === 'range' ? Number(input.value) : input.value); });
    return wrap;
  }
  const panel = (title, category = 'statistics') => { const p = el('section', { class: 'card-panel' }), header = el('div', { class: 'panel-header' }); header.append(heading('h2', title, category)); const body = el('div', { class: 'mode-panel-body' }); p.append(header, body); p.body = body; return p; };
  function metric(parent, title, value, category = 'statistics') { const p = el('div', { class: 'stat' }); const h = el('div', { class: 'stat-label metric-help' }, title); h.append(info(title, null, category)); p.append(h, el('div', { class: 'stat-value' }, value)); parent.append(p); return p; }
  function renderCards(parent, cards, values = false, system = 'hiLo') { for (const c of cards) { const card = cardElement(c, !!c.hidden); if (values && !c.hidden) card.append(el('span', { class: 'card-count-value' }, (E.countValue(c, system) > 0 ? '+' : '') + E.countValue(c, system))); parent.append(card); } }
  function table(snapshot, cfg, prompt, values = false, countText = null, hideDecks = false) {
    const root = el('div', { class: 'live-table' }), title = el('div', { class: 'live-table-title' }); title.append(el('span', {}, 'BLACKJACK LAB'), el('span', {}, cfg.rules.dealer.mode + ' · ' + cfg.rules.payout.numerator / cfg.rules.payout.denominator + ' : 1')); root.append(title);
    const dealer = el('div', { class: 'game-dealer' }), cards = el('div', { class: 'cards' });
    dealer.append(el('div', {}, 'DEALER'), cards); renderCards(cards, snapshot?.dealer || [], values, cfg.countSystem);
    const publicCards = (snapshot?.dealer || []).filter(c => !c.hidden);
    dealer.append(el('small', {}, publicCards.length ? E.handValue(publicCards).total + (snapshot.holeHidden ? ' + ?' : '') : 'Waiting for the deal')); root.append(dealer);
    const grid = el('div', { class: 'game-player-grid' });
    for (const p of snapshot?.players || []) {
      const seat = el('div', { class: 'game-seat' + (p.seat === cfg.heroSeat ? ' hero' : '') }), top = el('div', { class: 'game-seat-title' });
      top.append(el('span', {}, p.seat === cfg.heroSeat ? 'YOUR SEAT' : 'PLAYER ' + (p.seat + 1)), el('span', {}, money(p.balance))); seat.append(top);
      if (p.satOut) seat.append(el('small', {}, 'Sitting out'));
      for (const [index, h] of p.hands.entries()) {
        const hand = el('div', { class: 'game-hand' + (prompt?.seat === p.seat && prompt.handIndex === index ? ' active-hand' : '') }), row = el('div', { class: 'cards' });
        renderCards(row, h.cards, values, cfg.countSystem); hand.append(el('div', { class: 'game-hand-label' }, `Hand ${index + 1} · ${money(h.bet)}${h.status ? ' · ' + h.status : ''}`), row,
          el('div', { class: 'game-hand-label' }, h.cards.length ? `${E.handValue(h.cards).soft ? 'Soft ' : ''}${E.handValue(h.cards).total}` : '')); seat.append(hand);
      }
      grid.append(seat);
    }
    root.append(grid);
    const footer = el('div', { class: 'game-table-footer' }), n = snapshot?.remaining ?? cfg.decks * 52;
    footer.append(el('span', {}, hideDecks ? 'Estimate decks from the shoe stack' : `${n} cards · ${(n / 52).toFixed(2)} decks left`), el('span', {}, hideDecks ? 'Remaining shoe: ▰'.slice(0, -1) + '▰'.repeat(Math.max(1, Math.round(n / (cfg.decks * 52) * 12))) + '▱'.repeat(Math.max(0, 12 - Math.round(n / (cfg.decks * 52) * 12))) : `${((1 - n / (cfg.decks * 52)) * 100).toFixed(1)}% dealt`), el('span', {}, countText || 'Count display hidden'), el('span', {}, 'Seed ' + cfg.seed)); root.append(footer); return root;
  }
  function chart(canvas, series, options = {}) {
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, devicePixelRatio || 1), w = rect.width, h = rect.height;
    canvas.width = w * dpr; canvas.height = h * dpr; const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
    const l = 58, r = 15, t = 12, b = 30; let min = 0, max = 0, maxX = 1;
    for (const s of series) for (const p of s.points) if (Number.isFinite(p.y)) { min = Math.min(min, p.y); max = Math.max(max, p.y); maxX = Math.max(maxX, p.x); }
    if (min === max) { max += 1; min -= 1; } const pad = (max - min) * .07; max += pad; min -= pad;
    const px = x => l + (w - l - r) * x / maxX, py = y => t + (h - t - b) * (max - y) / (max - min);
    ctx.font = '10px system-ui'; ctx.fillStyle = '#9da2a6'; ctx.textAlign = 'right';
    for (let i = 0; i < 4; i++) { const y = t + (h - t - b) * i / 3, value = max - (max - min) * i / 3; ctx.strokeStyle = '#34373a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(w - r, y); ctx.stroke(); ctx.fillText(options.unit === '%' ? (value * 100).toFixed(1) + '%' : value.toLocaleString('en-US', { maximumFractionDigits: 1 }), l - 6, y + 3); }
    for (const [index, s] of series.entries()) { ctx.beginPath(); ctx.strokeStyle = s.color || `hsl(${(index * 137.5) % 360} 40% 64%)`; ctx.globalAlpha = s.alpha ?? (series.length > 10 ? .5 : 1); ctx.lineWidth = s.width || 1; let started = false;
      for (const p of s.points) { if (!Number.isFinite(p.y)) continue; if (!started) ctx.moveTo(px(p.x), py(p.y)); else ctx.lineTo(px(p.x), py(p.y)); started = true; } ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = '#9da2a6'; ctx.textAlign = 'left'; ctx.fillText('0', l, h - 9); ctx.textAlign = 'right'; ctx.fillText(Math.round(maxX) + ' rounds', w - r, h - 9);
    if (!series.some(s => s.points.length > 1)) { ctx.textAlign = 'center'; ctx.fillText('Paths appear as real hands settle', w / 2, h / 2); }
    canvas.onpointermove = event => {
      const x = Math.max(0, Math.min(maxX, (event.offsetX - l) / (w - l - r) * maxX));
      const values = series.map(s => { const point = s.points.reduce((a, p) => !a || Math.abs(p.x - x) < Math.abs(a.x - x) ? p : a, null); return point ? `${s.label}: ${options.unit === '%' ? pct(point.y) : point.y.toFixed(2)}` : ''; }).filter(Boolean);
      if (options.caption) options.caption.textContent = `Round ${Math.round(x)} · ` + values.slice(-7).join(' · ');
    };
    canvas.onclick = event => { if (!options.select) return; const x = (event.offsetX - l) / (w - l - r) * maxX, y = max - (event.offsetY - t) / (h - t - b) * (max - min); let best = null;
      for (const s of series) { if (s.overlay) continue; const p = s.points.reduce((a, q) => !a || Math.abs(q.x - x) < Math.abs(a.x - x) ? q : a, null); if (p && (!best || Math.abs(p.y - y) < best.distance)) best = { id: s.id, distance: Math.abs(p.y - y) }; }
      if (best) options.select(best.id);
    };
  }
  function bars(canvas, values, options = {}) {
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return; const dpr = Math.min(devicePixelRatio || 1, 2), w = rect.width, h = rect.height;
    canvas.width = w * dpr; canvas.height = h * dpr; const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); const peak = Math.max(1e-6, ...values.map(v => Math.abs(v.value))), bw = (w - 32) / Math.max(1, values.length), mid = values.some(v => v.value < 0) ? (h - 35) / 2 : h - 35;
    ctx.strokeStyle = '#555'; ctx.beginPath(); ctx.moveTo(16, mid); ctx.lineTo(w - 16, mid); ctx.stroke();
    values.forEach((v, i) => { const bh = v.value / peak * (values.some(x => x.value < 0) ? (h - 45) / 2 : h - 45); ctx.fillStyle = v.value >= 0 ? '#a5bfe5' : '#c98b98'; ctx.fillRect(17 + i * bw, Math.min(mid, mid - bh), Math.max(1, bw - 3), Math.abs(bh)); });
    ctx.fillStyle = '#9da2a6'; ctx.font = '10px system-ui'; ctx.fillText(values[0]?.label || '', 16, h - 10); ctx.textAlign = 'right'; ctx.fillText(values.at(-1)?.label || '', w - 16, h - 10);
    canvas.onpointermove = e => { const index = Math.floor((e.offsetX - 16) / bw), v = values[index]; if (v && options.caption) options.caption.textContent = `${v.label}: ${v.value.toFixed(4)}${v.ci ? ` · interval ${v.ci.map(x => x.toFixed(4)).join(' to ')}` : ''}`; };
    canvas.onclick = e => { const v = values[Math.floor((e.offsetX - 16) / bw)]; if (v && options.select) options.select(v); };
  }
  let storage; try { storage = localStorage; } catch { storage = { getItem: () => null, setItem: () => { throw Error('Storage unavailable'); } }; }
  const initial = RuleSettings.capture(), store = new M.ModeStore(storage, initial);
  for (const mode of M.MODES) try { store.mode(mode).envelope = RuleSettings.validateEnvelope(store.mode(mode).envelope); } catch { store.mode(mode).envelope = clone(initial); }
  let suppress = false, resetting = false, current = store.data.active, controllers = {}, savedSimFingerprint = '';
  function persist() { if (resetting) return; if (!store.save()) notice(store.error, true); }
  function syncEnvelope() { suppress = true; try { RuleSettings.applyEnvelope(store.mode().envelope); } finally { suppress = false; } persist(); }
  function updateEnvelope(handler) { const e = clone(store.mode().envelope); handler(e); RuleSettings.validateEnvelope(e); store.mode().envelope = e; syncEnvelope(); }
  function configuration(mode = current, newRun = false) {
    const m = store.mode(mode), c = M.config(m.envelope);
    if (newRun && String(m.envelope.fields.seed).trim() === '') c.seed = crypto.getRandomValues(new Uint32Array(1))[0];
    if (mode === 'play' || mode === 'learn') { c.sessions = 1; c.rounds = 100000; c.rules.limits.terminate = 'you'; const hero = c.seats.find(p => p.seat === c.heroSeat); hero.active = true; }
    return c;
  }
  function setup(mode, parent) {
    const m = store.mode(mode), e = m.envelope, f = e.fields, options = m.options;
    parent.append(heading('h2', titles[mode] + ' setup', mode), el('p', { class: 'mode-copy' }, 'Changes apply to the next session. All rules and strategy models are shared.'));
    const fields = el('div', { class: 'setup-fields' }); parent.append(fields);
    const root = (key, label, type, settings = {}) => fields.append(field(label, type, f[key], value => updateEnvelope(e => {
      if (key === 'heroSeat') { const n = e.seats.filter(s => s.active && s.seat !== +e.fields.heroSeat).length; e.seats = M.seats(n, '', +value); }
      e.fields[key] = type === 'checkbox' ? value : String(value);
      if (key === 'starting') for (const seat of e.seats) seat.amount = '';
    }), { id: mode + '-' + key, ...settings }));
    fields.append(heading('h3', 'Shoe & table', 'counting'));
    root('decks', 'Decks', 'number', { min: 1, max: 8, step: 1 }); root('penetration', 'Penetration %', 'number', { min: 20, max: 95, step: .1, category: 'counting' });
    const rule = (group, key, label, opts) => fields.append(field(label, 'select', e.rules[group][key], value => updateEnvelope(e => e.rules[group][key] = value), { id: `${mode}-${group}-${key}`, options: opts, category: 'strategy' }));
    rule('dealer', 'mode', 'Dealer soft 17', { S17: 'Stand (S17)', H17: 'Hit (H17)', custom: 'Custom thresholds' });
    fields.append(field('Blackjack payout', 'select', String(e.rules.payout.numerator / e.rules.payout.denominator), value => updateEnvelope(e => e.rules.payout = { numerator: Number(value) * 100, denominator: 100 }), { options: { 1: '1 : 1', 1.2: '6 : 5', 1.5: '3 : 2', 2: '2 : 1', ...(![1, 1.2, 1.5, 2].includes(e.rules.payout.numerator / e.rules.payout.denominator) ? { [String(e.rules.payout.numerator / e.rules.payout.denominator)]: `${e.rules.payout.numerator / e.rules.payout.denominator} : 1` } : {}) }, category: 'strategy' }));
    fields.append(heading('h3', 'Bankroll & players', 'betting'));
    root('starting', 'Starting bankroll $', 'number', { min: 1, max: 100000000, step: 1 }); root('baseBet', 'Base wager $', 'number', { min: 1, max: 1000000, step: 1, category: 'betting' }); root('minBet', 'Table minimum $', 'number', { min: 1, max: 1000000, step: 1 });
    fields.append(field('Table maximum $', 'number', e.rules.limits.tableMax, value => updateEnvelope(e => e.rules.limits.tableMax = value), { min: 1, max: 100000000, step: 1, category: 'betting' }));
    root('finite', 'Enforce bankroll limits', 'checkbox', { category: 'betting' });
    fields.append(field('Number of opponents', 'number', e.seats.filter(s => s.active && s.seat !== +f.heroSeat).length, value => updateEnvelope(e => e.seats = M.seats(value, '', +f.heroSeat)), { id: mode + '-opponents', min: 0, max: 4, step: 1, category: 'strategy' }));
    root('heroSeat', 'Your seating position', 'select', { options: { 0: 'First seat', 1: 'Second seat', 2: 'Center seat', 3: 'Fourth seat', 4: 'Last seat' } });
    rule('opponents', 'skill', 'Opponent skill', R.SKILLS); rule('opponents', 'bet', 'Opponent betting', R.OPPBETS);
    fields.append(heading('h3', 'Strategy & counting', 'strategy'));
    rule('play', 'mode', 'Playing strategy', R.PLAYS); rule('bet', 'mode', 'Bet sizing strategy', R.BETS);
    root('countSystem', 'Count system', 'select', { options: { hiLo: 'Hi-Lo', hiOptI: 'Hi-Opt I', none: 'No counting' }, category: 'counting' });
    fields.append(field('Count display', 'select', options.countVisibility, value => { options.countVisibility = value; persist(); controllers[mode]?.refresh?.(); }, { id: mode + '-countVisibility', options: { hidden: 'Hidden', running: 'Running count', true: 'True count', both: 'Running & true' }, category: 'counting' }));
    fields.append(field('Game speed', 'select', options.speed, value => { options.speed = Number(value); persist(); }, { id: mode + '-speed', options: { 1: '1×', 2: '2×', 5: '5×', 10: '10×', 25: '25×' }, help: 'Changes animation delay only. Every card and action is retained and the seeded game is unchanged.' }));
    root('seed', 'Random seed', 'number', { min: 0, max: 4294967295, step: 1, placeholder: 'Blank = fresh seed' });
    fields.append(button('All rules & strategy', () => RuleSettings.open()));
    return fields;
  }
  function transferConfig(target, cfg = null) {
    if (!M.MODES.includes(target)) throw Error('Unknown target mode');
    let e = clone(store.mode().envelope);
    if (cfg) {
      e.rules = clone(cfg.rules); for (const key of ['decks', 'penetration', 'penetrationSigma', 'penetrationMode', 'minBet', 'baseBet', 'starting', 'seed', 'heroSeat', 'countSystem']) if (cfg[key] != null) e.fields[key] = String(cfg[key]);
      e.fields.finite = cfg.finite; e.seats = cfg.seats.map(p => ({ seat: p.seat, active: p.active, amount: p.amount }));
      e.fields.sessions = '1'; e.fields.rounds = String(cfg.rounds);
    }
    store.transfer(current, target, e); switchMode(target); notice('Configuration copied. Existing deals and completed results remain separate.');
  }
  function gameStats(parent, game, counts = []) {
    const s = game.stats, section = panel('Session statistics', 'statistics'), grid = el('div', { class: 'session-grid' });
    const decisions = game.analysis ? game.decisions : [], countAccuracy = counts.length ? counts.filter(x => x.correct).length / counts.length : null;
    for (const [name, value] of [['Rounds', s.rounds], ['Hands including splits', s.hands], ['Wins', s.wins], ['Losses', s.losses], ['Pushes', s.pushes], ['Blackjacks including pushes', s.blackjacks], ['Total wagered', money(s.wager)], ['Net result', money(s.profit)], ['Return on total wagered', pct(s.wager ? s.profit / s.wager : null)], ['Average opening wager', money(s.rounds ? s.openingWager / s.rounds : 0)], ['Largest opening wager', money(s.largestWager)], ['Maximum drawdown', pct(s.drawdown)], ['Basic-strategy accuracy', decisions.length ? pct(decisions.filter(x => x.correct).length / decisions.length) : game.analysis ? 'No decisions yet' : 'Analysis disabled'], ['Manual count accuracy', counts.length ? pct(countAccuracy) : 'No elected entries']]) {
      const row = el('div', { class: 'result-row' }); row.append(el('span', {}, name), el('strong', {}, value)); grid.append(row);
    }
    section.body.append(grid); parent.append(section);
    const plot = panel('Bankroll history', 'statistics'), wrap = el('div', { class: 'game-chart' }), canvas = el('canvas', { 'aria-label': 'Session bankroll history' }); wrap.append(canvas); plot.body.append(wrap); parent.append(plot);
    requestAnimationFrame(() => chart(canvas, [{ label: 'Bankroll $', points: s.path.map(p => ({ x: p.round, y: p.bankroll / 100 })), color: '#8fbea8' }]));
  }
  class PlayUI {
    constructor() { this.game = null; this.counts = []; this.timer = null; this.busy = false; }
    mount(root) {
      if (!this.game && store.mode('play').game) { try { this.game = M.InteractiveSession.restore(store.mode('play').game); this.counts = store.mode('play').game.counts || []; } catch (error) { notice('Could not restore Play: ' + error.message, true); } }
      const shell = el('div', { class: 'workspace-shell' }), side = el('aside', { class: 'mode-setup' }); this.content = el('main', { class: 'mode-content' }); shell.append(side, this.content); root.replaceChildren(shell);
      const fields = setup('play', side), opts = store.mode('play').options;
      fields.append(heading('h3', 'Your controls', 'play'));
      for (const [key, label, options] of [['betting', 'Betting control', { manual: 'Manual wager', automatic: 'Selected sizing strategy' }], ['playing', 'Playing control', { manual: 'Manual decisions', automatic: 'Selected playing strategy' }]])
        fields.append(field(label, 'select', opts[key], value => { opts[key] = value; persist(); this.refresh(); }, { id: 'play-' + key, options, category: key === 'betting' ? 'betting' : 'strategy' }));
      for (const [key, label] of [['hints', 'Basic-strategy hints'], ['recommendations', 'Selected-strategy recommendation'], ['analysis', 'Session decision analysis'], ['manualCounts', 'Enter counts manually']])
        fields.append(field(label, 'checkbox', opts[key], value => { opts[key] = value; persist(); this.refresh(); }, { id: 'play-' + key, category: key === 'manualCounts' ? 'counting' : 'strategy' }));
      this.refresh();
    }
    save() { if (this.game) store.mode('play').game = { ...this.game.dump(), counts: this.counts }; persist(); }
    refresh() {
      if (!this.content || current !== 'play') return;
      clearTimeout(this.timer); const opts = store.mode('play').options; this.content.replaceChildren();
      const header = el('div', { class: 'mode-head' }), copy = el('div'); copy.append(el('div', { class: 'mode-eyebrow' }, 'PLAY · YOUR DECISIONS'), heading('h1', 'Take your seat', 'play'), el('p', { class: 'mode-copy' }, 'A real table, your wager, your call. Optional hints stay optional.'));
      const controls = el('div', { class: 'mode-controls' }); controls.append(button(this.game ? 'New session' : 'Start session', () => {
        if (this.game && !this.game.ended && this.game.stats.rounds && !confirm('End this session and start a new one?')) return;
        this.pause(); const c = configuration('play', true); this.game = new M.InteractiveSession(c, opts.analysis || opts.hints); this.counts = []; this.game.startRound(); this.save(); this.refresh();
      }, true));
      if (this.game) controls.append(button('Finish session', () => { this.game.finish(); this.save(); this.refresh(); }), button('Export session', () => download('blackjack-play-session.json', { ...this.game.dump(), statistics: this.game.stats, decisions: this.game.decisions, manualCounts: this.counts })));
      header.append(copy, controls); this.content.append(header);
      if (!this.game) { this.content.append(table(null, configuration('play'), null)); return; }
      const g = this.game, metrics = el('div', { class: 'metrics' }); this.bankMetric = metric(metrics, 'Your bankroll', money(g.sim.players.find(p => p.seat === g.config.heroSeat).balance)); metric(metrics, 'Session result', money(g.stats.profit)); metric(metrics, 'Hands played', g.stats.hands); metric(metrics, 'Return on wager', pct(g.stats.wager ? g.stats.profit / g.stats.wager : null)); this.content.append(metrics);
      this.tableHost = el('div'); this.content.append(this.tableHost); this.renderSnapshot(g.snapshot || g.sim.snap(null));
      if (g.ended) {
        this.content.append(heading('h2', 'Session review', 'statistics')); gameStats(this.content, g, this.counts);
        if (g.analysis && g.decisions.some(d => !d.correct)) this.content.append(button('Train on these concepts in Learn', () => {
          const weak = [...new Set(g.decisions.filter(d => !d.correct).map(d => d.category))]; const m = store.mode('learn'); m.options.submode = 'drills'; m.options.drill.category = 'mixed'; m.options.drill.categories = weak; transferConfig('learn', g.config);
        }));
        return;
      }
      const bar = el('div', { class: 'game-action-bar', 'aria-label': 'Play actions' }); this.content.append(bar);
      const prompt = g.prompt;
      if (!prompt) {
        bar.append(el('p', { class: 'game-result' }, g.result?.voided ? 'Round refunded after shoe exhaustion.' : g.result?.noRound ? 'No affordable wager remains.' : `Round ${g.stats.rounds} settled · ${money(g.sim.lastResult?.seats.find(p => p.seat === g.config.heroSeat)?.profit || 0)}`), button('Next hand', () => { g.startRound(); this.save(); this.refresh(); }, true));
      } else if (prompt.kind === 'bet') {
        bar.append(heading('h3', 'Place your wager', 'betting'), el('p', {}, `Allowed range: $${prompt.minimum.toFixed(2)}–$${prompt.maximum.toFixed(2)} on the configured chip grid.`));
        const input = el('input', { id: 'play-wager', type: 'number', min: prompt.minimum, max: prompt.maximum, step: g.config.rules.limits.chip, value: prompt.suggested, 'aria-label': 'Your opening wager' });
        if (opts.betting === 'manual') bar.append(input, button('Deal', () => this.answer(Number(input.value)), true));
        else bar.append(el('p', {}, 'Selected strategy wager: ' + money(prompt.suggested * 100)), button('Deal strategy wager', () => this.answer(prompt.suggested), true));
      } else if (prompt.kind === 'insurance') {
        bar.append(heading('h3', 'Insurance', 'betting'), el('p', {}, 'Dealer shows an ace. Insurance costs ' + money(prompt.cost) + ' and pays 2:1 if the dealer has blackjack.'));
        const yes = button('Take insurance', () => this.answer(true)); yes.disabled = !prompt.affordable; bar.append(yes, button('Decline', () => this.answer(false), true));
      } else {
        bar.append(heading('h3', 'Your decision · hand ' + (prompt.handIndex + 1), 'strategy'));
        const row = el('div', { class: 'mode-controls' });
        for (const action of R.ACTIONS) { const b = button(action[0].toUpperCase() + action.slice(1), () => this.answer(action), action === 'hit' || action === 'stand'); b.dataset.action = action; b.disabled = !prompt.actions.includes(action); row.append(b); }
        bar.append(row);
        if (opts.hints || opts.recommendations) {
          const rec = M.advise(prompt, g.sim, opts.recommendations), hint = el('div', { class: 'hint-box' }, `${opts.recommendations ? 'Selected strategy' : 'Rule-adjusted basic'}: ${rec.action}. ${rec.explanation}`); bar.append(hint);
        }
        if (opts.playing === 'automatic') {
          row.querySelectorAll('button').forEach(b => b.disabled = true);
          this.timer = setTimeout(() => { if (current === 'play' && g === this.game) guarded(() => this.answer(M.advise(prompt, g.sim, true).action)); }, 650 / opts.speed);
        }
      }
      if (opts.manualCounts && prompt) {
        const form = el('div', { class: 'count-entry' }), input = el('input', { type: 'number', 'aria-label': 'Your running count', placeholder: 'Your RC' });
        form.append(input, button('Record running count', () => { if (input.value === '' || !Number.isFinite(+input.value)) throw Error('Enter a numeric count.'); this.counts.push({ response: +input.value, expected: g.sim.count, correct: +input.value === g.sim.count, round: g.stats.rounds }); this.save(); notice('Count entry recorded for your session statistics.'); })); bar.append(form);
      }
      const mini = el('div'); gameStats(mini, g, opts.manualCounts ? this.counts : []); this.content.append(mini);
    }
    renderSnapshot(snapshot) {
      const g = this.game, opts = store.mode('play').options, rc = snapshot.count, tc = snapshot.remaining ? rc * 52 / snapshot.remaining : 0;
      const counts = opts.countVisibility === 'hidden' ? 'Count hidden' : (opts.countVisibility !== 'true' ? 'RC ' + rc : '') + (opts.countVisibility === 'both' ? ' · ' : '') + (opts.countVisibility !== 'running' ? 'TC ' + R.roundCount(tc, g.sim.rules.bet.tcRound).toFixed(2) : '');
      const player = snapshot.players.find(p => p.seat === g.config.heroSeat); if (player && this.bankMetric) this.bankMetric.querySelector('.stat-value').textContent = money(player.balance);
      this.tableHost.replaceChildren(table(snapshot, g.config, g.prompt, false, counts));
    }
    answer(value) {
      this.pause(); const g = this.game; g.answer(value); this.save(); const frames = g.frames; if (!frames.length) { this.refresh(); return; }
      if (frames.length && current === 'play') {
        this.busy = true; this.content.querySelectorAll('.game-action-bar button').forEach(b => b.disabled = true); let index = 0;
        const tick = () => { if (current !== 'play') return; if (index < frames.length) { this.renderSnapshot(frames[index++]); this.timer = setTimeout(tick, 400 / store.mode('play').options.speed); }
          else { this.busy = false; this.refresh(); } }; tick();
      }
    }
    pause() { clearTimeout(this.timer); this.busy = false; }
  }
  function download(name, data) { const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type: name.endsWith('.csv') ? 'text/csv' : 'application/json' }); const url = URL.createObjectURL(blob), a = el('a', { href: url, download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  const api = { el, button, field, panel, heading, info, help, math, metric, money, pct, notice, guarded, renderCards, table, chart, bars, store, setup, persist, configuration, updateEnvelope, transferConfig, download,
    summary(text, category = 'statistics') { const s = el('summary', {}, text); s.append(info(text, null, category)); return s; },
    get active() { return current; }, refresh: () => controllers[current]?.refresh?.() };
  window.BJWorkspace = api;
  controllers.play = new PlayUI(); controllers.learn = BJLearningUI.create(api); controllers.laboratory = BJLaboratoryUI.create(api);
  function toolbar() {
    const root = $('modeToolbar'), m = store.mode(); root.replaceChildren();
    const select = el('select', { id: 'modePreset', 'aria-label': 'Preset for this mode' }); select.append(el('option', { value: '' }, titles[current] + ' presets'));
    for (const name of Object.keys(m.presets)) select.append(el('option', { value: name }, name));
    const name = el('input', { id: 'modePresetName', placeholder: 'Preset name', maxlength: 80, 'aria-label': 'Mode preset name' });
    root.append(el('label', {}, 'Mode presets'), info('Mode presets', infoText.storage, 'storage'), select, name,
      button('Save', () => { m.envelope = RuleSettings.capture(); store.preset(name.value); toolbar(); notice('Preset saved for ' + titles[current] + '.'); }),
      button('Load', () => { store.loadPreset(select.value); syncEnvelope(); controllers[current]?.mount?.($('modeWorkspace')); toolbar(); }),
      button('Delete', () => { if (!select.value) throw Error('Choose a preset first.'); delete m.presets[select.value]; persist(); toolbar(); }));
    root.append(el('span', { class: 'toolbar-spacer' }));
    const target = el('select', { id: 'modeTransferTarget', 'aria-label': 'Configuration destination' });
    for (const mode of M.MODES) if (mode !== current) target.append(el('option', { value: mode }, titles[mode]));
    root.append(info('Move configurations', 'Copy the current rules, strategy, counting, bankroll and seats to another mode. In Laboratory, a selected environment can supply its realized configuration. This does not copy active game state.', 'storage'), target, button('Open configuration →', () => transferConfig(target.value, current === 'laboratory' ? controllers.laboratory.selectedConfig?.() : null)),
      button('Reset all modes', async () => { if (!confirm('Reset all mode settings, saved presets, sessions, and learning progress?')) return;
        resetting = true; controllers.play.pause(); controllers.learn.pause?.(); controllers.laboratory.stop?.(); await controllers.laboratory.clearSaved();
        for (const key of Object.keys(localStorage)) if (key.startsWith('blackjack.')) localStorage.removeItem(key);
        location.reload(); }));
  }
  function switchMode(mode) {
    if (!M.MODES.includes(mode)) return;
    const previous = current;
    if (previous === 'simulator') { SimulatorBridge.pauseForModeChange(); store.mode(previous).runtime = SimulatorBridge.capture(); }
    controllers[previous]?.pause?.(); store.mode(previous).envelope = RuleSettings.capture();
    current = mode; store.select(mode); document.body.dataset.mode = mode; suppress = true;
    try { RuleSettings.applyEnvelope(store.mode(mode).envelope); } finally { suppress = false; }
    $('simulatorWorkspace').hidden = mode !== 'simulator'; $('modeWorkspace').hidden = mode === 'simulator';
    for (const b of document.querySelectorAll('.mode-tab')) { b.setAttribute('aria-selected', b.dataset.mode === mode); b.tabIndex = b.dataset.mode === mode ? 0 : -1; }
    if (mode === 'simulator') { if (store.mode(mode).runtime) guarded(() => SimulatorBridge.restore(store.mode(mode).runtime)); else SimulatorBridge.refresh(); }
    else controllers[mode].mount($('modeWorkspace'));
    toolbar(); persist(); requestAnimationFrame(enhanceInfo);
  }
  function enhanceInfo() {
    for (const h of document.querySelectorAll('#simulatorWorkspace .panel-title, #simulatorWorkspace .stat-label, #simulatorWorkspace .side-title, #simulatorWorkspace summary'))
      if (!h.querySelector('.info-button')) h.append(info(h.textContent.trim(), null, h.textContent.toLowerCase().match(/count|shoe/) ? 'counting' : 'statistics'));
    for (const label of document.querySelectorAll('#simulatorWorkspace label[for]')) {
      const parent = label.closest('.field-label') || label.parentElement;
      if (parent.querySelector('.info-button')) continue;
      const input = $(label.htmlFor); const title = label.textContent.trim();
      parent.append(info(title, input?.type === 'number' ? `${title}: enter a finite value within the displayed bounds. ${input.min ? 'Minimum ' + input.min + '. ' : ''}${input.max ? 'Maximum ' + input.max + '. ' : ''}Simulator changes apply to the next run.` : null, /count/i.test(title) ? 'counting' : 'statistics', input?.tagName === 'SELECT' ? Object.fromEntries([...input.options].map(o => [o.value, o.textContent])) : null));
    }
  }
  const nav = $('modeNavigation'); nav.setAttribute('role', 'tablist');
  for (const mode of M.MODES) {
    const wrap = el('div', { class: 'mode-choice', role: 'presentation' }), tab = el('button', { type: 'button', class: 'mode-tab', role: 'tab', 'aria-selected': mode === current, 'aria-controls': mode === 'simulator' ? 'simulatorWorkspace' : 'modeWorkspace', 'data-mode': mode }, titles[mode]);
    tab.onclick = () => guarded(() => switchMode(mode)); wrap.append(tab, info(titles[mode], infoText[mode], mode === 'laboratory' ? 'inference' : mode === 'learn' ? 'counting' : 'statistics')); nav.append(wrap);
  }
  nav.onkeydown = e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); const tabs = [...nav.querySelectorAll('[role=tab]')], index = tabs.indexOf(document.activeElement); const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; next.click(); next.focus(); };
  window.addEventListener('blackjack-settings-saved', () => { if (suppress) return; store.mode().envelope = RuleSettings.capture(); persist(); });
  $('advancedDialog').addEventListener('close', () => { if (current !== 'simulator') controllers[current].mount($('modeWorkspace')); });
  window.addEventListener('resize', () => controllers[current]?.refreshCharts?.());
  window.addEventListener('beforeunload', () => { if (resetting) return; controllers.play.save(); controllers.learn.save?.(); if (current === 'simulator') store.mode('simulator').runtime = SimulatorBridge.capture(); store.save(); });
  setInterval(() => { if (!resetting && current === 'simulator') { const value = SimulatorBridge.capture(), fingerprint = value ? value.state + ':' + value.simulation.state.stats.rounds + ':' + value.changed : ''; if (fingerprint !== savedSimFingerprint) { savedSimFingerprint = fingerprint; store.mode('simulator').runtime = value; store.save(); } } }, 1000);
  switchMode(current);
})();
