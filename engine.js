"use strict";
const Rules = typeof module !== "undefined" ? require("./rules.js") : BJRules;
// Discrete, finite-shoe Monte Carlo engine. Monetary values are integer cents.
const RANKS = [
  "ace",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "jack",
  "queen",
  "king",
];
const SUITS = ["clubs", "diamonds", "hearts", "spades"];
function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hiLo(card) {
  return card.rank === "ace" ||
    ["10", "jack", "queen", "king"].includes(card.rank)
    ? -1
    : +card.rank >= 2 && +card.rank <= 6
      ? 1
      : 0;
}
function rankValue(rank) {
  return rank === "ace"
    ? 11
    : ["jack", "queen", "king"].includes(rank)
      ? 10
      : +rank;
}
function handValue(cards) {
  let v = 0,
    aces = 0;
  for (const c of cards) {
    v += rankValue(c.rank);
    if (c.rank === "ace") aces++;
  }
  while (v > 21 && aces) {
    v -= 10;
    aces--;
  }
  return { total: v, soft: aces > 0 };
}
function natural(h) {
  return !h.split && h.cards.length === 2 && handValue(h.cards).total === 21;
}
function basicAction(h, up, opts) {
  const { total, soft } = handValue(h.cards),
    u = rankValue(up.rank),
    two = h.cards.length === 2;
  if (
    two &&
    opts.canSplit &&
    rankValue(h.cards[0].rank) === rankValue(h.cards[1].rank)
  ) {
    const v = rankValue(h.cards[0].rank);
    if (
      v === 11 ||
      v === 8 ||
      (v === 9 && [2, 3, 4, 5, 6, 8, 9].includes(u)) ||
      (v === 7 && u <= 7) ||
      (v === 6 && u <= 6) ||
      (v === 4 && (u === 5 || u === 6)) ||
      ((v === 2 || v === 3) && u <= 7)
    )
      return "split";
  }
  let double = false,
    fallback = "hit";
  if (soft) {
    if (total >= 20) return "stand";
    if (total === 19) {
      double = opts.h17 && u === 6;
      fallback = "stand";
    } else if (total === 18) {
      double = (u >= 3 && u <= 6) || (opts.h17 && u === 2);
      fallback = u <= 8 ? "stand" : "hit";
    } else if (total === 17) double = u >= 3 && u <= 6;
    else if (total === 15 || total === 16) double = u >= 4 && u <= 6;
    else if (total === 13 || total === 14) double = u === 5 || u === 6;
  } else {
    if (total >= 17) return "stand";
    if (total >= 13 && total <= 16) return u >= 2 && u <= 6 ? "stand" : "hit";
    if (total === 12) return u >= 4 && u <= 6 ? "stand" : "hit";
    if (total === 11) double = u <= 10 || opts.h17;
    else if (total === 10) double = u <= 9;
    else if (total === 9) double = u >= 3 && u <= 6;
  }
  return double && two && opts.canDouble ? "double" : fallback;
}
function legalAction(action, h, up, opts, h17) {
  if (
    (action === "split" && !opts.canSplit) ||
    (action === "double" && !opts.canDouble) ||
    (action === "surrender" && !opts.canSurrender)
  )
    return basicAction(h, up, { ...opts, h17 });
  return action;
}
function policyAction(mode, h, up, opts, r, tc = 0, rng = () => 0.5) {
  const v = handValue(h.cards),
    u = rankValue(up.rank),
    pair =
      h.cards.length === 2 &&
      rankValue(h.cards[0].rank) === rankValue(h.cards[1].rank),
    type = pair ? "pair" : v.soft ? "soft" : "hard",
    number = pair ? rankValue(h.cards[0].rank) : v.total;
  let action = basicAction(h, up, opts);
  if (mode === "mimic") action = v.total < 17 ? "hit" : "stand";
  else if (mode === "stand") action = "stand";
  else if (mode === "hit") action = "hit";
  else if (mode === "conservative") action = v.total >= 12 ? "stand" : "hit";
  else if (mode === "aggressive")
    action =
      v.total >= 19
        ? "stand"
        : opts.canDouble && v.total >= 9 && v.total <= 11
          ? "double"
          : "hit";
  else if (mode === "random") {
    let a = [
      "hit",
      "stand",
      ...(opts.canSplit ? ["split"] : []),
      ...(opts.canDouble ? ["double"] : []),
      ...(opts.canSurrender ? ["surrender"] : []),
    ];
    action = a[Math.floor(rng() * a.length)];
  } else if (mode === "custom")
    action =
      r.play.table[`${type}:${number}:${u}`] ||
      r.play.table[`${v.soft ? "soft" : "hard"}:${v.total}:${u}`] ||
      action;
  else if (["adjusted", "deviations"].includes(mode)) {
    if (!r.dealer.das && pair) {
      let p = rankValue(h.cards[0].rank);
      if (p === 4 || ([2, 3].includes(p) && u <= 3) || (p === 6 && u === 2))
        action = "hit";
    }
    if (
      opts.canSurrender &&
      !v.soft &&
      ((v.total === 16 && [9, 10, 11].includes(u) && !pair) ||
        (v.total === 15 && u === 10) ||
        (opts.h17 && u === 11 && [15, 17].includes(v.total)))
    )
      action = "surrender";
    if (
      r.dealer.hole !== "peek" &&
      [10, 11].includes(u) &&
      ["double", "split"].includes(action) &&
      !(pair && number === 11 && u === 10)
    )
      action = "hit";
    if (mode === "deviations") {
      // Surrender indices take precedence over stand/hit indices when surrender is legal.
      let rows = r.play.deviations.filter(
        (d) =>
          d[0] === (d[0] === "pair" ? type : v.soft ? "soft" : "hard") &&
          d[1] === (d[0] === "pair" ? number : v.total) &&
          d[2] === u &&
          (d[4] !== "surrender" || opts.canSurrender),
      );
      for (const d of rows) {
        action = tc >= d[3] ? d[4] : d[5];
      }
    }
  }
  return legalAction(action, h, up, opts, opts.h17);
}
// Gaussian samples use percentage points. Rejection sampling avoids boundary spikes.
function sampleCutTarget(config, rng) {
  const mode = config.penetrationMode ?? "fixed";
  if (mode === "fixed") return config.penetration;
  const [sigma, low, high] =
    mode === "simulated" ? [1.5, 70, 80] : [config.penetrationSigma, 20, 95];
  if (sigma === 0) return 75;
  for (;;) {
    const radius = Math.sqrt(-2 * Math.log(1 - rng()));
    const sample = 75 + sigma * radius * Math.cos(2 * Math.PI * rng());
    if (sample >= low && sample <= high) return sample;
  }
}
const NPC_PROFILES = [
  { name: "Cautious regular", error: 0.04, bias: "due" },
  { name: "Experienced regular", error: 0.02, bias: "hot" },
  null,
  { name: "Casual risk-taker", error: 0.12, bias: "hot" },
  { name: "Inconsistent newcomer", error: 0.2, bias: "due" },
];
function freshStats() {
  return {
    rounds: 0,
    hands: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    blackjacks: 0,
    playerBusts: 0,
    dealerBusts: 0,
    wager: 0,
    profit: 0,
    sumX2: 0,
    sumXY: 0,
    sumY2: 0,
    sessions: 0,
    ruined: 0,
    sessionProfits: [],
    sessionWagers: [],
    shuffles: 0,
    cutShoes: 0,
    exhaustedShoes: 0,
    cutTargetSum: 0,
    realizedSum: 0,
    npcDecisions: 0,
    npcDeviations: 0,
    biasBets: 0,
  };
}
class BlackjackSimulation {
  constructor(config) {
    this.config = JSON.parse(JSON.stringify(config));
    this.rules = Rules.validate(Rules.migrate(config));
    this.config.rules = this.rules;
    this.config.blackjackPay =
      this.rules.payout.numerator / this.rules.payout.denominator;
    this.config.h17 = this.rules.dealer.mode === "H17";
    this.rng = seeded(config.seed);
    this.cutRng = seeded(config.seed ^ 0x9e3779b9);
    this.behaviorRng = seeded(config.seed ^ 0x85ebca6b);
    this.stats = freshStats();
    this.sessionIndex = 1;
    this.finished = false;
    this.pendingSessionEnd = false;
    this.beginSession();
  }
  shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      let j = Math.floor(this.rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  makeShoe() {
    let a = [];
    for (let n = 0; n < this.config.decks; n++)
      for (let suit of SUITS) for (let rank of RANKS) a.push({ rank, suit });
    return this.shuffle(a);
  }
  beginSession() {
    this.players = this.config.seats
      .filter((s) => s.active)
      .map((s) => ({
        seat: s.seat,
        name: s.name,
        initial: s.amount * 100,
        balance: s.amount * 100,
        hands: [],
        satOut: false,
        streak: 0,
        progression: 0,
        thought: "",
        profile: Rules.profile(this.rules, s.seat, this.behaviorRng),
      }));
    for (const p of this.players)
      if (p.profile?.bankroll != null)
        p.initial = p.balance = Math.round(p.profile.bankroll * 100);
    this.sessionRounds = 0;
    this.sessionWager = 0;
    this.dealer = [];
    this.holeHidden = true;
    this.path = [{ x: 0, y: 0 }];
    this.lastResult = null;
    this.openShoe();
  }
  openShoe() {
    this.shoe = this.makeShoe();
    this.cutTarget = sampleCutTarget(this.config, this.cutRng);
    this.cutCard = Math.ceil((this.shoe.length * this.cutTarget) / 100 - 1e-10);
    this.shoeSize = this.shoe.length;
    this.cutReached = false;
    this.count = 0;
    this.unseen = Array.from(
      { length: 10 },
      (_, i) => this.config.decks * (i === 9 ? 16 : 4),
    );
    this.countHistory = [];
    this.countSamples = [];
    this.stats.shuffles++;
  }
  recordCut() {
    this.cutReached = true;
    this.stats.cutShoes++;
    this.stats.cutTargetSum += this.cutTarget;
    this.stats.realizedSum +=
      (100 * (this.shoeSize - this.shoe.length)) / this.shoeSize;
  }
  draw() {
    if (!this.shoe.length) throw new Error("Shoe exhausted");
    return this.shoe.pop();
  }
  snap(fx) {
    return {
      dealer: this.dealer.map((c) => ({ ...c })),
      holeHidden: this.holeHidden,
      players: this.players.map((p) => ({
        seat: p.seat,
        name: p.name,
        balance: p.balance,
        satOut: p.satOut,
        profile: p.profile?.name,
        thought: p.thought,
        betNote: p.betNote,
        decision: p.decision,
        hands: p.hands.map((h) => ({
          cards: h.cards.map((c) => ({ ...c })),
          bet: h.bet,
          openingBet: h.openingBet,
          status: h.status || "",
          split: h.split,
        })),
      })),
      count: this.count,
      history: ["history", "full"].includes(this.rules.analytics.mode)
        ? [...this.countHistory]
        : [],
      unseen: ["probability", "full"].includes(this.rules.analytics.mode)
        ? [...this.unseen]
        : [],
      cutTarget: this.cutTarget,
      cutCard: this.cutCard,
      remaining: this.shoe.length,
      fx: fx || null,
    };
  }
  playRound(trace = false) {
    if (this.finished || this.pendingSessionEnd) return null;
    if (this.cutReached) this.openShoe();
    let startBalances = this.players.map((p) => p.balance),
      events = [],
      dealer = (this.dealer = []);
    this.holeHidden = true;
    const snap = (fx) => {
      if (trace) events.push(this.snap(fx));
    };
    let tc = this.shoe.length ? (this.count * 52) / this.shoe.length : 0;
    let insuranceWager = 0,
      insuranceProfit = 0;
    let biasBets = 0,
      diagnostics = {
        npcDecisions: this.stats.npcDecisions,
        npcDeviations: this.stats.npcDeviations,
      };
    try {
      for (const p of this.players) {
        p.hands = [];
        p.thought = "";
        p.decision = "";
        const ctx = {
          base: p.profile?.base ?? this.config.baseBet ?? this.config.minBet,
          bankroll: p.balance / 100,
          min: this.config.minBet,
          rc: this.count,
          tc,
          penetration: 1 - this.shoe.length / this.shoeSize,
          finite: this.config.finite,
          seatMax: p.profile?.max,
          countSamples: this.countSamples,
        };
        const desired = Rules.opponentBet(this.rules, p, ctx, this.behaviorRng);
        let stake = Rules.constrain(this.rules, desired, ctx);
        if (
          p.profile &&
          ["existing", "streak"].includes(p.profile.bet) &&
          stake >
            Rules.constrain(
              this.rules,
              (p.profile.bet === "existing"
                ? Rules.rawBet(this.rules, ctx)
                : ctx.base) * p.profile.risk,
              ctx,
            )
        ) {
          biasBets++;
          p.thought = p.streak > 0 ? "Streak: winning" : "Streak: losing";
        }
        p.betNote = `RC ${this.count}; TC ${tc.toFixed(2)}; requested $${desired.toFixed(2)} → $${(stake / 100).toFixed(2)}`;
        p.satOut = stake < this.config.minBet * 100;
        if (!p.satOut) {
          p.balance -= stake;
          p.hands = [
            {
              cards: [],
              bet: stake,
              openingBet: stake,
              split: false,
              splitAce: false,
              status: "",
            },
          ];
        }
      }
      if (this.rules.bet.mode === "percentile") {
        this.countSamples.push(
          this.rules.bet.input === "rc"
            ? this.count
            : Rules.roundCount(tc, this.rules.bet.tcRound),
        );
        if (this.countSamples.length > 1024) this.countSamples.shift();
      }
      if (this.players.every((p) => p.satOut)) {
        this.pendingSessionEnd = true;
        return { events: [], noRound: true };
      }
      const cardTo = (p, h, hidden = false) => {
        let c = this.draw();
        (p ? h.cards : dealer).push(c);
        if (!hidden) this.observe(c);
        snap({
          seat: p ? p.seat : "dealer",
          hand: p ? p.hands.indexOf(h) : 0,
          card: (p ? h.cards : dealer).length - 1,
          delta: hidden ? null : hiLo(c),
        });
      };
      snap(null);
      for (let pass = 0; pass < 2; pass++) {
        for (let p of this.players) if (!p.satOut) cardTo(p, p.hands[0]);
        if (pass === 0 || this.rules.dealer.hole !== "european")
          cardTo(null, null, pass === 1);
      }
      let dealerBlackjack = natural({ cards: dealer, split: false });
      // Insurance uses only the exposed count, before any peek.
      if (rankValue(dealer[0].rank) === 11)
        for (const p of this.players) {
          let mode = p.profile?.play || this.rules.play.mode,
            t = this.shoe.length ? (this.count * 52) / this.shoe.length : 0;
          if (
            !p.satOut &&
            mode === "deviations" &&
            t * (p.profile?.accuracy ?? 1) >= this.rules.play.insuranceIndex
          ) {
            let amount = Math.floor(p.hands[0].bet / 2);
            if (!this.config.finite || p.balance >= amount) {
              p.balance -= amount;
              p.insurance = amount;
              insuranceWager += amount;
            }
          }
        }
      const peeked = this.rules.dealer.hole === "peek";
      if (!dealerBlackjack || !peeked) {
        for (let p of this.players) {
          if (p.satOut) continue;
          for (let index = 0; index < p.hands.length; index++) {
            let h = p.hands[index];
            if (natural(h)) {
              h.status = "Blackjack";
              continue;
            }
            if (h.splitAce) {
              h.status = "Stand";
              continue;
            }
            for (let safety = 0; safety < 52; safety++) {
              let value = handValue(h.cards).total;
              if (value >= 21) {
                h.status = value > 21 ? "Bust" : "21";
                break;
              }
              const canAfford = !this.config.finite || p.balance >= h.bet;
              const legal = {
                canSplit:
                  canAfford &&
                  p.hands.length < this.rules.dealer.maxHands &&
                  h.cards.length === 2 &&
                  rankValue(h.cards[0].rank) === rankValue(h.cards[1].rank),
                canDouble:
                  canAfford &&
                  h.cards.length === 2 &&
                  (!h.split || this.rules.dealer.das),
                canSurrender:
                  this.rules.dealer.surrender &&
                  h.cards.length === 2 &&
                  !h.split,
              };
              let action = this.decide(p, h, dealer[0], legal, peeked);
              if (action === "surrender") {
                h.surrender = true;
                h.status = "Surrender";
                break;
              }
              if (action === "stand") {
                h.status = "Stand";
                break;
              }
              if (action === "split") {
                const second = h.cards.pop();
                h.split = true;
                h.splitAce = h.cards[0].rank === "ace";
                let nh = {
                  cards: [second],
                  bet: h.bet,
                  split: true,
                  splitAce: h.splitAce,
                  status: "",
                };
                p.balance -= h.bet;
                p.hands.splice(index + 1, 0, nh);
                snap(null);
                cardTo(p, h);
                cardTo(p, nh);
                if (h.splitAce) {
                  h.status = "Stand";
                  nh.status = "Stand";
                  break;
                }
                continue;
              }
              if (action === "double") {
                p.balance -= h.bet;
                h.bet *= 2;
                cardTo(p, h);
                h.status = handValue(h.cards).total > 21 ? "Bust" : "Double";
                break;
              }
              cardTo(p, h);
            }
          }
        }
      }
      if (this.rules.dealer.hole === "european") {
        cardTo(null, null, true);
        dealerBlackjack = natural({ cards: dealer, split: false });
      }
      this.holeHidden = false;
      let revealDelta = hiLo(dealer[1]);
      this.observe(dealer[1]);
      snap({ seat: "dealer", hand: 0, card: 1, delta: revealDelta });
      let needsDealer =
        !dealerBlackjack &&
        this.players.some((p) =>
          p.hands.some(
            (h) =>
              !h.surrender && !natural(h) && handValue(h.cards).total <= 21,
          ),
        );
      if (needsDealer) {
        for (let safety = 0; safety < 52; safety++) {
          let v = handValue(dealer);
          if (!Rules.dealerHits(v, this.rules)) break;
          cardTo(null, null);
        }
      }
      const dt = handValue(dealer).total,
        dealerBust = dt > 21;
      let roundWager = 0,
        local = {
          hands: 0,
          wins: 0,
          losses: 0,
          pushes: 0,
          blackjacks: 0,
          playerBusts: 0,
        };
      for (const p of this.players) {
        if (p.insurance) {
          if (dealerBlackjack) p.balance += 3 * p.insurance;
          insuranceProfit += dealerBlackjack ? 2 * p.insurance : -p.insurance;
          p.insurance = 0;
        }
      }
      for (const p of this.players)
        for (const h of p.hands) {
          let pt = handValue(h.cards).total,
            bj = natural(h);
          roundWager += h.bet;
          local.hands++;
          if (bj) local.blackjacks++;
          if (pt > 21) {
            h.status = "Bust";
            local.losses++;
            local.playerBusts++;
          } else if (dealerBlackjack && bj) {
            p.balance += h.bet;
            h.status = "Push";
            local.pushes++;
          } else if (dealerBlackjack) {
            h.status = "Loss";
            local.losses++;
          } else if (h.surrender) {
            p.balance += Math.floor(h.bet / 2);
            h.status = "Surrender";
            local.losses++;
          } else if (bj) {
            p.balance += h.bet + Math.round(h.bet * this.config.blackjackPay);
            h.status = "Blackjack";
            local.wins++;
          } else if (dealerBust || pt > dt) {
            p.balance += 2 * h.bet;
            h.status = "Win";
            local.wins++;
          } else if (pt === dt) {
            p.balance += h.bet;
            h.status = "Push";
            local.pushes++;
          } else {
            h.status = "Loss";
            local.losses++;
          }
        }
      this.players.forEach((p, i) => {
        if (p.satOut) return;
        const outcome = Math.sign(p.balance - startBalances[i]);
        Rules.progress(p, outcome, this.rules);
        if (outcome)
          p.streak = (Math.sign(p.streak) === outcome ? p.streak : 0) + outcome;
      });

      this.stats.biasBets += biasBets;
      if (this.shoeSize - this.shoe.length >= this.cutCard) this.recordCut();
      let profit = this.players.reduce(
          (v, p, i) => v + p.balance - startBalances[i],
          0,
        ),
        st = this.stats;
      st.rounds++;
      st.hands += local.hands;
      for (let k of ["wins", "losses", "pushes", "blackjacks", "playerBusts"])
        st[k] += local[k];
      if (dealerBust) st.dealerBusts++;
      roundWager += insuranceWager;
      st.insuranceWager = (st.insuranceWager || 0) + insuranceWager;
      st.insuranceProfit = (st.insuranceProfit || 0) + insuranceProfit;
      st.wager += roundWager;
      st.profit += profit;
      st.sumX2 += profit * profit;
      st.sumXY += profit * roundWager;
      st.sumY2 += roundWager * roundWager;
      this.sessionRounds++;
      this.sessionWager += roundWager;
      let sessionProfit = this.players.reduce(
        (v, p) => v + p.balance - p.initial,
        0,
      );
      if (
        this.sessionRounds %
          Math.max(1, Math.ceil(this.config.rounds / 500)) ===
          0 ||
        this.sessionRounds === this.config.rounds
      )
        this.path.push({ x: this.sessionRounds, y: sessionProfit });
      this.lastResult = { profit, wager: roundWager, dealerBust };
      snap(null);
      this.pendingSessionEnd =
        this.sessionRounds >= this.config.rounds || this.shouldTerminate();
      return { events, final: this.snap(null), result: this.lastResult };
    } catch (e) {
      // A round cannot finish if the cut card left too little reserve. Refund every wager.
      this.stats.npcDecisions = diagnostics.npcDecisions;
      this.stats.npcDeviations = diagnostics.npcDeviations;
      this.players.forEach((p, i) => {
        p.balance = startBalances[i];
        p.insurance = 0;
        p.hands = [];
        p.thought = "";
      });
      if (e.message !== "Shoe exhausted") throw e;
      this.stats.exhaustedShoes++;
      this.openShoe();
      this.dealer = [];
      this.holeHidden = true;
      return { events: [], voided: true };
    }
  }
  finishSession() {
    if (!this.pendingSessionEnd) return;
    let profit = this.players.reduce((v, p) => v + p.balance - p.initial, 0);
    if (this.path[this.path.length - 1].x !== this.sessionRounds)
      this.path.push({ x: this.sessionRounds, y: profit });
    this.stats.sessions++;
    this.stats.sessionProfits.push(profit);
    this.stats.sessionWagers.push(this.sessionWager);
    if (
      this.config.finite &&
      this.players.some((p) => p.balance < this.config.minBet * 100)
    )
      this.stats.ruined++;
    this.pendingSessionEnd = false;
    if (this.stats.sessions >= this.config.sessions) {
      this.finished = true;
      return;
    }
    this.sessionIndex++;
    this.beginSession();
  }
  observe(card) {
    this.count += hiLo(card);
    this.unseen[
      Math.min(10, rankValue(card.rank) === 11 ? 1 : rankValue(card.rank)) - 1
    ]--;
    const modes = ["history", "full"];
    if (modes.includes(this.rules.analytics.mode)) {
      this.countHistory.push(this.count);
      if (this.countHistory.length > 500) this.countHistory.shift();
    }
  }
  shouldTerminate() {
    if (!this.config.finite) return false;
    const low = (p) => p.balance < this.config.minBet * 100;
    switch (this.rules.limits.terminate) {
      case "any":
        return this.players.some(low);
      case "you":
        return (
          this.players.some((p) => p.seat === 2 && low(p)) ||
          this.players.every(low)
        );
      case "stoploss":
        return (
          this.players.reduce((s, p) => s + p.balance, 0) <=
            this.players.reduce((s, p) => s + p.initial, 0) *
              (1 - this.rules.limits.stopLoss) || this.players.every(low)
        );
      default:
        return this.players.every(low);
    }
  }
  decide(p, h, up, legal, peeked) {
    const mode = p.profile?.play || this.rules.play.mode,
      tc = Rules.roundCount(
        (this.shoe.length ? (this.count * 52) / this.shoe.length : 0) *
          (p.profile?.accuracy ?? 1),
        this.rules.bet.tcRound,
      );
    let result = policyAction(
      mode,
      h,
      up,
      { ...legal, h17: this.config.h17 },
      this.rules,
      tc,
      this.behaviorRng,
    );
    if (
      mode === "optimal" ||
      (mode === "adjusted" && this.rules.dealer.mode === "custom")
    ) {
      let ev = this.actionEVs(h, up, legal, peeked);
      result = Object.keys(ev).reduce((a, b) => (ev[a] >= ev[b] ? a : b));
      p.decision =
        "Estimated EV per initial wager: " +
        Object.entries(ev)
          .map(([a, v]) => a + " " + v.toFixed(3))
          .join(" · ");
    } else p.decision = (Rules.PLAYS[mode] || mode) + ": " + result;
    if (p.profile) {
      this.stats.npcDecisions++;
      const v = handValue(h.cards).total;
      if (v >= 9 && v <= 19 && this.behaviorRng() < p.profile.error) {
        result =
          result === "hit"
            ? "stand"
            : result === "stand"
              ? "hit"
              : v >= 17
                ? "stand"
                : "hit";
        this.stats.npcDeviations++;
        p.decision += " → decision error: " + result;
      }
    }
    return legalAction(result, h, up, legal, this.config.h17);
  }
  // Composition-aware Monte Carlo policy improvement. Only exposed-card information enters
  // the sampled pool. The actual hidden card and actual shoe order are never inspected.
  actionEVs(h, up, legal, peeked) {
    const actions = [
        "stand",
        "hit",
        ...(legal.canDouble ? ["double"] : []),
        ...(legal.canSplit ? ["split"] : []),
        ...(legal.canSurrender ? ["surrender"] : []),
      ],
      out = {},
      samples = this.rules.play.evSamples;
    let hash = 2166136261;
    for (const n of [
      ...this.unseen,
      ...h.cards.map((c) => rankValue(c.rank)),
      rankValue(up.rank),
    ])
      hash = Math.imul(hash ^ n, 16777619);
    for (const action of actions) {
      let sum = 0;
      for (let trial = 0; trial < samples; trial++) {
        let rng = seeded((hash + trial * 2654435761) >>> 0),
          pool = [...this.unseen];
        const pick = (exclude = 0) => {
          let total = pool.reduce(
            (a, b, i) => a + (i + 1 === exclude ? 0 : b),
            0,
          );
          if (total <= 0) return null;
          let x = rng() * total;
          for (let i = 0; i < 10; i++) {
            if (i + 1 === exclude) continue;
            x -= pool[i];
            if (x < 0) {
              pool[i]--;
              return { rank: i === 0 ? "ace" : String(i + 1), suit: "sample" };
            }
          }
          return null;
        };
        let dealer = [up],
          upv = rankValue(up.rank);
        if (this.rules.dealer.hole !== "european") {
          let hole = pick(peeked ? (upv === 11 ? 10 : upv === 10 ? 1 : 0) : 0);
          if (hole) dealer.push(hole);
        }
        let hands = [
            { cards: h.cards.map((c) => ({ ...c })), bet: 1, split: h.split },
          ],
          budget =
            legal.canDouble || legal.canSplit
              ? this.rules.dealer.maxHands * 2
              : 1;
        const add = (hand) => {
          let c = pick();
          if (c) hand.cards.push(c);
          return !!c;
        };
        for (let j = 0; j < hands.length; j++) {
          let hand = hands[j],
            first = j === 0 ? action : null;
          for (let k = 0; k < 30; k++) {
            if (hand.done) break;
            let v = handValue(hand.cards);
            if (v.total >= 21) break;
            let canSplit =
                hands.length < this.rules.dealer.maxHands &&
                budget >= hand.bet &&
                hand.cards.length === 2 &&
                rankValue(hand.cards[0].rank) === rankValue(hand.cards[1].rank),
              canDouble =
                budget >= hand.bet &&
                hand.cards.length === 2 &&
                (!hand.split || this.rules.dealer.das);
            let a =
              first ||
              policyAction(
                "adjusted",
                hand,
                up,
                {
                  canSplit,
                  canDouble,
                  canSurrender: false,
                  h17: this.config.h17,
                },
                this.rules,
                0,
                rng,
              );
            first = null;
            if (a === "stand") break;
            if (a === "surrender") {
              hand.surrender = true;
              break;
            }
            if (a === "split" && canSplit) {
              budget -= hand.bet;
              let second = hand.cards.pop();
              hand.split = true;
              let other = { cards: [second], bet: 1, split: true };
              hands.push(other);
              add(hand);
              add(other);
              if (rankValue(second.rank) === 11) {
                hand.done = true;
                other.done = true;
                break;
              }
              continue;
            }
            if (hand.done) break;
            if (a === "double" && canDouble) {
              budget -= hand.bet;
              hand.bet *= 2;
              add(hand);
              break;
            }
            if (!add(hand)) break;
          }
        }
        if (dealer.length === 1) {
          let c = pick();
          if (c) dealer.push(c);
        }
        let bj = natural({ cards: dealer, split: false });
        for (
          let k = 0;
          k < 30 && !bj && Rules.dealerHits(handValue(dealer), this.rules);
          k++
        ) {
          let c = pick();
          if (!c) break;
          dealer.push(c);
        }
        let dt = handValue(dealer).total;
        sum += hands.reduce((s, hand) => {
          let pt = handValue(hand.cards).total;
          return (
            s +
            (pt > 21
              ? -hand.bet
              : bj
                ? -hand.bet
                : hand.surrender
                  ? -0.5 * hand.bet
                  : dt > 21 || pt > dt
                    ? hand.bet
                    : pt === dt
                      ? 0
                      : -hand.bet)
          );
        }, 0);
      }
      out[action] = sum / samples;
    }
    return out;
  }
  probabilities() {
    let n = this.shoe.length,
      aces = 0,
      tens = 0;
    for (const c of this.shoe) {
      if (c.rank === "ace") aces++;
      if (rankValue(c.rank) === 10) tens++;
    }
    return {
      n,
      aces,
      tens,
      pTen: n ? tens / n : null,
      pAce: n ? aces / n : null,
      pNatural: n > 1 ? (2 * aces * tens) / (n * (n - 1)) : null,
    };
  }
}
if (typeof module !== "undefined")
  module.exports = {
    BlackjackSimulation,
    seeded,
    hiLo,
    rankValue,
    handValue,
    natural,
    basicAction,
    policyAction,
    legalAction,
    sampleCutTarget,
  };
