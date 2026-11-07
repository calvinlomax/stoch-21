# Blackjack Lab

A static, finite-shoe blackjack simulator. Open `index.html` directly, or serve this directory with `python3 -m http.server 8765`.

The compact **Rules & strategy** controls and the seven-section **Advanced** dialog share one configuration. Advanced edits are drafts until **Apply**; **Cancel** and Escape discard them. Changes affect the next run. Animation speed remains adjustable during a run.

Advanced settings include count and mathematical wager functions, bankroll-aware sizing, editable count/EV lookups and hard/soft/pair strategy matrices, count deviations, dealer/hole-card rules, payouts, shared chip and wager constraints, count analytics, and independent opponent playing and betting profiles. Live wager previews use the same functions and constraints as the engine. Help uses native MathML with LaTeX annotations, without a network dependency.

Settings persist in browser storage when available. Built-in presets, a saved preset, and JSON import/export are available in Advanced. JSON export includes run, shoe, seat, and strategy settings. CSV results include the complete advanced configuration and separate insurance accounting. Legacy `betMode: "count"` migrates to `tcDiscrete`, preserving the original floored Hi-Lo spread.

## Model definitions and limits

- Currency is accounted in integer cents. Opening wagers obey table limits, spread constraints, optional bankroll caps, and the common chip/increment grid. A model wager below the table minimum is raised to the minimum; this does not implement back-counting. Split and double stakes are additional exposures.
- Kelly and risk-constrained sizing use small-edge/diffusion approximations with configurable edge and variance. They do not guarantee a risk-of-ruin bound. The default edge is a linear Hi-Lo approximation, not an exact recalculation for each rule combination.
- **EV-optimal** chooses the highest *estimated* value among legal actions using reproducible, finite-composition Monte Carlo rollouts and rule-adjusted continuation. It is not an exact global optimal-policy solver. Future split/double funds in those rollouts use an approximate budget. More samples reduce noise and increase runtime. The real engine always enforces actual funds and legal actions.
- The standard basic table is a multi-deck reference. Rule-adjusted play handles DAS, surrender, no-peek exposure, and custom dealer thresholds; it is not an exact optimal table for every possible deck/rule combination. The editable I18/Fab 4 baseline is not automatically optimized for alternate rules. See the [published baseline](https://wizardofodds.com/games/blackjack/card-counting/high-low/) and [count/rule definitions](https://www.blackjackincolor.com/blackjackfaq.htm).
- Count percentile uses a smoothed empirical CDF of earlier opening counts in the current shoe (up to 1,024). The preview uses a zero-count reference rather than a future simulated count distribution.
- Count accuracy attenuates the observed count deterministically. Opponent error/streak profiles are illustrative behavioral models. Progressions reset between sessions, not between shoes; pushes leave them unchanged.
- Displayed probabilities use exposed-card composition. The dealer’s actual hidden card and future shoe order are unavailable to decision models. Displaying or hiding counts does not change the random sequence or simulation results.
- Runtime expression errors abort and refund the unfinished round. A shoe exhausted mid-round is also refunded and replaced. These refunded rounds do not enter outcome totals.

## Code layout

- `rules.js`: versioned configuration, migration, validation, safe expression parser, wager models, constraints, and opponent progression logic.
- `engine.js`: standalone simulation engine, legal decisions, accounting, and composition-aware EV rollouts; usable from Node without a DOM.
- `settings.js`: shared Standard/Advanced state, transactional dialog, previews, help, analytics, and persistence.
- `script.js`: existing artwork, table rendering, playback, summaries, charts, and CSV export.

## Tests

Install development dependencies with `npm ci`.

- `npm test`: deterministic strategy, accounting, validation, migration, hidden-information, and integration tests.
- `npm run test:ui`: Chrome/Playwright tests for Apply/Cancel, persistence, validation, tables, per-seat overrides, import/export, analytics, mobile layout, math help, and playback. Requires Google Chrome and a local port 8765.
- `npm run test:all`: both suites.

The app has no runtime package dependencies and no build step. Tests use the locally installed Chrome; Playwright does not need to download a browser.

## Local machine learning experiments

The entire root `ML/` directory is local-only and excluded by `.gitignore`, including its source code, `Engineering.md`, shell scripts, Python environment, datasets, checkpoints, logs, and reports. Previously tracked files in that directory have been removed from Git tracking; local copies are retained. A fresh clone does not include the ML pipeline. The simulator runs independently of it, and no learned models are integrated into the app.

When the local `ML/` directory is present, the Counter-only rerun is launched with:

```sh
bash ML/rerun_counter.sh --plan  # Validate and preview without running experiments.
bash ML/rerun_counter.sh         # Run, or resume the same experiment.
```

The rerun isolates reference/learned playing and betting decisions in a four-way component test, compares legacy Huber, scale-adjusted Huber, and squared-error betting losses on identical reference-policy data, then trains a stronger strategy anchor and compares three preservation strengths. It extends the selected small trial to 100,000 updates and at least five million self-play rounds before independent validation, four-way final testing, and paired interventions. Fresh seed namespaces separate these stages from the earlier experiment. This workflow trains only Counter models.

Configuration is in `ML/configs/counter_rerun.yaml`. Defaults write to `ML/runs/counter_rerun_v2/`, with live console/file progress, losses, gradient norms, strategy/deviation agreement, returns, checkpoints, and ETA. `pipeline.log`, CSV/JSON metrics, TensorBoard events, and PNG/PDF plots stay inside that ignored run directory. Ctrl+C requests a checkpoint at a safe boundary; repeating the command resumes. Use a new `--run NAME` if the code or configuration changes. The prepared rerun has not been executed; completing it does not itself establish that the Counter's research acceptance targets pass.
