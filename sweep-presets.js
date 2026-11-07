/* Reproducible examples selected from the 2026-11-06 Laboratory sweep. */
'use strict';
(() => {
  // Pooled ROI covers all 20 sessions for the named pair; sample ROI is the
  // particular 100-round run whose table settings and seed are captured here.
  const presets = [
    { id: 'six-running', name: 'Six-Deck Running Count', play: 'basic', bet: 'rcDiscrete', decks: 6, penetration: 65.8927, dealer: 'H17', seed: 2056136597, sample: .14031, pooled: .026468, environment: 1, session: 1 },
    { id: 'eight-linear', name: 'Eight-Deck Linear Deviations', play: 'deviations', bet: 'linear', decks: 8, penetration: 60.7221, dealer: 'H17', seed: 4138020132, sample: .24301, pooled: .041186, environment: 2, session: 2 },
    { id: 'eight-ev', name: 'Eight-Deck EV Percentile', play: 'optimal', bet: 'percentile', decks: 8, penetration: 65.1644, dealer: 'S17', seed: 2241085921, sample: .222, pooled: .005987, environment: 3, session: 2 },
    { id: 'six-sigmoid', name: 'Six-Deck Sigmoid Basic', play: 'basic', bet: 'sigmoid', decks: 6, penetration: 73.3488, dealer: 'S17', seed: 643181261, sample: .22991, pooled: .021485, environment: 4, session: 2 },
    { id: 'two-bankroll', name: 'Two-Deck Bankroll Deviations', play: 'deviations', bet: 'bankroll', decks: 2, penetration: 74.1655, dealer: 'H17', seed: 1321003994, sample: .01872, pooled: .027010, environment: 5, session: 2 },
    { id: 'two-penetration', name: 'Two-Deck Penetration Basic', play: 'basic', bet: 'penetration', decks: 2, penetration: 73.8111, dealer: 'S17', seed: 2025361316, sample: .05538, pooled: .021987, environment: 6, session: 1 },
    { id: 'two-ev-flat', name: 'Two-Deck EV Flat', play: 'optimal', bet: 'flat', decks: 2, penetration: 63.7887, dealer: 'H17', seed: 1435799165, sample: .11842, pooled: .004139, environment: 7, session: 1 },
    { id: 'six-count-bankroll', name: 'Six-Deck Count & Bankroll', play: 'deviations', bet: 'countBankroll', decks: 6, penetration: 78.5328, dealer: 'S17', seed: 3552828010, sample: .14682, pooled: .039446, environment: 8, session: 1 },
    { id: 'two-power', name: 'Two-Deck Power Deviations', play: 'deviations', bet: 'power', decks: 2, penetration: 64.1558, dealer: 'S17', seed: 1748240612, sample: .10723, pooled: .036189, environment: 9, session: 1 },
    { id: 'eight-percentile', name: 'Eight-Deck Percentile Basic', play: 'basic', bet: 'percentile', decks: 8, penetration: 80.1605, dealer: 'H17', seed: 2170606468, sample: .15061, pooled: .021392, environment: 10, session: 1 },
  ];
  function differences(a, b) { return ['play', 'bet', 'decks', 'penetration', 'dealer'].filter(key => a[key] !== b[key]).length; }
  function description(p) {
    const close = presets.filter(other => other !== p && differences(p, other) === 3).map(other => other.name);
    return `Source: environment ${p.environment}, session ${p.session}; sample ROI ${(p.sample * 100).toFixed(2)}% over 100 rounds; pair ROI ${(p.pooled * 100).toFixed(2)}% over 2,000 rounds. All pair confidence intervals overlap zero. The original shoe seed is included. ${close.length ? 'Differs in three settings from: ' + close.join(', ') + '.' : 'Differs by at least four settings from the other presets.'}`;
  }
  function apply(envelope, id) {
    const preset = presets.find(p => p.id === id); if (!preset) throw Error('Unknown sweep preset.');
    const e = JSON.parse(JSON.stringify(envelope)); e.rules = BJRules.defaults();
    e.rules.play.mode = preset.play; e.rules.bet.mode = preset.bet; e.rules.dealer.mode = preset.dealer; e.rules.limits.terminate = 'you';
    Object.assign(e.fields, { decks: String(preset.decks), penetration: String(preset.penetration), penetrationMode: 'fixed', penetrationSigma: '3', minBet: '10', baseBet: '25', starting: '10000', finite: true, heroSeat: '2', countSystem: 'hiLo', seed: String(preset.seed) });
    e.seats = BJModes.seats(2, '', 2); return e;
  }
  window.BJSweepPresets = { presets, differences, description, apply };
})();
