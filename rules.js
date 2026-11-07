/* Shared, versioned configuration and pure strategy functions. No DOM or dynamic code evaluation. */
"use strict";
const BJRules = (() => {
  const BETS = {
    flat: "Flat wager",
    rcDiscrete: "Discrete running count",
    rcContinuous: "Continuous running count",
    tcDiscrete: "Discrete true count",
    tcContinuous: "Continuous true count",
    lookup: "Custom count lookup",
    piecewise: "Piecewise linear count",
    percentile: "Count percentile",
    linear: "Linear",
    polynomial: "Polynomial",
    exponential: "Exponential",
    logarithmic: "Logarithmic",
    sigmoid: "Sigmoid / logistic",
    power: "Power law",
    custom: "Custom function",
    kelly: "Full Kelly criterion",
    fractional: "Fractional Kelly criterion",
    advantage: "Advantage proportional",
    bankroll: "Fixed bankroll percentage",
    countBankroll: "Count × bankroll",
    risk: "Risk-constrained optimal",
    penetration: "Penetration-aware",
    ev: "EV lookup",
  };
  const PLAYS = {
    basic: "Basic strategy (standard)",
    adjusted: "Basic strategy (rule-adjusted)",
    deviations: "Basic + deviations (I18 / Fab 4)",
    mimic: "Dealer mimic (stand on 17)",
    stand: "Always stand",
    hit: "Always hit (until 21)",
    conservative: "Conservative",
    aggressive: "Aggressive",
    random: "Random",
    custom: "Custom strategy table",
    optimal: "EV-optimal (composition-dependent estimates)",
  };
  const SKILLS = {
    existing: "Disabled / existing behavior",
    basic: "Basic strategy",
    beginner: "Beginner",
    intermediate: "Intermediate",
    expert: "Expert",
    mixed: "Mixed skill levels",
    randomized: "Randomized behavior",
    conservative: "Conservative",
    aggressive: "Aggressive",
    counting: "Card-counting",
    custom: "Custom profiles",
  };
  const OPPBETS = {
    existing: "Existing streak behavior",
    flat: "Flat wager",
    count: "Count-based betting",
    bankroll: "Bankroll percentage",
    martingale: "Martingale",
    paroli: "Reverse Martingale (Paroli)",
    fibonacci: "Fibonacci",
    dalembert: "D’Alembert",
    streak: "Win/loss streak betting",
    custom: "Custom betting profile",
  };
  const ACTIONS = ["hit", "stand", "double", "split", "surrender"];
  const deviations = [
    ["hard", 16, 10, 0, "stand", "hit"],
    ["hard", 15, 10, 4, "stand", "hit"],
    ["pair", 10, 5, 5, "split", "stand"],
    ["pair", 10, 6, 4, "split", "stand"],
    ["hard", 10, 10, 4, "double", "hit"],
    ["hard", 12, 3, 2, "stand", "hit"],
    ["hard", 12, 2, 3, "stand", "hit"],
    ["hard", 11, 11, 1, "double", "hit"],
    ["hard", 9, 2, 1, "double", "hit"],
    ["hard", 10, 11, 4, "double", "hit"],
    ["hard", 9, 7, 3, "double", "hit"],
    ["hard", 16, 9, 5, "stand", "hit"],
    ["hard", 13, 2, -1, "stand", "hit"],
    ["hard", 12, 4, 0, "stand", "hit"],
    ["hard", 12, 5, -2, "stand", "hit"],
    ["hard", 12, 6, -1, "stand", "hit"],
    ["hard", 13, 3, -2, "stand", "hit"],
    ["hard", 14, 10, 3, "surrender", "hit"],
    ["hard", 15, 10, 0, "surrender", "hit"],
    ["hard", 15, 9, 2, "surrender", "hit"],
    ["hard", 15, 11, 1, "surrender", "hit"],
  ];
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const defaults = () => ({
    version: 2,
    bet: {
      mode: "flat",
      input: "tc",
      threshold: 1,
      slope: 1,
      coefficient: 1,
      power: 2,
      intercept: 1,
      unit: 1,
      lookup: [
        [-5, 1],
        [1, 1],
        [2, 2],
        [4, 4],
      ],
      evLookup: [
        [-5, -0.03],
        [0, -0.005],
        [2, 0.005],
        [5, 0.02],
      ],
      expression: "base * max(1, c)",
      tcRound: "none",
      kelly: 0.25,
      allocation: 1,
      percent: 0.01,
      edgeBase: -0.005,
      edgeSlope: 0.005,
      variance: 1.3,
      edgeModel: "linear",
      edgeExpression: "-0.005 + 0.005 * tc",
      risk: 0.05,
      penetrationSlope: 1,
      percentileScale: 3,
    },
    play: {
      mode: "basic",
      decisionRules: [],
      table: {},
      deviations: clone(deviations),
      insuranceIndex: 3,
      evSamples: 128,
    },
    dealer: {
      mode: "S17",
      hardStand: 17,
      softStand: 17,
      hole: "peek",
      das: true,
      maxHands: 4,
      surrender: false,
    },
    payout: { numerator: 3, denominator: 2 },
    limits: {
      mode: "fixed",
      maxMultiplier: 4,
      minMultiplier: 1,
      tableMax: 1000000,
      bankrollMax: 0.1,
      dynamicSlope: 1,
      chip: 1,
      increment: 1,
      round: "floor",
      insufficient: "allin",
      terminate: "all",
      stopLoss: 1,
    },
    analytics: { mode: "effects", precision: 2, round: "none" },
    opponents: {
      enabled: true,
      skill: "mixed",
      bet: "existing",
      error: 0.08,
      accuracy: 1,
      risk: 1,
      percent: 0.01,
      streakLength: 2,
      factor: 2,
      maxProgression: 8,
      resetWins: 3,
      bias: "both",
      expression: "base * max(1, 1 - streak)",
      distribution: [0.25, 0.5, 0.25],
      seats: {},
    },
  });
  function merge(base, patch) {
    const out = clone(base);
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return out;
    for (const k of Object.keys(base)) {
      if (Object.hasOwn(patch, k))
        out[k] =
          base[k] &&
          typeof base[k] === "object" &&
          !Array.isArray(base[k]) &&
          Object.keys(base[k]).length
            ? merge(base[k], patch[k])
            : clone(patch[k]);
    }
    return out;
  }
  function migrate(c = {}) {
    let r = merge(defaults(), c.rules || c);
    if (!c.rules && ("betMode" in c || "strategy" in c)) {
      r.bet.mode = c.betMode === "count" ? "tcDiscrete" : c.betMode || "flat";
      r.play.mode = c.strategy || "basic";
      r.dealer.mode = c.h17 ? "H17" : "S17";
      r.payout.numerator = (c.blackjackPay ?? 1.5) * 10;
      r.payout.denominator = 10;
      r.limits.maxMultiplier = c.spread || 4;
      r.analytics.mode = c.showCount === false ? "hidden" : "effects";
      r.opponents.enabled = c.humanOpponents !== false;
    }
    return r;
  }
  const finite = (x, name, lo = -1e9, hi = 1e9, integer = false) => {
    if (
      typeof x !== "number" ||
      !Number.isFinite(x) ||
      x < lo ||
      x > hi ||
      (integer && !Number.isInteger(x))
    )
      throw Error(
        `${name}: enter ${integer ? "a whole number" : "a number"} from ${lo} to ${hi}.`,
      );
  };
  const choice = (v, opts, name) => {
    if (!opts.includes(v)) throw Error(`${name}: invalid option.`);
  };
  // Recursive-descent expression parser: a small arithmetic language, never JavaScript.
  const functions = {
    abs: Math.abs,
    sqrt: Math.sqrt,
    log: Math.log,
    exp: Math.exp,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    min: Math.min,
    max: Math.max,
    pow: Math.pow,
    clip: (x, a, b) => Math.min(b, Math.max(a, x)),
  };
  const cache = new Map();
  function expression(source) {
    if (cache.has(source)) return cache.get(source);
    if (typeof source !== "string" || source.length > 300)
      throw Error("Expression must contain at most 300 characters.");
    const tokens =
      source.match(
        /(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|[a-zA-Z_][a-zA-Z_0-9]*|[()+\-*/^,]/g,
      ) || [];
    if (tokens.join("") !== source.replace(/\s/g, ""))
      throw Error("Expression contains unsupported characters.");
    let i = 0,
      nodes = 0;
    const variables = [
      "c",
      "rc",
      "tc",
      "base",
      "bankroll",
      "edge",
      "variance",
      "penetration",
      "streak",
      "step",
    ];
    function primary() {
      if (++nodes > 120) throw Error("Expression is too complex.");
      let t = tokens[i++];
      if (t === "(") {
        let n = add();
        if (tokens[i++] !== ")") throw Error("Missing closing parenthesis.");
        return n;
      }
      if (t && /^\d|^\./.test(t)) return () => Number(t);
      if (variables.includes(t)) return (v) => v[t] ?? 0;
      if (Object.hasOwn(functions, t)) {
        if (tokens[i++] !== "(") throw Error("Function needs parentheses.");
        let args = [add()];
        while (tokens[i] === ",") {
          i++;
          args.push(add());
        }
        if (tokens[i++] !== ")") throw Error("Invalid function arguments.");
        let arity = ["min", "max"].includes(t)
          ? [1, 12]
          : t === "clip"
            ? [3, 3]
            : t === "pow"
              ? [2, 2]
              : [1, 1];
        if (args.length < arity[0] || args.length > arity[1])
          throw Error("Wrong number of function arguments.");
        return (v) => functions[t](...args.map((a) => a(v)));
      }
      throw Error("Unknown variable or function: " + (t || "empty expression"));
    }
    function unary() {
      if (tokens[i] === "+" || tokens[i] === "-") {
        let sign = tokens[i++] === "-" ? -1 : 1,
          n = unary();
        return (v) => sign * n(v);
      }
      let n = primary();
      if (tokens[i] === "^") {
        i++;
        let b = unary(),
          a = n;
        n = (v) => a(v) ** b(v);
      }
      return n;
    }
    function mul() {
      let n = unary();
      while (["*", "/"].includes(tokens[i])) {
        let op = tokens[i++],
          b = unary(),
          a = n;
        n = (v) => (op === "*" ? a(v) * b(v) : a(v) / b(v));
      }
      return n;
    }
    function add() {
      let n = mul();
      while (["+", "-"].includes(tokens[i])) {
        let op = tokens[i++],
          b = mul(),
          a = n;
        n = (v) => (op === "+" ? a(v) + b(v) : a(v) - b(v));
      }
      return n;
    }
    let evaluate = add();
    if (i !== tokens.length) throw Error("Unexpected expression token.");
    let fn = (v) => {
      let x = evaluate(v);
      if (!Number.isFinite(x) || Math.abs(x) > 1e12)
        throw Error("Expression produced an undefined or excessive value.");
      return x;
    };
    if (cache.size > 100) cache.clear();
    cache.set(source, fn);
    return fn;
  }
  function tableCheck(rows, name, positive = false) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 100)
      throw Error(name + ": enter 1–100 rows.");
    let prev = -Infinity;
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 2)
        throw Error(name + ": each row needs two numbers.");
      finite(row[0], name, -1000, 1000);
      finite(row[1], name, positive ? 0 : -10, positive ? 1000000 : 10);
      if (row[0] <= prev)
        throw Error(name + ": counts must be strictly increasing.");
      prev = row[0];
    }
  }
  function validate(r) {
    for (const key of [
      "bet",
      "play",
      "dealer",
      "payout",
      "limits",
      "analytics",
      "opponents",
    ])
      if (!r[key] || typeof r[key] !== "object")
        throw Error("Missing settings section: " + key);
    choice(r.bet.mode, Object.keys(BETS), "Bet sizing");
    choice(r.play.mode, Object.keys(PLAYS), "Playing strategy");
    choice(r.dealer.mode, ["S17", "H17", "custom"], "Dealer");
    choice(r.dealer.hole, ["peek", "nopeek", "european"], "Hole card");
    choice(r.bet.input, ["rc", "tc"], "Count input");
    choice(
      r.bet.tcRound,
      ["none", "floor", "trunc", "round"],
      "True count rounding",
    );
    choice(
      r.analytics.round,
      ["none", "floor", "trunc", "round"],
      "Display rounding",
    );
    choice(
      r.analytics.mode,
      [
        "hidden",
        "running",
        "true",
        "both",
        "effects",
        "history",
        "probability",
        "full",
      ],
      "Count display",
    );
    choice(
      r.limits.mode,
      ["fixed", "none", "bankroll", "table", "dynamic", "custom"],
      "Limits",
    );
    choice(r.limits.round, ["floor", "round", "ceil"], "Wager rounding");
    choice(r.limits.insufficient, ["allin", "sitout"], "Insufficient bankroll");
    choice(
      r.limits.terminate,
      ["all", "you", "any", "stoploss"],
      "Termination",
    );
    choice(r.opponents.skill, Object.keys(SKILLS), "Opponent skill");
    choice(r.opponents.bet, Object.keys(OPPBETS), "Opponent bet");
    choice(r.bet.edgeModel, ["linear", "lookup", "custom"], "Advantage model");
    choice(r.opponents.bias, ["hot", "due", "both"], "Streak bias");
    for (const [k, lo, hi, int] of [
      ["threshold", -100, 100],
      ["slope", -100, 100],
      ["coefficient", -100, 100],
      ["intercept", -100, 100],
      ["power", 0.01, 10],
      ["unit", 0.01, 1000],
      ["kelly", 0, 1],
      ["allocation", 0.001, 1],
      ["percent", 0.00001, 1],
      ["edgeBase", -1, 1],
      ["edgeSlope", -1, 1],
      ["variance", 0.0001, 100],
      ["risk", 0.00001, 0.99],
      ["penetrationSlope", -10, 10],
      ["percentileScale", 0.01, 100],
    ])
      finite(r.bet[k], k, lo, hi, int);
    for (const [k, lo, hi, int] of [
      ["maxMultiplier", 1, 1000000, true],
      ["minMultiplier", 0, 1000000],
      ["tableMax", 0.01, 100000000],
      ["bankrollMax", 0.00001, 1],
      ["dynamicSlope", 0, 100],
      ["chip", 0.01, 1000000],
      ["increment", 0.01, 1000000],
      ["stopLoss", 0.00001, 1],
    ])
      finite(r.limits[k], k, lo, hi, int);
    if (
      r.limits.minMultiplier > r.limits.maxMultiplier &&
      r.limits.mode === "custom"
    )
      throw Error("Minimum spread must not exceed maximum spread.");
    finite(r.payout.numerator, "Payout numerator", 0.01, 1000);
    finite(r.payout.denominator, "Payout denominator", 0.01, 1000);
    if (r.payout.numerator / r.payout.denominator > 100)
      throw Error("Payout ratio must be at most 100:1.");
    finite(r.dealer.hardStand, "Hard stand threshold", 12, 21, true);
    finite(r.dealer.softStand, "Soft stand threshold", 12, 21, true);
    finite(r.dealer.maxHands, "Maximum hands", 1, 8, true);
    finite(r.play.evSamples, "EV samples", 32, 2048, true);
    finite(r.play.insuranceIndex, "Insurance index", -20, 20);
    if (!Array.isArray(r.play.decisionRules) || r.play.decisionRules.length > 100) throw Error('Use at most 100 custom decision rules.');
    for (const row of r.play.decisionRules) {
      choice(row.type, ['any', 'hard', 'soft', 'pair'], 'Decision rule hand type');
      choice(row.action, ACTIONS, 'Decision rule action');
      for (const key of ['minTotal', 'maxTotal']) finite(row[key], key, 2, 31);
      for (const key of ['minTC', 'maxTC']) finite(row[key], key, -100, 100);
      if (row.minTotal > row.maxTotal || row.minTC > row.maxTC || !Array.isArray(row.upcards) || !row.upcards.length || row.upcards.some(v => !Number.isInteger(v) || v < 2 || v > 11)) throw Error('Invalid custom decision-rule ranges or upcards.');
    }
    finite(r.analytics.precision, "Precision", 0, 6, true);
    for (const k of ["chip", "increment"])
      if (Math.abs(r.limits[k] * 100 - Math.round(r.limits[k] * 100)) > 1e-6)
        throw Error("Chip and wager increments must be whole cents.");
    for (const k of ["error", "accuracy", "percent"])
      finite(r.opponents[k], k, 0, 1);
    finite(r.opponents.risk, "Risk tolerance", 0.01, 10);
    finite(r.opponents.streakLength, "Streak length", 1, 20, true);
    finite(r.opponents.factor, "Progression factor", 1, 10);
    finite(r.opponents.maxProgression, "Progression cap", 1, 20, true);
    finite(r.opponents.resetWins, "Paroli reset wins", 1, 20, true);
    for (const v of [r.opponents.enabled, r.dealer.das, r.dealer.surrender])
      if (typeof v !== "boolean") throw Error("Expected a yes/no setting.");
    tableCheck(r.bet.lookup, "Count lookup", true);
    tableCheck(r.bet.evLookup, "EV lookup");
    if (
      !Array.isArray(r.opponents.distribution) ||
      r.opponents.distribution.length !== 3 ||
      r.opponents.distribution.some((v) => !Number.isFinite(v) || v < 0) ||
      r.opponents.distribution.reduce((a, b) => a + b, 0) <= 0
    )
      throw Error(
        "Skill distribution needs three nonnegative weights with a positive sum.",
      );
    if (
      !r.play.table ||
      Array.isArray(r.play.table) ||
      typeof r.play.table !== "object"
    )
      throw Error("Invalid strategy matrix.");
    for (const [k, v] of Object.entries(r.play.table)) {
      if (
        !/^(hard:(?:[5-9]|1\d|20)|soft:(?:1[3-9]|20)|pair:(?:[2-9]|10|11)):(?:[2-9]|10|11)$/.test(
          k,
        ) ||
        !ACTIONS.includes(v)
      )
        throw Error("Invalid custom strategy cell.");
    }
    if (!Array.isArray(r.play.deviations) || r.play.deviations.length > 100)
      throw Error("Use at most 100 deviations.");
    for (const row of r.play.deviations) {
      if (!Array.isArray(row) || row.length !== 6)
        throw Error("Invalid deviation row.");
      choice(row[0], ["hard", "soft", "pair"], "Deviation hand");
      finite(row[1], "Deviation total", 2, 21, true);
      finite(row[2], "Dealer upcard", 2, 11, true);
      finite(row[3], "Deviation index", -100, 100);
      choice(row[4], ACTIONS, "Deviation action");
      choice(row[5], ACTIONS, "Below-index action");
    }
    if (
      !r.opponents.seats ||
      typeof r.opponents.seats !== "object" ||
      Array.isArray(r.opponents.seats)
    )
      throw Error("Invalid opponent profiles.");
    for (const [seat, p] of Object.entries(r.opponents.seats)) {
      if (!["0", "1", "3", "4"].includes(seat) || !p || typeof p !== "object")
        throw Error("Invalid opponent seat.");
      if (p.play) choice(p.play, Object.keys(PLAYS), "Seat strategy");
      if (p.bet) choice(p.bet, Object.keys(OPPBETS), "Seat betting");
      for (const k of ["error", "accuracy", "percent"])
        if (p[k] != null) finite(p[k], k, 0, 1);
      for (const k of ["base", "bankroll", "max"])
        if (p[k] != null) finite(p[k], k, 0, 100000000);
      if (p.risk != null) finite(p.risk, "Seat risk", 0.01, 10);
      if (p.expression) expression(p.expression);
    }
    for (const [source, active] of [
      [r.bet.expression, r.bet.mode === "custom"],
      [r.bet.edgeExpression, r.bet.edgeModel === "custom"],
      [r.opponents.expression, r.opponents.bet === "custom"],
    ]) {
      const fn = expression(source);
      if (active)
        for (const c of [-20, -1, 0, 1, 20])
          fn({
            c,
            rc: c,
            tc: c,
            base: 25,
            bankroll: 10000,
            edge: 0.01,
            variance: 1.3,
            penetration: 0.75,
            streak: -2,
            step: 1,
          });
    }
    return r;
  }
  const roundCount = (c, mode) => (mode === "none" ? c : Math[mode](c));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  function lookup(rows, x, linear = false) {
    if (x <= rows[0][0]) return rows[0][1];
    for (let i = 1; i < rows.length; i++) {
      if (x < rows[i][0])
        return linear
          ? rows[i - 1][1] +
              ((rows[i][1] - rows[i - 1][1]) * (x - rows[i - 1][0])) /
                (rows[i][0] - rows[i - 1][0])
          : rows[i - 1][1];
    }
    return rows.at(-1)[1];
  }
  function advantage(r, tc) {
    const b = r.bet;
    return clamp(
      b.edgeModel === "lookup"
        ? lookup(b.evLookup, tc, true)
        : b.edgeModel === "custom"
          ? expression(b.edgeExpression)({ tc, c: tc })
          : b.edgeBase + b.edgeSlope * tc,
      -1,
      1,
    );
  }
  function rawBet(r, ctx) {
    let b = r.bet,
      base = ctx.base * b.unit,
      W = Math.max(0, ctx.bankroll) * b.allocation,
      tc = roundCount(ctx.tc, b.tcRound),
      c = b.input === "rc" ? ctx.rc : tc,
      x = Math.max(0, c - b.threshold),
      edge = advantage(r, tc),
      v = { ...ctx, base, bankroll: W, c, tc, edge, variance: b.variance };
    switch (b.mode) {
      case "flat":
        return base;
      case "rcDiscrete":
        return base * Math.max(1, Math.floor(ctx.rc));
      case "rcContinuous":
        return base * Math.max(1, ctx.rc);
      case "tcDiscrete":
        return base * Math.max(1, Math.floor(tc));
      case "tcContinuous":
        return base * Math.max(1, tc);
      case "lookup":
        return base * lookup(b.lookup, c);
      case "piecewise":
        return base * lookup(b.lookup, c, true);
      case "percentile": {
        let history = ctx.countSamples?.length ? ctx.countSamples : [0],
          percentile =
            history.reduce(
              (sum, v) =>
                sum + 1 / (1 + Math.exp(-(c - v) / b.percentileScale)),
              0,
            ) / history.length;
        return base * (1 + (r.limits.maxMultiplier - 1) * percentile);
      }
      case "linear":
        return base * (b.intercept + b.slope * (c - b.threshold));
      case "polynomial":
        return (
          base * (b.intercept + b.slope * x + b.coefficient * x ** b.power)
        );
      case "exponential":
        return base * b.coefficient * Math.exp(clamp(b.slope * x, -50, 50));
      case "logarithmic":
        return base * (b.intercept + b.slope * Math.log1p(x));
      case "sigmoid":
        return (
          base *
          (b.intercept +
            b.coefficient /
              (1 + Math.exp(clamp(-b.slope * (c - b.threshold), -50, 50))))
        );
      case "power":
        return base * (b.intercept + b.coefficient * x ** b.power);
      case "custom":
        return expression(b.expression)(v);
      case "kelly":
      case "fractional":
        return (
          (b.mode === "kelly" ? 1 : b.kelly) *
          W *
          Math.max(0, edge / b.variance)
        );
      case "advantage":
        return base * Math.max(0, b.slope * edge);
      case "bankroll":
        return W * b.percent;
      case "countBankroll":
        return W * b.percent * Math.max(0, c - b.threshold);
      case "risk":
        return (
          W *
          Math.max(
            0,
            Math.min(
              edge / b.variance,
              (2 * edge) / (b.variance * Math.log(1 / b.risk)),
            ),
          )
        );
      case "penetration":
        return (
          base *
          Math.max(1, c) *
          Math.max(0, 1 + b.penetrationSlope * ctx.penetration)
        );
      case "ev":
        return (
          W * b.kelly * Math.max(0, lookup(b.evLookup, tc, true) / b.variance)
        );
      default:
        throw Error("Unknown betting strategy.");
    }
  }
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  function constrain(r, desired, ctx) {
    if (!Number.isFinite(desired) || Math.abs(desired) > 1e12)
      throw Error("Wager calculation exceeded numeric limits.");
    const l = r.limits,
      base = ctx.base,
      available = Math.max(0, ctx.bankroll);
    let max = Math.min(l.tableMax, ctx.seatMax ?? Infinity),
      min = ctx.min;
    if (l.mode === "fixed" || l.mode === "custom")
      max = Math.min(max, base * l.maxMultiplier);
    if (l.mode === "custom") min = Math.max(min, base * l.minMultiplier);
    if (l.mode === "dynamic")
      max = Math.min(
        max,
        base *
          Math.min(
            l.maxMultiplier,
            Math.max(1, 1 + l.dynamicSlope * Math.max(0, ctx.tc)),
          ),
      );
    if (l.mode === "bankroll") max = Math.min(max, available * l.bankrollMax);
    if (ctx.finite) max = Math.min(max, available);
    const chip = Math.round(l.chip * 100),
      inc = Math.round(l.increment * 100),
      quantum = (chip / gcd(chip, inc)) * inc;
    let requested = Math.max(min, desired),
      cents = Math[l.round]((requested * 100) / quantum) * quantum;
    let ceiling = Math.floor((max * 100 + 1e-6) / quantum) * quantum,
      floor = Math.ceil((min * 100 - 1e-6) / quantum) * quantum;
    if (ctx.finite && l.insufficient === "sitout" && cents > available * 100)
      return 0;
    if (ceiling < floor) return 0;
    return Math.min(ceiling, Math.max(floor, cents));
  }
  function profile(r, seat, rng, heroSeat = 2) {
    if (seat === heroSeat || !r.opponents.enabled) return null;
    let o = r.opponents,
      p = {
        name: "Opponent",
        play: "basic",
        bet: o.bet,
        error: 0,
        accuracy: o.accuracy,
        risk: o.risk,
        percent: o.percent,
        bias: seat === 0 || seat === 4 ? "due" : "hot",
      };
    switch (o.skill) {
      case "existing":
        p.play = r.play.mode;
        break;
      case "beginner":
        p.error = 0.2;
        break;
      case "intermediate":
        p.error = 0.08;
        break;
      case "expert":
        p.play = "adjusted";
        p.error = 0.01;
        break;
      case "mixed":
        p.error = [0.04, 0.02, 0, 0.12, 0.2][seat];
        break;
      case "randomized": {
        let sum = o.distribution.reduce((a, b) => a + b, 0),
          v = rng() * sum;
        p.error =
          v < o.distribution[0]
            ? 0.2
            : v < o.distribution[0] + o.distribution[1]
              ? 0.08
              : 0.01;
        break;
      }
      case "conservative":
      case "aggressive":
        p.play = o.skill;
        break;
      case "counting":
        p.play = "deviations";
        break;
      case "custom":
        p.error = o.error;
        break;
    }
    p = { ...p, ...(o.seats[seat] || {}) };
    p.name = PLAYS[p.play] + " · " + OPPBETS[p.bet];
    return p;
  }
  function opponentBet(r, p, ctx, rng) {
    const o = r.opponents,
      pr = p.profile;
    if (!pr) return rawBet(r, ctx);
    let base = pr.base ?? ctx.base,
      streak = p.streak,
      step = Math.min(o.maxProgression, p.progression || 0),
      desired = base;
    switch (pr.bet) {
      case "existing":
        desired = rawBet(r, { ...ctx, base });
        if (
          (pr.bias === "hot"
            ? streak >= o.streakLength
            : streak <= -o.streakLength) &&
          rng() < 0.45
        )
          desired *= o.factor;
        break;
      case "flat":
        break;
      case "count":
        desired = base * Math.max(1, ctx.tc * pr.accuracy);
        break;
      case "bankroll":
        desired = Math.max(0, ctx.bankroll) * pr.percent;
        break;
      case "martingale":
        desired = base * o.factor ** step;
        break;
      case "paroli":
        desired = base * o.factor ** (step % o.resetWins);
        break;
      case "fibonacci": {
        let a = 1,
          b = 1;
        for (let i = 0; i < step; i++) [a, b] = [b, a + b];
        desired = base * a;
        break;
      }
      case "dalembert":
        desired = base * (step + 1);
        break;
      case "streak":
        if (
          (o.bias !== "due" && streak >= o.streakLength) ||
          (o.bias !== "hot" && streak <= -o.streakLength)
        )
          desired =
            base *
            o.factor **
              Math.min(o.maxProgression, Math.abs(streak) - o.streakLength + 1);
        break;
      case "custom":
        desired = expression(pr.expression || o.expression)({
          ...ctx,
          base,
          c: ctx.tc,
          streak,
          step,
          edge: advantage(r, ctx.tc),
          variance: r.bet.variance,
        });
        break;
    }
    return desired * pr.risk;
  }
  function progress(p, outcome, r) {
    if (!outcome) return;
    const mode = p.profile?.bet;
    let n = p.progression || 0;
    if (mode === "martingale") n = outcome < 0 ? n + 1 : 0;
    else if (mode === "paroli")
      n = outcome > 0 ? (n + 1) % r.opponents.resetWins : 0;
    else if (mode === "fibonacci") n = outcome < 0 ? n + 1 : Math.max(0, n - 2);
    else if (mode === "dalembert") n = Math.max(0, n + (outcome < 0 ? 1 : -1));
    p.progression = Math.min(r.opponents.maxProgression, n);
  }
  function dealerHits(value, r) {
    let d = r.dealer,
      threshold =
        d.mode === "custom"
          ? value.soft
            ? d.softStand
            : d.hardStand
          : value.soft && d.mode === "H17"
            ? 18
            : 17;
    return value.total < threshold;
  }
  return {
    BETS,
    PLAYS,
    SKILLS,
    OPPBETS,
    ACTIONS,
    defaults,
    merge,
    migrate,
    validate,
    clone,
    expression,
    roundCount,
    lookup,
    advantage,
    rawBet,
    constrain,
    profile,
    opponentBet,
    progress,
    dealerHits,
    clamp,
  };
})();
if (typeof module !== "undefined") module.exports = BJRules;
