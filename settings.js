/* Standard and Advanced views share a single settings model. Advanced edits are transactional. */
"use strict";
const RuleSettings = (() => {
  const R = BJRules,
    $ = (id) => document.getElementById(id),
    copy = R.clone;
  let current = R.defaults(),
    draftSettings = null,
    active = "bet",
    matrix = "hard", scope = null, draftExtras = {}, openingSettings = null;
  const sections = {
    bet: "Bet sizing",
    play: "Strategy for your seat",
    dealer: "Dealer soft 17 & rules",
    payout: "Blackjack payout",
    limits: "Multiplier & bankroll",
    analytics: "Hi-Lo counting & analytics",
    opponents: "Opponent skill & betting",
  };
  const enumOf = (...a) =>
    Object.fromEntries(a.map((x) => (Array.isArray(x) ? x : [x, x])));
  const rounding = enumOf(
    ["none", "No rounding"],
    ["floor", "Floor"],
    ["trunc", "Truncate toward zero"],
    ["round", "Nearest integer"],
  );
  // [path, label, type/options, min, max, step, visibility]
  const schema = {
    bet: [
      ["bet.mode", "Bet-sizing strategy", R.BETS],
      [
        "bet.input",
        "Count input",
        enumOf(["rc", "Running count"], ["tc", "True count"]),
      ],
      ["bet.tcRound", "True-count rounding", rounding],
      ["baseBet", "Base wager ($)", "number", 1, 1000000, 1],
      ["bet.unit", "Betting units", "number", 0.01, 1000, 0.01],
      ["bet.threshold", "Count threshold", "number", -100, 100, 0.1],
      ["bet.slope", "Slope / edge scale", "number", -100, 100, 0.1],
      [
        "bet.intercept",
        "Intercept (base-wager units)",
        "number",
        -100,
        100,
        0.1,
      ],
      ["bet.coefficient", "Coefficient / amplitude", "number", -100, 100, 0.1],
      ["bet.power", "Exponent", "number", 0.01, 10, 0.1],
      [
        "bet.percentileScale",
        "Percentile smoothing width",
        "number",
        0.01,
        100,
        0.1,
      ],
      ["bet.expression", "Custom wager expression", "text"],
      ["bet.kelly", "Kelly fraction", "number", 0, 1, 0.05],
      [
        "bet.allocation",
        "Allocated bankroll fraction",
        "number",
        0.001,
        1,
        0.01,
      ],
      [
        "bet.percent",
        "Bankroll fraction per wager",
        "number",
        0.00001,
        1,
        0.001,
      ],
      [
        "bet.risk",
        "Approximate ruin-probability ceiling",
        "number",
        0.00001,
        0.99,
        0.01,
      ],
      [
        "bet.penetrationSlope",
        "Penetration coefficient",
        "number",
        -10,
        10,
        0.1,
      ],
      [
        "bet.edgeModel",
        "Advantage estimator",
        enumOf(
          ["linear", "Linear count approximation"],
          ["lookup", "EV lookup interpolation"],
          ["custom", "Custom expression"],
        ),
      ],
      ["bet.edgeBase", "Edge at true count zero", "number", -1, 1, 0.001],
      [
        "bet.edgeSlope",
        "Edge increase per true-count unit",
        "number",
        -1,
        1,
        0.001,
      ],
      ["bet.edgeExpression", "Custom advantage expression", "text"],
      [
        "bet.variance",
        "Return variance (units squared)",
        "number",
        0.0001,
        100,
        0.1,
      ],
    ],
    play: [
      ["play.mode", "Playing strategy", R.PLAYS],
      [
        "play.insuranceIndex",
        "Insurance true-count index",
        "number",
        -20,
        20,
        1,
      ],
      [
        "play.evSamples",
        "EV rollout samples per action",
        "number",
        32,
        2048,
        32,
      ],
    ],
    dealer: [
      [
        "dealer.mode",
        "Dealer soft-total policy",
        enumOf(
          ["S17", "Stand on soft 17"],
          ["H17", "Hit on soft 17"],
          ["custom", "Custom thresholds"],
        ),
      ],
      ["dealer.hardStand", "Stand on hard total", "number", 12, 21, 1],
      ["dealer.softStand", "Stand on soft total", "number", 12, 21, 1],
      [
        "dealer.hole",
        "Hole-card / blackjack rule",
        enumOf(
          ["peek", "American hole card + peek"],
          ["nopeek", "Hole card, no peek (all bets lose)"],
          ["european", "European no hole card (all bets lose)"],
        ),
      ],
      ["dealer.das", "Double after split", "boolean"],
      ["dealer.maxHands", "Maximum hands per player", "number", 1, 8, 1],
      ["dealer.surrender", "Late surrender", "boolean"],
    ],
    payout: [
      [
        "payout.preset",
        "Natural-blackjack payout",
        enumOf(
          ["3:2", "3:2"],
          ["6:5", "6:5"],
          ["1:1", "1:1"],
          ["2:1", "2:1"],
          ["custom", "Custom ratio"],
        ),
      ],
      ["payout.numerator", "Payout numerator", "number", 0.01, 1000, 0.01],
      ["payout.denominator", "Payout denominator", "number", 0.01, 1000, 0.01],
    ],
    limits: [
      [
        "limits.mode",
        "Maximum-wager policy",
        enumOf(
          ["fixed", "Fixed multiplier"],
          ["none", "No multiplier limit"],
          ["bankroll", "Bankroll-based maximum"],
          ["table", "Table maximum"],
          ["dynamic", "Dynamic count-dependent multiplier"],
          ["custom", "Custom minimum/maximum spread"],
        ),
      ],
      [
        "limits.maxMultiplier",
        "Maximum bet multiplier",
        "number",
        1,
        1000000,
        1,
      ],
      [
        "limits.minMultiplier",
        "Minimum bet multiplier",
        "number",
        0,
        1000000,
        0.1,
      ],
      [
        "limits.dynamicSlope",
        "Multiplier increase per true count",
        "number",
        0,
        100,
        0.1,
      ],
      ["starting", "Initial bankroll ($)", "number", 1, 100000000, 1],
      ["baseBet", "Base wager ($)", "number", 1, 1000000, 1],
      ["minBet", "Table minimum ($)", "number", 1, 1000000, 1],
      ["limits.tableMax", "Table maximum ($)", "number", 0.01, 100000000, 0.01],
      [
        "limits.bankrollMax",
        "Maximum fraction of bankroll",
        "number",
        0.00001,
        1,
        0.01,
      ],
      ["limits.chip", "Chip denomination ($)", "number", 0.01, 1000000, 0.01],
      [
        "limits.increment",
        "Wager increment ($)",
        "number",
        0.01,
        1000000,
        0.01,
      ],
      [
        "limits.round",
        "Wager rounding",
        enumOf(
          ["floor", "Round down"],
          ["round", "Nearest"],
          ["ceil", "Round up"],
        ),
      ],
      ["finite", "Enforce bankroll limits", "boolean"],
      [
        "limits.insufficient",
        "Insufficient bankroll",
        enumOf(
          ["allin", "Reduce wager to available chips"],
          ["sitout", "Sit out if requested wager is unaffordable"],
        ),
      ],
      [
        "limits.terminate",
        "End session when",
        enumOf(
          ["all", "All players below minimum"],
          ["you", "Your seat below minimum"],
          ["any", "Any player below minimum"],
          ["stoploss", "Combined bankroll reaches stop-loss"],
        ),
      ],
      [
        "limits.stopLoss",
        "Stop-loss fraction of initial bankroll",
        "number",
        0.00001,
        1,
        0.01,
      ],
    ],
    analytics: [
      [
        "analytics.mode",
        "Count display",
        enumOf(
          ["hidden", "Hidden"],
          ["running", "Running count only"],
          ["true", "True count only"],
          ["both", "Running + true count"],
          ["effects", "Card-by-card count effects"],
          ["history", "Count history"],
          ["probability", "Probability / advantage estimates"],
          ["full", "Full analytics overlay"],
        ),
      ],
      ["analytics.precision", "True-count decimal places", "number", 0, 6, 1],
      ["analytics.round", "Displayed true-count rounding", rounding],
    ],
    opponents: [
      ["opponents.enabled", "Enable independent opponent profiles", "boolean"],
      ["opponents.skill", "Playing skill", R.SKILLS],
      ["opponents.bet", "Betting behavior", R.OPPBETS],
      [
        "opponents.error",
        "Custom decision error probability",
        "number",
        0,
        1,
        0.01,
      ],
      ["opponents.accuracy", "Count accuracy multiplier", "number", 0, 1, 0.05],
      ["opponents.risk", "Wager risk multiplier", "number", 0.01, 10, 0.1],
      ["opponents.percent", "Bankroll wager fraction", "number", 0, 1, 0.001],
      ["opponents.streakLength", "Streak trigger length", "number", 1, 20, 1],
      ["opponents.factor", "Progression multiplier", "number", 1, 10, 0.1],
      [
        "opponents.maxProgression",
        "Maximum progression step",
        "number",
        1,
        20,
        1,
      ],
      ["opponents.resetWins", "Paroli reset after wins", "number", 1, 20, 1],
      [
        "opponents.bias",
        "Streak sensitivity",
        enumOf(
          ["both", "Wins and losses"],
          ["hot", "Winning streaks"],
          ["due", "Losing streaks"],
        ),
      ],
      ["opponents.expression", "Custom opponent wager expression", "text"],
    ],
  };
  const rootIds = [
    "heroSeat",
    "countSystem",
    "decks",
    "penetrationMode",
    "penetration",
    "penetrationSigma",
    "minBet",
    "baseBet",
    "starting",
    "finite",
    "sessions",
    "rounds",
    "seed",
    "displayMode",
    "stepInterval",
  ];
  const standard = {
    strategy: ["play", "mode"],
    dealerRule: ["dealer", "mode"],
    betMode: ["bet", "mode"],
    spread: ["limits", "maxMultiplier"],
    showCount: ["analytics", "mode"],
    humanOpponents: ["opponents", "enabled"],
  };
  function capture() {
    let fields = {};
    for (const id of rootIds)
      fields[id] = $(id).type === "checkbox" ? $(id).checked : $(id).value;
    return {
      version: 2,
      rules: copy(current),
      fields,
      seats: copy(window.getSeatDraft()),
    };
  }
  function get(path) {
    if (path.startsWith('$')) return draftExtras[path.slice(1)];
    if (!path.includes("."))
      return path === "finite"
        ? draftSettings.fields[path]
        : Number(draftSettings.fields[path]);
    let [a, b] = path.split(".");
    if (path === "payout.preset") {
      let p = draftSettings.rules.payout;
      return (
        ["3:2", "6:5", "1:1", "2:1"].find((x) => {
          let [n, d] = x.split(":").map(Number);
          return n / d === p.numerator / p.denominator;
        }) || "custom"
      );
    }
    return draftSettings.rules[a][b];
  }
  function set(path, value) {
    if (path.startsWith('$')) { draftExtras[path.slice(1)] = value; return; }
    if (!path.includes(".")) draftSettings.fields[path] = value;
    else {
      let [a, b] = path.split(".");
      if (path === "payout.preset") {
        if (value !== "custom") {
          let [n, d] = value.split(":").map(Number);
          draftSettings.rules.payout = { numerator: n, denominator: d };
        } else draftSettings.rules.payout = { numerator: 1.25, denominator: 1 };
      } else draftSettings.rules[a][b] = value;
    }
  }
  const el = (tag, attrs = {}, text) => {
    let e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs))
      k === "class" ? (e.className = v) : e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  function info(key, title) {
    let b = el(
      "button",
      {
        type: "button",
        class: "info-button",
        "aria-label": "About " + title,
        "aria-haspopup": "dialog",
      },
      "ⓘ",
    );
    b.onclick = () => help(key, title);
    return b;
  }
  function heading(tag, title, key) {
    let h = el(tag, { class: "settings-heading" }, title);
    h.append(info(key, title));
    return h;
  }
  function fieldVisible(path) {
    let m = get("bet.mode"),
      d = get("dealer.mode"),
      l = get("limits.mode"),
      o = get("opponents.bet");
    const map = {
      "bet.input": [
        "lookup",
        "piecewise",
        "percentile",
        "linear",
        "polynomial",
        "exponential",
        "logarithmic",
        "sigmoid",
        "power",
        "custom",
        "countBankroll",
        "penetration",
      ].includes(m),
      "bet.threshold": [
        "linear",
        "polynomial",
        "exponential",
        "logarithmic",
        "sigmoid",
        "power",
        "countBankroll",
      ].includes(m),
      "bet.slope": [
        "linear",
        "polynomial",
        "exponential",
        "logarithmic",
        "sigmoid",
        "advantage",
      ].includes(m),
      "bet.intercept": [
        "linear",
        "polynomial",
        "logarithmic",
        "sigmoid",
        "power",
      ].includes(m),
      "bet.coefficient": [
        "polynomial",
        "exponential",
        "sigmoid",
        "power",
      ].includes(m),
      "bet.power": ["polynomial", "power"].includes(m),
      "bet.percentileScale": m === "percentile",
      "bet.expression": m === "custom",
      "bet.kelly": ["fractional", "ev"].includes(m),
      "bet.allocation": [
        "kelly",
        "fractional",
        "bankroll",
        "countBankroll",
        "risk",
        "ev",
      ].includes(m),
      "bet.percent": ["bankroll", "countBankroll"].includes(m),
      "bet.risk": m === "risk",
      "bet.penetrationSlope": m === "penetration",
      "bet.edgeBase": get("bet.edgeModel") === "linear",
      "bet.edgeSlope": get("bet.edgeModel") === "linear",
      "bet.edgeExpression": get("bet.edgeModel") === "custom",
      "dealer.hardStand": d === "custom",
      "dealer.softStand": d === "custom",
      "limits.maxMultiplier": ["fixed", "custom", "dynamic"].includes(l),
      "limits.minMultiplier": l === "custom",
      "limits.dynamicSlope": l === "dynamic",
      "limits.bankrollMax": l === "bankroll",
      "limits.stopLoss": get("limits.terminate") === "stoploss",
      "play.insuranceIndex": get("play.mode") === "deviations",
      "play.evSamples": ["optimal", "adjusted"].includes(get("play.mode")),
      "opponents.error": get("opponents.skill") === "custom",
      "opponents.percent": o === "bankroll",
      "opponents.resetWins": o === "paroli",
      "opponents.expression": o === "custom",
      "opponents.bias": o === "streak",
      "opponents.streakLength": ["existing", "streak"].includes(o),
      "opponents.factor": [
        "existing",
        "streak",
        "paroli",
        "martingale",
      ].includes(o),
      "opponents.maxProgression": [
        "streak",
        "paroli",
        "martingale",
        "fibonacci",
        "dalembert",
      ].includes(o),
    };
    if (
      [
        "bet.edgeModel",
        "bet.edgeBase",
        "bet.edgeSlope",
        "bet.edgeExpression",
        "bet.variance",
      ].includes(path) &&
      active !== "analytics" &&
      !["kelly", "fractional", "advantage", "risk", "ev", "custom"].includes(m)
    )
      return false;
    return map[path] !== false;
  }
  function makeField(row) {
    let [path, title, type, min, max, step] = row,
      wrap = el("div", {
        class: "field advanced-field",
        "data-search": (
          title +
          " " +
          (typeof type === "object" ? Object.values(type).join(" ") : "")
        ).toLowerCase(),
      });
    wrap.dataset.path = path;
    wrap.hidden = !fieldVisible(path);
    let id = "adv-" + path.replaceAll(".", "-"),
      label = el("div", { class: "field-label" });
    label.append(el("label", { for: id }, title), info(path, title));
    let control;
    if (typeof type === "object" || type === "boolean") {
      control = el("select", { id });
      let opts = type === "boolean" ? { true: "Yes", false: "No" } : type;
      for (const [value, text] of Object.entries(opts))
        control.append(el("option", { value }, text));
      control.value = String(get(path));
    } else {
      control = el("input", {
        id,
        type: type === "number" ? "number" : "text",
      });
      if (min != null) {
        control.min = min;
        control.max = max;
        control.step = step;
      }
      control.value = get(path);
    }
    control.oninput = () => {
      set(
        path,
        type === "boolean"
          ? control.value === "true"
          : type === "number"
            ? control.value.trim() === ""
              ? NaN
              : Number(control.value)
            : control.value,
      );
      if (path === "bet.mode")
        previewAxis = ["bankroll", "countBankroll"].includes(control.value)
          ? "bankroll"
          : ["kelly", "fractional", "advantage", "risk", "ev"].includes(
                control.value,
              )
            ? "edge"
            : "count";
      let valid = validateDraft(false);
      control.setAttribute("aria-invalid", String(!valid));
      for (const f of $("advancedFields").querySelectorAll("[data-path]"))
        f.hidden = !fieldVisible(f.dataset.path);
      filter();
      preview();
    };
    if (typeof type === "object" || type === "boolean")
      control.onchange = () => {
        renderSection();
      };
    wrap.append(label, control);
    return wrap;
  }
  function validateEnvelope(e) {
    if (!e || typeof e !== "object") throw Error("Invalid settings file.");
    let normalized = {
      version: 2,
      rules: R.migrate(e.rules ? e : e),
      fields: { ...capture().fields, ...e.fields },
      seats: e.seats || capture().seats,
    };
    R.validate(normalized.rules);
    const f = normalized.fields;
    if (!Number.isInteger(+f.heroSeat) || +f.heroSeat < 0 || +f.heroSeat > 4) throw Error('Invalid seating position.');
    if (!['hiLo', 'hiOptI', 'none'].includes(f.countSystem)) throw Error('Invalid count system.');
    for (const [key, lo, hi] of [
      ["decks", 1, 8],
      ["minBet", 1, 1000000],
      ["baseBet", 1, 1000000],
      ["starting", 1, 100000000],
      ["sessions", 1, 500],
      ["rounds", 1, 100000],
    ]) {
      if (
        !Number.isInteger(Number(f[key])) ||
        Number(f[key]) < lo ||
        Number(f[key]) > hi
      )
        throw Error(key + ": invalid value.");
    }
    if (
      Number(f.baseBet) < Number(f.minBet) ||
      normalized.rules.limits.tableMax < Number(f.minBet)
    )
      throw Error(
        "Base wager and table maximum must be at least the table minimum.",
      );
    if (Number(f.sessions) * Number(f.rounds) > 2000000)
      throw Error("Limit the experiment to 2,000,000 rounds.");
    if (
      !Number.isFinite(Number(f.penetration)) ||
      !Number.isFinite(Number(f.penetrationSigma)) ||
      !["fixed", "simulated", "gaussian"].includes(f.penetrationMode) ||
      Number(f.penetration) < 20 ||
      Number(f.penetration) > 95 ||
      Number(f.penetrationSigma) < 0 ||
      Number(f.penetrationSigma) > 30
    )
      throw Error("Invalid penetration settings.");
    if (typeof f.finite !== "boolean")
      throw Error("Bankroll enforcement must be yes/no.");
    if (
      f.seed !== "" &&
      (!Number.isInteger(Number(f.seed)) ||
        Number(f.seed) < 0 ||
        Number(f.seed) > 4294967295)
    )
      throw Error("Invalid seed.");
    if (
      !["animated", "stepped", "final"].includes(f.displayMode) ||
      !Number.isInteger(Number(f.stepInterval)) ||
      Number(f.stepInterval) < 1
    )
      throw Error("Invalid display settings.");
    if (
      !Array.isArray(normalized.seats) ||
      normalized.seats.length !== 5 ||
      normalized.seats.some(
        (s, i) =>
          s.seat !== i ||
          typeof s.active !== "boolean" ||
          (s.amount !== "" &&
            (!Number.isInteger(Number(s.amount)) ||
              Number(s.amount) < 0 ||
              Number(s.amount) > 100000000)),
      ) ||
      !normalized.seats.some((s) => s.active)
    )
      throw Error("Invalid seat settings.");
    return normalized;
  }
  function validateDraft(show = true) {
    try {
      validateEnvelope(draftSettings);
      $("advancedError").textContent = "";
      $("advancedApply").disabled = false;
      return true;
    } catch (e) {
      $("advancedError").textContent = e.message;
      $("advancedApply").disabled = true;
      return false;
    }
  }
  function syncStandard() {
    const opts = {
      strategy: R.PLAYS,
      dealerRule: { S17: "Stand", H17: "Hit", custom: "Custom" },
      betMode: R.BETS,
    };
    for (const [id, [a, b]] of Object.entries(standard)) {
      let input = $(id),
        v = current[a][b];
      if (id === "showCount") {
        input.checked = v !== "hidden";
        continue;
      }
      if (id === "humanOpponents") {
        input.checked = v;
        continue;
      }
      if (input.tagName === "SELECT") {
        for (const o of [...input.options]) if (o.dataset.advanced) o.remove();
        if (![...input.options].some((o) => o.value === String(v))) {
          let opt = new Option((opts[id]?.[v] || v) + " · Advanced", v);
          opt.dataset.advanced = "true";
          input.add(opt);
        }
      }
      input.value = String(v);
    }
    const payout = current.payout.numerator / current.payout.denominator;
    for (const o of [...$("pay").options]) if (o.dataset.advanced) o.remove();
    if (![...$("pay").options].some((o) => Number(o.value) === payout)) {
      let opt = new Option(
        current.payout.numerator +
          ":" +
          current.payout.denominator +
          " · Advanced",
        payout,
      );
      opt.dataset.advanced = "true";
      $("pay").add(opt);
    }
    $("pay").value = String(payout);
    $("spreadField").style.display = ["fixed", "dynamic", "custom"].includes(
      current.limits.mode,
    )
      ? "block"
      : "none";
    let base = R.defaults(),
      visible = copy(current);
    for (const [id, [a, b]] of Object.entries(standard))
      visible[a][b] = base[a][b];
    visible.payout = base.payout;
    let advanced =
      JSON.stringify(visible) !== JSON.stringify(base) ||
      !["basic", "mimic", "stand"].includes(current.play.mode) ||
      ![
        "flat",
        "rcDiscrete",
        "rcContinuous",
        "tcDiscrete",
        "tcContinuous",
        "fractional",
      ].includes(current.bet.mode) ||
      current.dealer.mode === "custom" ||
      ![1.5, 1.2].includes(payout) ||
      !["hidden", "effects"].includes(current.analytics.mode);
    $("advancedBadge").textContent = advanced ? "Advanced settings active" : "";
  }
  function persist() {
    try {
      localStorage.setItem(
        "blackjack.settings.v2",
        JSON.stringify(validateEnvelope(capture())),
      );
      window.dispatchEvent(new CustomEvent('blackjack-settings-saved'));
    } catch {
      /* Incomplete drafts and unavailable storage do not interrupt editing. */
    }
  }
  function applyEnvelope(e) {
    e = validateEnvelope(e);
    current = e.rules;
    for (const id of rootIds)
      if ($(id).type === "checkbox") $(id).checked = e.fields[id];
      else $(id).value = e.fields[id];
    window.setSeatDraft(e.seats);
    syncStandard();
    $("displayMode").onchange();
    flagChange();
    syncStandard();
    persist();
  }
  function open(options = null) {
    scope = options && !options.target ? options : null;
    draftSettings = scope?.envelope ? copy(scope.envelope) : capture();
    draftExtras = copy(scope?.extras || {});
    openingSettings = JSON.stringify(draftSettings);
    const pages = scope ? ['general', ...scope.pages] : Object.keys(sections);
    active = scope ? 'general' : (sections[active] ? active : 'bet');
    $('advancedNav').replaceChildren();
    for (const key of pages) {
      const b = el('button', { type: 'button', 'data-section': key }, key === 'general' ? 'General' : scope?.pageNames?.[key] || sections[key]);
      b.onclick = () => { active = key; $('advancedSearch').value = ''; renderSection(); };
      $('advancedNav').append(b);
    }
    $('advancedResetSection').hidden = !!scope;
    $('advancedResetAll').hidden = !!scope;
    $('advancedTitle').textContent = scope?.title || 'Advanced rules & strategy';
    $("advancedSearch").value = "";
    renderSection();
    $("advancedDialog").showModal();
  }
  function filter() {
    let q = $("advancedSearch").value.toLowerCase().trim();
    if (q) {
      for (const f of $("advancedFields").querySelectorAll(".advanced-field"))
        f.hidden = !f.dataset.search.includes(q);
    }
    $("advancedNoMatch").hidden =
      !q ||
      [...$("advancedFields").querySelectorAll(".advanced-field")].some(
        (f) => !f.hidden,
      );
  }
  function renderSection() {
    let box = $("advancedFields");
    box.replaceChildren();
    $("advancedSectionTitle").replaceChildren(
      heading("h3", active === 'general' ? 'General' : scope?.pageNames?.[active] || sections[active], active),
    );
    for (const b of $("advancedNav").children)
      b.setAttribute(
        "aria-current",
        b.dataset.section === active ? "page" : "false",
      );
    if ($("advancedSearch").value.trim()) {
      let seen = new Set();
      for (const rows of (scope ? [scope.generalRows, ...scope.pages.map(page => schema[page])] : Object.values(schema)))
        for (const row of rows)
          if (!seen.has(row[0]) && !scope?.excludePaths?.includes(row[0])) {
            seen.add(row[0]);
            box.append(scope?.penetrationControl && row[0] === 'penetration' ? makePenetrationControl() : makeField(row));
          }
    } else for (const row of (active === 'general' ? scope.generalRows : schema[active])) {
      if (!scope?.excludePaths?.includes(row[0])) box.append(scope?.penetrationControl && row[0] === 'penetration' ? makePenetrationControl() : makeField(row));
    }
    $("advancedExtra").replaceChildren();
    if (active === "bet") {
      lookupEditor("lookup", "Count-to-wager lookup / breakpoints", true);
      lookupEditor("evLookup", "Count-to-advantage lookup", false);
      kellyPresets();
    }
    if (active === "play") strategyTable();
    if (active === "opponents") opponentEditor();
    filter();
    validateDraft(false);
    preview();
  }
  function makePenetrationControl() {
    const wrap = el('div', { class: 'field advanced-field', 'data-search': 'penetration fixed simulated gaussian cut sigma' }), label = el('div', { class: 'field-label' });
    label.append(el('label', { for: 'adv-penetrationMode' }, 'Penetration %'), info('penetration', 'Penetration %')); wrap.append(label);
    const group = el('div', { class: 'penetration-control' }), fixed = el('input', { type: 'number', id: 'adv-penetration', min: 20, max: 95, step: .0001, 'aria-label': 'Fixed cut-card percentage' }), sigma = el('input', { type: 'number', id: 'adv-penetrationSigma', min: 0, max: 30, step: .1, 'aria-label': 'Standard deviation in percentage points' }), mode = el('select', { id: 'adv-penetrationMode', 'aria-label': 'Penetration mode' }), hint = el('small');
    for (const [value, text] of [['fixed', 'Fixed'], ['simulated', 'Simulated'], ['gaussian', 'Gaussian']]) mode.append(el('option', { value }, text));
    fixed.value = draftSettings.fields.penetration; sigma.value = draftSettings.fields.penetrationSigma; mode.value = draftSettings.fields.penetrationMode;
    const update = () => { group.classList.toggle('numeric', mode.value !== 'simulated'); fixed.hidden = mode.value !== 'fixed'; sigma.hidden = mode.value !== 'gaussian'; hint.textContent = { fixed: 'Fixed cut target (%)', simulated: 'Variable cut + actual rounds', gaussian: 'Gaussian σ (pp)' }[mode.value]; };
    fixed.oninput = () => { draftSettings.fields.penetration = fixed.value.trim() === '' ? NaN : Number(fixed.value); validateDraft(false); preview(); };
    sigma.oninput = () => { draftSettings.fields.penetrationSigma = sigma.value.trim() === '' ? NaN : Number(sigma.value); validateDraft(false); preview(); };
    mode.onchange = () => { draftSettings.fields.penetrationMode = mode.value; update(); validateDraft(false); preview(); };
    group.append(fixed, sigma, mode); wrap.append(group, hint); update(); return wrap;
  }
  function kellyPresets() {
    if (!["fractional", "ev"].includes(get("bet.mode"))) return;
    let group = el("div", { class: "settings-inline" });
    for (const [name, v] of [
      ["Quarter", 0.25],
      ["Half", 0.5],
      ["Full", 1],
    ]) {
      let b = el("button", { type: "button", class: "button" }, name);
      b.onclick = () => {
        set("bet.kelly", v);
        renderSection();
      };
      group.append(b);
    }
    $("advancedExtra").prepend(group);
  }
  function lookupEditor(key, title, wager) {
    if (key === "lookup" && !["lookup", "piecewise"].includes(get("bet.mode")))
      return;
    if (
      key === "evLookup" &&
      get("bet.mode") !== "ev" &&
      get("bet.edgeModel") !== "lookup"
    )
      return;
    let group = el("section", { class: "settings-subsection" });
    group.append(heading("h4", title, "bet." + key));
    let table = el("table", { class: "settings-table" }),
      head = el("tr");
    for (const t of [
      "Count",
      wager ? "Wager multiplier" : "Expected return / unit",
      "",
    ])
      head.append(el("th", {}, t));
    table.append(head);
    draftSettings.rules.bet[key].forEach((row, i) => {
      let tr = el("tr");
      row.forEach((v, j) => {
        let td = el("td"),
          inp = el("input", {
            type: "number",
            step: "any",
            "aria-label": `${title}, row ${i + 1}, ${j === 0 ? "count" : "value"}`,
          });
        inp.value = v;
        inp.oninput = () => {
          row[j] = inp.value.trim() === "" ? NaN : Number(inp.value);
          validateDraft();
          preview();
        };
        td.append(inp);
        tr.append(td);
      });
      let td = el("td"),
        del = el(
          "button",
          {
            type: "button",
            class: "button",
            "aria-label": "Remove row " + (i + 1),
          },
          "Remove",
        );
      del.onclick = () => {
        draftSettings.rules.bet[key].splice(i, 1);
        renderSection();
      };
      td.append(del);
      tr.append(td);
      table.append(tr);
    });
    let add = el("button", { type: "button", class: "button" }, "Add row");
    add.onclick = () => {
      let rows = draftSettings.rules.bet[key];
      rows.push([rows.length ? rows.at(-1)[0] + 1 : 0, wager ? 1 : 0]);
      renderSection();
    };
    group.append(table, add);
    $("advancedExtra").append(group);
  }
  function strategyTable() {
    let group = el("section", { class: "settings-subsection" });
    group.append(heading("h4", "Interactive strategy matrix", "play.table"));
    let nav = el("div", { class: "settings-inline" });
    for (const kind of ["hard", "soft", "pair"]) {
      let b = el(
        "button",
        {
          type: "button",
          class: "button",
          "aria-pressed": String(matrix === kind),
        },
        kind[0].toUpperCase() + kind.slice(1),
      );
      b.onclick = () => {
        matrix = kind;
        renderSection();
      };
      nav.append(b);
    }
    group.append(nav);
    let table = el("table", { class: "settings-table strategy-matrix" }),
      head = el("tr");
    head.append(el("th", {}, "Hand / dealer"));
    for (let u = 2; u <= 11; u++) head.append(el("th", {}, u === 11 ? "A" : u));
    table.append(head);
    let start = matrix === "hard" ? 5 : matrix === "soft" ? 13 : 2,
      end = matrix === "pair" ? 11 : 20;
    for (let n = start; n <= end; n++) {
      let tr = el("tr");
      tr.append(
        el("th", {}, matrix === "pair" ? (n === 11 ? "A,A" : `${n},${n}`) : n),
      );
      for (let u = 2; u <= 11; u++) {
        let key = `${matrix}:${n}:${u}`,
          h = exampleHand(matrix, n),
          up = { rank: u === 11 ? "ace" : String(u) },
          opts = {
            h17: get("dealer.mode") === "H17",
            canDouble: true,
            canSplit: matrix === "pair",
            canSurrender: get("dealer.surrender"),
          },
          a = policyAction(
            get("play.mode") === "optimal" ? "adjusted" : get("play.mode"),
            h,
            up,
            opts,
            draftSettings.rules,
            Number($("previewCount")?.value) || 0,
            () => 0.5,
          );
        let td = el("td"),
          select = el("select", {
            "aria-label": `${matrix} ${n} versus ${u === 11 ? "ace" : u}`,
          });
        for (const action of R.ACTIONS)
          select.append(
            el(
              "option",
              { value: action },
              { hit: "H", stand: "S", double: "D", split: "P", surrender: "R" }[
                action
              ],
            ),
          );
        select.value = a;
        select.dataset.action = a;
        select.onchange = () => {
          draftSettings.rules.play.mode = "custom";
          draftSettings.rules.play.table[key] = select.value;
          renderSection();
        };
        td.append(select);
        tr.append(td);
      }
      table.append(tr);
    }
    let scroll = el("div", { class: "table-scroll" });
    scroll.append(table);
    group.append(
      scroll,
      el(
        "p",
        { class: "note" },
        "H hit · S stand · D double · P split · R surrender. Edit any cell to create a custom table. Unedited cells use basic strategy. Illegal actions fall back to legal basic strategy. EV mode shows the rule-adjusted reference here; live decisions use sampled composition.",
      ),
    );
    $("advancedExtra").append(group);
    if (scope?.decisionRules) {
      const rules = el('details', { class: 'settings-subsection' }), summary = el('summary', {}, 'Custom decision rules'), editor = el('textarea', { class: 'custom-rule-editor', 'aria-label': 'Custom decision rules JSON' });
      editor.value = JSON.stringify(draftSettings.rules.play.decisionRules || [], null, 2);
      const apply = el('button', { type: 'button', class: 'button' }, 'Apply custom decision rules');
      apply.onclick = () => { try { const parsed = JSON.parse(editor.value); const old = draftSettings.rules.play.decisionRules; draftSettings.rules.play.decisionRules = parsed; try { R.validate(draftSettings.rules); } catch (error) { draftSettings.rules.play.decisionRules = old; throw error; } draftSettings.rules.play.mode = 'custom'; renderSection(); } catch (error) { $('advancedError').textContent = error.message; } };
      rules.append(summary, editor, apply); $('advancedExtra').append(rules);
    }
    if (get("play.mode") === "deviations") {
      let g = el("section", { class: "settings-subsection" });
      g.append(heading("h4", "Count deviations", "play.deviations"));
      let t = el("table", { class: "settings-table" }),
        head = el("tr");
      for (const x of [
        "Type",
        "Total / pair",
        "Upcard",
        "TC ≥",
        "At / above",
        "Below",
        "",
      ])
        head.append(el("th", {}, x));
      t.append(head);
      draftSettings.rules.play.deviations.forEach((row, i) => {
        let tr = el("tr");
        row.forEach((v, j) => {
          let td = el("td"),
            input;
          if ([0, 4, 5].includes(j)) {
            input = el("select", {
              "aria-label": `Deviation ${i + 1} column ${j + 1}`,
            });
            for (const opt of j === 0 ? ["hard", "soft", "pair"] : R.ACTIONS)
              input.append(el("option", { value: opt }, opt));
          } else
            input = el("input", {
              type: "number",
              step: "1",
              "aria-label": `Deviation ${i + 1} column ${j + 1}`,
            });
          input.value = v;
          input.onchange = () => {
            row[j] = [0, 4, 5].includes(j)
              ? input.value
              : input.value.trim() === ""
                ? NaN
                : Number(input.value);
            validateDraft();
          };
          td.append(input);
          tr.append(td);
        });
        let td = el("td"),
          b = el("button", { type: "button", class: "button" }, "×");
        b.setAttribute("aria-label", "Remove deviation " + (i + 1));
        b.onclick = () => {
          draftSettings.rules.play.deviations.splice(i, 1);
          renderSection();
        };
        td.append(b);
        tr.append(td);
        t.append(tr);
      });
      let sc = el("div", { class: "table-scroll" });
      sc.append(t);
      let add = el(
        "button",
        { type: "button", class: "button" },
        "Add deviation",
      );
      add.onclick = () => {
        draftSettings.rules.play.deviations.push([
          "hard",
          16,
          10,
          0,
          "stand",
          "hit",
        ]);
        renderSection();
      };
      g.append(sc, add);
      $("advancedExtra").append(g);
    }
  }
  function exampleHand(kind, n) {
    let ranks =
      kind === "pair"
        ? [n, n]
        : kind === "soft"
          ? [11, n - 11]
          : n <= 11
            ? [2, n - 2]
            : [10, n - 10];
    return {
      cards: ranks.map((v) => ({ rank: v === 11 ? "ace" : String(v) })),
      split: false,
    };
  }
  function opponentEditor() {
    if (!get("opponents.enabled")) return;
    let group = el("section", { class: "settings-subsection" });
    group.append(
      heading("h4", "Independent seat profiles", "opponents.seats"),
      el(
        "p",
        { class: "note" },
        "Seat overrides take precedence over the shared opponent settings. Your seat uses its own strategy and bet-sizing model. Starting bankroll overrides apply on the next run.",
      ),
    );
    if (get("opponents.skill") === "randomized") {
      let row = el("div", { class: "settings-grid" });
      ["Beginner weight", "Intermediate weight", "Expert weight"].forEach(
        (name, i) => {
          let label = el("label", {}, name),
            inp = el("input", { type: "number", min: 0, step: 0.1 });
          inp.value = draftSettings.rules.opponents.distribution[i];
          inp.oninput = () => {
            draftSettings.rules.opponents.distribution[i] =
              inp.value.trim() === "" ? NaN : Number(inp.value);
            validateDraft();
          };
          label.append(info("opponents.distribution", name), inp);
          row.append(label);
        },
      );
      group.append(row);
    }
    for (const seat of [0, 1, 3, 4]) {
      let details = el("details", { class: "seat-profile" }),
        summary = el(
          "summary",
          {},
          "Seat " +
            (seat + 1) +
            (draftSettings.seats[seat].active ? "" : " · inactive"),
        );
      summary.append(info("opponents.seats", "Seat " + (seat + 1)));
      details.append(summary);
      let grid = el("div", { class: "settings-grid" });
      let p = draftSettings.rules.opponents.seats[seat] || {};
      for (const [key, title, options] of [
        ["play", "Playing strategy", R.PLAYS],
        ["bet", "Betting behavior", R.OPPBETS],
        ["base", "Base wager ($)"],
        ["bankroll", "Starting bankroll ($)"],
        ["max", "Maximum wager ($)"],
        ["error", "Decision error probability"],
        ["accuracy", "Count accuracy"],
        ["risk", "Risk multiplier"],
        ["percent", "Bankroll fraction"],
        ["expression", "Custom betting expression"],
      ]) {
        let label = el("label", {}, title);
        label.append(info("opponents." + key, title));
        let input;
        if (options) {
          input = el("select", { "aria-label": `Seat ${seat + 1}: ${title}` });
          input.append(el("option", { value: "" }, "Use shared setting"));
          for (const [v, n] of Object.entries(options))
            input.append(el("option", { value: v }, n));
        } else
          input = el("input", {
            type: key === "expression" ? "text" : "number",
            step: "any",
            placeholder: "Use shared setting",
            "aria-label": `Seat ${seat + 1}: ${title}`,
          });
        input.value = p[key] ?? "";
        input.oninput = () => {
          draftSettings.rules.opponents.seats[seat] ??= {};
          if (input.value === "")
            delete draftSettings.rules.opponents.seats[seat][key];
          else
            draftSettings.rules.opponents.seats[seat][key] =
              options || key === "expression"
                ? input.value
                : Number(input.value);
          validateDraft();
        };
        label.append(input);
        grid.append(label);
      }
      let clear = el(
        "button",
        { type: "button", class: "button" },
        "Clear seat overrides",
      );
      clear.onclick = () => {
        delete draftSettings.rules.opponents.seats[seat];
        renderSection();
      };
      details.append(grid, clear);
      group.append(details);
    }
    $("advancedExtra").append(group);
  }
  const math = (body, tex) =>
    `<math display="block"><semantics>${body}<annotation encoding="application/x-tex">${tex}</annotation></semantics></math>`;
  const formulas = {
    count: math(
      "<mrow><mi>TC</mi><mo>=</mo><mfrac><mi>RC</mi><msub><mi>D</mi><mtext>remaining</mtext></msub></mfrac></mrow>",
      "TC=RC/D_{remaining}",
    ),
    linear: math(
      "<mrow><mi>B</mi><mo>(</mo><mi>c</mi><mo>)</mo><mo>=</mo><mi>clip</mi><mo>(</mo><msub><mi>B</mi><mn>0</mn></msub><mo>+</mo><mi>k</mi><mo>(</mo><mi>c</mi><mo>−</mo><msub><mi>c</mi><mn>0</mn></msub><mo>)</mo><mo>,</mo><msub><mi>B</mi><mtext>min</mtext></msub><mo>,</mo><msub><mi>B</mi><mtext>max</mtext></msub><mo>)</mo></mrow>",
      "B(c)=\\operatorname{clip}(B_0+k(c-c_0),B_{min},B_{max})",
    ),
    kelly: math(
      "<mrow><mi>B</mi><mo>≈</mo><mi>f</mi><mi>W</mi><mi>max</mi><mo>(</mo><mn>0</mn><mo>,</mo><mfrac><mi>μ</mi><msup><mi>σ</mi><mn>2</mn></msup></mfrac><mo>)</mo></mrow>",
      "B\\approx fW\\max(0,\\mu/\\sigma^2)",
    ),
    ev: math(
      '<mrow><mi>EV</mi><mo>=</mo><munder><mo>∑</mo><mi>i</mi></munder><msub><mi>P</mi><mi>i</mi></msub><msub><mi>X</mi><mi>i</mi></msub><mo>,</mo><mspace width="1em"/><msup><mi>σ</mi><mn>2</mn></msup><mo>=</mo><munder><mo>∑</mo><mi>i</mi></munder><msub><mi>P</mi><mi>i</mi></msub><msup><mrow><mo>(</mo><msub><mi>X</mi><mi>i</mi></msub><mo>−</mo><mi>EV</mi><mo>)</mo></mrow><mn>2</mn></msup></mrow>',
      "EV=\\sum_i P_iX_i,\\quad \\sigma^2=\\sum_iP_i(X_i-EV)^2",
    ),
    payout: math(
      '<mrow><msub><mi>Profit</mi><mtext>natural</mtext></msub><mo>=</mo><mi>B</mi><mfrac><mi>n</mi><mi>d</mi></mfrac><mo>,</mo><mspace width="1em"/><msub><mi>Return</mi><mtext>natural</mtext></msub><mo>=</mo><mi>B</mi><mo>+</mo><mi>B</mi><mfrac><mi>n</mi><mi>d</mi></mfrac></mrow>',
      "Profit_{natural}=Bn/d,\\quad Return_{natural}=B+Bn/d",
    ),
    probability: math(
      "<mrow><mi>P</mi><mo>(</mo><mtext>natural</mtext><mo>)</mo><mo>=</mo><mfrac><mrow><mn>2</mn><mi>A</mi><mi>T</mi></mrow><mrow><mi>N</mi><mo>(</mo><mi>N</mi><mo>−</mo><mn>1</mn><mo>)</mo></mrow></mfrac></mrow>",
      "P(natural)=2AT/[N(N-1)]",
    ),
    risk: math(
      "<mrow><mi>B</mi><mo>≈</mo><mi>W</mi><mi>max</mi><mo>(</mo><mn>0</mn><mo>,</mo><mi>min</mi><mo>(</mo><mfrac><mi>μ</mi><msup><mi>σ</mi><mn>2</mn></msup></mfrac><mo>,</mo><mfrac><mrow><mn>2</mn><mi>μ</mi></mrow><mrow><msup><mi>σ</mi><mn>2</mn></msup><mi>ln</mi><mo>(</mo><mn>1</mn><mo>/</mo><mi>r</mi><mo>)</mo></mrow></mfrac><mo>)</mo><mo>)</mo></mrow>",
      "B\\approx W\\max(0,\\min(\\mu/\\sigma^2,2\\mu/(\\sigma^2\\ln(1/r))))",
    ),
  };
  // Small MathML formatter for the same arithmetic grammar used by wager expressions.
  // All equations are native typeset math; the hidden annotation preserves LaTeX semantics.
  function typeset(source) {
    const tokens =
      source.match(
        /(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?|[a-zA-Z_][a-zA-Z_0-9]*|[()+\-*/^,]/g,
      ) || [];
    let i = 0;
    const symbols = {
      base: ["<msub><mi>B</mi><mn>0</mn></msub>", "B_0"],
      bankroll: ["<mi>W</mi>", "W"],
      edge: ["<mi>μ</mi>", "\\mu"],
      variance: ["<msup><mi>σ</mi><mn>2</mn></msup>", "\\sigma^2"],
      threshold: ["<msub><mi>c</mi><mn>0</mn></msub>", "c_0"],
      slope: ["<mi>k</mi>", "k"],
      coefficient: ["<mi>a</mi>", "a"],
      intercept: ["<mi>b</mi>", "b"],
      power: ["<mi>p</mi>", "p"],
      fraction: ["<mi>f</mi>", "f"],
      percent: ["<mi>q</mi>", "q"],
      penetration: ["<mi>d</mi>", "d"],
      factor: ["<mi>g</mi>", "g"],
      step: ["<mi>j</mi>", "j"],
      maximum: ["<mi>M</mi>", "M"],
      width: ["<mi>s</mi>", "s"],
    };
    const wrap = (a) => [
      "<mrow><mo>(</mo>" + a[0] + "<mo>)</mo></mrow>",
      "(" + a[1] + ")",
    ];
    function primary() {
      let t = tokens[i++];
      if (t === "(") {
        let a = add();
        i++;
        return wrap(a);
      }
      if (/^\d|^\./.test(t)) return ["<mn>" + t + "</mn>", t];
      if (tokens[i] === "(") {
        i++;
        let args = [add()];
        while (tokens[i] === ",") {
          i++;
          args.push(add());
        }
        i++;
        return [
          '<mrow><mi mathvariant="normal">' +
            t +
            "</mi><mo>(</mo>" +
            args.map((a) => a[0]).join("<mo>,</mo>") +
            "<mo>)</mo></mrow>",
          "\\operatorname{" + t + "}(" + args.map((a) => a[1]).join(",") + ")",
        ];
      }
      return symbols[t] || ["<mi>" + t + "</mi>", t];
    }
    function unary() {
      if (tokens[i] === "-" || tokens[i] === "+") {
        let op = tokens[i++],
          a = unary();
        return ["<mrow><mo>" + op + "</mo>" + a[0] + "</mrow>", op + a[1]];
      }
      let a = primary();
      if (tokens[i] === "^") {
        i++;
        let b = unary();
        a = ["<msup>" + a[0] + b[0] + "</msup>", a[1] + "^{" + b[1] + "}"];
      }
      return a;
    }
    function mul() {
      let a = unary();
      while (["*", "/"].includes(tokens[i])) {
        let op = tokens[i++],
          b = unary();
        a =
          op === "/"
            ? [
                "<mfrac>" + a[0] + b[0] + "</mfrac>",
                "\\frac{" + a[1] + "}{" + b[1] + "}",
              ]
            : [
                "<mrow>" + a[0] + "<mo>·</mo>" + b[0] + "</mrow>",
                a[1] + "\\cdot " + b[1],
              ];
      }
      return a;
    }
    function add() {
      let a = mul();
      while (["+", "-"].includes(tokens[i])) {
        let op = tokens[i++],
          b = mul();
        a = [
          "<mrow>" +
            a[0] +
            "<mo>" +
            (op === "-" ? "−" : "+") +
            "</mo>" +
            b[0] +
            "</mrow>",
          a[1] + op + b[1],
        ];
      }
      return a;
    }
    let a = add();
    return math("<mrow><mi>B</mi><mo>=</mo>" + a[0] + "</mrow>", "B=" + a[1]);
  }
  const betEquations = {
    lookup: "base*L(c)",
    piecewise: "base*(y0+(y1-y0)*(c-c0)/(c1-c0))",
    percentile: "base*(1+(maximum-1)*F(c))",
    ev: "fraction*bankroll*max(0,E(tc)/variance)",
    flat: "base",
    rcDiscrete: "base * max(1, floor(rc))",
    rcContinuous: "base * max(1, rc)",
    tcDiscrete: "base * max(1, floor(tc))",
    tcContinuous: "base * max(1, tc)",
    linear: "base * (intercept + slope * (c - threshold))",
    polynomial: "base * (intercept + slope*x + coefficient*x^power)",
    exponential: "base * coefficient * exp(slope*x)",
    logarithmic: "base * (intercept + slope * log(1+x))",
    sigmoid:
      "base * (intercept + coefficient / (1 + exp(-slope*(c-threshold))))",
    power: "base * (intercept + coefficient*x^power)",
    kelly: "bankroll * max(0, edge / variance)",
    fractional: "fraction * bankroll * max(0, edge / variance)",
    advantage: "base * max(0,slope*edge)",
    bankroll: "bankroll*percent",
    countBankroll: "bankroll*percent*max(0,c-threshold)",
    penetration: "base * max(1,c) * max(0,1+slope*penetration)",
  };
  const opponentEquations = {
    flat: "base",
    count: "base * max(1,tc)",
    bankroll: "bankroll*percent",
    martingale: "base*factor^step",
    paroli: "base*factor^step",
    dalembert: "base*(step+1)",
  };
  const betDescriptions = {
    flat: "One base wager, multiplied by betting units.",
    rcDiscrete: "Base wager × max(1, floor(running count)).",
    rcContinuous: "Base wager × max(1, running count), before chip rounding.",
    tcDiscrete:
      "Base wager × max(1, floor(true count)). This preserves the original Hi-Lo spread.",
    tcContinuous: "Base wager × max(1, true count), before chip rounding.",
    lookup:
      "A step function: use the multiplier at the greatest count breakpoint not exceeding the current count. Endpoint values extend beyond the table.",
    piecewise:
      "Interpolate linearly between adjacent count/multiplier rows; hold endpoint values outside the range.",
    percentile:
      "A smoothed empirical count percentile based on earlier opening counts in the current shoe (up to 1,024). Each historical count contributes a logistic CDF with the configured smoothing width. Before any history, zero is the reference. The preview uses that zero reference.",
    linear:
      "Base × (intercept + slope × (count − threshold)). Slope is measured in base-wager units per count.",
    polynomial:
      "Base × (intercept + slope × x + coefficient × x^power), where x = max(0, count − threshold).",
    exponential:
      "Base × coefficient × exp(slope × x). The exponent is limited to ±50 for numerical stability.",
    logarithmic:
      "Base × (intercept + slope × log(1 + x)). The nonnegative x avoids an undefined logarithm.",
    sigmoid:
      "Base × (intercept + coefficient / (1 + exp(−slope × (count − threshold)))).",
    power:
      "Base × (intercept + coefficient × x^power). x is nonnegative, so fractional powers remain real.",
    custom:
      "An arithmetic expression returns dollars. Variables: c (selected count), rc, tc, base, bankroll, edge, variance, penetration (0–1), streak, step. Allowed functions: abs, sqrt, log, exp, floor, ceil, round, min, max, pow, clip. No JavaScript, property access, assignments, or network access.",
    kelly:
      "Full small-edge Kelly approximation, fraction = 1. This is not an exact optimizer of the full blackjack return distribution.",
    fractional:
      "Quarter, half, full, or custom fraction of the small-edge Kelly estimate. Lower fractions reduce exposure. W is the allocated current bankroll.",
    advantage:
      "Base × max(0, slope × estimated edge). The edge scale is dimensionless.",
    bankroll: "Allocated current bankroll × wager fraction.",
    countBankroll:
      "Allocated bankroll × wager fraction × max(0, count − threshold).",
    risk: "Kelly sizing capped by a diffusion approximation to ruin probability. The selected ceiling is a model parameter, not a guaranteed realized ruin bound.",
    penetration:
      "Base × max(1, selected count) × max(0, 1 + penetration coefficient × fraction of shoe dealt).",
    ev: "Interpolate expected return per unit from the EV lookup and apply the fractional Kelly approximation.",
  };
  const playDescriptions = {
    basic:
      "The existing multi-deck basic-strategy table, with S17/H17 double adjustments. It is a reference policy, not an exact solver for every deck count.",
    adjusted:
      "Adjust the reference table for double-after-split, late surrender, and no-peek exposure. Custom dealer thresholds use the same composition-aware EV estimates as EV mode.",
    deviations:
      "Editable Hi-Lo I18 playing indices, insurance, and Fab 4 late-surrender indices. The supplied indices are a conventional multi-deck baseline, not recalculated optimal indices for all rules. Surrender takes precedence when available.",
    mimic: "Hit below 17; stand on 17 or higher, including soft 17.",
    stand: "Stand on every non-natural hand.",
    hit: "Hit every hand below 21.",
    conservative:
      "Stand at 12 or higher; otherwise hit. Never deliberately double or split.",
    aggressive: "Hit below 19; double legal two-card totals 9–11.",
    random:
      "Choose uniformly from currently legal actions using the reproducible behavior RNG.",
    custom:
      "Use editable hard/soft/pair cells. Missing cells and illegal actions fall back to the reference basic strategy.",
    optimal:
      "Composition-dependent Monte Carlo policy improvement: evaluate legal actions with sampled unseen cards and rule-adjusted continuation, then choose the highest estimated EV. Includes hit, stand, double, split, and surrender when legal. It is not a globally exact dynamic-programming optimum; estimates have sampling error, and future wagers use an approximate available-funds budget. The actual hidden card and shoe order are never consulted.",
  };
  const opponentDescriptions = {
    existing:
      "Reuse the original seat strategy when the playing-skill setting is disabled. The separate existing betting option retains probabilistic hot/due streak raises.",
    basic: "Basic-strategy play without deliberate errors.",
    beginner: "20% eligible-decision error probability.",
    intermediate: "8% eligible-decision error probability.",
    expert: "Rule-adjusted basic strategy with 1% eligible-decision errors.",
    mixed: "Original fixed per-seat error probabilities: 4%, 2%, 12%, and 20%.",
    randomized:
      "Draw a beginner, intermediate, or expert error profile per session from the three skill weights.",
    conservative: "Stand on totals 12 and above.",
    aggressive: "Hit below 19 and double eligible totals 9–11.",
    counting:
      "Basic strategy with count deviations; count accuracy scales the count seen by the opponent.",
    custom: "Use the configured error probability and per-seat overrides.",
  };
  const oppBetDescriptions = {
    existing:
      "Use the shared bet model. After the configured streak length, original hot/due profiles raise their wager with probability 45%.",
    flat: "Use the opponent’s base wager.",
    count: "Base wager × max(1, true count × count accuracy).",
    bankroll: "Current bankroll × the selected fraction.",
    martingale:
      "After a loss, advance one step; after a win reset. Wager = base × factor^step.",
    paroli:
      "Advance on wins, reset on losses or after the chosen win count. Pushes leave the progression unchanged.",
    fibonacci:
      "Wager base × the Fibonacci sequence 1, 1, 2, 3, 5, …; advance on losses, retreat two steps on wins.",
    dalembert:
      "Wager base × (step + 1); add a step on losses and remove one on wins.",
    streak:
      "Increase by factor^(streak length − trigger + 1) for selected winning/losing streaks, capped by the maximum progression step.",
    custom:
      "Evaluate the restricted arithmetic expression in dollars, with count, bankroll, streak, and progression variables. Each seat can override it.",
  };
  Object.assign(betDescriptions, {
    flat: "Use one base wager, including the betting-unit multiplier.",
    rcDiscrete:
      "Multiply the base wager by the floored running count, with at least one unit.",
    rcContinuous:
      "Use the running count continuously, with at least one unit, before chip rounding.",
    tcDiscrete:
      "Use the floored true count, with at least one unit. This preserves the original Hi-Lo spread.",
    tcContinuous:
      "Use the true count continuously, with at least one unit, before chip rounding.",
    linear:
      "A straight-line response around the count threshold. The slope is in base-wager units per count.",
    polynomial:
      "Combine an intercept, a linear term, and a powered nonnegative count excess.",
    exponential:
      "Grow exponentially above the threshold. The exponent is clipped to ±50 for numerical stability.",
    logarithmic:
      "Grow logarithmically above the threshold. Nonnegative count excess keeps the logarithm defined.",
    sigmoid: "A bounded logistic response centered on the threshold.",
    power:
      "Raise nonnegative count excess to the configured exponent; fractional powers remain real.",
    advantage: "Scale the base wager in proportion to positive estimated edge.",
    bankroll: "Wager a fixed fraction of allocated current bankroll.",
    countBankroll:
      "Scale a fraction of allocated bankroll by positive count excess.",
    penetration:
      "Scale the count-based wager by a linear function of the fraction of shoe dealt.",
  });
  Object.assign(oppBetDescriptions, {
    flat: "Use the opponent’s base wager.",
    count:
      "Raise the base wager with the accuracy-adjusted true count, using at least one unit.",
    bankroll: "Wager the selected fraction of current bankroll.",
    martingale:
      "Advance one step after a loss; reset after a win. The progression factor compounds at each step.",
    dalembert:
      "Add one base-wager unit after a loss; remove one after a win, with at least one unit.",
  });
  const helpText = {
    bet: "Controls each opening wager. All models pass through the same table, spread, bankroll, and chip constraints. A zero or negative model wager is raised to the table minimum; it does not implement back-counting or sitting out unfavorable counts. Base includes the betting-unit multiplier. RC is the exposed-card running count; TC divides RC by physically remaining decks. All displayed curves use the actual wager function and constraints.",
    play: "Controls decisions after cards are dealt. Pair cells are considered before hard/soft cells. A double requires two cards and available funds; a split requires equal card values, available funds, and room below the hand limit. Split aces receive one card each. Legal-action fallbacks preserve accounting. Natural blackjacks are settled automatically. EV is expected net profit per initial wager; Pi is an outcome probability and Xi is the net return in wager units.",
    dealer:
      "S17 stands on all totals 17 and above. H17 hits soft 17 and stands on hard 17. Custom rules use separate hard and soft stand thresholds. American peek checks for blackjack before player decisions; no-peek and European rules expose all split/double wagers to dealer blackjack. European rules draw the second dealer card after player play. Late surrender returns half a wager only if the dealer does not have blackjack. Blackjack always takes priority over surrendered hands.",
    payout:
      "Only an unsplit two-card 21 receives the natural payout. 3:2 pays $15 profit on $10; 6:5 pays $12; 1:1 pays $10; 2:1 pays $20. Custom numerator n and denominator d define n/d profit per dollar. Ordinary wins pay 1:1, pushes return the stake, and losses return nothing. Payouts are rounded to integer cents. Dealer and player naturals push.",
    limits:
      "Fixed multiplier caps the opening wager at base × maximum. No multiplier limit and Table maximum still respect the table maximum and enforced bankroll. Bankroll-based maximum adds a fraction-of-current-bankroll cap. Dynamic maximum grows with positive true count, up to the maximum multiplier. Custom spread adds a base-wager minimum. Limits apply to opening wagers; legal doubles and splits add wagers separately. The chip denomination and increment combine as their least common multiple in cents. Rounding is followed by clipping to valid chips within the limits. If no valid wager meets the minimum, the seat sits out. Enforced funds cannot go negative. With enforcement off, the model may use credit and balances may be negative; bankroll-aware bets use nonnegative available capital.",
    analytics:
      "Counting is independent of display and never reveals the dealer’s hidden card. Hi-Lo adds +1 for 2–6, 0 for 7–9, and −1 for tens and aces. Hidden suppresses count displays/effects; running, true, and both select numeric labels. Effects adds per-card deltas; history adds a rolling 500-exposure plot; probability adds composition and estimated-edge details; full combines them with wager and decision annotations. Display rounding does not change strategy rounding. A and T denote unseen aces and ten-valued cards; N is the unseen population. The natural probability is exact for the next two draws without replacement from that population; a Hi-Lo count alone cannot determine the full composition. Advantage uses the configured approximation, not an exact game EV.",
    opponents:
      "Playing skill and betting behavior are independent. Global defaults apply to opponents, and per-seat overrides take precedence. Disabling independent opponents makes all seats use your strategy and bet model. Error probabilities apply to decisions on totals 9–19. Streaks and progressions use the net round result across split hands and insurance; a push leaves both unchanged. New sessions reset progressions. A shoe exhaustion refunds the unfinished round. Risk tolerance multiplies the desired wager before shared limits. Progressions alter exposure; they do not alter card probabilities.",
  };
  function help(key, title) {
    if (key === 'penetration') {
      $('penDialog').showModal();
      return;
    }
    if (["shoe", "run"].includes(key)) {
      $("settingsHelpTitle").textContent = title;
      $("settingsHelpBody").replaceChildren(
        el(
          "p",
          {},
          key === "shoe"
            ? "Deck count sets the finite shoe size. Penetration controls when to reshuffle after a completed round. The table minimum and base wager feed all betting models. Fixed, simulated, and Gaussian penetration are explained in the penetration information panel."
            : "Sessions are independent bankroll resets; rounds set the target per session. A numeric seed reproduces deals and decisions for identical settings. Animated shows each action; Periodic shows round outcomes at the selected interval; Final only shows the completed run. Playback speed changes animation timing, not the random sequence.",
        ),
      );
      $("settingsHelp").showModal();
      return;
    }
    let section = key.split(".")[0];
    if (!sections[section]) section = "bet";
    let body = $("settingsHelpBody");
    body.replaceChildren(el("p", {}, helpText[section]));
    if (key.includes(".")) {
      const p = el(
        "p",
        { class: "help-context" },
        title + ": " + parameterHelp(key),
      );
      body.prepend(p);
    }
    if (section === "bet") {
      body.insertAdjacentHTML(
        "beforeend",
        formulas.count +
          formulas.linear +
          formulas.kelly +
          formulas.risk +
          formulas.ev,
      );
      body.append(
        el(
          "p",
          {},
          "B is the wager in dollars; B₀ is the base wager; c is count, c₀ the threshold, k the dollar slope; clip enforces lower and upper limits. f is the Kelly fraction; W is allocated bankroll; μ is estimated net return per wager unit; σ² is its variance; r is the approximate ruin ceiling. In the model-specific equations, B₀ includes betting units; k is the slope in base-wager units, b is the intercept, a the coefficient, p the exponent, x the nonnegative count excess above c₀, q the bankroll fraction, and d the shoe fraction dealt. L is the step lookup; E is interpolated expected return; c₀/c₁ and y₀/y₁ are adjacent lookup counts and multipliers; F is the smoothed empirical count percentile; M is the maximum multiplier. In the general continuous-linear equation above, k is instead measured in dollars per count. Opponent formulas use g for the progression factor and j for its step. Edge defaults to −0.005 + 0.005 × TC, an editable approximation.",
        ),
      );
      addOptions(body, R.BETS, betDescriptions);
    }
    if (section === "play") {
      body.insertAdjacentHTML("beforeend", formulas.ev);
      addOptions(body, R.PLAYS, playDescriptions);
      let a = el(
        "a",
        {
          href: "https://wizardofodds.com/games/blackjack/card-counting/high-low/",
          target: "_blank",
          rel: "noopener",
        },
        "Published I18 / Fab 4 baseline and rule assumptions",
      );
      body.append(a);
    }
    if (section === "dealer")
      addOptions(
        body,
        enumOf(["S17", "S17"], ["H17", "H17"], ["custom", "Custom thresholds"]),
        {
          S17: "Stand at soft 17.",
          H17: "Hit soft 17.",
          custom:
            "Use separate hard/soft thresholds; this also changes the rule-adjusted policy evaluation.",
        },
      );
    if (section === "payout")
      body.insertAdjacentHTML("beforeend", formulas.payout);
    if (section === "limits")
      body.insertAdjacentHTML("beforeend", formulas.linear);
    if (section === "analytics")
      body.insertAdjacentHTML(
        "beforeend",
        formulas.count + formulas.probability + formulas.ev,
      );
    if (section === "opponents") {
      addOptions(body, R.SKILLS, opponentDescriptions);
      addOptions(body, R.OPPBETS, oppBetDescriptions);
      body.insertAdjacentHTML("beforeend", formulas.count + formulas.ev);
    }
    $("settingsHelpTitle").textContent = title;
    $("settingsHelp").showModal();
  }
  function addOptions(body, options, descriptions) {
    let dl = el("dl");
    for (const [k, name] of Object.entries(options)) {
      let dd = el("dd", {}, descriptions[k] || name);
      let formula =
        options === R.BETS
          ? betEquations[k]
          : options === R.OPPBETS
            ? opponentEquations[k]
            : null;
      if (formula) dd.insertAdjacentHTML("beforeend", typeset(formula));
      dl.append(el("dt", {}, name), dd);
    }
    body.append(dl);
  }
  function parameterHelp(key) {
    const hints = {
      "bet.expression": betDescriptions.custom,
      "bet.edgeExpression":
        "Returns an estimated edge between −1 and 1; available variables are tc and c. Domain errors stop the run with an explanatory message.",
      "bet.tcRound":
        "None preserves fractional counts. Floor rounds toward negative infinity; truncate toward zero; nearest rounds ties toward positive infinity. Discrete count modes additionally floor the result.",
      "bet.lookup":
        "Counts must increase strictly. Values are nonnegative multipliers of base × betting units.",
      "bet.evLookup":
        "Counts must increase strictly. Values are expected net returns per wager unit, not percentages (0.01 means 1%).",
      "bet.variance":
        "Variance of unit net returns; must be positive. Default 1.3 is a model assumption, not recalculated from every rule combination.",
      "play.evSamples":
        "More samples reduce Monte Carlo noise but slow simulation. Sampling is reproducible and does not consume the game’s deal RNG.",
      "opponents.accuracy":
        "A value of 1 uses the observed count; 0 ignores it; intermediate values attenuate it deterministically.",
      "opponents.distribution":
        "Nonnegative beginner/intermediate/expert weights are normalized before the per-session draw.",
      "limits.insufficient":
        "Reduce-to-available can make a smaller valid opening wager. Sit-out requires enough chips for the rounded requested wager. Neither allows sub-minimum bets.",
      "limits.terminate":
        "Each session ends on its round target or the selected bankroll condition. If all seats sit out, the session ends even if nominal balances exceed the minimum.",
      "analytics.precision":
        "Number of decimals in displayed true counts, from 0 to 6. It does not alter internal counting.",
      "play.table":
        "Use the hard, soft, and pair tabs. Each cell is independently editable. Changing a cell switches to Custom Strategy Table.",
      "opponents.seats":
        "Leave a value blank to inherit. Playing strategy, betting behavior, error probability, count accuracy, capital, wager limits, and expressions can differ by seat.",
    };
    return (
      hints[key] ||
      "This control is used by the selected model; values are validated before Apply. The category reference below describes all options, units, and assumptions."
    );
  }
  function preview() {
    try {
      drawPreview();
    } catch (error) {
      $("advancedPreview").replaceChildren(
        el("p", { class: "note" }, "Preview unavailable: " + error.message),
      );
      $("advancedError").textContent = error.message;
      $("advancedApply").disabled = true;
    }
  }
  function drawPreview() {
    const box = $("advancedPreview");
    box.replaceChildren();
    if (!draftSettings) return;
    try {
      R.validate(draftSettings.rules);
    } catch (e) {
      box.append(
        el(
          "p",
          { class: "note" },
          "Fix validation errors to update the preview.",
        ),
      );
      return;
    }
    if (active === "bet" || active === "limits") {
      box.append(heading("h4", "Live wager preview", "bet"));
      let controls = el("div", { class: "settings-inline" }),
        label = el("label", {}, "Preview axis "),
        axis = el("select", { "aria-label": "Preview axis" });
      for (const [v, t] of [
        ["count", "Count"],
        ["bankroll", "Bankroll"],
        ["edge", "Estimated advantage"],
      ])
        axis.append(el("option", { value: v }, t));
      axis.value = previewAxis;
      axis.onchange = () => {
        previewAxis = axis.value;
        preview();
      };
      label.append(axis);
      let slider = el("input", {
        type: "range",
        min: -10,
        max: 10,
        step: 0.25,
        id: "previewCount",
        "aria-label": "Preview running and true count",
      });
      slider.value = previewCount;
      slider.onchange = () => {
        previewCount = Number(slider.value);
        preview();
      };
      controls.append(
        label,
        el("span", {}, "Count " + previewCount.toFixed(2)),
        slider,
      );
      box.append(controls);
      if (get("bet.mode") === "custom")
        box.insertAdjacentHTML("beforeend", typeset(get("bet.expression")));
      else if (betEquations[get("bet.mode")])
        box.insertAdjacentHTML(
          "beforeend",
          typeset(betEquations[get("bet.mode")]),
        );
      let rows = [];
      for (let i = 0; i <= 20; i++) {
        let x =
          previewAxis === "count"
            ? -10 + i
            : previewAxis === "bankroll"
              ? (Number(draftSettings.fields.starting) * i) / 10
              : -0.05 + i * 0.005;
        let r = copy(draftSettings.rules),
          ctx = {
            base: Number(draftSettings.fields.baseBet),
            min: Number(draftSettings.fields.minBet),
            bankroll:
              previewAxis === "bankroll"
                ? x
                : Number(draftSettings.fields.starting),
            tc: previewAxis === "count" ? x : previewCount,
            rc: previewAxis === "count" ? x : previewCount,
            penetration: 0.5,
            finite: draftSettings.fields.finite,
          };
        if (previewAxis === "edge") {
          r.bet.edgeModel = "linear";
          r.bet.edgeBase = x;
          r.bet.edgeSlope = 0;
        }
        let requested = R.rawBet(r, ctx),
          wager = R.constrain(r, requested, ctx) / 100;
        rows.push({ x, requested, wager });
      }
      let max = Math.max(1, ...rows.map((r) => r.wager)),
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 600 180");
      svg.setAttribute("role", "img");
      svg.setAttribute(
        "aria-label",
        "Wager curve after all limits and chip rounding",
      );
      let path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute(
        "d",
        rows
          .map(
            (r, i) =>
              `${i ? "L" : "M"}${20 + i * 28},${155 - (130 * r.wager) / max}`,
          )
          .join(" "),
      );
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "3");
      svg.append(path);
      box.append(
        svg,
        el(
          "p",
          { class: "note" },
          `Wager range $0–$${max.toFixed(2)}. Curve includes all limits. Count preview sets RC and TC to the same illustrative value; penetration is 50%.`,
        ),
      );
      let table = el("table", { class: "settings-table" }),
        head = el("tr");
      for (const v of [previewAxis, "Requested ($)", "Actual wager ($)"])
        head.append(el("th", {}, v));
      table.append(head);
      rows
        .filter((_, i) => i % 4 === 0)
        .forEach((r) => {
          let row = el("tr");
          for (const v of [r.x, r.requested, r.wager])
            row.append(el("td", {}, v.toFixed(2)));
          table.append(row);
        });
      box.append(table);
    } else if (active === "payout") {
      let wager = Number(draftSettings.fields.baseBet),
        ratio = get("payout.numerator") / get("payout.denominator");
      box.append(
        heading("h4", "Example payout", "payout"),
        el(
          "p",
          {},
          `On a $${wager} wager: natural profit $${(Math.round(wager * 100 * ratio) / 100).toFixed(2)}, ordinary win profit $${wager}, push profit $0.`,
        ),
      );
      box.insertAdjacentHTML("beforeend", formulas.payout);
    } else if (active === "analytics") {
      box.append(heading("h4", "Count and probability model", "analytics"));
      box.insertAdjacentHTML(
        "beforeend",
        formulas.count + formulas.probability,
      );
      box.append(
        el(
          "p",
          { class: "note" },
          "For example, RC +6 with 3 decks remaining gives TC +2. Display settings never change the internal count.",
        ),
      );
    } else if (active === "play") {
      box.append(
        el("p", { class: "note" }, playDescriptions[get("play.mode")]),
      );
    }
  }
  let previewAxis = "count",
    previewCount = 0;
  function download(value, name) {
    let url = URL.createObjectURL(
        new Blob([JSON.stringify(value, null, 2)], {
          type: "application/json",
        }),
      ),
      a = el("a", { href: url, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function renderAnalytics(snapshot, simulation) {
    const r = simulation?.rules || current,
      a = r.analytics,
      mode = a.mode,
      count = snapshot?.count || 0,
      remaining = snapshot?.remaining || Number($("decks").value) * 52,
      tc = remaining ? (count * 52) / remaining : 0,
      shown = R.roundCount(tc, a.round).toFixed(a.precision),
      rcVisible = !["hidden", "true"].includes(mode),
      tcVisible = !["hidden", "running"].includes(mode);
    $("tableCount").textContent =
      mode === "hidden"
        ? "Count hidden"
        : mode === "true"
          ? "TC " + shown
          : mode === "running"
            ? "RC " + signed(count)
            : "RC " + signed(count) + " · TC " + shown;
    $("countFooter").textContent = rcVisible ? signed(count) : "Off";
    $("trueCount").textContent = tcVisible ? shown : "Off";
    let box = $("analyticsOverlay");
    if (!box) {
      box = el("div", { id: "analyticsOverlay" });
      document.querySelector(".table-footer").after(box);
    }
    box.hidden = !["history", "probability", "full"].includes(mode);
    box.replaceChildren();
    if (box.hidden) return;
    box.append(
      heading("h4", "Count analytics", "analytics"),
      el(
        "div",
        {},
        `Remaining decks: ${(remaining / 52).toFixed(2)} · Shoe dealt: ${(100 * (1 - remaining / ((simulation?.config.decks || Number($("decks").value)) * 52))).toFixed(1)}% · Estimated edge: ${(R.advantage(r, tc) * 100).toFixed(2)}%`,
      ),
    );
    if (["history", "full"].includes(mode)) {
      const history = snapshot?.history || [],
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 600 80");
      svg.setAttribute("role", "img");
      svg.setAttribute(
        "aria-label",
        "Running-count history, last 500 exposed cards",
      );
      let max = Math.max(1, ...history.map(Math.abs)),
        path = document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute(
        "d",
        history
          .map(
            (v, i) =>
              `${i ? "L" : "M"}${(i * 600) / Math.max(1, history.length - 1)},${40 - (35 * v) / max}`,
          )
          .join(" "),
      );
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke-width", 2);
      svg.append(path);
      box.append(svg);
    }
    if (["probability", "full"].includes(mode) && snapshot?.unseen?.length) {
      let counts = snapshot.unseen,
        n = counts.reduce((a, b) => a + b, 0);
      box.append(
        el(
          "div",
          {},
          `Unseen composition: ${n} cards · P(ten) ${n ? ((100 * counts[9]) / n).toFixed(2) : "0"}% · P(ace) ${n ? ((100 * counts[0]) / n).toFixed(2) : "0"}% · P(two-card natural) ${n > 1 ? ((200 * counts[0] * counts[9]) / (n * (n - 1))).toFixed(2) : "0"}%`,
        ),
      );
    }
    if (mode === "full")
      for (const p of snapshot?.players || [])
        box.append(
          el(
            "div",
            {},
            `Seat ${p.seat + 1}: ${p.betNote || "No wager yet"}${p.decision ? " · " + p.decision : ""}`,
          ),
        );
  }
  schema.analytics.push(
    ...schema.bet.filter((row) =>
      [
        "bet.edgeModel",
        "bet.edgeBase",
        "bet.edgeSlope",
        "bet.edgeExpression",
        "bet.variance",
      ].includes(row[0]),
    ),
  );
  function init() {
    const sweepGroup = el('optgroup', { label: 'Sweep examples · exploratory' });
    for (const preset of BJSweepPresets.presets) sweepGroup.append(el('option', { value: 'sweep:' + preset.id }, preset.name));
    $('advancedPreset').append(sweepGroup);
    for (const [key, name] of Object.entries(sections)) {
      let b = el("button", { type: "button", "data-section": key }, name);
      b.onclick = () => {
        active = key;
        $("advancedSearch").value = "";
        renderSection();
      };
      $("advancedNav").append(b);
    }
    $("advancedOpen").onclick = open;
    $("advancedCancel").onclick = () => $("advancedDialog").close();
    $("advancedApply").onclick = async () => {
      if (!validateDraft()) return;
      const apply = $('advancedApply'); apply.disabled = true;
      try {
        if (scope?.onApply) { if (await scope.onApply(copy(draftSettings), copy(draftExtras)) === false) return; }
        else {
          if (openingSettings !== JSON.stringify(draftSettings) && window.BJWorkspace?.beforeAdvancedApply && !await window.BJWorkspace.beforeAdvancedApply()) return;
          applyEnvelope(draftSettings);
        }
        $('advancedDialog').close();
      } catch (error) { $('advancedError').textContent = error.message; }
      finally { if ($('advancedDialog').open) apply.disabled = false; }
    };
    $("advancedResetSection").onclick = () => {
      draftSettings.rules[active] = R.defaults()[active];
      if (active === "bet") draftSettings.fields.baseBet = 25;
      if (active === "limits")
        Object.assign(draftSettings.fields, {
          baseBet: 25,
          minBet: 10,
          starting: 10000,
          finite: true,
        });
      renderSection();
    };
    $("advancedResetAll").onclick = () => {
      draftSettings.rules = R.defaults();
      Object.assign(draftSettings.fields, {
        baseBet: 25,
        minBet: 10,
        starting: 10000,
        finite: true,
      });
      renderSection();
    };
    $("advancedSearch").oninput = renderSection;
    $("settingsHelpClose").onclick = () => $("settingsHelp").close();
    $("advancedExport").onclick = () => {
      if (validateDraft()) download(draftSettings, "blackjack-settings.json");
    };
    $("advancedImport").onchange = async (e) => {
      try {
        let f = e.target.files[0];
        if (!f) return;
        if (f.size > 200000)
          throw Error("Settings file must be smaller than 200 KB.");
        draftSettings = validateEnvelope(JSON.parse(await f.text()));
        renderSection();
      } catch (error) {
        $("advancedError").textContent = error.message;
      }
      e.target.value = "";
    };
    $("advancedSave").onclick = () => {
      if (!validateDraft()) return;
      try {
        localStorage.setItem(
          "blackjack.preset.v2." + (window.BJWorkspace?.active || "simulator"),
          JSON.stringify(draftSettings),
        );
        $("advancedNotice").textContent = "Saved this preset on this device.";
      } catch {
        $("advancedError").textContent =
          "Browser storage is unavailable; export a settings file instead.";
      }
    };
    $("advancedPreset").onchange = (e) => {
      let type = e.target.value;
      if (!type) return;
      if (type === "saved") {
        try {
          let saved = localStorage.getItem("blackjack.preset.v2." + (window.BJWorkspace?.active || "simulator")) || ((window.BJWorkspace?.active || "simulator") === "simulator" ? localStorage.getItem("blackjack.preset.v2") : null);
          if (!saved) throw Error("No saved preset on this device.");
          draftSettings = validateEnvelope(JSON.parse(saved));
        } catch (error) {
          $("advancedError").textContent = error.message;
          e.target.value = "";
          return;
        }
      } else if (type.startsWith('sweep:')) {
        const preset = BJSweepPresets.presets.find(p => 'sweep:' + p.id === type);
        draftSettings = validateEnvelope(BJSweepPresets.apply(draftSettings, preset.id));
        $('advancedNotice').textContent = BJSweepPresets.description(preset);
      } else {
        draftSettings.rules = R.defaults();
        if (type === "counter") {
          draftSettings.rules.play.mode = "deviations";
          draftSettings.rules.bet.mode = "tcDiscrete";
          draftSettings.rules.analytics.mode = "full";
        }
        if (type === "kelly") {
          draftSettings.rules.bet.mode = "fractional";
          draftSettings.rules.limits.mode = "bankroll";
        }
        if (type === "mixed") {
          draftSettings.rules.opponents.seats = {
            0: { play: "conservative", bet: "flat" },
            1: { play: "deviations", bet: "count" },
            3: { play: "aggressive", bet: "paroli" },
            4: { play: "basic", bet: "martingale", error: 0.2 },
          };
        }
      }
      e.target.value = "";
      renderSection();
    };
    for (const [id, [a, b]] of Object.entries(standard))
      $(id).addEventListener("input", () => {
        let input = $(id);
        current[a][b] =
          id === "showCount"
            ? input.checked
              ? "effects"
              : "hidden"
            : id === "humanOpponents"
              ? input.checked
              : id === "spread"
                ? Number(input.value)
                : input.value;
        syncStandard();
        persist();
      });
    $("pay").addEventListener("input", () => {
      current.payout = {
        numerator: Number($("pay").value) * 10,
        denominator: 10,
      };
      syncStandard();
      persist();
    });
    for (const id of rootIds) $(id).addEventListener("input", persist);
    for (const [id, key] of [
      ["strategy", "play"],
      ["dealerRule", "dealer"],
      ["pay", "payout"],
      ["betMode", "bet"],
      ["spread", "limits"],
    ]) {
      let label = document.querySelector(`label[for="${id}"]`);
      let wrap = el("div", { class: "field-label" });
      label.before(wrap);
      wrap.append(label, info(key, label.textContent.trim()));
    }
    for (const [id, key] of [
      ["showCount", "analytics"],
      ["humanOpponents", "opponents"],
    ]) {
      let label = $(id).closest("label"),
        wrap = el("div", { class: "toggle-info-row" });
      label.before(wrap);
      wrap.append(label, info(key, sections[key]));
    }
    $("rulesHeadingInfo").append(info("bet", "Rules & strategy"));
    $("advancedTitle").append(info("bet", "Advanced rules & strategy"));
    for (const h of document.querySelectorAll(".sidebar .group-title"))
      if (h.id !== "rulesHeadingInfo")
        h.append(
          info(
            h.textContent.includes("Players")
              ? "limits"
              : h.textContent.includes("Run")
                ? "run"
                : "shoe",
            h.textContent.trim(),
          ),
        );
    try {
      let stored =
        localStorage.getItem("blackjack.settings.v2") ||
        localStorage.getItem("blackjack.settings");
      if (stored) applyEnvelope(JSON.parse(stored));
      else syncStandard();
    } catch (error) {
      $("error").textContent =
        "Saved settings were not loaded: " + error.message;
      syncStandard();
    }
  }
  init();
  return {
    math,
    typeset,
    get: () => copy(current),
    open,
    help,
    validateEnvelope,
    capture,
    applyEnvelope,
    persist,
    renderAnalytics,
  };
})();
window.RuleSettings = RuleSettings;
RuleSettings.renderAnalytics(null, null);
