# Engineerin.md — Blackjack Agents with Divergent Loss Functions

**Project:** Four neural blackjack agents (General, Basic Strategy, Card Counter, Gambler) that share identical inputs and architecture but learn *different behavior* because their **loss functions and training dynamics** differ. Each kind is pre-trained, trained as a population, and the best member of each kind is chosen by a tournament under identical (duplicate) deals.

**Audience:** A future engineer implementing, extending, or debugging this project. This file consolidates the full design conversation, flags every decision that is still open, records corrections to earlier drafts, and adds material the conversation did not cover (marked **[ADDED]**).

**Status legend used throughout**

- **[DECIDED]** — agreed in the design conversation.
- **[DEFAULT]** — my recommended default; the user has not explicitly confirmed it.
- **[OPEN]** — an unresolved question (collected again in Section 15).
- **[ADDED]** — new content or a correction beyond what was discussed.

---

## Table of Contents

1. Executive Summary
2. Notation and Glossary
3. Goals, Non-Goals, and Design Principles
4. Environment Specification
5. Theoretical Background
6. Shared Input Specification
7. Shared Network Architecture
8. Per-Model Specifications
   - 8.1 General model
   - 8.2 Basic Strategy model
   - 8.3 Card Counter model
   - 8.4 Gambler model
9. Pre-training
10. Populations and Tournament
11. Evaluation, Metrics, and Probes
12. Cross-Kind Comparison (Headline Experiment)
13. Pitfalls, Known Issues, and Corrections to Earlier Drafts
14. Repository Layout and Configuration
15. Open Decisions
16. Step-by-Step Implementation Plan
17. Validation Checklist and Acceptance Criteria
18. Master Hyperparameter Table
19. Possible Extensions
20. References (IEEE)

---

## 1. Executive Summary

The project asks one question: **how much of an agent's "personality" can be produced by the loss function alone?**

All four agents see the same observation vector (hand, dealer upcard, shoe composition, running/true count, session state, recent-card history) and use the same network body. They are made different only through:

| Kind | Intended behavior | What makes it so |
|---|---|---|
| **General** | Maximize expected units per hand | Plain Double DQN with Huber loss |
| **Basic Strategy** | Reproduce the fixed basic-strategy table and *ignore* count, streak, and history | Cross-entropy imitation of the table plus an invariance penalty on nuisance features |
| **Card Counter** | Use the count to deviate from basic strategy and to vary bet size, risk-aware | TD loss + Kelly (log-wealth) bet loss + auxiliary true-count prediction |
| **Gambler** | Overreact to streaks, be optimistic, be risk-seeking, and fall for the gambler's fallacy | Streak-modulated learning rate, asymmetric (expectile) TD loss, convex reward, streak-dependent betting, and biased beliefs about upcoming cards |

Training pipeline:

1. **Pre-train** each trunk on supervised shoe/hand tasks (true count, next-card distribution, dealer outcome distribution) and, for most kinds, behavior-clone basic strategy.
2. **Build populations** (8–16 variants per kind) that differ in seed and hyperparameters.
3. **Fine-tune** each variant with its kind-specific loss.
4. **Tournament within each kind** using *duplicate deals* (identical shuffled shoes for every contender), paired statistics, and successive halving, with a **kind-specific fitness function**.
5. **Validate** the winners on held-out shoe seeds, then run all four winners against each other on common shoes (the headline comparison).

Key facts that shape the whole design:

- Blackjack is not head-to-head. "Playing each other" means *competing under identical conditions* and being ranked by fitness.
- The house edge is small (~0.4–0.5% under the assumed rules) while per-hand standard deviation is ~1.1–1.15 units, so naive comparisons require **millions** of hands. Duplicate deals and paired tests are mandatory, not optional.
- In a well-shuffled shoe, card **order carries no extra information** beyond the rank histogram. History features therefore cannot improve a rational agent; they exist so the Gambler can be *wrong* in a measurable way and so ablations can confirm the math.

---

## 2. Notation and Glossary

| Symbol / term | Meaning |
|---|---|
| `s` | Observation (state) vector, identical for all models |
| `a ∈ {stand, hit, double, split}` | Player action (optional 5th action: insurance, see 4.6) |
| `r` | Net result of a round **in units of the initial bet** (e.g., −1, 0, +1, +1.5, ±2) |
| `b` | Bet level in units (1…8) |
| `B` | Bankroll |
| `γ` | Discount factor; **1** because rounds are short, episodic |
| `Q(s,a)` | Action-value estimate |
| `π(s)` | Policy (distribution over legal actions) |
| `RC` | Running count (Hi-Lo) |
| `TC` | True count = `RC / decks_remaining` |
| Penetration | Fraction of the shoe dealt before the reshuffle (cut card) |
| Hi-Lo | Balanced counting system: 2–6 = +1, 7–9 = 0, 10/J/Q/K/A = −1 [5], [29] |
| Kelly bet | Bet that maximizes expected log wealth [7] |
| DDQN | Double Deep Q-Network [1], [2] |
| Huber loss | Quadratic near zero, linear in the tails [3] |
| Expectile loss | Asymmetric least-squares loss [16], [30] |
| Duplicate deals | Every contender plays identical shuffled shoes (common random numbers) [31] |
| Successive halving | Allocate budget progressively to the better half of candidates [11] |
| PBT | Population Based Training [10] |
| Basic strategy | Optimal fixed play given only the player's hand and dealer upcard for a given rule set [8] |
| Illustrious 18 | The 18 most valuable count-based deviations from basic strategy [5], [29] |

---

## 3. Goals, Non-Goals, and Design Principles

### 3.1 Goals

1. Four agents with measurably different, *intended* behaviors from identical inputs.
2. A reproducible pipeline: environment, pre-training, populations, tournament, evaluation.
3. Statistically sound comparisons despite blackjack's high variance.
4. Diagnostics that **prove** each agent learned its intended behavior (linear probes, shuffle tests, ramp plots, order-sensitivity probes).

### 3.2 Non-Goals

- Beating a real casino. The project is a modeling and ML-methodology exercise.
- Multi-player table dynamics (optional extension, see Section 19).
- Side bets, surrender, or non-standard rules (optional extensions).

### 3.3 Design Principles

1. **Same inputs, different losses.** Model differences come from objectives and training dynamics, not private features. **[DECIDED]**
2. **Enforce, don't hope.** If a model *must* ignore a feature (Basic Strategy), add an explicit penalty. If a model *must* use a feature (Counter), add an auxiliary loss that forces the representation to exist.
3. **Fitness must match intent.** A tournament that ranks everyone by raw EV will erase the personalities. Each kind has its own fitness.
4. **Variance is the enemy.** Use duplicate deals, paired differences, and bootstrap confidence intervals.
5. **Select on one set, report on another.** Winner's curse is real; always validate on held-out shoe seeds.
6. **Greedy at evaluation.** ε = 0 for every contender.
7. **Reset state identically.** Streak, bankroll, history, and count features start from the same values at the start of each evaluation shoe.

---

## 4. Environment Specification

### 4.1 Assumed rules **[DEFAULT — confirm with the user]**

| Rule | Value |
|---|---|
| Decks | 6 |
| Dealer on soft 17 | Stands (S17) |
| Doubling | Any first two cards; **double after split (DAS)** allowed |
| Splitting | Pairs (by rank); resplit up to 4 hands; split aces receive one card each, no resplit of aces |
| Blackjack payout | 3:2 |
| Dealer peeks for blackjack | Yes (a dealer blackjack ends the round before player action) |
| Surrender | None |
| Penetration | ~75% (reshuffle when the cut card is reached; finish the current round) |
| Players | Single player vs. dealer (configurable for extra "other player" cards) |

These rules determine the basic-strategy table in 5.2. **If any change, regenerate the table** (use a solver or a published reference chart for the matching rule set) and the Illustrious-18 indices, since index values depend on the rules.

### 4.2 Round flow

1. If the cut card was passed in the previous round, reshuffle and reset all shoe-derived features.
2. **Bet phase:** the agent selects `b` using only pre-deal information (shoe + session features; hand features zeroed).
3. Deal: player card, dealer upcard, player card, dealer hole card (hole card is *not visible*).
4. Dealer peek: if the dealer has blackjack, the round resolves immediately (player blackjack pushes).
5. Player acts until stand, bust, double, or all split hands are resolved.
6. Dealer reveals the hole card and draws to 17+ (stands on soft 17).
7. Resolve payouts, update bankroll, outcome history, and streak.

### 4.3 Reward definition **[DECIDED]**

Net units won per round relative to the initial bet:

| Outcome | `r` |
|---|---|
| Win | +1 |
| Push | 0 |
| Loss | −1 |
| Player blackjack | +1.5 |
| Doubled win / loss | +2 / −2 |
| Split hands | Sum over the sub-hands |

Bankroll update: `B ← B + b · r`.

### 4.4 Episode structure and split handling **[ADDED]**

- One **round** is one episode for the action head. `γ = 1`.
- Rewards are terminal: all intermediate transitions have `r = 0` and the final transition receives the net result of that (sub)hand.
- **Split handling:** after a split, process sub-hands sequentially. Treat each sub-hand as its own mini-episode for transitions *within* it. The split transition's TD target should be the **realized sum of the sub-hands' terminal rewards** (a Monte-Carlo target), because bootstrapping through a branching state is awkward. Document this as a design decision and unit-test it.
- Use **action masking** everywhere: double only on the first two cards (and after split if DAS), split only on pairs with split count < 4, etc. Masked actions get `−∞` (or `−1e9`) in the argmax, in the target computation, and in any softmax.

### 4.5 Information-leakage rules **[ADDED]**

These bugs silently inflate performance. Test for each:

- The dealer's **hole card must not enter the seen-card histogram or the count** until it is revealed.
- Cards of the current round enter the count **as they become visible**, in the same order a human would see them.
- The bet-phase observation may include only cards seen **before** the deal.
- If the dealer peeks and has blackjack, the hole card is revealed and counted at that moment.
- Burned cards (if modeled) are invisible and therefore never counted, although they are removed from the shoe. This makes the count slightly inexact, as in real play.

### 4.6 Optional insurance action **[ADDED]**

The Illustrious-18 list includes insurance (take insurance at TC ≥ +3 under Hi-Lo [5]). To let the Counter learn it, add a fifth action `insure` available only when the dealer shows an ace, before the peek. Keep it behind a config flag, `ENABLE_INSURANCE`, because it complicates the state machine and the mask.

### 4.6.1 Bankroll and ruin

- Fixed starting bankroll (e.g., 1000 units) per evaluation shoe sequence.
- Bust terminal state when `B < b_min`. Bets are clipped to `B / 8` so that a worst-case round (4 hands, each doubled, all lost = −8 units) cannot produce a negative bankroll; if you instead allow it, clamp wealth in the log reward (see 8.3).

### 4.7 Randomness

- Use `numpy.random.Generator` with explicit seeds per shoe. A *shoe seed* fully determines the shuffle, so any model can replay identical shoes (duplicate deals).
- Seed the PyTorch RNG independently for model initialization and exploration.

---

## 5. Theoretical Background

### 5.1 Why a small edge needs a big sample

Under the assumed rules, the house edge for correct basic strategy is roughly 0.4–0.5% (verify against a published calculator when you build the env). The per-hand standard deviation is about 1.1–1.15 units. To detect a mean difference `δ` between two independent players with confidence `z`:

```
n ≈ 2 · (z · σ / δ)²
```

For `δ = 0.1%` (0.001 units), `σ ≈ 1.15`, `z = 1.96`: `n ≈ 1×10⁷` hands per player. Paired comparisons on identical shoes cancel most card luck because the players' hands are highly correlated, reducing the required `n` by one to two orders of magnitude [31]. This is why duplicate deals are central to the tournament.

### 5.2 Basic strategy

Basic strategy is the fixed action table that maximizes EV given only the player's hand and the dealer's upcard for a specific rule set [8]. For **6 decks, S17, DAS, no surrender, dealer peeks**, the table is (D = double, otherwise hit; Ds = double, otherwise stand; P = split; S = stand; H = hit):

**Hard totals**

| Player | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| 5–8 | H | H | H | H | H | H | H | H | H | H |
| 9 | H | D | D | D | D | H | H | H | H | H |
| 10 | D | D | D | D | D | D | D | D | H | H |
| 11 | D | D | D | D | D | D | D | D | D | H |
| 12 | H | H | S | S | S | H | H | H | H | H |
| 13–16 | S | S | S | S | S | H | H | H | H | H |
| 17+ | S | S | S | S | S | S | S | S | S | S |

**Soft totals**

| Player | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| A,2 / A,3 | H | H | H | D | D | H | H | H | H | H |
| A,4 / A,5 | H | H | D | D | D | H | H | H | H | H |
| A,6 | H | D | D | D | D | H | H | H | H | H |
| A,7 | S | Ds | Ds | Ds | Ds | S | S | H | H | H |
| A,8 / A,9 | S | S | S | S | S | S | S | S | S | S |

**Pairs**

| Pair | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | A |
|---|---|---|---|---|---|---|---|---|---|---|
| A,A | P | P | P | P | P | P | P | P | P | P |
| 10,10 | S | S | S | S | S | S | S | S | S | S |
| 9,9 | P | P | P | P | P | S | P | P | S | S |
| 8,8 | P | P | P | P | P | P | P | P | P | P |
| 7,7 | P | P | P | P | P | P | H | H | H | H |
| 6,6 | P | P | P | P | P | H | H | H | H | H |
| 5,5 | *treat as hard 10* | | | | | | | | | |
| 4,4 | H | H | H | P | P | H | H | H | H | H |
| 2,2 / 3,3 | P | P | P | P | P | P | H | H | H | H |

Fallback rules: if doubling is not allowed (three or more cards, or the double mask is off), D → H and Ds → S. **Verify this table against a trusted source or solver for the exact rule set before using it as a training target.** The table is a code artifact: store it as data (`basic_strategy.csv`) with unit tests, and generate it once.

### 5.3 Card counting and Hi-Lo

- **Hi-Lo tags:** 2–6 → +1; 7–9 → 0; 10, J, Q, K, A → −1 [5], [29].
- **Running count:** sum of tags of all cards seen since the shuffle.
- **True count:** `TC = RC / decks_remaining`. Decks remaining = cards remaining / 52.
- **Linear in the histogram:** `RC = (n₂+n₃+n₄+n₅+n₆) − (n₁₀+n_A)`, where `nᵣ` is the number of seen cards of rank group `r`. This is why an MLP can learn the count from the raw histogram (Option 2 in 8.3).
- **Bet ramp (reference baseline):** `bet = clip(floor(TC) − 1, 1, 8)` units, a common spread.
- **Illustrious 18 (Hi-Lo)**, the most valuable deviations [5], [29]. *Indices depend on the rule set; verify before use as supervised targets.*

| Hand vs. dealer | Deviation | Index (TC) |
|---|---|---|
| Insurance | Take | ≥ +3 |
| 16 vs 10 | Stand | ≥ 0 |
| 15 vs 10 | Stand | ≥ +4 |
| 10,10 vs 5 | Split | ≥ +5 |
| 10,10 vs 6 | Split | ≥ +4 |
| 10 vs 10 | Double | ≥ +4 |
| 12 vs 3 | Stand | ≥ +2 |
| 12 vs 2 | Stand | ≥ +3 |
| 11 vs A | Double | ≥ +1 |
| 9 vs 2 | Double | ≥ +1 |
| 10 vs A | Double | ≥ +4 |
| 9 vs 7 | Double | ≥ +3 |
| 16 vs 9 | Stand | ≥ +5 |
| 13 vs 2 | Stand | ≥ −1 |
| 12 vs 4 | Hit | < 0 |
| 12 vs 5 | Hit | < −2 |
| 12 vs 6 | Hit | < −1 |
| 13 vs 3 | Hit | < −2 |

### 5.4 Count information is a sufficient statistic

For a uniformly shuffled shoe, the distribution of the next card depends only on the **multiset of remaining cards**, i.e., the rank histogram. The *order* in which past cards appeared adds no predictive information. Consequences:

1. A rational agent cannot gain from sequence-aware features (GRU, window, decayed counts) beyond exact counts. A sequence-aware Counter that fails to beat the histogram-based Counter **confirms** the math; this is a deliberate experiment.
2. History features are useful only to (a) simulate imperfect human memory (decayed counts, "missed cards"), and (b) let the **Gambler** hold wrong beliefs ("three tens in a row, a low card is due").
3. Gambler order-dependence will **not** arise from reward optimization alone, because order has no true signal. It must be induced explicitly (see 8.4, mechanism d).

### 5.5 Kelly criterion

Kelly betting maximizes the expected log of wealth and, in the long run, maximizes the compounded growth rate while avoiding ruin [7]. For a small edge, the optimal fraction is approximately `edge / variance`. Contrast with a **risk-neutral** objective (maximize expected units), which is **bang-bang**: it bets the maximum whenever the edge is positive and the minimum otherwise. This distinction matters for how we train and rank the General vs. Counter bet heads (8.1, 8.3).

### 5.6 Reinforcement learning ingredients

- **DQN** with target networks and replay [1]; **Double DQN** reduces overestimation by selecting the next action with the online net and evaluating it with the target net [2]; **Huber loss** stabilizes training against outliers [3]; **Adam** [4].
- **Expectile regression** assigns asymmetric weights to positive and negative errors; with weight τ > 0.5 on positive TD errors the value estimates drift toward the upper expectile of the return distribution (optimism). The same idea appears in implicit Q-learning [16] and originates in asymmetric least squares [30].
- **Risk-sensitive RL** modifies TD errors or utilities to produce risk-seeking or risk-averse agents [32].
- **Recurrent replay** (burn-in, stored hidden states) is needed for GRU agents in DQN [17]; the GRU itself is from [18].

### 5.7 Behavioral background for the Gambler

| Bias | Description | Source |
|---|---|---|
| Gambler's fallacy | Belief that a streak makes reversal "due" | [14], [34] |
| Hot-hand belief | Belief that streaks continue | [15] |
| House-money effect | Increased risk-taking after wins | [36] |
| Prospect theory | Reference-dependent, loss-averse, concave-gains/convex-losses utility | [12], [13] |

**Note:** the Gambler's convex-gain reward (8.4c) deliberately goes *against* prospect theory's concave gains. It models over-excitement after big payouts, not a calibrated human value function. If you want a prospect-theory Gambler instead, implement it as an alternative variant (`utility="prospect"`).

---

## 6. Shared Input Specification

All four models receive this identical vector. Dimensions below give a concrete layout; keep the index map in one module (`features/layout.py`) so nuisance-feature masks are generated programmatically.

### 6.1 Feature groups **[DECIDED]**, with history additions

| Group | Feature | Dim | Notes |
|---|---|---|---|
| **Hand** | player total / 21 | 1 | Hard or soft total as the player counts it |
| | soft flag | 1 | 1 if an ace counts as 11 |
| | number of cards / 8 | 1 | |
| | is-pair flag | 1 | |
| | pair rank one-hot | 10 | Zeros if not a pair |
| | can-double | 1 | Mirrors the action mask |
| | can-split | 1 | Mirrors the action mask |
| **Dealer** | upcard one-hot (A, 2…10) | 10 | |
| **Shoe** | seen counts per rank group, normalized by starting count | 10 | Seen **visible** cards only (see 4.5) |
| | decks remaining | 1 | |
| | penetration | 1 | |
| | Hi-Lo true count | 1 | **Config flag** `include_engineered_count` (Option 1 vs 2 in 8.3) |
| **Session** | bankroll / starting bankroll | 1 | |
| | last 5 outcomes (+1 / 0 / −1) | 5 | |
| | signed streak length | 1 | +n win streak, −n loss streak |
| | last bet size | 1 | Normalized by max bet |
| **History** | decayed rank counts, 3 decay rates (e.g., 0.8, 0.95, 0.99) | 30 | `recent[r] = d·recent[r] + 1[card = r]` |
| | last N = 15 cards, one-hot (11-way incl. pad) | 165 | Or a learned embedding + 1D conv to ~32 dims |
| | streakiness | 2 | Same-rank run length; high/low-card run length |

Totals: Hand 16 + Dealer 10 + Shoe 13 + Session 8 = **47**, plus History 30 + 165 + 2 = 197, giving **244 raw dims** (or ~**111** with the conv/pooling encoding of the last-15 window).

### 6.2 Feature-group index map and nuisance sets **[ADDED]**

Define named slices:

```python
SLICES = {
    "hand": slice(0, 16),
    "dealer": slice(16, 26),
    "shoe": slice(26, 39),      # includes engineered TC if enabled
    "session": slice(39, 47),
    "history": slice(47, 244),
}
ALLOWED_FOR_BASIC = ("hand", "dealer")                    # Basic Strategy may use only these
NUISANCE_FOR_BASIC = ("shoe", "session", "history")       # must be ignored
```

### 6.3 Preprocessing

- Normalize every scalar to roughly [0, 1] or [−1, 1]. Counts normalized by the starting counts (e.g., `seen_r / (decks · 4)`; tens by `decks · 16`).
- Clip `TC` to [−10, +10] and divide by 10.
- Mask vector `m ∈ {0,1}⁴` (or 5 with insurance) accompanies each observation but is **not** part of `s`; it is applied inside the loss and the policy.

### 6.4 Bet-phase observation

For the bet head, use the **same vector with Hand and Dealer groups zeroed** (nothing is dealt yet). Shoe, Session, and History groups are as of the end of the previous round.

### 6.5 Reset semantics

At each reshuffle: seen counts, decayed counts, window, and penetration reset. At the start of each evaluation shoe sequence: bankroll, streak, outcome history, last bet reset to the fixed initial values. Document and test this; inconsistent resets across contenders invalidate the tournament.

---

## 7. Shared Network Architecture

### 7.1 Trunk

An MLP: `in_dim → 256 → 256` with ReLU/GELU, LayerNorm optional. Use 128–128 only if you drop the history features (~47 dims); with the full ~244-dim input prefer 256–256. **[DECIDED, with the widening noted in the conversation]**

### 7.2 Heads

| Head | Output | Used by |
|---|---|---|
| **Action head** | `Q(s, a)` for 4 (or 5) actions; masked | All |
| **Bet head** | `Q_bet(s_pre, b)` for 8 bet levels (1–8 units) | General (optional), Counter, Gambler; **frozen** for Basic |
| **Count head (aux)** | scalar `ĉ` ≈ true count | Pre-training (all), Counter fine-tune |
| **Next-card head (aux)** | 10-way logits ≈ remaining-shoe rank distribution | Pre-training (all), Counter fine-tune |
| **Dealer-outcome head (aux)** | 6-way logits: {17, 18, 19, 20, 21, bust} | Pre-training (all) |
| **Belief head (Gambler)** | 10-way logits: *believed* next-card distribution | Gambler (8.4d) **[ADDED]** |

The Basic Strategy model reads the action head as **logits** (cross-entropy), while RL models read it as Q-values; the shape is identical.

### 7.3 Reference code (PyTorch [9])

```python
import torch, torch.nn as nn, torch.nn.functional as F

class SharedNet(nn.Module):
    def __init__(self, in_dim, hidden=256, n_actions=4, n_bets=8):
        super().__init__()
        self.trunk = nn.Sequential(
            nn.Linear(in_dim, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden), nn.ReLU(),
        )
        self.q_head       = nn.Linear(hidden, n_actions)
        self.bet_head     = nn.Linear(hidden, n_bets)
        self.count_head   = nn.Linear(hidden, 1)
        self.nextcard_head= nn.Linear(hidden, 10)
        self.dealer_head  = nn.Linear(hidden, 6)
        self.belief_head  = nn.Linear(hidden, 10)   # Gambler only; ignored elsewhere

    def forward(self, s):
        z = self.trunk(s)
        return {
            "z": z,
            "q": self.q_head(z),
            "bet_q": self.bet_head(z),
            "tc_hat": self.count_head(z).squeeze(-1),
            "next_logits": self.nextcard_head(z),
            "dealer_logits": self.dealer_head(z),
            "belief_logits": self.belief_head(z),
        }

def masked_q(q, mask):
    return q.masked_fill(~mask, -1e9)
```

### 7.4 Optional: counter bet skip-connection

Give the Counter's bet head a skip connection from `tc_hat`, so bet size is structurally a function of the model's own count estimate:

```python
bet_in = torch.cat([z, tc_hat.detach().unsqueeze(-1)], dim=-1)
```

---

## 8. Per-Model Specifications

### 8.1 General model (baseline)

**Purpose:** the unbiased reference. It shows what plain RL discovers from the shared inputs.

**Loss [DECIDED]:** Double DQN with Huber loss, `γ = 1`.

```python
def ddqn_huber(online, target, batch, gamma=1.0):
    s, a, r, s2, done, mask2 = batch
    q = online(s)["q"].gather(1, a.unsqueeze(1)).squeeze(1)
    with torch.no_grad():
        a_star = masked_q(online(s2)["q"], mask2).argmax(1, keepdim=True)
        q_next = target(s2)["q"].gather(1, a_star).squeeze(1)
        y = r + gamma * (1.0 - done) * q_next
    return F.smooth_l1_loss(q, y)
```

**Reward:** net units (4.3).

**Bet policy [OPEN]:** two choices.

| Option | Behavior | Use |
|---|---|---|
| (a) Flat 1 unit | Clean baseline | Default if no answer is given |
| (b) Bet head trained on net-units reward | Tests whether the model discovers counting on its own | Interesting experiment; see warning below |

**Warning [ADDED]:** under a **risk-neutral** reward, the optimal bet policy is bang-bang (max bet when edge > 0, min otherwise). The General model's bet ramp will therefore look like a step function, not a Kelly ramp. This is correct behavior, not a bug, and makes a good contrast with the Counter.

**Hyperparameters:** Adam [4], lr 1e-3; ε decays 1.0 → 0.05; target-net sync every ~1,000 steps; replay buffer 100k; batch 256 (suggested); gradient-norm clip 10.

**Expected behavior:** near basic strategy EV; possibly weak count dependence emerging only if the engineered count is present and the bet head is enabled.

**Failure modes:** overestimation (mitigated by Double DQN), divergence from `γ=1` with long bootstrapping (not an issue here), masked-action leakage into targets.

### 8.2 Basic Strategy model

**Purpose:** reproduce the fixed table and be **provably invariant** to count, streak, and history.

**Loss [DECIDED]:**

```
L = CE(π(s), a_basic(s)) + λ_inv · KL( π(s) ‖ π(s with nuisance features shuffled) )
```

Optionally add a small TD term (λ_td ≈ 0.1) as an experiment to see whether RL pulls the model away from the table.

```python
def basic_strategy_loss(net, s, a_basic, mask, nuisance_idx, lam_inv=0.5, T=1.0):
    logits = masked_q(net(s)["q"], mask)
    ce = F.cross_entropy(logits, a_basic)

    perm = torch.randperm(s.size(0), device=s.device)
    s_shuf = s.clone()
    s_shuf[:, nuisance_idx] = s[perm][:, nuisance_idx]     # shuffle shoe/session/history
    logits_shuf = masked_q(net(s_shuf)["q"], mask)

    logp   = F.log_softmax(logits / T, dim=-1)
    logp_s = F.log_softmax(logits_shuf / T, dim=-1)
    kl = F.kl_div(logp_s, logp.exp(), reduction="batchmean")   # KL(π ‖ π_shuf)
    return ce + lam_inv * kl
```

Notes:

- `nuisance_idx` is the concatenation of `SLICES["shoe"]`, `SLICES["session"]`, and `SLICES["history"]` (6.2).
- Shuffling across the batch breaks the correlation between the nuisance features and the hand, which is the point: the output should not change.
- This idea is related to invariance-based regularization [28]; here it is implemented as a simple consistency penalty.
- **Data augmentation alternative [ADDED]:** during pre-training and fine-tuning, replace nuisance features with random draws from *valid* simulated states. Combine with the KL penalty for belt-and-braces invariance.

**Bet:** fixed at 1 unit; bet head frozen.

**Hyperparameters:** lr 5e-4, λ_inv ≈ 0.5, no exploration. Training data are all `(hand, upcard)` combinations with random nuisance features.

**Training data generation:** enumerate every legal `(player hand state, dealer upcard, mask)` combination, label with the table's action, and sample nuisance features from simulated shoes. This is supervised, so there is no replay or ε.

**Expected behavior:** ≈100% action agreement with the table on all states; near-zero output change under nuisance shuffles; EV equal to table EV.

**Fitness (tournament):** see 10.4. A Basic Strategy model with **higher** EV than the table is a failure (it learned something it shouldn't).

### 8.3 Card Counter model

**Purpose:** use the count for both action deviations and bet sizing, risk-aware.

**Loss [DECIDED]:**

```
L = L_TD + λ_bet · L_bet + λ_aux · MSE(ĉ, true_count)
```

#### Count access: three options

| Option | Description | Verdict |
|---|---|---|
| **1. Engineered count as input** | Hi-Lo TC in the shared vector; the Counter learns to use it because its losses reward doing so | **Start here** (simplest) |
| **2. Derive the count from raw histogram** | Drop the engineered TC from the shared vector for *all* models; the Counter must learn `RC = n₂+…+n₆ − n₁₀ − n_A` and the division by decks remaining | **Cleanest same-inputs experiment**; also tests whether the General model discovers counting |
| **3. Recurrent running count** | Feed only new cards since the last decision into a GRU [18]; the hidden state holds the count; reset at shuffle | Most literal "keeping" of a count; needs sequence-aware replay [17] |

Recommended order: Option 1 + auxiliary head to get a working baseline, then Option 2 as an experiment, then Option 3 if desired. **[OPEN]** whether the final Counter gets the engineered Hi-Lo feature or must derive it.

#### L_TD

Same Double DQN loss as 8.1. Over time it learns Illustrious-18-style deviations.

#### L_bet — Kelly (log-wealth) bet loss

**Correction [ADDED]:** an earlier draft wrote `L_bet = -(q_bet.gather(...)).pow(2).mean()`, which has a sign error (it maximizes squared error). The correct form is a **regression of the bet head onto the log-wealth reward**.

**Full-information trick [ADDED]:** the cards do not depend on how much you wager, and the action policy does not depend on `b`. Therefore, once a round finishes with net result `r` (per unit bet), the log-wealth reward for **every** bet level can be computed counterfactually:

```
target_b = log( (B + b · r) / B )     for b = 1 … 8
```

So the bet head is trained with **supervised regression against the full vector of counterfactual targets**; no bet exploration is needed.

```python
def bet_loss_fullinfo(bet_q, r_units, bankroll, bet_levels, eps=1e-6):
    # bet_q: (B, 8); r_units: (B,) net result per unit bet; bankroll in units
    wealth_after = bankroll[:, None] + bet_levels[None, :] * r_units[:, None]
    target = torch.log(wealth_after.clamp_min(eps) / bankroll[:, None])
    return F.smooth_l1_loss(bet_q, target)
```

Selection rule: `b* = argmax_b bet_q[b]`. Because the Q-values estimate expected log growth, large bets are chosen only when the edge justifies the variance, which approximates Kelly [7].

**Alternative (supervised ramp):** target `clip(TC − 1, 1, 8)` units. Useful as a pre-training target or sanity baseline, but it hard-codes the ramp rather than learning it.

**Caveat:** the full-information trick assumes `r` is independent of `b`. It breaks if the bankroll or the last bet feeds into the action policy (it shouldn't, since the action head is bet-agnostic; verify with a unit test).

#### L_aux — count auxiliary head

```python
L_aux = F.mse_loss(out["tc_hat"], true_count.detach())
```

The auxiliary head forces part of the trunk's representation to encode the count, which the bet and action heads then read. Optionally add a **next-card auxiliary** (KL to the exact remaining-shoe distribution) as in pre-training.

#### Fidelity knob **[DECIDED idea; parameterization ADDED]**

To simulate imperfect human counters:

```python
noisy_count = true_count + torch.randn_like(true_count) * sigma      # sloppy counter
# or drop each card update with probability p ("missed a card")
```

Train several Counters (e.g., σ ∈ {0, 0.5, 1.0}, p ∈ {0, 0.02, 0.05}) and plot EV and growth rate vs. fidelity.

#### History ablation

Run each Counter with history features zeroed vs. intact. The expected gain from history is ≈ 0 (5.4). A next-card auxiliary may help representations but should not beat exact counts.

**Hyperparameters:** lr 1e-3, λ_bet ≈ 1.0, λ_aux ≈ 0.2, bet spread 1–8.

**Expected behavior:** mean bet rises with TC (Kelly-like ramp); deviations such as stand on 16 vs 10 at TC ≥ 0; strong linear-probe R² for the count in the trunk.

### 8.4 Gambler model

**Purpose:** simulate overexcitement and cognitive bias through learning dynamics and biased objectives. Four mechanisms (a–d), plus a betting behavior.

#### (a) Streak-modulated learning rate ("on a roll") **[DECIDED]**

```python
import math

def gambler_lr(base_lr, streak, k=3.0, alpha=1.5, hi=3.0,
               win_scale=1.0, loss_scale=1.0):
    scale = win_scale if streak > 0 else loss_scale
    mult = 1.0 + alpha * math.tanh(abs(streak) / k) * scale
    return base_lr * min(mult, hi)

for g in optimizer.param_groups:
    g["lr"] = gambler_lr(BASE_LR, live_streak)
```

Notes:

- **Correction [ADDED]:** the earlier draft used `min(max(boost, lo), hi)` with `lo = 0.5`, but `boost ≥ 1`, so `lo` never bound. Drop it, or allow a **dampened** learning rate (multiplier < 1) for a "cold streak, hesitant" variant.
- With `alpha = 1.5` the multiplier saturates at 2.5, so `hi = 3.0` only binds if `win_scale` or `loss_scale` exceeds ~1.2.
- Use the **live** streak at gradient-step time. Do not use the streak stored in the sampled transition (replay samples from the past).
- `win_scale > loss_scale` models "on a roll after wins"; `loss_scale > win_scale` models "tilt after losses." Run both as variants.
- Adam's step size scales roughly linearly with lr, so this does amplify updates. Clip gradient norm to keep training stable [33] (and see [35] for LR-scheduling intuition).
- **Stronger variant:** *recency-biased replay sampling* (sample the most recent transitions with higher probability) so that the learning rate boost actually acts on streak-period data.

#### (b) Optimism via expectile TD loss **[DECIDED]**

```python
def expectile_huber(delta, tau=0.8):
    w = torch.where(delta > 0, torch.full_like(delta, tau),
                              torch.full_like(delta, 1 - tau))
    return (w * F.huber_loss(delta, torch.zeros_like(delta), reduction="none")).mean()
```

`delta = y − Q(s, a)`. With `τ > 0.5`, positive errors (better-than-expected outcomes) weigh more, pushing Q-values upward: "I'm luckier than average." [16], [30].

#### (c) Convex, risk-seeking reward **[DECIDED]**

```python
def gambler_utility(r, p_win=1.3, p_loss=0.9):
    return torch.where(r >= 0, r.abs() ** p_win,
                       -(r.abs() ** p_loss))
```

So +1.5 → ≈1.69, +2 → ≈2.46, −1 → −1, −2 → ≈−1.87: big payoffs (doubles, splits, blackjack) feel disproportionately good; losses are slightly underweighted. Optionally add a small "excitement bonus" to the double and split Q-targets. See 5.7 for how this contrasts with prospect theory [12], [13], and [32] for risk-sensitive TD.

#### (d) Biased beliefs for the gambler's fallacy **[ADDED]**

Mechanisms (a)–(c) do **not** make the model depend on card order: order carries no true signal (5.4), so reward maximization alone teaches the network to *ignore* history features. (High learning rates yield noise-fitting that can look like order-dependence in a finite run, but that is not a reliable mechanism.) To induce a real gambler's fallacy, train a **belief head** on a *biased* target and let that belief influence actions.

1. **Compute the true next-card distribution** from the remaining shoe: `p_true(r) = remaining_r / remaining_total`.
2. **Compute recent excess** `z_r = recent_frac(r) / p_true(r) − 1`, where `recent_frac` comes from the decayed counts.
3. **Biased target:**
   ```
   p_gf(r) ∝ p_true(r) · exp( −κ · z_r )        # gambler's fallacy: expect reversal
   p_hh(r) ∝ p_true(r) · exp( +κ · z_r )        # hot-hand-style: expect continuation
   ```
   `κ = 0` recovers the rational belief.
4. **Train** the belief head with `KL(p_gf ‖ softmax(belief_logits))`.
5. **Make the belief matter** with *biased action selection*: define a perception bias on top of the learned values:
   ```
   Q_eff(s,a) = Q_net(s,a) + w · Δ_a(s)
   Δ_hit    = −c · ( P_bust_belief(s) − P_bust_true(s) )
   Δ_double = 2 · Δ_hit
   Δ_stand = Δ_split = 0
   ```
   where `P_bust_belief` is the probability that the next card busts the hand under `p_gf`, and `P_bust_true` uses `p_true`. Use `Q_eff` for action selection and for the argmax inside the TD target. Since the bias is applied *after* the network, TD learning cannot cancel it, so the distortion persists while the network still learns accurate values for the biased policy.

Also supply the "streakiness" features (6.1) so the belief has something to react to.

#### Betting behavior **[DECIDED idea; implementation ADDED]**

Choose a variant (one gambler per variant):

| Variant | Bet behavior |
|---|---|
| **Hot hand** | Bet up after wins: `target_bet = base · (1 + β · max(streak, 0))` |
| **Martingale tilt** | Bet up after losses: `target_bet = base · 2^{min(−streak, m)}` (capped) |

Two implementation routes:

1. **Distorted objective:** train the full-information bet head (8.3) with the *gambler utility* (8.4c) and a streak multiplier, and let the behavior emerge.
2. **Behavioral prior:** add `λ_bias · CE(bet_logits, bet_from_streak(streak))` to hard-wire the pattern.

Route 1 plus a small route-2 term is a good default. Always cap bets at `B / 8` (4.6.1).

#### Hyperparameters (suggested ranges for the population)

| Parameter | Range |
|---|---|
| base lr | 5e-4 – 1.5e-3 |
| `alpha` | 0.5 – 2.0 |
| `k` | 2 – 6 |
| `tau` (expectile) | 0.65 – 0.9 |
| `p_win` / `p_loss` | 1.1–1.5 / 0.8–1.0 |
| `κ` (belief bias) | 0 – 2 |
| `w` (perception bias weight) | 0 – 0.3 |
| bet variant | hot-hand, Martingale, both |

**Stability:** clip gradient norm, cap the lr multiplier, and watch for Q-value blow-up from the optimistic loss. If it diverges, lower τ or the lr cap before anything else.

---

## 9. Pre-training

### 9.1 Why pre-train

RL from reward alone is slow and noisy in blackjack (high variance, tiny edge). Pre-training gives every trunk useful shoe and hand representations and starts the RL phase from competent play.

### 9.2 Stage 1: shared supervised pre-training (all kinds)

Simulate many random shoes at random penetration, sample random game states, and train the shared trunk on:

| Task | Target | Loss |
|---|---|---|
| True count | Hi-Lo TC | MSE |
| Next-card distribution | Exact remaining-shoe rank distribution | KL |
| Dealer final total | 6-way distribution computed by simulation or exact enumeration from the visible state | KL / CE |

The next-card and dealer targets are *exact* given the shoe, so there is no label noise. Loss weights: start at 1.0 / 1.0 / 0.5 and tune on a validation shoe set.

### 9.3 Stage 2: kind-specific pre-training

| Kind | Task | Notes |
|---|---|---|
| **Basic Strategy** | Behavior cloning [26] of the table (CE only) with **random nuisance features** | Invariance term added in fine-tuning |
| **Counter** | Aux count + next-card heads; optionally Illustrious-18 deviation targets as supervised labels | Avoids slow discovery through noisy reward |
| **General** | Clone basic strategy, then plain TD | Sensible warm start |
| **Gambler** | Clone basic strategy, then biased losses | Biases layered on competent play |

The effectiveness of pre-training for deep networks is discussed in [27].

### 9.4 Transition to RL

- **Freeze the trunk for 1–2 epochs** at the start of RL so early noisy TD gradients do not wreck pre-trained features. **[DECIDED]**
- Then unfreeze with a lower trunk learning rate (e.g., 0.1× the head lr) for another epoch before moving to the full lr (optional **[ADDED]**).
- Initialize the replay buffer by playing with the pre-trained greedy policy plus ε-noise.

---

## 10. Populations and Tournament

### 10.1 Idea **[DECIDED]**

Blackjack is not head-to-head, so models of the same kind "play one another" by **competing under identical conditions**; the best by fitness wins and becomes that kind's final model.

### 10.2 Populations

N = 8–16 variants per kind, varying seed and a few hyperparameters (lr, λ weights, ε schedule; for the Gambler `alpha`, `tau`, `p`, `κ`, bet variant). Diversity makes the tournament meaningful.

### 10.3 Duplicate-deal evaluation

```python
def evaluate(model, shoe_seeds, n_hands_per_shoe=200):
    results = []
    for seed in shoe_seeds:                  # identical across ALL contenders
        env = Blackjack(seed=seed)           # same shuffle, same reset state
        results.append(play_shoe(model, env, n_hands_per_shoe, greedy=True))
    return np.array(results)                 # per-shoe units won, growth, etc.

diff = results_A - results_B                 # paired by shoe
z = diff.mean() / (diff.std(ddof=1) / np.sqrt(len(diff)))
```

Use common random numbers [31]. Report paired mean differences with **bootstrap confidence intervals** [22].

### 10.4 Fitness per kind **[DECIDED, Gambler OPEN]**

| Kind | Fitness |
|---|---|
| **General** | EV per hand (units/hand); tie-break on lower variance |
| **Counter** | **Log-growth rate** of bankroll (Kelly), with **risk of ruin** as a hard constraint (e.g., RoR ≤ 5% over the evaluation horizon). A flat-betting model must not win on raw EV alone. |
| **Basic Strategy** | Action agreement with the table (primary); invariance score (output change under nuisance shuffle) as secondary. A model with **higher EV than the table** is a failure. |
| **Gambler** | **[OPEN]** (a) most gambler-like by behavioral metrics, (b) highest bankroll despite the biases, or **composite:** gambler-ness gated by not going bankrupt in under X hands. Recommended default: composite. |

**Composite gambler-ness score [ADDED]:**

```
G = w₁·z(bet–streak correlation)
  + w₂·z(order-sensitivity probe shift)
  + w₃·z(risk-seeking index)      # excess double/split frequency vs. basic strategy
  − penalty(bankrupt before H hands)
```

### 10.5 Successive halving **[DECIDED]**

```
16 contenders → 10k hands each      → keep 8
 8 contenders → 100k hands each     → keep 4
 4 contenders → 500k hands each     → keep 2
 2 contenders → 2M hands each       → keep 1
```

Evaluate rungs on **nested** shoe sets (rung k uses the seeds of rung k−1 plus new ones) to keep comparisons paired and to save compute [11]. Adjust budgets to your hardware.

### 10.6 Optional PBT / evolutionary refinement **[DECIDED as optional]**

After each round, copy weights and hyperparameters from the top ~20% over the bottom ~20%, perturb numeric hyperparameters by ×0.8 or ×1.2, and continue training; repeat for a few generations [10]. The final model per kind is the best of the final generation.

### 10.7 Held-out validation **[DECIDED]**

The tournament seeds are used for selection, so they are biased. Re-evaluate each winner on a **fresh held-out set of shoe seeds** and report those numbers only. Compare the winner's held-out score to its tournament score as a winner's-curse estimate.

---

## 11. Evaluation, Metrics, and Probes

### 11.1 Core metrics (all models)

| Metric | Definition |
|---|---|
| EV per hand | Mean net units per round (per unit bet), plus mean per-wager bankroll change |
| House edge | `−EV` for flat betting |
| Std per hand | For variance and sample-size planning |
| Log-growth rate | `mean(log(B_end / B_0)) / hands` |
| Risk of ruin | Fraction of simulated sessions reaching the bust threshold |
| Max drawdown | Largest peak-to-trough bankroll drop |
| Action agreement with basic strategy | Fraction of states where the greedy action equals the table |

Evaluate on 1M+ hands per model at minimum; use more for tight comparisons (5.1).

### 11.2 Behavioral correlations

| Correlation | Counter | Basic | General | Gambler |
|---|---|---|---|---|
| Bet size vs. true count | **High** | ≈ 0 (flat) | Step-like if bet head enabled | ≈ 0 |
| Bet size vs. streak | ≈ 0 | ≈ 0 | ≈ 0 | **High** |

### 11.3 Representation probes

- **Linear probe [21]:** regress the true count on frozen trunk activations. Expect high R² for the Counter, low for Basic Strategy, intermediate for General.
- **Count-shuffle test:** permute count features at evaluation time. Counter EV and bet-count correlation should collapse; Basic Strategy should be unchanged (output difference ≈ 0).
- **Bet ramp plot:** mean bet vs. true count. Kelly-like ramp for the Counter, step for General (if enabled), flat for Basic, streak-driven for Gambler.

### 11.4 History and gambler's-fallacy tests

- **History ablation:** zero the history features. Expected change: ≈ 0 for Counter, small positive or negative for General, harmful for Gambler.
- **Order-sensitivity probe [ADDED, rigorous version]:** build states with the **same rank histogram** but different *orders* of the last N cards (e.g., a run of three tens vs. the same three tens spread out). Hold everything else identical, and measure the change in the hit/double/bet probabilities. Any change is pure order dependence, which is the operational definition of the gambler's fallacy. This controls for count, which the earlier "hand-crafted shoe with long runs" description did not.
- **Next-card prediction accuracy:** compare each model's next-card head to the true remaining-shoe distribution (KL). The Counter should be near zero; the Gambler's belief head should match its *biased* target.

### 11.5 Statistical practice

- Paired comparisons on shared shoes; bootstrap CIs [22]; report effect sizes with intervals, not just p-values.
- Pre-register the comparison list to avoid multiple-comparison inflation across the many pairwise tests.
- Use fresh seeds for every reported number (10.7).

---

## 12. Cross-Kind Comparison (Headline Experiment)

After each kind's winner is chosen and validated:

1. Run all four winners on **the same** held-out shoes (paired).
2. Report EV, log-growth, risk of ruin, drawdown, and the correlations in 11.2.
3. Add reference players: (i) the exact basic-strategy table, (ii) a hand-coded Hi-Lo counter with a standard ramp and the Illustrious 18, to calibrate how close each learned model is to the classical benchmarks [5], [29].
4. Produce plots: bankroll trajectories (median and quantile bands), bet-vs-TC ramps, bet-vs-streak scatter, EV bars with CIs, and the fidelity-degradation curve for the sloppy counters.

Sanity expectations (approximate; confirm with your own reference implementation): the Basic Strategy model and the General model land near the table's slightly negative EV; the Counter achieves positive expected growth with a reasonable spread and penetration; the Gambler underperforms on growth and has higher variance and ruin rate.

---

## 13. Pitfalls, Known Issues, and Corrections to Earlier Drafts

### 13.1 Corrections **[ADDED]**

| # | Earlier draft | Correction |
|---|---|---|
| 1 | Counter bet loss written as `-(q_bet.gather(...)).pow(2).mean()` | Sign error. Use regression to log-wealth targets (8.3). |
| 2 | Gambler lr clamp `min(max(boost, lo), hi)` with `lo = 0.5` | `boost ≥ 1`, so `lo` is inert. Remove, or add a dampening variant. |
| 3 | "Gambler's loss and lr dynamics amplify reliance on history features" | A higher lr does not create reliance on a non-predictive feature. Use the belief-head mechanism (8.4d). |
| 4 | "Gambler's-fallacy test: feed shoes with long runs of high cards" | Control for count: hold the histogram fixed and permute the order (11.4). |
| 5 | General model "bet head trained on the same reward" implied a Kelly-like ramp | A risk-neutral reward gives a bang-bang ramp (8.1). |
| 6 | Bet head needs exploration | Not needed: full-information counterfactual targets (8.3). |

### 13.2 Common implementation pitfalls

- **Hole-card leakage** into the count (4.5).
- **Masked actions** not masked inside the *target* argmax (silently inflates Q).
- **Split transitions**: bootstrapping through a branching state yields bias; use Monte-Carlo targets for the split action (4.4).
- **Stale features in replay:** the nuisance features in stored transitions must be those at decision time, not recomputed later.
- **Winner's curse** (10.7).
- **ε > 0 at evaluation:** run greedy for every contender.
- **Unequal resets:** bankroll, streak, and history must reset identically for each evaluation shoe.
- **Bankroll ruin handling:** use a fixed starting bankroll and a bust terminal state (4.6.1), or the Gambler/Counter comparison is distorted.
- **Invariance leakage in Basic Strategy:** `can_double` and `can_split` are legitimate hand features; do not include them in the nuisance set.
- **Gradient explosion** with the optimistic loss and lr boosts: clip and cap.
- **Insurance:** if enabled, add a mask entry and a state for the pre-peek decision.

### 13.3 Debugging aids

- Plot Q-value magnitudes, TD-error distributions, gradient norms, and action-agreement vs. step.
- Log the live streak and lr multiplier for the Gambler.
- Track per-feature-group ablation scores during training, not just at the end.

---

## 14. Repository Layout and Configuration

```
blackjack-agents/
├── Engineerin.md
├── configs/
│   ├── env.yaml                  # rules, penetration, bankroll, bet spread
│   ├── features.yaml             # include_engineered_count, history sizes, decay rates
│   ├── general.yaml
│   ├── basic.yaml
│   ├── counter.yaml
│   ├── gambler.yaml
│   └── tournament.yaml
├── data/
│   └── basic_strategy.csv        # generated table, with tests
├── bj/
│   ├── env/
│   │   ├── shoe.py               # shuffle, deal, cut card, seeds
│   │   ├── rules.py              # rule flags, legal actions, mask
│   │   ├── dealer.py
│   │   └── blackjack.py          # round loop, rewards, bankroll, splits
│   ├── features/
│   │   ├── layout.py             # SLICES, nuisance indices
│   │   ├── tracker.py            # seen counts, Hi-Lo, decayed counts, window
│   │   └── builder.py            # obs vector assembly, bet-phase zeroing
│   ├── models/
│   │   └── shared_net.py
│   ├── losses/
│   │   ├── td.py                 # ddqn_huber, expectile_huber
│   │   ├── basic.py              # CE + invariance KL
│   │   ├── bet.py                # full-information log-wealth loss
│   │   ├── aux.py                # count, next-card, dealer, belief
│   │   └── utility.py            # gambler_utility, prospect variant
│   ├── training/
│   │   ├── replay.py             # standard + recency-biased replay
│   │   ├── pretrain.py
│   │   ├── train_general.py
│   │   ├── train_basic.py
│   │   ├── train_counter.py
│   │   └── train_gambler.py
│   ├── eval/
│   │   ├── play.py               # greedy play with duplicate deals
│   │   ├── metrics.py            # EV, growth, ruin, drawdown
│   │   ├── probes.py             # linear probe, shuffle test, order probe
│   │   └── stats.py              # paired z, bootstrap CIs
│   ├── tournament/
│   │   ├── population.py
│   │   ├── halving.py
│   │   ├── fitness.py            # per-kind fitness
│   │   └── pbt.py
│   └── baselines/
│       ├── basic_table.py
│       └── hilo_counter.py       # hand-coded reference counter
├── tests/
└── scripts/
    └── run_all.py
```

Use dataclasses or Hydra/YAML for configs; log every run's config hash, seeds, git commit, and library versions.

---

## 15. Open Decisions

These were asked in the conversation and **not yet answered**. Defaults are used until the user decides.

| # | Question | Default |
|---|---|---|
| 1 | Should the **General** model learn bet sizing (to see if it discovers counting) or stay flat? | Flat 1 unit; run bet-head version as a separate experiment |
| 2 | Should the **Gambler** see only short-window history, or the full history with its loss pushing it to overweight the recent part? | Short window + decayed counts at fast rates, with the belief head (8.4d). The full-history variant is a second experiment |
| 3 | Should the **Counter** receive the engineered Hi-Lo feature or derive it from the raw histogram? | Engineered first (Option 1), raw as a later experiment (Option 2) |
| 4 | **Gambler fitness:** gambler-ness, bankroll survival, or composite? | Composite |
| 5 | Are the assumed rules correct (6 decks, S17, DAS, 3:2, 75% penetration, peek, no surrender)? | As in 4.1 |
| 6 | Enable the insurance action? | Off |
| 7 | Single player, or additional table players whose cards add to the count? | Single player |

---

## 16. Step-by-Step Implementation Plan

Each phase lists tasks, deliverables, and **acceptance criteria**. Do not proceed until a phase's acceptance criteria pass.

### Phase 0 — Setup and decisions

1. Create the repo layout (Section 14), Python ≥ 3.10, PyTorch [9], NumPy, pandas, matplotlib, pytest, and a config library.
2. Pin versions in `requirements.txt` / `pyproject.toml`; set up experiment logging (TensorBoard or Weights & Biases).
3. Resolve or record defaults for the open decisions (Section 15).
4. Write `configs/env.yaml` containing every rule in 4.1.

**Acceptance:** `pytest` runs (even with no tests); configs load; decisions recorded in the config files.

### Phase 1 — Shoe and dealer

1. Implement `Shoe(decks, penetration, seed)` with a seeded shuffle, `deal()`, cut-card logic, and `remaining_counts()`.
2. Implement the dealer drawing logic (S17).
3. Implement hand evaluation (hard/soft totals, blackjack, bust, pair detection).

**Acceptance:** unit tests pass for (a) 312 cards in a 6-deck shoe with 24 per rank group value 10 = 96 (tens) and 24 for every other rank; (b) deterministic shuffle per seed; (c) hand evaluation edge cases (multiple aces, soft 17).

### Phase 2 — Round engine

1. Implement the round loop: bet → deal → peek → player actions → dealer → resolution.
2. Implement legal-action masks (double on first two cards, DAS, split rules, split aces).
3. Implement sub-hand handling for splits and the Monte-Carlo split target (4.4).
4. Implement bankroll, bet clipping (`B/8`), and the bust terminal state.
5. Implement the optional insurance action behind a flag.

**Acceptance:**
- With a scripted random policy, simulate ≥ 10⁶ rounds and check: player blackjack frequency ≈ 4.7–4.8%, dealer bust frequency in the right range (~28%), no negative bankrolls, no illegal actions taken.
- With the basic-strategy table, the house edge is ≈ 0.4–0.5% within confidence. **If it is far off, fix the engine or the table before continuing** (this is the single best correctness check).

### Phase 3 — Feature tracking and builder

1. Implement `Tracker`: seen counts (visible cards only), Hi-Lo RC and TC, decks remaining, penetration, decayed counts (3 rates), last-N window, streakiness features.
2. Implement session features: bankroll ratio, outcome history, signed streak, last bet.
3. Implement `build_obs(state, phase)` with the layout of Section 6 and the bet-phase zeroing; produce `SLICES` and the nuisance index arrays.
4. Implement the `include_engineered_count` flag and the fidelity knob (noise σ, dropout p).

**Acceptance:** tests assert (a) hole card is excluded until revealed; (b) TC matches a brute-force recomputation; (c) resets happen at reshuffle and at the start of an evaluation sequence; (d) feature vector dimension equals the layout total; (e) all features lie in their normalized ranges.

### Phase 4 — Baselines

1. Generate `basic_strategy.csv` from a solver or a verified chart for the exact rule set; implement `basic_table.py` with the fallback rules (D → H, Ds → S).
2. Implement a hand-coded Hi-Lo counter with the ramp (5.3) and the Illustrious 18 as the benchmark.

**Acceptance:** the hand-coded counter shows a positive edge over many millions of rounds at the chosen penetration (approximately +0.5% to +1.5% depending on spread; a loose sanity range), and the table player matches the Phase 2 house edge.

### Phase 5 — Network and losses

1. Implement `SharedNet` (7.3) and the loss modules: `ddqn_huber`, `expectile_huber`, `basic_strategy_loss`, `bet_loss_fullinfo`, aux losses, `gambler_utility`.
2. Unit-test each loss on tiny synthetic batches: sign checks, masking, shape checks, gradient flow only into intended heads, KL non-negativity, expectile asymmetry.
3. Implement replay (uniform and recency-biased).

**Acceptance:** all loss unit tests pass; a tiny overfit test (single batch) drives each loss near zero.

### Phase 6 — Pre-training

1. Implement the shoe-state sampler for supervised pre-training (random penetration, random partial rounds).
2. Compute exact targets: TC, next-card distribution, dealer final-total distribution.
3. Pre-train a shared trunk (9.2) and save the checkpoint; then run the kind-specific stage (9.3).
4. Validate on held-out shoes.

**Acceptance:** count R² > 0.99; next-card KL near zero; dealer-outcome KL small; Basic-Strategy BC reaches ≈100% table agreement with nuisance features randomized.

### Phase 7 — Train the Basic Strategy model

1. Build the supervised dataset (all legal `(hand, upcard, mask)` combos × random nuisance).
2. Train with CE + invariance KL; sweep λ_inv.
3. Evaluate agreement, invariance, and EV vs. the table.

**Acceptance:** ≥ 99.9% agreement; max policy change under nuisance shuffle < a small tolerance (e.g., total variation < 0.01); EV statistically equal to the table's on paired shoes.

### Phase 8 — Train the General model

1. Implement the DDQN loop: ε-greedy, target sync, replay, masking, gradient clipping.
2. Warm-start from the cloned trunk; freeze/unfreeze schedule (9.4).
3. Train; log Q magnitudes, TD error, agreement with the table.

**Acceptance:** converges to near-table EV; no Q divergence; agreement with the table is high but not forced.

### Phase 9 — Train the Counter

1. Add the bet head (full-information log-wealth regression), the count aux head, and the optional next-card aux.
2. Train Option 1 (engineered count) first; record bet ramp, deviations, and the linear-probe R².
3. Run ablations: history on/off; sloppy-count σ and dropout p; Option 2 (raw histogram).

**Acceptance:** positive log-growth; bet vs. TC correlation high; reproduces several Illustrious-18 deviations (e.g., 16 vs 10 stand at TC ≥ 0, and insurance if enabled); count-shuffle collapses its performance; history ablation changes EV ≈ 0.

### Phase 10 — Train the Gambler

1. Implement mechanism (a): live-streak lr modulation; (b) expectile loss; (c) convex utility.
2. Implement mechanism (d): the belief head, the biased target, and the perception-biased action selection.
3. Implement the betting variants (hot-hand, Martingale) via the distorted objective plus the optional behavioral prior.
4. Train with gradient clipping; log lr multiplier, Q magnitudes, and bankrupt rate.

**Acceptance:** bet–streak correlation clearly nonzero in the intended direction; the order-sensitivity probe shows a shift; risk-seeking index elevated; training stable (no NaNs, bounded Q).

### Phase 11 — Populations and tournament

1. Generate N = 8–16 hyperparameter variants per kind (10.2).
2. Implement duplicate-deal evaluation, the paired z-test, bootstrap CIs, and per-kind fitness (10.4).
3. Implement successive halving (10.5), and optionally PBT (10.6).
4. Run the tournament, record all rung results and seeds, and select winners.
5. Re-evaluate winners on held-out seeds (10.7).

**Acceptance:** rung results reproducible given the seeds; winner's-curse gap computed; each winner satisfies its kind's behavioral checks (Section 11).

### Phase 12 — Cross-kind comparison and reporting

1. Run the headline experiment (Section 12) on shared held-out shoes.
2. Generate all plots and tables; archive configs, checkpoints, seeds, and logs.
3. Write a results report: what matched expectation, what did not, and why.

**Acceptance:** all headline metrics have confidence intervals; all behavioral signatures (11.2–11.4) are present for the intended kind and absent for the others.

### Phase 13 — Hardening

1. Add CI for unit tests and a smoke-training test.
2. Add determinism checks (same seed → same results).
3. Document known limitations and next steps.

---

## 17. Validation Checklist and Acceptance Criteria

**Environment**

- [ ] 6-deck composition correct; shuffle reproducible by seed
- [ ] Hole card hidden from features until revealed
- [ ] Dealer peek, S17, DAS, split-ace rules implemented
- [ ] Table player's house edge ≈ 0.4–0.5% (loose; compare with a published calculator)
- [ ] Hand-coded Hi-Lo counter has a positive edge
- [ ] No negative bankroll; bet clipping works

**Features**

- [ ] Hi-Lo TC matches brute force
- [ ] Resets at reshuffle and per evaluation shoe sequence
- [ ] Nuisance index sets correct; `can_double` / `can_split` excluded from them

**Losses**

- [ ] `bet_loss_fullinfo` has the correct sign (maximizes log wealth)
- [ ] Action masks applied in argmax, target, and softmax
- [ ] Expectile loss weights are asymmetric as intended
- [ ] Invariance KL ≥ 0 and zero when features are irrelevant

**Models**

- [ ] Basic: ≥ 99.9% agreement, invariant, EV = table
- [ ] General: near-table EV, stable
- [ ] Counter: Kelly-like ramp, deviations learned, probe R² high
- [ ] Gambler: bet–streak correlation, order-sensitivity shift, stable training

**Tournament**

- [ ] Duplicate deals used for every contender
- [ ] Per-kind fitness implemented
- [ ] Held-out validation reported
- [ ] Greedy evaluation (ε = 0)

---

## 18. Master Hyperparameter Table

| Parameter | General | Basic | Counter | Gambler |
|---|---|---|---|---|
| Loss | DDQN + Huber | CE + invariance KL (+ small TD optional) | DDQN + log-wealth bet + count MSE | Expectile DDQN + convex utility + belief KL + bet distortion |
| Optimizer | Adam | Adam | Adam | Adam |
| Learning rate | 1e-3 | 5e-4 | 1e-3 | base 1e-3 × streak multiplier (≤ 3×) |
| γ | 1 | — | 1 | 1 |
| ε schedule | 1.0 → 0.05 | none | 1.0 → 0.05 | 1.0 → 0.05 |
| Target sync | ~1k steps | — | ~1k steps | ~1k steps |
| Replay | 100k | — | 100k | 100k (recency-biased option) |
| λ_inv | — | ≈ 0.5 | — | — |
| λ_bet | — | frozen | ≈ 1.0 | ≈ 1.0 (+ λ_bias small) |
| λ_aux (count) | pre-train only | pre-train only | ≈ 0.2 | pre-train only |
| τ (expectile) | — | — | — | 0.65–0.9 (default 0.8) |
| `p_win` / `p_loss` | — | — | — | 1.3 / 0.9 |
| `alpha`, `k` | — | — | — | 1.5, 3.0 |
| `κ`, `w` | — | — | — | 0–2, 0–0.3 |
| Bet policy | flat (or bet head) | flat, frozen | Kelly head, spread 1–8 | hot-hand or Martingale |
| Grad-clip norm | 10 | 10 | 10 | 5–10 |
| Batch size | 256 | 256 | 256 | 256 |
| Trunk | 256–256 | 256–256 | 256–256 | 256–256 |

All values are starting points to be tuned inside the population search.

---

## 19. Possible Extensions

- **Rule variants:** H17, no DAS, 8 decks, surrender, different payouts (regenerate the table and indices).
- **Other counting systems:** Hi-Opt, KO, Omega II; compare their efficiency.
- **Multi-player table:** other players' cards enter the count; model table-position effects.
- **Penetration study:** growth rate vs. penetration and bet spread.
- **Recurrent (GRU) and Transformer variants** for the history pathway [17], [18], [24]; use them to verify that order adds nothing for the Counter.
- **Prospect-theory Gambler** with loss aversion and probability weighting [12], [13].
- **Adaptive-adversary casino:** a "cheat-heat" model where large bet spreads trigger shuffles.
- **Prioritized replay** [20] for faster learning of rare, high-leverage hands.
- **Distributional RL** to explicitly represent the return distribution, which makes risk-sensitive variants (CVaR-style) natural.

---

## 20. References

[1] V. Mnih *et al.*, "Human-level control through deep reinforcement learning," *Nature*, vol. 518, no. 7540, pp. 529–533, 2015.

[2] H. van Hasselt, A. Guez, and D. Silver, "Deep reinforcement learning with double Q-learning," in *Proc. AAAI Conf. Artif. Intell.*, Phoenix, AZ, USA, 2016, pp. 2094–2100.

[3] P. J. Huber, "Robust estimation of a location parameter," *Ann. Math. Statist.*, vol. 35, no. 1, pp. 73–101, 1964.

[4] D. P. Kingma and J. Ba, "Adam: A method for stochastic optimization," in *Proc. Int. Conf. Learn. Represent. (ICLR)*, San Diego, CA, USA, 2015.

[5] E. O. Thorp, *Beat the Dealer: A Winning Strategy for the Game of Twenty-One*. New York, NY, USA: Vintage Books, 1966.

[6] P. Griffin, *The Theory of Blackjack: The Compleat Card Counter's Guide to the Casino Game of 21*, 6th ed. Las Vegas, NV, USA: Huntington Press, 1999.

[7] J. L. Kelly, Jr., "A new interpretation of information rate," *Bell Syst. Tech. J.*, vol. 35, no. 4, pp. 917–926, Jul. 1956.

[8] R. R. Baldwin, W. E. Cantey, H. Maisel, and J. P. McDermott, "The optimum strategy in blackjack," *J. Amer. Statist. Assoc.*, vol. 51, no. 275, pp. 429–439, 1956.

[9] A. Paszke *et al.*, "PyTorch: An imperative style, high-performance deep learning library," in *Proc. Adv. Neural Inf. Process. Syst. (NeurIPS)*, Vancouver, BC, Canada, 2019, pp. 8024–8035.

[10] M. Jaderberg *et al.*, "Population based training of neural networks," *arXiv:1711.09846*, 2017.

[11] K. Jamieson and A. Talwalkar, "Non-stochastic best arm identification and hyperparameter optimization," in *Proc. Int. Conf. Artif. Intell. Statist. (AISTATS)*, Cadiz, Spain, 2016, pp. 240–248.

[12] D. Kahneman and A. Tversky, "Prospect theory: An analysis of decision under risk," *Econometrica*, vol. 47, no. 2, pp. 263–291, 1979.

[13] A. Tversky and D. Kahneman, "Advances in prospect theory: Cumulative representation of uncertainty," *J. Risk Uncertainty*, vol. 5, no. 4, pp. 297–323, 1992.

[14] A. Tversky and D. Kahneman, "Belief in the law of small numbers," *Psychol. Bull.*, vol. 76, no. 2, pp. 105–110, 1971.

[15] T. Gilovich, R. Vallone, and A. Tversky, "The hot hand in basketball: On the misperception of random sequences," *Cogn. Psychol.*, vol. 17, no. 3, pp. 295–314, 1985.

[16] I. Kostrikov, A. Nair, and S. Levine, "Offline reinforcement learning with implicit Q-learning," in *Proc. Int. Conf. Learn. Represent. (ICLR)*, 2022.

[17] S. Kapturowski, G. Ostrovski, J. Quan, R. Munos, and W. Dabney, "Recurrent experience replay in distributed reinforcement learning," in *Proc. Int. Conf. Learn. Represent. (ICLR)*, New Orleans, LA, USA, 2019.

[18] K. Cho *et al.*, "Learning phrase representations using RNN encoder–decoder for statistical machine translation," in *Proc. Conf. Empirical Methods Natural Lang. Process. (EMNLP)*, Doha, Qatar, 2014, pp. 1724–1734.

[19] R. S. Sutton and A. G. Barto, *Reinforcement Learning: An Introduction*, 2nd ed. Cambridge, MA, USA: MIT Press, 2018.

[20] T. Schaul, J. Quan, I. Antonoglou, and D. Silver, "Prioritized experience replay," in *Proc. Int. Conf. Learn. Represent. (ICLR)*, San Juan, Puerto Rico, 2016.

[21] G. Alain and Y. Bengio, "Understanding intermediate layers using linear classifier probes," *arXiv:1610.01644*, 2016.

[22] B. Efron and R. J. Tibshirani, *An Introduction to the Bootstrap*. New York, NY, USA: Chapman & Hall, 1993.

[23] M. Hessel *et al.*, "Rainbow: Combining improvements in deep reinforcement learning," in *Proc. AAAI Conf. Artif. Intell.*, New Orleans, LA, USA, 2018, pp. 3215–3222.

[24] A. Vaswani *et al.*, "Attention is all you need," in *Proc. Adv. Neural Inf. Process. Syst. (NeurIPS)*, Long Beach, CA, USA, 2017, pp. 5998–6008.

[25] M. Rabin, "Inference by believers in the law of small numbers," *Quart. J. Econ.*, vol. 117, no. 3, pp. 775–816, 2002.

[26] S. Ross, G. Gordon, and D. Bagnell, "A reduction of imitation learning and structured prediction to no-regret online learning," in *Proc. Int. Conf. Artif. Intell. Statist. (AISTATS)*, Fort Lauderdale, FL, USA, 2011, pp. 627–635.

[27] D. Erhan, Y. Bengio, A. Courville, P.-A. Manzagol, P. Vincent, and S. Bengio, "Why does unsupervised pre-training help deep learning?," *J. Mach. Learn. Res.*, vol. 11, pp. 625–660, 2010.

[28] M. Arjovsky, L. Bottou, I. Gulrajani, and D. Lopez-Paz, "Invariant risk minimization," *arXiv:1907.02893*, 2019.

[29] S. Wong, *Professional Blackjack*. La Jolla, CA, USA: Pi Yee Press, 1994.

[30] W. K. Newey and J. L. Powell, "Asymmetric least squares estimation and testing," *Econometrica*, vol. 55, no. 4, pp. 819–847, 1987.

[31] P. Glasserman and D. D. Yao, "Some guidelines and guarantees for common random numbers," *Manage. Sci.*, vol. 38, no. 6, pp. 884–908, 1992.

[32] O. Mihatsch and R. Neuneier, "Risk-sensitive reinforcement learning," *Mach. Learn.*, vol. 49, no. 2–3, pp. 267–290, 2002.

[33] R. Pascanu, T. Mikolov, and Y. Bengio, "On the difficulty of training recurrent neural networks," in *Proc. Int. Conf. Mach. Learn. (ICML)*, Atlanta, GA, USA, 2013, pp. 1310–1318.

[34] D. Chen, T. J. Moskowitz, and K. Shue, "Decision making under the gambler's fallacy: Evidence from asylum judges, loan officers, and baseball umpires," *Quart. J. Econ.*, vol. 131, no. 3, pp. 1181–1242, 2016.

[35] L. N. Smith, "Cyclical learning rates for training neural networks," in *Proc. IEEE Winter Conf. Appl. Comput. Vis. (WACV)*, Santa Rosa, CA, USA, 2017, pp. 464–472.

[36] R. H. Thaler and E. J. Johnson, "Gambling with the house money and trying to break even: The effects of prior outcomes on risky choice," *Manage. Sci.*, vol. 36, no. 6, pp. 643–660, 1990.

> **Citation note:** Rule-dependent numbers (house edge, Illustrious-18 indices, basic-strategy cells) come from the classical blackjack literature [5], [6], [8], [29] and **must be re-verified for the exact rule set** with a solver or published calculator before being used as ground truth. Some in-text citations ([19], [20], [23], [25]) point to optional background reading and extensions rather than to a specific claim.
