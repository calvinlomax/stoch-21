/* Shared public-state sessions, learning exercises, and versioned mode storage. */
'use strict';
const BJModes = (() => {
  const E = typeof module !== 'undefined' ? require('./engine.js') : BJEngine;
  const R = typeof module !== 'undefined' ? require('./rules.js') : BJRules;
  const clone = x => JSON.parse(JSON.stringify(x));
  const MODES = ['play', 'learn', 'laboratory', 'simulator'];
  const DRILLS = {
    cardValue: 'Hi-Lo card values', runningSingle: 'Single-card running count', runningMulti: 'Multi-card running count',
    runningTable: 'Full-table running count', runningSpeed: 'Running-count speed', trueCount: 'True-count conversion',
    decks: 'Decks remaining', basic: 'Basic-strategy decisions', hard: 'Hard totals', soft: 'Soft totals', pair: 'Pair splitting',
    surrender: 'Surrender decisions', i18: 'Illustrious 18', fab4: 'Fab 4 surrender', bet: 'Bet sizing', mixed: 'Mixed comprehensive',
  };
  const defaults = mode => ({
    betting: 'manual', playing: 'manual', hints: false, recommendations: false, analysis: false, manualCounts: false,
    countSystem: 'hiLo', countVisibility: 'both', speed: 1, opponents: 2, seed: 20261106,
    submode: 'guided', assistance: 'beginner', timing: 'afterDecision', explanations: true,
    showRC: true, showTC: true, askRC: false, askTC: false, askDecks: false, cardValues: true,
    betHints: true, deviationHints: true, ev: false, postHand: true, difficulty: 'standard',
    drill: { category: 'mixed', questions: 20, simultaneous: 5, timeLimit: 30, flashSeconds: 3,
      countMin: -10, countMax: 10, rounding: 'floor', tolerance: .25, categories: Object.keys(DRILLS).filter(x => x !== 'mixed') },
    ...(mode === 'learn' ? { hints: true, recommendations: true, analysis: true } : {}),
  });
  class ModeStore {
    constructor(storage, initial) {
      this.storage = storage; this.key = 'blackjack.modes.v1';
      this.data = { version: 1, active: 'simulator', modes: Object.fromEntries(MODES.map(mode => [mode,
        { envelope: clone(initial), options: defaults(mode), presets: {}, game: null, guided: null, drillSession: null, progress: { sessions: [], categories: {} } }])) };
      try { const old = JSON.parse(storage.getItem(this.key)); if (old?.version === 1) {
        if (MODES.includes(old.active)) this.data.active = old.active;
        for (const mode of MODES) if (old.modes?.[mode]) {
          const value = old.modes[mode]; this.data.modes[mode] = { ...this.data.modes[mode], ...value,
            options: { ...defaults(mode), ...value.options, drill: { ...defaults(mode).drill, ...value.options?.drill } } };
        }
      } } catch { /* Invalid saved data never prevents opening the app. */ }
    }
    mode(name = this.data.active) { if (!MODES.includes(name)) throw Error('Unknown mode'); return this.data.modes[name]; }
    save() { try { this.storage.setItem(this.key, JSON.stringify(this.data)); this.error = ''; return true; }
      catch { this.error = 'Browser storage is unavailable or full. Export the current session to retain it.'; return false; } }
    select(mode) { this.mode(mode); this.data.active = mode; this.save(); }
    preset(name, mode = this.data.active) { if (!name.trim() || name.length > 80) throw Error('Use a preset name of 1–80 characters.');
      const s = this.mode(mode); s.presets[name] = clone({ envelope: s.envelope, options: s.options }); this.save(); }
    loadPreset(name, mode = this.data.active) { const s = this.mode(mode), p = s.presets[name]; if (!p) throw Error('Preset not found');
      s.envelope = clone(p.envelope); s.options = clone(p.options); this.save(); }
    transfer(from, to, envelope = this.mode(from).envelope) { this.mode(to).envelope = clone(envelope); this.save(); }
  }
  function config(envelope, extra = {}) {
    const f = envelope.fields, rules = R.validate(R.migrate(envelope)), starting = Number(f.starting);
    const out = { decks: +f.decks, penetration: +f.penetration, penetrationSigma: +f.penetrationSigma,
      penetrationMode: f.penetrationMode, minBet: +f.minBet, baseBet: +f.baseBet, starting,
      sessions: +f.sessions, rounds: +f.rounds, finite: f.finite, seed: f.seed === '' ? 20261106 : +f.seed,
      heroSeat: +(f.heroSeat ?? 2), countSystem: f.countSystem || 'hiLo', rules,
      seats: envelope.seats.map(s => ({ ...s, amount: s.amount === '' ? starting : +s.amount, name: s.seat === +(f.heroSeat ?? 2) ? 'Your seat' : `Player ${s.seat + 1}` })), ...extra };
    for (const [key, min, max] of [['decks', 1, 8], ['minBet', .01, 1e6], ['baseBet', .01, 1e6], ['rounds', 1, 100000], ['sessions', 1, 500]])
      if (!Number.isFinite(out[key]) || out[key] < min || out[key] > max || (['decks', 'rounds', 'sessions'].includes(key) && !Number.isInteger(out[key]))) throw Error(`Invalid ${key}.`);
    if (!Number.isInteger(out.seed) || out.seed < 0 || out.seed > 4294967295) throw Error('Seed must be an integer from 0 to 4,294,967,295.');
    if (!['hiLo', 'hiOptI', 'none'].includes(out.countSystem)) throw Error('Unknown count system.');
    if (out.baseBet < out.minBet || rules.limits.tableMax < out.minBet) throw Error('Base wager and table maximum must be at least the minimum.');
    if (!Number.isFinite(out.penetration) || out.penetration < 20 || out.penetration > 95) throw Error('Penetration must be 20–95%.');
    if (!out.seats.some(s => s.active)) throw Error('At least one seat is required.');
    return out;
  }
  function seats(opponents, starting, hero = 2) {
    const others = [0, 1, 2, 3, 4].filter(i => i !== hero).slice(0, opponents);
    return Array.from({ length: 5 }, (_, seat) => ({ seat, name: seat === hero ? 'Your seat' : `Player ${seat + 1}`,
      active: seat === hero || others.includes(seat), amount: starting }));
  }
  function ledger(initial) { return { initial, rounds: 0, hands: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0,
    wager: 0, openingWager: 0, largestWager: 0, profit: 0, squares: 0, peak: initial, drawdown: 0, bankrupt: false,
    actions: {}, path: [{ round: 0, profit: 0, bankroll: initial, drawdown: 0, roi: 0, bet: 0, winRate: 0, rc: 0, tc: 0, penetration: 0, wager: 0 }] }; }
  function record(stats, simulation, round, capitalOffset = 0) {
    const seat = round.result.seats.find(p => p.seat === (simulation.config.heroSeat ?? 2));
    if (!seat || !seat.hands.length) return null;
    const player = simulation.players.find(p => p.seat === seat.seat);
    stats.rounds++; stats.hands += seat.hands.length; stats.profit += seat.profit; stats.squares += seat.profit ** 2;
    stats.wager += seat.wager; stats.openingWager += seat.openingWager; stats.largestWager = Math.max(stats.largestWager, seat.openingWager);
    for (const h of seat.hands) {
      if (['Win', 'Blackjack'].includes(h.status)) stats.wins++;
      else if (h.status === 'Push') stats.pushes++; else stats.losses++;
      if (h.blackjack) stats.blackjacks++;
    }
    for (const [action, n] of Object.entries(seat.actions)) stats.actions[action] = (stats.actions[action] || 0) + n;
    const equity = player.balance - capitalOffset;
    stats.peak = Math.max(stats.peak, equity); stats.drawdown = Math.max(stats.drawdown, (stats.peak - equity) / Math.max(1, stats.peak));
    stats.bankrupt ||= player.balance < simulation.config.minBet * 100;
    const remaining = simulation.shoe.length / 52;
    const point = { round: stats.rounds, profit: stats.profit, bankroll: equity, drawdown: stats.drawdown,
      roi: stats.wager ? stats.profit / stats.wager : 0, bet: seat.openingWager, winRate: stats.wins / stats.hands,
      rc: simulation.count, tc: remaining ? simulation.count / remaining : 0, penetration: round.result.openingPenetration,
      wager: stats.wager, roundWager: seat.wager, delta: seat.profit, hands: stats.hands, wins: stats.wins, losses: stats.losses, pushes: stats.pushes, blackjacks: stats.blackjacks, openingSum: stats.openingWager, largestWager: stats.largestWager, squares: stats.squares, bankrupt: stats.bankrupt, actions: { ...stats.actions }, openingTC: round.result.openingCount / Math.max(1 / 52, simulation.config.decks * (1 - round.result.openingPenetration)),
      openingRC: round.result.openingCount, handCount: seat.hands.length };
    stats.path.push(point); return point;
  }
  function advise(prompt, simulation, selected = false, ev = false) {
    if (prompt.kind !== 'decision') return null;
    const r = simulation.rules, opts = { ...prompt.legal, h17: simulation.config.h17 }, mode = selected ? r.play.mode : 'adjusted';
    const tc = R.roundCount(prompt.trueCount, r.bet.tcRound);
    const action = mode === 'optimal' || (mode === 'adjusted' && r.dealer.mode === 'custom') ?
      Object.entries(simulation.actionEVs(prompt.hand, prompt.up, prompt.legal, prompt.peeked)).sort((a, b) => b[1] - a[1])[0][0] :
      E.policyAction(mode, prompt.hand, prompt.up, opts, r, tc, E.seeded((simulation.config.seed ^ (simulation.stats.rounds + 1) * 2654435761 ^ prompt.handIndex) >>> 0));
    const v = E.handValue(prompt.hand.cards), dealer = E.rankValue(prompt.up.rank);
    const explanation = `${v.soft ? 'Soft' : prompt.hand.cards.length === 2 && E.rankValue(prompt.hand.cards[0].rank) === E.rankValue(prompt.hand.cards[1].rank) ? 'Pair / total' : 'Hard'} ${v.total} versus dealer ${dealer === 11 ? 'ace' : dealer}: ${action}. ${action === 'double' ? 'Add an equal wager and take exactly one card.' : action === 'split' ? 'Create two separately funded hands; split aces receive one card.' : action === 'surrender' ? 'Late surrender returns half the original wager unless the dealer has blackjack.' : action === 'stand' ? 'Keep this total and let the dealer complete the hand.' : 'Take a card; the recommendation balances improvement against bust risk.'} ${selected && mode === 'deviations' ? `The selected count index uses rounded TC ${tc}.` : 'This is the rule-adjusted reference, not a guarantee of winning or an exact composition-optimal proof.'}`;
    let reason = '';
    if (action === 'stand' && !v.soft && v.total < 17 && dealer >= 2 && dealer <= 6) reason = 'The dealer has a weak upcard; the reference keeps this stiff total rather than adding your own bust risk.';
    else if (action === 'hit' && !v.soft && v.total >= 12 && dealer >= 7) reason = 'This stiff total is weak against a strong upcard, so the reference accepts draw risk to improve it.';
    else if (action === 'hit' && v.soft) reason = 'The flexible ace can become one, allowing a draw to improve the hand without an immediate one-card bust.';
    else if (action === 'double') reason = v.soft ? 'The ace protects the one-card draw while the reference favors extra exposure against this upcard.' : 'The reference favors adding an equal stake to this favorable one-card drawing opportunity.';
    else if (action === 'split') reason = prompt.hand.cards[0].rank === 'ace' ? 'Splitting creates two ace-starting hands instead of playing one soft 12; each ace receives just one card.' : 'The pair table prefers two separately funded starting hands; DAS and dealer upcard can change this choice.';
    else if (action === 'surrender') reason = 'The reference caps the loss at half a wager for this unfavorable matchup, conditional on the selected surrender/peek rules.';
    else if (action === 'stand') reason = 'The reference avoids risking this made total on another draw.';
    return { action, explanation: explanation + ' ' + reason, ...(ev ? { ev: simulation.actionEVs(prompt.hand, prompt.up, prompt.legal, prompt.peeked) } : {}) };
  }
  class InteractiveSession {
    constructor(configuration, analysis = false) {
      this.config = clone(configuration); this.sim = new E.BlackjackSimulation(this.config); this.analysis = analysis;
      this.operations = []; this.decisions = []; this.stats = ledger(this.sim.players.find(p => p.seat === (configuration.heroSeat ?? 2)).initial);
      this.prompt = null; this.frames = []; this.result = null; this.ended = false; this.serial = 0;
    }
    startRound(log = true) {
      if (this.ended || this.prompt) throw Error('Complete the current round first.');
      if (this.sim.pendingSessionEnd) this.sim.finishSession();
      if (this.sim.finished) { this.ended = true; return null; }
      if (log) this.operations.push({ type: 'round' });
      this.iterator = this.sim.roundFlow(true, this.config.heroSeat ?? 2); this.eventIndex = 0;
      return this.advance();
    }
    advance(value) {
      const next = this.iterator.next(value); this.serial++;
      if (next.done) {
        this.prompt = null; this.result = next.value;
        if (next.value?.result) record(this.stats, this.sim, next.value);
        this.snapshot = next.value?.final || this.sim.snap(null);
      } else { this.prompt = next.value; this.result = null; this.snapshot = this.prompt.snapshot; }
      // Each snapshot is already redacted by the shared engine.
      const events = next.value?.events || [];
      this.frames = events.slice(this.eventIndex); this.eventIndex = events.length;
      return this.prompt;
    }
    answer(value, log = true) {
      const prompt = this.prompt; if (!prompt) throw Error('There is no pending decision.');
      if (prompt.kind === 'decision' && !prompt.actions.includes(value)) throw Error('That action is not legal.');
      if (prompt.kind === 'bet') {
        const cents = R.constrain(this.sim.rules, Number(value), prompt.context);
        if (!Number.isFinite(Number(value)) || value < prompt.minimum || Math.round(value * 100) !== cents || !cents) throw Error('Enter a legal wager on the configured chip grid.');
        value = Number(value);
      }
      if (prompt.kind === 'insurance' && (typeof value !== 'boolean' || (value && !prompt.affordable))) throw Error('Insurance is not affordable.');
      if (prompt.kind === 'decision' && this.analysis) {
        const recommendation = advise(prompt, this.sim), chosen = E.handValue(prompt.hand.cards);
        this.decisions.push({ round: this.stats.rounds + 1, hand: prompt.handIndex, chosen: value, expected: recommendation.action,
          correct: value === recommendation.action, explanation: recommendation.explanation,
          category: prompt.hand.cards.length === 2 && E.rankValue(prompt.hand.cards[0].rank) === E.rankValue(prompt.hand.cards[1].rank) ? 'pair' : chosen.soft ? 'soft' : 'hard' });
      }
      if (log) this.operations.push({ type: 'answer', value });
      return this.advance(value);
    }
    finish() {
      if (this.prompt && this.prompt.kind !== 'bet') throw Error('Finish the current hand before ending the session.');
      if (this.prompt) { this.iterator.return(); this.sim.abortUnstartedRound(); this.prompt = null; }
      this.ended = true; this.snapshot = this.sim.snap(null);
    }
    dump() { return { version: 1, config: this.config, analysis: this.analysis, operations: this.operations, ended: this.ended }; }
    static restore(value) {
      if (value.version !== 1 || value.operations.length > 100000) throw Error('Saved session is invalid or too large.');
      const game = new InteractiveSession(value.config, value.analysis);
      for (const op of value.operations) op.type === 'round' ? game.startRound(false) : game.answer(op.value, false);
      game.operations = clone(value.operations); if (value.ended) game.finish(); return game;
    }
  }
  function scoring(progress, row) {
    const name = row.category, p = progress.categories[name] ||= { attempted: 0, correct: 0, seconds: 0, errors: 0 };
    p.attempted++; p.correct += row.correct ? 1 : 0; p.errors += row.correct ? 0 : 1; p.seconds += row.seconds;
  }
  function learningSummary(answers) {
    const byCategory = {}; let streak = 0, best = 0;
    for (const row of answers) {
      scoring({ categories: byCategory }, row); streak = row.correct ? streak + 1 : 0; best = Math.max(best, streak);
    }
    return { attempted: answers.length, correct: answers.filter(x => x.correct).length,
      accuracy: answers.length ? answers.filter(x => x.correct).length / answers.length : null,
      averageSeconds: answers.length ? answers.reduce((s, x) => s + x.seconds, 0) / answers.length : 0,
      streak, best, score: answers.reduce((s, x) => s + (x.correct ? Math.max(1, 100 - Math.round(x.seconds * 2)) : 0), 0), byCategory };
  }
  class DrillSession {
    constructor(settings, configuration, seed = 1) {
      this.settings = clone(settings); this.config = clone(configuration); this.seed = seed; this.rng = E.seeded(seed); this.answers = [];
      this.sequence = []; this.index = 0; this.finished = false; this.question = null; this.running = 0;
      if (!(settings.questions >= 1 && settings.questions <= 500 && settings.timeLimit > 0 && settings.timeLimit <= 600 && settings.simultaneous >= 1 && settings.simultaneous <= 30 && settings.countMin <= settings.countMax && settings.countMin >= -100 && settings.countMax <= 100 && settings.tolerance >= 0 && settings.tolerance <= 100)) throw Error('Check question count, timing, card count, count range, and tolerance.');
      if (!DRILLS[settings.category] || !settings.categories?.length || settings.categories.some(x => !DRILLS[x] || x === 'mixed')) throw Error('Choose valid drill categories.');
    }
    int(a, b) { return a + Math.floor(this.rng() * (b - a + 1)); }
    card(rank) { return { rank: rank || ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'][this.int(0, 12)], suit: ['clubs', 'hearts', 'spades', 'diamonds'][this.int(0, 3)] }; }
    next() {
      if (this.answers.length >= this.settings.questions) { this.finished = true; this.question = null; return null; }
      const s = this.settings, category = s.category === 'mixed' ? s.categories[this.int(0, s.categories.length - 1)] : s.category;
      const q = { id: this.answers.length + 1, category, cards: [], tolerance: s.tolerance, rule: '', explanation: '' };
      if (category === 'cardValue' || category.startsWith('running')) {
        const n = category === 'cardValue' || category === 'runningSingle' ? 1 : category === 'runningTable' ? Math.min(11, 2 * (this.config.seats.filter(p => p.active).length) + 1) : s.simultaneous;
        let reset = false;
        const previousCategory = this.answers.at(-1)?.category;
        if (previousCategory && previousCategory !== 'cardValue' && !previousCategory.startsWith('running')) { this.sequence = []; this.index = 0; }
        if (this.index + n > this.sequence.length) {
          this.sequence = [];
          for (let deck = 0; deck < this.config.decks; deck++) for (const suit of ['clubs', 'hearts', 'spades', 'diamonds'])
            for (const rank of ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king']) this.sequence.push({ rank, suit });
          for (let i = this.sequence.length - 1; i > 0; i--) { const j = this.int(0, i); [this.sequence[i], this.sequence[j]] = [this.sequence[j], this.sequence[i]]; }
          this.index = 0; this.running = 0; reset = true;
        }
        q.cards = this.sequence.slice(this.index, this.index += n); const previous = this.running;
        const change = q.cards.reduce((v, c) => v + E.hiLo(c), 0); this.running += change;
        q.answer = category === 'cardValue' ? E.hiLo(q.cards[0]) : this.running; q.tolerance = 0;
        q.prompt = category === 'cardValue' ? 'What is this card’s Hi-Lo value?' : `${reset ? 'Fresh shoe: begin at RC 0. ' : ''}Update the running count after these cards.`;
        q.explanation = `${previous} + (${q.cards.map(c => E.hiLo(c)).join(' + ')}) = ${this.running}. Hi-Lo counts 2–6 as +1, 7–9 as 0, and tens/aces as −1.`;
      } else if (category === 'trueCount') {
        q.rc = this.int(s.countMin, s.countMax); q.decks = this.int(1, this.config.decks * 4) / 4;
        q.answer = R.roundCount(q.rc / q.decks, s.rounding); q.prompt = `RC ${q.rc}; ${q.decks} decks remaining. What is the ${s.rounding === 'none' ? 'unrounded' : s.rounding + '-rounded'} true count?`;
        q.explanation = `TC = ${q.rc} ÷ ${q.decks} = ${(q.rc / q.decks).toFixed(4)}; ${s.rounding} gives ${q.answer}. Floor rounds toward −∞; truncation rounds toward zero; nearest uses JavaScript’s nearest-integer convention (ties toward +∞).`;
      } else if (category === 'decks') {
        q.decks = this.int(1, this.config.decks * 4) / 4; q.fill = q.decks / this.config.decks;
        q.answer = q.decks; q.prompt = `Estimate decks remaining in this ${this.config.decks}-deck shoe.`;
        q.explanation = `${q.decks} decks remain (${Math.round(q.decks * 52)} cards). Your answer is accepted within ${q.tolerance} decks.`;
      } else if (category === 'bet') {
        const rc = this.int(s.countMin, s.countMax), decks = this.int(1, this.config.decks * 2) / 2;
        const ctx = { base: this.config.baseBet, bankroll: this.config.starting, min: this.config.minBet, rc,
          tc: rc / decks, penetration: 1 - decks / this.config.decks, finite: this.config.finite, countSamples: [] };
        q.answer = R.constrain(this.config.rules, R.rawBet(this.config.rules, ctx), ctx) / 100;
        q.prompt = `Choose the opening wager: RC ${rc}, ${decks} decks remaining, bankroll $${ctx.bankroll}, base $${ctx.base}. Strategy: ${R.BETS[this.config.rules.bet.mode]}.`;
        q.explanation = `TC = ${rc} ÷ ${decks} = ${(rc / decks).toFixed(2)}. The shared bet model, table bounds, spread, bankroll, and chip grid produce $${q.answer.toFixed(2)}. Percentile mode uses its neutral reference when prior samples are absent.`;
      } else {
        let r = clone(this.config.rules), up, hand, tc = this.int(s.countMin, s.countMax);
        if (category === 'i18' && this.int(0, 17) === 0) {
          tc = this.config.rules.play.insuranceIndex + this.int(-1, 1); q.dealer = this.card('ace');
          q.prompt = `Dealer shows an ace at TC ${tc}. Take or decline insurance?`;
          q.answer = tc >= this.config.rules.play.insuranceIndex ? 'take' : 'decline'; q.options = ['take', 'decline'];
          q.rule = 'Illustrious 18 insurance index ' + this.config.rules.play.insuranceIndex;
          q.explanation = `Insurance pays 2:1, with break-even ten probability 1/3. The configured Hi-Lo index is ${this.config.rules.play.insuranceIndex}; at TC ${tc}, ${q.answer}. This count index approximates composition-dependent insurance value.`;
          this.question = q; return q;
        }
        if (category === 'i18' || category === 'fab4') {
          const rows = category === 'i18' ? R.defaults().play.deviations.slice(0, 17) : R.defaults().play.deviations.slice(17);
          const d = rows[this.int(0, rows.length - 1)]; tc = d[3] + this.int(-1, 1); up = d[2];
          hand = d[0] === 'pair' ? [this.card(d[1] === 11 ? 'ace' : String(d[1])), this.card(d[1] === 11 ? 'ace' : String(d[1]))] : [this.card('10'), this.card(String(d[1] - 10))];
          if (d[1] < 12 && d[0] !== 'pair') hand = [this.card('5'), this.card(String(d[1] - 5))];
          r.play.mode = 'deviations'; r.play.deviations = clone(rows);
          if (category === 'fab4') r.dealer.surrender = true;
          q.rule = `${category === 'fab4' ? 'Fab 4 (late surrender enabled for this exercise)' : 'I18 index'}: ${d[0]} ${d[1]} vs ${up}, ${tc >= d[3] ? 'at/above' : 'below'} TC ${d[3]}.`;
        } else {
          up = this.int(2, 11); let type = category;
          if (category === 'basic') type = ['hard', 'soft', 'pair'][this.int(0, 2)];
          if (type === 'soft') hand = [this.card('ace'), this.card(String(this.int(2, 9)))];
          else if (type === 'pair') { const rank = this.int(1, 10); hand = [this.card(rank === 1 ? 'ace' : String(rank)), this.card(rank === 1 ? 'ace' : String(rank))]; }
          else { let total = category === 'surrender' ? this.int(14, 16) : this.int(9, 20); const a = Math.min(10, total - 2); hand = [this.card(String(a)), this.card(String(total - a))]; }
          if (category === 'surrender') { r.dealer.surrender = true; up = this.int(9, 11); q.rule = 'Late surrender enabled for this exercise; dealer blackjack still takes priority.'; }
        }
        const h = { cards: hand, split: false }, legal = { canDouble: true, canSplit: E.rankValue(hand[0].rank) === E.rankValue(hand[1].rank), canSurrender: r.dealer.surrender, h17: r.dealer.mode === 'H17' };
        const dealer = this.card(up === 11 ? 'ace' : String(up));
        q.answer = E.policyAction(['i18', 'fab4'].includes(category) ? 'deviations' : 'adjusted', h, dealer, legal, r, tc);
        q.cards = hand; q.dealer = dealer; q.options = ['hit', 'stand', ...(legal.canDouble ? ['double'] : []), ...(legal.canSplit ? ['split'] : []), ...(legal.canSurrender ? ['surrender'] : [])];
        q.prompt = `Choose an action versus ${up === 11 ? 'ace' : up}${['i18', 'fab4'].includes(category) ? ` at TC ${tc}` : ''}. ${q.rule}`;
        q.explanation = `${q.answer.toUpperCase()}: ${E.handValue(hand).soft ? 'soft' : 'hard'} ${E.handValue(hand).total} versus ${up}. ${q.rule || 'Use the selected table rules, including soft-17 handling, DAS, and surrender legality.'}`;
      }
      this.question = q; return q;
    }
    answer(value, seconds, timedOut = false) {
      const q = this.question; if (!q) throw Error('Start a question first.');
      const correct = !timedOut && seconds <= this.settings.timeLimit && (typeof q.answer === 'number' ? Number.isFinite(Number(value)) && value !== '' && Math.abs(Number(value) - q.answer) <= q.tolerance : value === q.answer);
      const row = { ...clone(q), response: value, correct, seconds: Math.max(0, seconds), timedOut: timedOut || seconds > this.settings.timeLimit };
      this.answers.push(row); this.question = null; if (this.answers.length >= this.settings.questions) this.finished = true;
      return row;
    }
    dump() { return { settings: this.settings, config: this.config, seed: this.seed, answers: clone(this.answers), pending: !!this.question }; }
    static restore(value) {
      const session = new DrillSession(value.settings, value.config, value.seed);
      for (const answer of value.answers) { session.next(); session.answer(answer.response, answer.seconds, answer.timedOut); }
      if (value.pending && !session.finished) session.next(); return session;
    }
  }
  return { MODES, DRILLS, defaults, ModeStore, config, seats, ledger, record, advise, InteractiveSession, DrillSession, learningSummary, scoring, clone };
})();
if (typeof module !== 'undefined') module.exports = BJModes;
