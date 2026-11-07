Blackjack strategy has two main pieces: how you play a hand and how much you wager on it. The table rules, bankroll, count, and other players provide the conditions in which those choices play out. The app offers **11 named playing strategies and 23 named betting strategies**, or **253 named play-and-bet pairings** before changing any settings. That is a count of menu pairings, not necessarily 253 meaningfully different behaviors: limits and settings can make different pairings act alike. Once you include adjustable parameters, custom tables, decision rules, wager functions, and opponent profiles, there is no single useful fixed total for the possible configurations. Laboratory lets you compare these choices across sampled conditions rather than judging them from one lucky or unlucky session.

**Key:** Regular = Laboratory’s **Strategy & table settings** dialog; Advanced = **All rules & strategy**; Both = available in both. Some advanced fields appear only for the selected strategy or policy.

### Shoe and table

- Decks — **Regular**
- Penetration percentage — **Regular**
- Dealer soft 17: stand, hit, or custom thresholds — **Both**
- Dealer hard-total stand threshold — **Advanced**
- Dealer soft-total stand threshold — **Advanced**
- Hole-card / blackjack rule: American peek, no peek, or European no-hole-card — **Advanced**
- Double after split — **Advanced**
- Maximum hands per player — **Advanced**
- Late surrender — **Advanced**
- Blackjack payout: 3:2, 6:5, 1:1, or 2:1 — **Both**
- Custom blackjack payout numerator and denominator — **Advanced**

### Bankroll and wager limits

- Starting bankroll — **Both**
- Base wager — **Both**
- Table minimum — **Both**
- Table maximum — **Both**
- Enforce bankroll limits — **Both**
- Maximum-wager policy: fixed multiplier, no multiplier limit, bankroll-based maximum, table maximum, dynamic count-dependent multiplier, or custom spread — **Advanced**
- Maximum bet multiplier — **Advanced**
- Minimum bet multiplier — **Advanced**
- Multiplier increase per true count — **Advanced**
- Maximum fraction of bankroll — **Advanced**
- Chip denomination — **Advanced**
- Wager increment — **Advanced**
- Wager rounding: down, nearest, or up — **Advanced**
- Insufficient-bankroll behavior: reduce wager or sit out — **Advanced**
- Session termination: all players below minimum, your seat below minimum, any player below minimum, or combined stop-loss — **Advanced**
- Stop-loss fraction — **Advanced**

### Playing strategy

- Playing strategy — **Both**:
  - Basic strategy: standard or rule-adjusted
  - Basic strategy plus deviations
  - Dealer mimic
  - Always stand
  - Always hit
  - Conservative
  - Aggressive
  - Random
  - Custom strategy table
  - EV-optimal
- Insurance true-count index — **Advanced**
- EV rollout samples per action — **Advanced**
- Editable hard, soft, and pair strategy matrices — **Advanced**
- Editable count deviations: hand type, total or pair, dealer upcard, true-count threshold, and action above or below the threshold — **Advanced**

### Bet sizing

- Bet-sizing strategy — **Both**:
  - Flat wager
  - Discrete or continuous running count
  - Discrete or continuous true count
  - Custom count lookup
  - Piecewise linear count
  - Count percentile
  - Linear, polynomial, exponential, logarithmic, sigmoid, or power law
  - Custom function
  - Full Kelly or fractional Kelly
  - Advantage proportional
  - Fixed bankroll percentage
  - Count × bankroll
  - Risk-constrained optimal
  - Penetration-aware
  - EV lookup
- Count input: running or true count — **Advanced**
- True-count rounding — **Advanced**
- Betting units — **Advanced**
- Count threshold — **Advanced**
- Slope / edge scale — **Advanced**
- Intercept — **Advanced**
- Coefficient / amplitude — **Advanced**
- Exponent — **Advanced**
- Percentile smoothing width — **Advanced**
- Custom wager expression — **Advanced**
- Kelly fraction, including quarter, half, and full shortcuts — **Advanced**
- Allocated bankroll fraction — **Advanced**
- Bankroll fraction per wager — **Advanced**
- Approximate ruin-probability ceiling — **Advanced**
- Penetration coefficient — **Advanced**
- Advantage estimator: linear approximation, EV lookup, or custom expression — **Advanced**
- Edge at true count zero — **Advanced**
- Edge increase per true-count unit — **Advanced**
- Custom advantage expression — **Advanced**
- Return variance — **Advanced**
- Count-to-wager lookup / breakpoints — **Advanced**
- Count-to-advantage lookup — **Advanced**

### Opponents and seating

- Number of opponents — **Regular**
- Your seating position — **Regular**
- Opponent playing skill — **Both**:
  - Disabled / existing behavior
  - Basic, beginner, intermediate, or expert
  - Mixed or randomized
  - Conservative or aggressive
  - Card-counting
  - Custom profiles
- Opponent betting behavior — **Both**:
  - Existing streak behavior
  - Flat or count-based wager
  - Bankroll percentage
  - Martingale or reverse Martingale / Paroli
  - Fibonacci
  - D’Alembert
  - Win/loss streak betting
  - Custom betting profile
- Enable independent opponent profiles — **Advanced**
- Custom decision-error probability — **Advanced**
- Count accuracy multiplier — **Advanced**
- Wager risk multiplier — **Advanced**
- Bankroll wager fraction — **Advanced**
- Streak trigger length — **Advanced**
- Progression multiplier — **Advanced**
- Maximum progression step — **Advanced**
- Paroli reset after wins — **Advanced**
- Streak sensitivity: wins and losses, winning streaks, or losing streaks — **Advanced**
- Custom opponent wager expression — **Advanced**
- Randomized beginner, intermediate, and expert weights — **Advanced**
- Per-seat overrides for playing strategy, betting behavior, base wager, starting bankroll, maximum wager, error probability, count accuracy, risk multiplier, bankroll fraction, and custom betting expression — **Advanced**

### Counting and display

- Count system: Hi-Lo, Hi-Opt I, or no counting — **Regular**
- Laboratory count visibility: hidden, running count, true count, or both — **Regular**
- Analytics count display: hidden, running, true, both, card effects, history, probability / advantage estimates, or full overlay — **Advanced**
- Displayed true-count decimal places — **Advanced**
- Displayed true-count rounding — **Advanced**
- Game speed: 1×, 2×, 5×, 10×, or 25× — **Regular**
- Random seed — **Regular**

The two count-display controls are listed separately because they are separate settings, even though their labels overlap.

### How viable are these strategies?

Viability depends on the rules, bankroll, wager limits, and what you care about: expected return, swings, or the chance of running out of money. For example, basic strategy with flat betting is a useful baseline and generally gives up less through avoidable playing mistakes than always standing with the same wager; neither is guaranteed to beat the house. Basic strategy with count-based betting may improve on the flat-betting version when the count carries useful information and the rules, penetration, and allowed spread make that information actionable, but it can also bring larger swings. Likewise, full Kelly and fractional Kelly use the same kind of estimated advantage, but fractional Kelly generally stakes less and has lower bankroll volatility; full Kelly is more sensitive to errors in the estimated edge. Martingale versus flat betting is another useful comparison: increasing bets after losses may produce many small wins, but table limits, bankroll limits, and occasional large losses still matter—it does not change the odds of the cards. These are comparisons between policies under shared conditions, not players directly taking money from one another. Results are estimates, so use enough independent environments and sessions, look at uncertainty and drawdown as well as return, and remember that shared shoe seeds do not guarantee identical cards when decisions differ.

### The takeaway

Start with a simple baseline, change one thing at a time, and see whether any apparent improvement holds up across different conditions. A strategy that looks great in one run might just have caught a good shoe; a useful strategy is one whose return and risk make sense together over many runs.
