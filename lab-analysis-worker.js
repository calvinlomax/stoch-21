'use strict';
importScripts('./rules.js', './engine.js', './modes-core.js', './laboratory-core.js');

// The simulation workers maintain cumulative bins. This worker combines the
// latest selected runs into chart-ready values without blocking interaction.
onmessage = event => {
  const { id, jobs, multi, confidence, strategies, selected } = event.data;
  try {
    const cards = [], usable = jobs.filter(j => j.stats && (multi || selected || j.arm === 'strategy'));
    const groups = multi ? strategies : [{ id: 'strategy', name: 'Strategy' }];
    const belongs = (job, strategy) => !multi || job.strategyId === strategy.id;
    for (const [title, accessor] of [['Session profit histogram $', j => j.stats.profit / 100], ['Drawdown distribution (fraction)', j => j.stats.drawdown]]) {
      const vals = usable.map(accessor), lo = Math.min(0, ...vals), hi = Math.max(lo + 1e-6, ...vals), count = multi ? 10 : 12, values = [];
      for (let i = 0; i < count; i++) for (const s of groups) {
        const matches = usable.filter(j => belongs(j, s) && Math.min(count - 1, Math.floor((accessor(j) - lo) / (hi - lo) * count)) === i);
        if (multi && !usable.some(j => belongs(j, s))) continue;
        values.push({ label: `${multi ? s.name + ': ' : ''}${(lo + i * (hi - lo) / count).toFixed(2)} to ${(lo + (i + 1) * (hi - lo) / count).toFixed(2)}`, value: matches.length, strategyId: multi ? s.id : null, runId: matches[0]?.id });
      }
      cards.push({ title, values, selectable: true });
    }
    for (const [type, title] of [['count', 'Return by opening true count'], ['penetration', 'Return by shoe penetration'], ['bet', 'Opening wager distribution $']]) {
      const buckets = new Map();
      for (const job of usable) for (const [key, value] of Object.entries(job.bins[type])) {
        const id = `${key}\u0000${multi ? job.strategyId : 'strategy'}`; if (!buckets.has(id)) buckets.set(id, []);
        buckets.get(id).push({ ...job, arm: 'strategy', stats: { ...job.stats, profit: value.profit, wager: value.wager, rounds: value.n } });
      }
      cards.push({ title, values: [...buckets].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([key, rows]) => {
        const [bucket, strategyId] = key.split('\u0000'), summary = BJLab.summarize(rows, confidence), name = strategies.find(s => s.id === strategyId)?.name;
        const label = type === 'count' ? bucket : type === 'penetration' ? `${bucket * 10}–${bucket * 10 + 10}%` : `${(2 ** (+bucket / 2)).toFixed(2)}–${(2 ** ((+bucket + 1) / 2)).toFixed(2)}`;
        return { label: `${label}${multi ? ' · ' + name : ''}`, value: type === 'bet' ? rows.reduce((n, j) => n + j.stats.rounds, 0) : summary.roi.point, ci: type === 'bet' ? null : summary.roi.ci, strategyId: multi ? strategyId : null };
      }) });
    }
    for (const [type, title, categories] of [['outcomes', 'Settled outcomes (blackjacks are a win/push subset)', ['wins', 'losses', 'pushes', 'blackjacks']], ['actions', 'Strategy decision frequencies', ['hit', 'stand', 'double', 'split', 'surrender']]]) {
      const values = [];
      for (const key of categories) for (const s of groups) { const rows = usable.filter(j => belongs(j, s)); if (multi && !rows.length) continue;
        values.push({ label: `${key}${multi ? ' · ' + s.name : ''}`, value: rows.reduce((n, j) => n + (type === 'actions' ? j.stats.actions?.[key] || 0 : j.stats[key] || 0), 0), strategyId: multi ? s.id : null }); }
      cards.push({ title, values });
    }
    const ruleGroups = new Map();
    for (const job of usable) { const r = job.config.rules, label = `${r.dealer.mode}/${r.dealer.hole}/${r.payout.numerator / r.payout.denominator}/${r.dealer.das ? 'DAS' : 'NDAS'}/${r.dealer.surrender ? 'LS' : 'NS'}`, key = `${label}\u0000${multi ? job.strategyId : 'strategy'}`; if (!ruleGroups.has(key)) ruleGroups.set(key, []); ruleGroups.get(key).push({ ...job, arm: 'strategy' }); }
    cards.push({ title: 'Expected return by realized rule configuration', values: [...ruleGroups].map(([key, rows]) => { const [label, strategyId] = key.split('\u0000'), summary = BJLab.summarize(rows, confidence); return { label: `${label}${multi ? ' · ' + (strategies.find(s => s.id === strategyId)?.name || strategyId) : ''}`, value: summary.roi.point, ci: summary.roi.ci, strategyId: multi ? strategyId : null }; }) });
    postMessage({ id, cards });
  } catch (error) { postMessage({ id, error: error.message }); }
};
