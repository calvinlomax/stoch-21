/* Deterministic experiment design, real engine shards, cluster inference and chart fits. */
'use strict';
const BJLab = (() => {
  const E = typeof module !== 'undefined' ? require('./engine.js') : BJEngine;
  const R = typeof module !== 'undefined' ? require('./rules.js') : BJRules;
  const M = typeof module !== 'undefined' ? require('./modes-core.js') : BJModes;
  const get = (value, path) => path.split('.').reduce((v, k) => v?.[k], value);
  const set = (value, path, x) => { const parts = path.split('.'); let v = value; for (const p of parts.slice(0, -1)) v = v[p] ||= {}; v[parts.at(-1)] = x; };
  const PARAMETERS = [
    ['decks', 'Decks', 1, 8, 'integer'], ['penetration', 'Penetration %', 20, 95],
    ['rules.dealer.mode', 'Dealer soft 17', ['S17', 'H17', 'custom']],
    ['payout', 'Blackjack payout', [1, 1.2, 1.5, 2]], ['minBet', 'Table minimum $', 1, 1000000, 'integer'],
    ['rules.limits.tableMax', 'Table maximum $', 1, 100000000], ['starting', 'Starting bankroll $', 1, 100000000, 'integer'],
    ['opponents', 'Opponent count', 0, 4, 'integer'], ['rules.opponents.skill', 'Opponent skill', Object.keys(R.SKILLS)],
    ['rules.opponents.bet', 'Opponent betting', Object.keys(R.OPPBETS)], ['heroSeat', 'Player seating position', 0, 4, 'integer'],
    ['penetrationMode', 'Shuffle location model', ['fixed', 'simulated', 'gaussian']],
    ['seed', 'Shoe seed', 0, 4294967295, 'integer'], ['penetrationSigma', 'Cut-location SD, pp', 0, 30],
    ['countSystem', 'Count system', ['hiLo', 'hiOptI', 'none']],
    ['rules.dealer.hole', 'Hole card', ['peek', 'nopeek', 'european']], ['rules.dealer.das', 'Double after split', [true, false]],
    ['rules.dealer.surrender', 'Late surrender', [true, false]], ['rules.dealer.maxHands', 'Maximum split hands', 1, 8, 'integer'],
    ['rules.dealer.hardStand', 'Custom hard stand', 12, 21, 'integer'], ['rules.dealer.softStand', 'Custom soft stand', 12, 21, 'integer'],
    ['rules.limits.mode', 'Wager limit model', ['fixed', 'none', 'table', 'bankroll', 'dynamic', 'custom']],
    ['rules.limits.maxMultiplier', 'Maximum bet multiplier', 1, 1000000, 'integer'],
    ['rules.limits.minMultiplier', 'Minimum bet multiplier', 0, 1000000], ['rules.limits.bankrollMax', 'Bankroll exposure cap', .00001, 1],
    ['rules.limits.dynamicSlope', 'Dynamic cap slope', 0, 100], ['rules.limits.chip', 'Chip size $', .01, 1000000],
    ['rules.limits.increment', 'Wager increment $', .01, 1000000], ['rules.limits.round', 'Wager rounding', ['floor', 'round', 'ceil']],
    ['rules.limits.insufficient', 'Insufficient funds', ['allin', 'sitout']],
    ['rules.opponents.error', 'Opponent error rate', 0, 1], ['rules.opponents.accuracy', 'Opponent count accuracy', 0, 1],
    ['rules.opponents.risk', 'Opponent risk multiplier', .01, 10], ['rules.opponents.percent', 'Opponent bankroll fraction', .00001, 1],
    ['rules.opponents.streakLength', 'Opponent streak trigger', 1, 20, 'integer'], ['rules.opponents.factor', 'Opponent progression factor', 1, 10],
    ['rules.opponents.maxProgression', 'Opponent progression cap', 1, 20, 'integer'], ['rules.opponents.resetWins', 'Opponent Paroli reset', 1, 20, 'integer'],
    ['rules.opponents.bias', 'Opponent streak bias', ['hot', 'due', 'both']],
  ].map(([key, label, min, max, kind]) => ({ key, label, ...(Array.isArray(min) ? { values: min, kind: 'choice' } : { min, max, kind: kind || 'number' }) }));
  const defaults = () => ({ environments: 30, sessions: 2, hands: 500, workers: Math.min(4, typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2),
    seed: 91731, confidence: .95, paired: true, compare: false, controlPlay: 'basic', controlBet: 'flat',
    bankruptcy: 'stop', stopProfit: 0, stopLoss: 0, stopDrawdown: 0, tickHands: 5,
    parameters: { decks: { mode: 'choice', values: [2, 6, 8], weights: [1, 1, 1] },
      penetration: { mode: 'uniform', min: 60, max: 85 }, 'rules.dealer.mode': { mode: 'choice', values: ['S17', 'H17'], weights: [1, 1] },
      seed: { mode: 'uniform', min: 0, max: 4294967295 } }, fits: { average: true, lr: false, gam: false, sma: false }, window: 20, smoothing: 1 });
  function sample(spec, descriptor, fixed, rng) {
    const mode = spec?.mode || 'fixed';
    if (mode === 'fixed') return spec && Object.hasOwn(spec, 'value') ? spec.value : fixed;
    if (mode === 'choice') {
      const values = spec.values, weights = spec.weights || values.map(() => 1);
      if (!values?.length || weights.length !== values.length || weights.some(w => !Number.isFinite(w) || w < 0) || weights.reduce((a, b) => a + b, 0) <= 0) throw Error(descriptor.label + ': invalid allowed values / weights.');
      let n = rng() * weights.reduce((a, b) => a + b, 0);
      return values[weights.findIndex(w => (n -= w) < 0)];
    }
    if (descriptor.kind === 'choice') throw Error('Use fixed or weighted allowed values for ' + descriptor.label);
    const lo = +spec.min, hi = +spec.max;
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi || lo < descriptor.min || hi > descriptor.max) throw Error(descriptor.label + ': range is outside supported bounds.');
    let value;
    if (mode === 'uniform') value = descriptor.kind === 'integer' ? lo + Math.floor(rng() * (hi - lo + 1)) : lo + rng() * (hi - lo);
    else if (mode === 'logUniform') { if (lo <= 0) throw Error('Log-uniform ranges must be positive.'); value = Math.exp(Math.log(lo) + rng() * Math.log(hi / lo)); }
    else if (mode === 'normal') {
      const mean = spec.mean ?? (lo + hi) / 2, sd = spec.sd ?? (hi - lo) / 6;
      if (!Number.isFinite(mean) || !Number.isFinite(sd) || sd < 0 || (sd === 0 && (mean < lo || mean > hi))) throw Error('Invalid truncated-normal mean or SD.');
      for (let i = 0; i < 1000; i++) { const v = mean + sd * Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng()); if (v >= lo && v <= hi) { value = v; break; } }
      if (value == null) throw Error('Truncated-normal range has negligible mass.');
    } else throw Error('Unknown randomization distribution.');
    return descriptor.kind === 'integer' ? Math.round(value) : Math.round(value * 10000) / 10000;
  }
  function design(base, settings) {
    const s = M.clone(settings);
    const multi = s.multiEnabled === true;
    const strategies = multi ? s.strategies : null;
    if (multi && (!Array.isArray(strategies) || strategies.length < 2 || strategies.length > 5 || new Set(strategies.map(x => x.id)).size !== strategies.length || strategies.some(x => !x.id || !x.config))) throw Error('Add between two and five distinct strategies.');
    for (const [key, lo, hi] of [['environments', 1, 128], ['sessions', 1, 20], ['hands', 1, 100000], ['workers', 1, 8], ['tickHands', 1, 100]])
      if (!Number.isInteger(s[key]) || s[key] < lo || s[key] > hi) throw Error(`${key} must be an integer ${lo}–${hi}.`);
    if (s.environments * s.sessions * s.hands * (multi ? strategies.length : s.compare ? 2 : 1) > 2000000) throw Error('Limit Laboratory to 2,000,000 total requested rounds across all strategies.');
    if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > 4294967295 || !(s.confidence >= .8 && s.confidence <= .999)) throw Error('Check seed and confidence level.');
    if (!['stop', 'rebuy', 'unlimited'].includes(s.bankruptcy)) throw Error('Unknown bankruptcy behavior.');
    for (const key of ['stopProfit', 'stopLoss', 'stopDrawdown']) if (!Number.isFinite(s[key]) || s[key] < 0) throw Error('Stop conditions must be nonnegative.');
    if (s.stopDrawdown > 1) throw Error('Drawdown stop must be a fraction no larger than 1.');
    const environments = [], jobs = [];
    for (let index = 0; index < s.environments; index++) {
      const rng = E.seeded((s.seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0); let c, lastError;
      for (let attempt = 0; attempt < 100; attempt++) {
        c = M.clone(base);
        c.opponents = base.seats.filter(x => x.active && x.seat !== (base.heroSeat ?? 2)).length;
        c.starting = base.starting || base.seats.find(p => p.seat === (base.heroSeat ?? 2)).amount;
        c.payout = base.rules.payout.numerator / base.rules.payout.denominator;
        try {
          for (const d of PARAMETERS) {
            if (multi && (d.key === 'starting' || d.key === 'countSystem' || (d.key.startsWith('rules.limits.') && d.key !== 'rules.limits.tableMax'))) continue;
            const value = sample(s.parameters[d.key], d, get(c, d.key), rng);
            if (d.values ? !d.values.includes(value) : !Number.isFinite(value) || value < d.min || value > d.max || (d.kind === 'integer' && !Number.isInteger(value))) throw Error(d.label + ': invalid value.');
            set(c, d.key, value);
          }
          c.rules.payout = { numerator: c.payout * 100, denominator: 100 };
          c.seats = M.seats(c.opponents, c.starting, c.heroSeat); c.sessions = 1; c.rounds = s.hands;
          c.finite = s.bankruptcy !== 'unlimited'; c.rules.limits.terminate = 'you';
          R.validate(c.rules);
          if (c.baseBet < c.minBet || c.rules.limits.tableMax < c.minBet || c.starting < c.minBet) throw Error('Base wager, table maximum, and bankroll must meet the table minimum.');
          break;
        } catch (error) { lastError = error; c = null; }
      }
      if (!c) throw Error('Invalid experiment design: ' + lastError.message + ' Adjust the fixed values or ranges.');
      environments.push({ index, config: M.clone(c) });
      for (let session = 0; session < s.sessions; session++) {
        const seed = (c.seed + Math.imul(session, 0x85ebca6b)) >>> 0;
        if (multi) {
          for (const strategy of strategies) {
            const cfg = M.clone(c), source = strategy.config;
            cfg.rules.play = M.clone(source.rules.play); cfg.rules.bet = M.clone(source.rules.bet);
            cfg.rules.limits = { ...M.clone(source.rules.limits), tableMax: c.rules.limits.tableMax, terminate: 'you' };
            cfg.rules.analytics = { ...M.clone(source.rules.analytics), mode: c.rules.analytics.mode };
            cfg.starting = source.starting; cfg.baseBet = source.baseBet; cfg.countSystem = source.countSystem;
            cfg.finite = s.bankruptcy === 'unlimited' ? false : source.finite;
            cfg.seats = M.seats(c.opponents, c.starting, c.heroSeat);
            cfg.seats.find(p => p.seat === c.heroSeat).amount = source.starting;
            cfg.seed = seed;
            R.validate(cfg.rules);
            if (cfg.baseBet < cfg.minBet || cfg.starting < cfg.minBet) throw Error(`Strategy ${strategy.name}: base wager and bankroll must meet each environment's table minimum.`);
            jobs.push({ id: `${index}:${session}:${strategy.id}`, environment: index, session, arm: 'strategy', strategyId: strategy.id, config: cfg });
          }
          continue;
        }
        for (const arm of s.compare ? ['strategy', 'control'] : ['strategy']) {
          const cfg = M.clone(c); cfg.seed = arm === 'control' && !s.paired ? (seed ^ 0xc2b2ae35) >>> 0 : seed;
          if (arm === 'control') { cfg.rules.play.mode = s.controlPlay; cfg.rules.bet.mode = s.controlBet; R.validate(cfg.rules); }
          jobs.push({ id: `${index}:${session}:${arm}`, environment: index, session, arm, config: cfg });
        }
      }
    }
    return { version: 1, settings: s, environments, jobs };
  }
  class Shard {
    constructor(jobs, settings) { this.settings = settings; this.jobs = jobs.map(job => ({ ...M.clone(job), sim: new E.BlackjackSimulation(job.config),
      stats: M.ledger(job.config.seats.find(p => p.seat === job.config.heroSeat).amount * 100), done: false, rounds: 0, rebuys: 0, reason: '' })); }
    dump() { return this.jobs.map(job => ({ id: job.id, simulation: job.sim.dump(), stats: job.stats, done: job.done, rounds: job.rounds, rebuys: job.rebuys, reason: job.reason, voids: job.voids || 0 })); }
    restore(states) { for (const saved of states || []) { const job = this.jobs.find(j => j.id === saved.id); if (!job) continue;
      job.sim = E.BlackjackSimulation.restore(saved.simulation); for (const key of ['stats', 'done', 'rounds', 'rebuys', 'reason', 'voids']) job[key] = M.clone(saved[key]); } }
    tick() {
      return this.jobs.map(job => {
        const points = []; if (job.done) return { id: job.id, done: true, points: [] };
        for (let i = 0; i < this.settings.tickHands && !job.done; i++) {
          if (job.sim.pendingSessionEnd) {
            if (this.settings.bankruptcy === 'rebuy' && job.rounds < this.settings.hands && job.stats.bankrupt) {
              job.rebuys++; const c = { ...job.config, rounds: this.settings.hands - job.rounds, seed: (job.config.seed + Math.imul(job.rebuys, 0x27d4eb2d)) >>> 0 };
              job.sim = new E.BlackjackSimulation(c);
            } else { job.done = true; job.reason = job.stats.bankrupt ? 'Below table minimum' : 'Hand target'; break; }
          }
          const result = job.sim.playRound(false);
          if (result?.voided) { if ((job.voids = (job.voids || 0) + 1) > 100) throw Error('Repeated shoe exhaustion: use more decks or fewer seats.'); continue; }
          if (!result || result.noRound) { job.done = true; job.reason = 'No affordable wager'; break; }
          const point = M.record(job.stats, job.sim, result, job.rebuys * job.stats.initial);
          if (!point) { job.done = true; job.reason = 'Player sitting out'; break; }
          point.round = ++job.rounds; points.push(point);
          const profit = job.stats.profit / 100;
          const stop = job.rounds >= this.settings.hands || (this.settings.stopProfit > 0 && profit >= this.settings.stopProfit) ||
            (this.settings.stopLoss > 0 && profit <= -this.settings.stopLoss) || (this.settings.stopDrawdown > 0 && job.stats.drawdown >= this.settings.stopDrawdown);
          if (stop) { job.done = true; job.reason = job.rounds >= this.settings.hands ? 'Hand target' : 'Stop condition'; }
        }
        const { path, ...summary } = job.stats;
        job.stats.path = job.stats.path.slice(-1);
        const bins = { count: {}, penetration: {}, bet: {} };
        for (const p of points) for (const [type, key] of [['count', Math.max(-20, Math.min(20, Math.floor(p.openingTC)))], ['penetration', Math.min(9, Math.floor(p.penetration * 10))], ['bet', Math.floor(Math.log2(Math.max(.01, p.bet / 100)) * 2)]]) { const b = bins[type][key] ||= { profit: 0, wager: 0, n: 0 }; b.profit += p.delta; b.wager += p.roundWager; b.n++; }
        return { id: job.id, points, stats: summary, bins, done: job.done, reason: job.reason, rebuys: job.rebuys };
      });
    }
  }
  // Lanczos log-gamma + incomplete beta gives Student-t quantiles even for small clusters.
  function logGamma(z) {
    const p = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.5073432786869, -.13857109526572, 9.984369578e-6, 1.505632735e-7];
    if (z < .5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
    z--; let x = .9999999999998099; for (let i = 0; i < p.length; i++) x += p[i] / (z + i + 1);
    const t = z + p.length - .5; return .5 * Math.log(2 * Math.PI) + (z + .5) * Math.log(t) - t + Math.log(x);
  }
  function betaCF(a, b, x) {
    let c = 1, d = 1 - (a + b) * x / (a + 1); if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d; let h = d;
    for (let m = 1; m < 180; m++) {
      for (const aa of [m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m)), -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1))]) {
        d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d;
        const delta = d * c; h *= delta; if (Math.abs(delta - 1) < 1e-12 && aa < 0) return h;
      }
    } return h;
  }
  function beta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
    return x < (a + 1) / (a + b + 2) ? factor * betaCF(a, b, x) / a : 1 - factor * betaCF(b, a, 1 - x) / b;
  }
  function tCDF(t, df) { const p = .5 * beta(df / (df + t * t), df / 2, .5); return t >= 0 ? 1 - p : p; }
  const criticalCache = new Map();
  function tCritical(confidence, df) { const key = confidence + ':' + df; if (criticalCache.has(key)) return criticalCache.get(key); let lo = 0, hi = 1; const target = (1 + confidence) / 2; while (tCDF(hi, df) < target) hi *= 2;
    for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (tCDF(mid, df) < target) lo = mid; else hi = mid; } const result = (lo + hi) / 2; if (criticalCache.size > 512) criticalCache.clear(); criticalCache.set(key, result); return result; }
  function clusterGroups(jobs) {
    const parent = jobs.map((_, i) => i), find = i => parent[i] === i ? i : parent[i] = find(parent[i]);
    const seenEnv = new Map(), seenSeed = new Map();
    jobs.forEach((job, i) => { for (const [map, key] of [[seenEnv, job.environment], [seenSeed, job.config.seed]]) {
      if (map.has(key)) parent[find(i)] = find(map.get(key)); else map.set(key, i);
    } });
    const groups = new Map(); jobs.forEach((job, i) => { const key = find(i); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(job); });
    return [...groups.values()];
  }
  function ratioInterval(groups, numerator, denominator, confidence) {
    const totalN = groups.reduce((s, g) => s + numerator(g), 0), totalD = groups.reduce((s, g) => s + denominator(g), 0), point = totalD ? totalN / totalD : 0;
    if (groups.length < 2 || !totalD) return { point, ci: null, se: null };
    const influence = groups.map(g => numerator(g) - point * denominator(g)), meanD = totalD / groups.length;
    const se = Math.sqrt(influence.reduce((s, x) => s + x * x, 0) / (groups.length - 1) / groups.length) / meanD;
    const delta = tCritical(confidence, groups.length - 1) * se;
    return { point, ci: [point - delta, point + delta], se };
  }
  function summarize(jobs, confidence = .95, bootstrap = false) {
    const valid = jobs.filter(j => j.stats && j.arm !== 'control'), groups = clusterGroups(valid), sum = key => valid.reduce((s, j) => s + (j.stats[key] || 0), 0);
    const metric = key => g => g.reduce((s, j) => s + (j.stats[key] || 0), 0);
    const roi = ratioInterval(groups, metric('profit'), metric('wager'), confidence), perHand = ratioInterval(groups, metric('profit'), metric('rounds'), confidence);
    const rounds = sum('rounds'), hands = sum('hands'), profit = sum('profit'), wager = sum('wager');
    const variance = rounds > 1 ? Math.max(0, (sum('squares') - profit * profit / rounds) / (rounds - 1)) : 0;
    const drawdowns = valid.map(j => j.stats.drawdown), envROI = valid.map(j => j.stats.wager ? j.stats.profit / j.stats.wager : 0);
    const spread = envROI.length > 1 ? Math.sqrt(envROI.reduce((s, v) => s + (v - roi.point) ** 2, 0) / (envROI.length - 1)) : 0;
    let verdict = 'Uncertain · interval overlaps zero';
    if (!roi.ci) verdict = 'Insufficient independent environments';
    else if (roi.ci[0] > 0) verdict = roi.ci[0] > .01 ? 'Strongly Winning' : 'Winning';
    else if (roi.ci[1] < 0) verdict = roi.ci[1] < -.01 ? 'Strongly Losing' : 'Losing';
    else if (roi.ci[0] >= -.001 && roi.ci[1] <= .001) verdict = 'Approximately Neutral';
    const maxDrawdown = Math.max(0, ...drawdowns), meanDrawdown = drawdowns.length ? drawdowns.reduce((a, b) => a + b, 0) / drawdowns.length : 0;
    const byEnvironment = new Map();
    for (const job of valid) { const rows = byEnvironment.get(job.environment) || []; rows.push(job); byEnvironment.set(job.environment, rows); }
    const effects = [...byEnvironment.values()].filter(rows => rows.length >= 2 && rows.every(j => j.done)).map(rows => {
      const n = rows.length, p = rows.reduce((s, j) => s + j.stats.profit, 0), w = rows.reduce((s, j) => s + j.stats.wager, 0), mean = w ? p / w : 0;
      const noise = w ? rows.reduce((s, j) => s + (j.stats.profit - mean * j.stats.wager) ** 2, 0) / (n - 1) / n / (w / n) ** 2 : 0;
      return { mean, noise };
    });
    let sensitivity = 'Not established · repeat independent sessions', betweenEnvironmentSD = null;
    if (groups.length >= 10 && effects.length === byEnvironment.size && effects.length >= 10) {
      const mean = effects.reduce((s, e) => s + e.mean, 0) / effects.length;
      const observed = effects.reduce((s, e) => s + (e.mean - mean) ** 2, 0) / (effects.length - 1);
      betweenEnvironmentSD = Math.sqrt(Math.max(0, observed - effects.reduce((s, e) => s + e.noise, 0) / effects.length));
      sensitivity = betweenEnvironmentSD < .01 ? 'Robust' : betweenEnvironmentSD < .04 ? 'Moderately Sensitive' : 'Fragile';
    }

    const ruin = ratioInterval(groups, g => g.filter(j => j.stats.bankrupt).length, g => g.length, confidence);
    if (groups.length >= 2) { const z = tCritical(confidence, groups.length - 1), n = groups.length, p = ruin.point;
      const center = (p + z * z / (2 * n)) / (1 + z * z / n), half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n);
      ruin.ci = [Math.max(0, Math.min(ruin.ci?.[0] ?? 1, center - half)), Math.min(1, Math.max(ruin.ci?.[1] ?? 0, center + half))];
    }
    let bootstrapPositive = null;
    if (bootstrap && groups.length >= 10 && wager) {
      const rng = E.seeded(91837); let positive = 0;
      for (let i = 0; i < 1000; i++) { let n = 0, d = 0; for (let j = 0; j < groups.length; j++) { const g = groups[Math.floor(rng() * groups.length)]; n += metric('profit')(g); d += metric('wager')(g); } if (d && n / d > 0) positive++; }
      bootstrapPositive = positive / 1000;
    }
    return { environments: new Set(valid.map(j => j.environment)).size, clusters: groups.length, sessions: valid.length, completed: valid.filter(j => j.done).length,
      rounds, hands, profit, wager, roi, perHand, profit100: perHand.point * 100, variance, sd: Math.sqrt(variance), riskAdjusted: variance ? perHand.point / Math.sqrt(variance) : 0,
      wins: sum('wins'), losses: sum('losses'), pushes: sum('pushes'), blackjacks: sum('blackjacks'),
      averageWager: rounds ? sum('openingWager') / rounds : 0, largestWager: Math.max(0, ...valid.map(j => j.stats.largestWager)),
      ruin, maxDrawdown, meanDrawdown, verdict, varianceClass: Math.sqrt(variance) / Math.max(1, rounds ? sum('openingWager') / rounds : 1) < 1 ? 'Low' : Math.sqrt(variance) / Math.max(1, rounds ? sum('openingWager') / rounds : 1) < 2 ? 'Medium' : 'High',
      drawdownClass: meanDrawdown < .1 ? 'Low' : meanDrawdown < .3 ? 'Medium' : 'High', sensitivity, betweenEnvironmentSD, bootstrapPositive };
  }
  function comparison(jobs, confidence) {
    const groups = clusterGroups(jobs.filter(j => j.stats));
    const total = arm => jobs.filter(j => j.stats && j.arm === arm).reduce((s, j) => ({ n: s.n + j.stats.profit, d: s.d + j.stats.wager }), { n: 0, d: 0 });
    const a = total('strategy'), b = total('control'); if (!a.d || !b.d || groups.length < 2) return null;
    const pa = a.n / a.d, pb = b.n / b.d, influence = groups.map(g => {
      let va = 0, vb = 0; for (const j of g) if (j.arm === 'strategy') va += j.stats.profit - pa * j.stats.wager; else vb += j.stats.profit - pb * j.stats.wager;
      return va / (a.d / groups.length) - vb / (b.d / groups.length);
    });
    const se = Math.sqrt(influence.reduce((s, v) => s + v * v, 0) / (groups.length - 1) / groups.length), delta = tCritical(confidence, groups.length - 1) * se;
    return { point: pa - pb, ci: [pa - pb - delta, pa - pb + delta], clusters: groups.length };
  }
  // Descriptive examples, not statistical significance tests. Normalizing by
  // median absolute deviation makes unusually volatile paths visible too.
  function exampleRuns(jobs, referenceId = null) {
    const valid = jobs.filter(j => j.stats?.rounds && j.stats.wager > 0);
    const roi = j => j.stats.profit / j.stats.wager;
    const volatility = j => { const s = j.stats, n = s.rounds; return n > 1 ? Math.sqrt(Math.max(0, (s.squares - s.profit * s.profit / n) / (n - 1))) / Math.max(1, s.openingWager / n) : 0; };
    let candidates;
    if (referenceId) {
      const refs = new Map(valid.filter(j => j.strategyId === referenceId).map(j => [`${j.environment}:${j.session}`, j]));
      candidates = valid.filter(j => j.strategyId !== referenceId && refs.has(`${j.environment}:${j.session}`)).map(j => { const ref = refs.get(`${j.environment}:${j.session}`); return { job: j, reference: ref, score: roi(j) - roi(ref), volatility: Math.abs(volatility(j) - volatility(ref)) }; });
    } else candidates = valid.filter(j => j.arm !== 'control').map(j => ({ job: j, score: roi(j), volatility: volatility(j) }));
    if (!candidates.length) return [];
    candidates.sort((a, b) => a.score - b.score || a.job.id.localeCompare(b.job.id));
    const median = values => { const sorted = [...values].sort((a, b) => a - b), i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; };
    const center = median(candidates.map(c => c.score)), volCenter = median(candidates.map(c => c.volatility));
    const mad = Math.max(1e-9, median(candidates.map(c => Math.abs(c.score - center)))), volMad = Math.max(1e-9, median(candidates.map(c => Math.abs(c.volatility - volCenter))));
    const anomalous = [...candidates].sort((a, b) => (Math.abs(b.score - center) / mad + Math.abs(b.volatility - volCenter) / volMad) - (Math.abs(a.score - center) / mad + Math.abs(a.volatility - volCenter) / volMad))[0];
    return [['Best', candidates.at(-1)], ['Worst', candidates[0]], ['Median', candidates[Math.floor((candidates.length - 1) / 2)]], ['Most anomalous', anomalous]].map(([label, c]) => ({ label, jobId: c.job.id, referenceId: c.reference?.id || null, value: c.score, volatility: c.volatility }));
  }
  function solve(a, b) {
    const n = b.length, rows = a.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < n; i++) { let pivot = i; for (let j = i + 1; j < n; j++) if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
      [rows[i], rows[pivot]] = [rows[pivot], rows[i]]; const scale = rows[i][i]; if (Math.abs(scale) < 1e-14) return b.map(() => 0);
      for (let k = i; k <= n; k++) rows[i][k] /= scale;
      for (let j = 0; j < n; j++) if (j !== i) { const f = rows[j][i]; for (let k = i; k <= n; k++) rows[j][k] -= f * rows[i][k]; }
    } return rows.map(r => r[n]);
  }
  function fit(points, kind, window = 20, smoothing = 1) {
    if (points.length < 2 || kind === 'average') return points;
    if (kind === 'sma') return points.map((p, i) => ({ x: p.x, y: points.slice(Math.max(0, i - window + 1), i + 1).reduce((s, q) => s + q.y, 0) / Math.min(window, i + 1) }));
    const max = Math.max(1, points.at(-1).x), basis = x => kind === 'lr' ? [1, x / max] : [1, x / max, (x / max) ** 2, (x / max) ** 3, ...[.2, .4, .6, .8].map(k => Math.max(0, x / max - k) ** 3)];
    const n = basis(0).length, a = Array.from({ length: n }, () => Array(n).fill(0)), b = Array(n).fill(0);
    for (const p of points) { const v = basis(p.x); for (let i = 0; i < n; i++) { b[i] += v[i] * p.y; for (let j = 0; j < n; j++) a[i][j] += v[i] * v[j]; } }
    for (let i = 2; i < n; i++) a[i][i] += smoothing;
    const coefficients = solve(a, b); return points.map(p => ({ x: p.x, y: basis(p.x).reduce((s, v, i) => s + v * coefficients[i], 0) }));
  }
  return { PARAMETERS, defaults, get, set, sample, design, Shard, summarize, comparison, exampleRuns, clusterGroups, ratioInterval, tCDF, tCritical, fit };
})();
if (typeof module !== 'undefined') module.exports = BJLab;
