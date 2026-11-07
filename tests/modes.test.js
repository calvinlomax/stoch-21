const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rules'), E = require('../engine'), M = require('../modes-core'), L = require('../laboratory-core');
const config = (extra = {}) => ({ rules: R.defaults(), decks: 6, penetration: 75, penetrationSigma: 3, penetrationMode: 'fixed', minBet: 10, baseBet: 25, starting: 10000, sessions: 1, rounds: 20, seed: 771, heroSeat: 2, countSystem: 'hiLo', finite: true, seats: M.seats(2, 10000), ...extra });
function play(game) { while (game.prompt) game.answer(game.prompt.kind === 'bet' ? game.prompt.suggested : game.prompt.kind === 'insurance' ? false : M.advise(game.prompt, game.sim, true).action); }
test('interactive play matches the same automated shared strategy and exact accounting', () => {
  const c = config(), interactive = new M.InteractiveSession(c, true), automated = new E.BlackjackSimulation(c);
  for (let i = 0; i < 20; i++) { interactive.startRound(); play(interactive); const result = automated.playRound(); assert.equal(interactive.sim.players.find(p => p.seat === 2).balance, automated.players.find(p => p.seat === 2).balance); assert.deepEqual(interactive.sim.unseen, automated.unseen); assert.equal(interactive.sim.count, automated.count); }
  assert.equal(interactive.stats.rounds, 20); assert.equal(interactive.stats.profit, interactive.sim.players.find(p => p.seat === 2).balance - 1000000);
});
test('public snapshots never expose the dealer hole card and rejected inputs do not alter a deal', () => {
  const game = new M.InteractiveSession(config()); game.startRound(); const before = game.dump(); assert.throws(() => game.answer(-1)); assert.deepEqual(game.dump(), before);
  game.answer(game.prompt.suggested); if (game.prompt) { assert.equal(game.snapshot.dealer[1].rank, undefined); assert.equal(game.snapshot.dealer[1].hidden, true); const stable = game.dump(); assert.throws(() => game.answer('invalid')); assert.deepEqual(game.dump(), stable); }
});
test('interactive saved state restores an active hand and subsequent seeded outcomes', () => {
  const game = new M.InteractiveSession(config(), true); for (let i = 0; i < 3; i++) { game.startRound(); play(game); } game.startRound(); game.answer(game.prompt.suggested);
  const restored = M.InteractiveSession.restore(game.dump()); assert.deepEqual(restored.snapshot, game.snapshot); play(game); play(restored); assert.deepEqual(restored.stats, game.stats); assert.deepEqual(restored.sim.snap(null), game.sim.snap(null));
});
test('simulator RNG and private shoe restore exactly without changing the seed sequence', () => {
  const sim = new E.BlackjackSimulation(config()); for (let i = 0; i < 5; i++) sim.playRound(); const restored = E.BlackjackSimulation.restore(sim.dump());
  for (let i = 0; i < 10; i++) assert.deepEqual(restored.playRound(), sim.playRound());
});
test('all drill types are reproducible, score actual answers, and restore timing results', () => {
  for (const category of Object.keys(M.DRILLS)) {
    const settings = { category, categories: Object.keys(M.DRILLS).filter(x => x !== 'mixed'), questions: 5, timeLimit: 10, simultaneous: 5, countMin: -10, countMax: 10, rounding: 'floor', tolerance: .25 };
    const d = new M.DrillSession(settings, config(), 41); let q = d.next(); d.answer(q.answer, .4); q = d.next(); const restored = M.DrillSession.restore(d.dump()); assert.deepEqual(restored.question, q); d.answer(q.answer, 11); assert.equal(d.answers[1].correct, false); assert.equal(d.answers[1].timedOut, true);
    assert.equal(M.learningSummary(d.answers).accuracy, .5);
  }
});
test('mode state and presets are isolated, configuration transfers use deep copies', () => {
  const storage = { data: null, getItem() { return this.data; }, setItem(k, v) { this.data = v; } }, initial = { fields: { decks: '6' }, rules: R.defaults(), seats: M.seats(2, 10000) };
  const store = new M.ModeStore(storage, initial); store.select('play'); store.mode().envelope.fields.decks = '2'; store.preset('Practice'); store.transfer('play', 'learn'); store.mode('learn').envelope.fields.decks = '8'; assert.equal(store.mode('play').envelope.fields.decks, '2'); assert.equal(store.mode('simulator').envelope.fields.decks, '6'); assert.equal(store.mode('learn').presets.Practice, undefined); store.save(); assert.equal(new M.ModeStore(storage, initial).mode('learn').envelope.fields.decks, '8');
});
test('randomized designs and synchronized worker shards are deterministic and resumable', () => {
  const settings = { ...L.defaults(), environments: 3, sessions: 2, hands: 15, tickHands: 3, compare: true, controlPlay: 'basic', controlBet: 'flat' };
  const a = L.design(config(), settings), b = L.design(config(), settings); assert.deepEqual(a, b);
  const s1 = new L.Shard(a.jobs, settings); s1.tick(); s1.tick(); const saved = s1.dump(), s2 = new L.Shard(b.jobs, settings); s2.restore(saved);
  for (let i = 0; i < 3; i++) assert.deepEqual(s1.tick(), s2.tick());
  assert.equal(a.jobs[0].config.seed, a.jobs[1].config.seed);
});
test('multi-strategy designs share environments and seeds while preserving independent strategy settings', () => {
  const first = config({ starting: 5000, baseBet: 25 }), second = config({ starting: 12000, baseBet: 50, countSystem: 'none' });
  second.rules = R.defaults(); second.rules.play.mode = 'stand'; second.rules.bet.mode = 'flat'; second.rules.limits.tableMax = 3000;
  const settings = { ...L.defaults(), multiEnabled: true, environments: 3, sessions: 2, hands: 10, tickHands: 2,
    strategies: [{ id: 'a', name: 'First', config: first }, { id: 'b', name: 'Second', config: second }] };
  const design = L.design(config(), settings); assert.equal(design.jobs.length, 12); assert.deepEqual(design, L.design(config(), settings));
  for (let i = 0; i < design.jobs.length; i += 2) {
    const [a, b] = design.jobs.slice(i, i + 2); assert.equal(a.environment, b.environment); assert.equal(a.session, b.session); assert.equal(a.config.seed, b.config.seed); assert.equal(a.config.decks, b.config.decks); assert.equal(a.config.rules.limits.tableMax, b.config.rules.limits.tableMax);
    assert.equal(a.config.starting, 5000); assert.equal(b.config.starting, 12000); assert.equal(b.config.rules.play.mode, 'stand'); assert.equal(b.config.baseBet, 50); assert.equal(b.config.countSystem, 'none');
  }
  const shard = new L.Shard(design.jobs, design.settings); shard.tick(); const saved = shard.dump(), restored = new L.Shard(design.jobs, design.settings); restored.restore(saved); assert.deepEqual(shard.tick(), restored.tick());
  assert.throws(() => L.design(config(), { ...settings, strategies: [settings.strategies[0]] }), /two and five/);
  assert.throws(() => L.design(config(), { ...settings, hands: 100000, environments: 128, sessions: 20 }), /2,000,000/);
});
test('cluster intervals merge common seeds and use correct small-sample critical values', () => {
  assert.ok(Math.abs(L.tCritical(.95, 1) - 12.706204736) < 1e-5); assert.ok(Math.abs(L.tCritical(.95, 29) - 2.045229642) < 1e-5);
  const jobs = [0, 1, 2].map(i => ({ environment: i, arm: 'strategy', config: { seed: 1 }, stats: { profit: 10, wager: 100, rounds: 1, squares: 100, drawdown: 0, largestWager: 100, openingWager: 100 } }));
  assert.equal(L.clusterGroups(jobs).length, 1); assert.equal(L.summarize(jobs).roi.ci, null); jobs[1].config.seed = 2; jobs[2].config.seed = 3; assert.equal(L.summarize(jobs).clusters, 3);
});
test('fits are calculated from observations and do not fabricate profit', () => {
  const points = Array.from({ length: 20 }, (_, x) => ({ x, y: 2 * x + 3 })); assert.ok(L.fit(points, 'lr').every(p => Math.abs(p.y - (2 * p.x + 3)) < 1e-8)); assert.equal(L.fit(points, 'sma', 3)[2].y, 5); assert.ok(L.fit(points, 'gam').every(p => Number.isFinite(p.y)));
});
test('alternate count systems and custom decision rules use shared public-state logic', () => {
  assert.equal(E.countValue({ rank: 'ace' }, 'hiOptI'), 0); assert.equal(E.countValue({ rank: '3' }, 'none'), 0);
  const r = R.defaults(); r.play.mode = 'custom'; r.play.decisionRules = [{ type: 'hard', minTotal: 16, maxTotal: 16, upcards: [10], minTC: 0, maxTC: 100, action: 'stand' }]; R.validate(r);
  assert.equal(E.policyAction('custom', { cards: [{ rank: '10' }, { rank: '6' }] }, { rank: '10' }, { canSplit: false, canDouble: true, canSurrender: false }, r, 1), 'stand');
});
test('read-only recommendations and EV overlays never advance actual game RNG or counts', () => {
  const g = new M.InteractiveSession(config({ seed: 12345, seats: M.seats(0, 10000) })); g.startRound(); g.answer(g.prompt.suggested);
  if (g.prompt?.kind === 'insurance') g.answer(false);
  assert.equal(g.prompt.kind, 'decision'); const before = g.sim.dump(); M.advise(g.prompt, g.sim, true, true); assert.deepEqual(g.sim.dump(), before);
});
test('zero observed bankruptcies do not produce a zero-width risk interval', () => {
  const jobs = Array.from({ length: 20 }, (_, i) => ({ environment: i, arm: 'strategy', config: { seed: i }, done: true, stats: { profit: i % 2 ? 10 : -10, wager: 100, rounds: 1, squares: 100, drawdown: .01, openingWager: 100, largestWager: 100, bankrupt: false } }));
  const summary = L.summarize(jobs); assert.equal(summary.ruin.point, 0); assert.ok(summary.ruin.ci[1] > 0); assert.match(summary.sensitivity, /Not established/);
});
