const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../rules");
const {
  BlackjackSimulation,
  handValue,
  policyAction,
  seeded,
} = require("../engine");
function config(r = R.defaults(), extra = {}) {
  return {
    seed: 7301,
    decks: 6,
    penetration: 75,
    penetrationMode: "fixed",
    sessions: 1,
    rounds: 50,
    minBet: 10,
    baseBet: 25,
    finite: true,
    seats: [{ seat: 2, active: true, amount: 10000 }],
    rules: r,
    ...extra,
  };
}
function run(c) {
  let sim = new BlackjackSimulation(c),
    safety = 0;
  while (!sim.finished && safety++ < 10000) {
    sim.playRound();
    if (sim.pendingSessionEnd) sim.finishSession();
  }
  assert.ok(sim.finished);
  return sim;
}
function rig(r, cards, extra = {}) {
  let s = new BlackjackSimulation(config(r, { rounds: 1, ...extra }));
  s.shoe = cards.map((rank) => ({ rank, suit: "clubs" })).reverse();
  s.shoeSize = s.shoe.length;
  s.cutCard = 1000;
  return s;
}
const ctx = {
  base: 25,
  min: 10,
  bankroll: 10000,
  tc: 3.75,
  rc: 6,
  penetration: 0.75,
  finite: true,
};
test("legacy Hi-Lo settings migrate without changing the spread", () => {
  let r = R.migrate({
    betMode: "count",
    spread: 8,
    strategy: "mimic",
    h17: true,
    blackjackPay: 1.2,
    humanOpponents: false,
    showCount: false,
  });
  assert.equal(r.bet.mode, "tcDiscrete");
  assert.equal(R.constrain(r, R.rawBet(r, ctx), ctx), 7500);
  assert.equal(r.play.mode, "mimic");
  assert.equal(r.payout.numerator / r.payout.denominator, 1.2);
  assert.equal(r.analytics.mode, "hidden");
});
test("all betting models produce legal wagers and complete a seeded simulation", () => {
  for (const mode of Object.keys(R.BETS)) {
    let r = R.defaults();
    r.bet.mode = mode;
    R.validate(r);
    for (const tc of [-10, 0, 2.5, 20]) {
      let c = { ...ctx, tc, rc: tc };
      let actual = R.constrain(r, R.rawBet(r, c), c);
      assert.ok(actual >= 1000 && actual <= 10000, mode);
    }
    let s = run(config(r));
    assert.equal(s.stats.rounds, 50, mode);
    assert.equal(s.players[0].balance - 1000000, s.stats.profit, mode);
  }
});
test("custom expression interpreter rejects code and undefined domains", () => {
  for (const text of [
    "globalThis.alert(1)",
    "constructor.constructor(1)",
    "base=100",
    "base;alert(1)",
    "[1,2]",
    "Math.random()",
    "base ? 1 : 2",
  ])
    assert.throws(() => R.expression(text));
  assert.equal(R.expression("base * max(1, c)^2")({ base: 25, c: 2 }), 100);
  assert.throws(() => R.expression("sqrt(c)")({ c: -1 }));
  assert.throws(() => R.expression("1 / c")({ c: 0 }));
  assert.throws(() => R.expression("pow(2)"));
});
test("consistent chip, table, bankroll, and spread constraints", () => {
  let r = R.defaults();
  r.limits.mode = "none";
  r.limits.tableMax = 67;
  r.limits.chip = 2;
  r.limits.increment = 3;
  assert.equal(R.constrain(r, 100, ctx), 6600);
  assert.equal(R.constrain(r, 100, { ...ctx, bankroll: 13 }), 1200);
  assert.equal(R.constrain(r, 100, { ...ctx, bankroll: 9 }), 0);
  r.limits.insufficient = "sitout";
  assert.equal(R.constrain(r, 100, { ...ctx, bankroll: 50 }), 0);
  r.limits.mode = "bankroll";
  r.limits.bankrollMax = 0.001;
  assert.equal(R.constrain(r, 100, ctx), 0);
});
test("natural and ordinary payouts are accounted separately", () => {
  for (const [n, d] of [
    [3, 2],
    [6, 5],
    [1, 1],
    [2, 1],
    [7, 4],
  ]) {
    let r = R.defaults();
    r.payout = { numerator: n, denominator: d };
    let s = rig(r, ["ace", "9", "king", "8"]);
    s.playRound();
    assert.equal(s.stats.profit, Math.round((2500 * n) / d));
    assert.equal(s.stats.blackjacks, 1);
    let win = rig(r, ["king", "9", "queen", "8"]);
    win.playRound();
    assert.equal(win.stats.profit, 2500);
  }
});
test("dealer and player naturals push; dealer blackjack preempts surrender", () => {
  let r = R.defaults();
  let s = rig(r, ["ace", "ace", "king", "king"]);
  s.playRound();
  assert.equal(s.stats.profit, 0);
  r.dealer.hole = "nopeek";
  r.dealer.surrender = true;
  r.play.mode = "custom";
  r.play.table = { "hard:16:11": "surrender" };
  s = rig(r, ["10", "ace", "6", "king"]);
  s.playRound();
  assert.equal(s.stats.profit, -2500);
});
test("late surrender loses exactly half and records wager", () => {
  let r = R.defaults();
  r.dealer.surrender = true;
  r.play.mode = "adjusted";
  let s = rig(r, ["10", "10", "6", "7"]);
  s.playRound();
  assert.equal(s.stats.profit, -1250);
  assert.equal(s.stats.wager, 2500);
  assert.equal(s.players[0].hands[0].status, "Surrender");
});
test("S17, H17, and custom dealer thresholds change actual dealer draws", () => {
  let results = [];
  for (const mode of ["S17", "H17", "custom"]) {
    let r = R.defaults();
    r.dealer.mode = mode;
    r.dealer.softStand = 19;
    r.dealer.hardStand = 18;
    r.play.mode = "stand";
    let s = rig(r, ["10", "ace", "8", "6", "2"]);
    s.playRound();
    results.push(s.dealer.length);
  }
  assert.deepEqual(results, [2, 3, 3]);
});
test("no-peek and European rules do not reveal blackjack to player decisions", () => {
  for (const hole of ["peek", "nopeek", "european"]) {
    let r = R.defaults();
    r.dealer.hole = hole;
    r.play.mode = "custom";
    r.play.table = { "hard:11:11": "double" };
    let s = rig(
      r,
      hole === "european"
        ? ["5", "ace", "6", "2", "king"]
        : ["5", "ace", "6", "king", "2"],
    );
    s.playRound();
    assert.equal(s.stats.wager, hole === "peek" ? 2500 : 5000);
    assert.equal(s.stats.profit, hole === "peek" ? -2500 : -5000);
  }
});
test("insurance accounting is separate and reproducible", () => {
  let r = R.defaults();
  r.play.mode = "deviations";
  r.play.insuranceIndex = -20;
  let s = rig(r, ["10", "ace", "9", "king"]);
  s.playRound();
  assert.equal(s.stats.insuranceWager, 1250);
  assert.equal(s.stats.insuranceProfit, 2500);
  assert.equal(s.stats.profit, 0);
  assert.equal(s.stats.wager, 3750);
});
test("custom strategy illegal actions fall back legally", () => {
  let r = R.defaults();
  r.play.mode = "custom";
  r.play.table = { "hard:16:10": "double" };
  let h = { cards: ["10", "3", "3"].map((rank) => ({ rank })) };
  assert.equal(
    policyAction(
      "custom",
      h,
      { rank: "10" },
      { canDouble: false, canSplit: false },
      r,
    ),
    "hit",
  );
});
test("every playing strategy integrates and conserves account balances", () => {
  for (const mode of Object.keys(R.PLAYS)) {
    let r = R.defaults();
    r.play.mode = mode;
    r.play.evSamples = 32;
    let s = run(config(r, { rounds: 15 }));
    assert.equal(s.stats.rounds, 15);
    assert.equal(s.players[0].balance - 1000000, s.stats.profit, mode);
    assert.ok(s.players[0].balance >= 0);
  }
});
test("opponent progressions respond to wins/losses, preserve pushes, and reset", () => {
  for (const bet of ["martingale", "paroli", "fibonacci", "dalembert"]) {
    let r = R.defaults(),
      p = { progression: 2, profile: { bet } };
    R.progress(p, 0, r);
    assert.equal(p.progression, 2);
    R.progress(p, -1, r);
    assert.equal(p.progression, bet === "paroli" ? 0 : 3);
    R.progress(p, 1, r);
    assert.equal(
      p.progression,
      bet === "martingale"
        ? 0
        : bet === "paroli"
          ? 1
          : bet === "fibonacci"
            ? 1
            : 2,
    );
  }
});
test("per-seat skill and wager overrides remain independent", () => {
  let r = R.defaults();
  r.opponents.skill = "basic";
  r.opponents.bet = "flat";
  r.opponents.seats = {
    0: { play: "stand", bet: "martingale", base: 40, bankroll: 2000 },
    1: { play: "hit", bet: "flat", base: 15 },
  };
  let s = new BlackjackSimulation(
    config(r, {
      seats: [
        { seat: 0, active: true, amount: 10000 },
        { seat: 1, active: true, amount: 10000 },
      ],
    }),
  );
  s.playRound();
  assert.equal(s.players[0].profile.play, "stand");
  assert.equal(s.players[1].profile.play, "hit");
  assert.equal(s.players[0].initial, 200000);
  assert.equal(s.players[0].hands[0].openingBet, 4000);
  assert.equal(s.players[1].hands[0].openingBet, 1500);
});
test("all opponent betting modes complete reproducibly", () => {
  for (const bet of Object.keys(R.OPPBETS)) {
    let r = R.defaults();
    r.opponents.bet = bet;
    let c = config(r, {
      seats: [
        { seat: 0, active: true, amount: 10000 },
        { seat: 3, active: true, amount: 10000 },
      ],
    });
    let a = run(c),
      b = run(c);
    assert.deepEqual(a.stats, b.stats, bet);
    assert.equal(
      a.players.reduce((v, p) => v + p.balance - p.initial, 0),
      a.stats.profit,
    );
  }
});
test("hidden count display does not change game or betting state", () => {
  let r = R.defaults();
  r.play.mode = "deviations";
  r.bet.mode = "tcDiscrete";
  let a = run(config(r));
  r.analytics.mode = "hidden";
  let b = run(config(r));
  assert.deepEqual(a.stats, b.stats);
  assert.equal(a.count, b.count);
});
test("composition EV uses observations, never actual hidden cards or shoe order", () => {
  let r = R.defaults();
  r.play.evSamples = 32;
  let a = new BlackjackSimulation(config(r)),
    b = new BlackjackSimulation(config(r));
  let h = { cards: [{ rank: "10" }, { rank: "6" }] },
    up = { rank: "10" },
    legal = { canDouble: true, canSplit: false, canSurrender: true };
  b.shoe.reverse();
  b.dealer = [up, { rank: "ace" }];
  a.dealer = [up, { rank: "2" }];
  assert.deepEqual(
    a.actionEVs(h, up, legal, true),
    b.actionEVs(h, up, legal, true),
  );
});
test("exhausted shoe refunds all bets and does not record a round", () => {
  let r = R.defaults();
  r.play.mode = "hit";
  let s = rig(r, ["2", "3", "4", "5"]);
  let result = s.playRound();
  assert.ok(result.voided);
  assert.equal(s.players[0].balance, 1000000);
  assert.equal(s.stats.rounds, 0);
  assert.equal(s.stats.wager, 0);
});
test("validation rejects malformed tables, profiles, enums, and nonfinite values", () => {
  for (const mutate of [
    (r) =>
      (r.bet.lookup = [
        [2, 1],
        [1, 2],
      ]),
    (r) => (r.bet.variance = 0),
    (r) => (r.bet.mode = "unknown"),
    (r) => (r.limits.chip = NaN),
    (r) => (r.opponents.seats = { 2: { bet: "flat" } }),
    (r) => (r.play.table = { bad: "hit" }),
    (r) => (r.opponents.error = -1),
  ]) {
    let r = R.defaults();
    mutate(r);
    assert.throws(() => R.validate(r));
  }
});
test("round traces render every event independent of the speed multiplier", () => {
  let r = R.defaults(),
    a = new BlackjackSimulation(config(r)),
    b = new BlackjackSimulation(config(r));
  let x = a.playRound(true),
    y = b.playRound(false);
  assert.ok(x.events.length > 4);
  assert.deepEqual(x.final, y.final);
  assert.deepEqual(a.stats, b.stats);
});
test("a runtime expression failure refunds earlier seats in the same round", () => {
  let r = R.defaults();
  r.opponents.seats = { 1: { bet: "custom", expression: "sqrt(tc - 1)" } };
  let s = new BlackjackSimulation(
    config(r, {
      seats: [
        { seat: 0, active: true, amount: 10000 },
        { seat: 1, active: true, amount: 10000 },
      ],
    }),
  );
  assert.throws(() => s.playRound());
  assert.deepEqual(
    s.players.map((p) => p.balance),
    [1000000, 1000000],
  );
  assert.equal(s.stats.wager, 0);
});
test("Paroli resets after the configured winning streak", () => {
  let r = R.defaults(),
    p = { progression: 2, profile: { bet: "paroli" } };
  R.progress(p, 1, r);
  assert.equal(p.progression, 0);
});
test("percentile strategy reacts to previously observed counts", () => {
  let r = R.defaults();
  r.bet.mode = "percentile";
  assert.ok(
    R.rawBet(r, { ...ctx, countSamples: [-10, -5] }) >
      R.rawBet(r, { ...ctx, countSamples: [5, 10] }),
  );
});
test("fractional-chip accounting stays in cents and split aces pay ordinary wins", () => {
  let r = R.defaults();
  r.limits.chip = 0.25;
  r.limits.increment = 0.25;
  r.bet.mode = "custom";
  r.bet.expression = "25.25";
  let s = rig(r, ["ace", "9", "ace", "8", "king", "queen"]);
  s.playRound();
  assert.equal(s.stats.hands, 2);
  assert.equal(s.stats.blackjacks, 0);
  assert.equal(s.stats.wager, 5050);
  assert.equal(s.stats.profit, 5050);
  assert.equal(s.players[0].balance, 1005050);
});
test("multiple sessions reset bankrolls and progression state", () => {
  let r = R.defaults();
  r.opponents.bet = "martingale";
  let s = new BlackjackSimulation(
    config(r, {
      sessions: 2,
      rounds: 1,
      seats: [{ seat: 0, active: true, amount: 10000 }],
    }),
  );
  s.playRound();
  s.players[0].progression = 5;
  s.finishSession();
  assert.equal(s.players[0].balance, 1000000);
  assert.equal(s.players[0].progression, 0);
  s.playRound();
  s.finishSession();
  assert.equal(s.stats.sessions, 2);
  assert.equal(
    s.stats.profit,
    s.stats.sessionProfits.reduce((a, b) => a + b, 0),
  );
});
