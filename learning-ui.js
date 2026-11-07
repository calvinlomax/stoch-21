'use strict';
const BJLearningUI = (() => {
  function create(api) {
    const { el, button, field, heading, panel, metric, money, pct } = api;
    const M = BJModes, E = BJEngine, R = BJRules;
    const profiles = {
      beginner: { hints: true, hintLevel: 'full', showRC: true, showTC: true, askRC: false, askTC: false, askDecks: false, cardValues: true, betHints: true, deviationHints: true, explanations: true, timing: 'immediate' },
      assisted: { hints: true, hintLevel: 'onDemand', showRC: true, showTC: true, askRC: false, askTC: false, askDecks: false, cardValues: true, betHints: true, deviationHints: true, explanations: true, timing: 'afterDecision' },
      intermediate: { hints: true, hintLevel: 'onDemand', showRC: true, showTC: true, askRC: true, askTC: true, askDecks: false, cardValues: false, betHints: true, deviationHints: true, explanations: true, timing: 'afterHand' },
      advanced: { hints: false, hintLevel: 'none', showRC: false, showTC: false, askRC: true, askTC: true, askDecks: true, cardValues: false, betHints: false, deviationHints: true, explanations: true, timing: 'afterRound' },
      expert: { hints: false, hintLevel: 'none', showRC: false, showTC: false, askRC: true, askTC: true, askDecks: true, cardValues: false, betHints: false, deviationHints: false, explanations: true, timing: 'sessionEnd' },
    };
    return new class {
      constructor() { this.game = null; this.drill = null; this.answers = []; this.pending = []; this.feedback = []; this.countChecks = {}; this.timer = null; this.clock = null; this.clockStarted = null; this.elapsed = 0; this.guideLogged = false; this.drillLogged = false; this.lastDrill = null; this.guideStarted = null; this.guideElapsed = 0; this.guideStamp = null; }
      get state() { return api.store.mode('learn'); }
      get opts() { return this.state.options; }
      mount(root) {
        if (!this.game && this.state.guided) try {
          const value = this.state.guided; this.game = M.InteractiveSession.restore(value); this.answers = value.answers || []; this.pending = value.pending || []; this.feedback = value.feedback || []; this.countChecks = value.countChecks || {}; this.guideLogged = !!value.logged; this.guideElapsed = value.elapsed || 0; this.guideStamp = value.stamp || null;
        } catch (e) { api.notice('Guided session could not be restored: ' + e.message, true); }
        if (!this.drill && this.state.drillSession) try {
          this.drill = M.DrillSession.restore(this.state.drillSession); this.elapsed = this.state.drillSession.elapsed || 0; this.drillLogged = !!this.state.drillSession.logged;
        } catch (e) { api.notice('Drill could not be restored: ' + e.message, true); }
        const reopen = !!this.settingsDialog?.open;
        const shell = el('div', { class: 'workspace-shell workspace-full' }); this.content = el('main', { class: 'mode-content' }); shell.append(this.content); root.replaceChildren(shell);
        const modal = api.settingsDialog('learn', shell, 'Learning settings'); this.settingsDialog = modal.dialog;
        const tableSettings = el('details', { class: 'settings-more' }); tableSettings.append(el('summary', {}, 'Table & strategy settings')); const tableBody = el('div'); tableSettings.append(tableBody); api.setup('learn', tableBody);
        const fields = el('div', { class: 'setup-fields' }), o = this.opts;
        modal.body.append(heading('h2', 'Learning settings', 'learn'), el('p', { class: 'mode-copy' }, 'Choose the help and feedback you want while practicing.'), fields, tableSettings);
        fields.append(heading('h3', 'Assistance & feedback', 'feedback'));
        fields.append(field('Assistance level', 'select', o.assistance, value => { o.assistance = value; Object.assign(o, profiles[value]); this.save(); this.mount(root); }, { id: 'learn-assistance', options: { beginner: 'Beginner', assisted: 'Assisted', intermediate: 'Intermediate', advanced: 'Advanced', expert: 'Expert / No Assistance' }, category: 'feedback' }));
        fields.append(field('Hint level', 'select', o.hintLevel || 'full', value => { o.hintLevel = value; this.save(); this.refresh(); }, { id: 'learn-hintLevel', options: { full: 'Show recommendations', onDemand: 'On demand', none: 'No hints' }, category: 'feedback' }));
        fields.append(field('Feedback timing', 'select', o.timing, value => { o.timing = value; this.save(); this.refresh(); }, { id: 'learn-timing', options: { immediate: 'Immediate', afterDecision: 'After decision', afterHand: 'After hand', afterRound: 'After round', sessionEnd: 'Session end' }, category: 'feedback' }));
        fields.append(field('Feedback detail', 'select', o.feedbackLevel || 'detailed', value => { o.feedbackLevel = value; this.save(); this.refresh(); }, { options: { detailed: 'Detailed explanations', brief: 'Correct answer only', off: 'No inline grading' }, category: 'feedback' }));
        fields.append(field('Count rounding', 'select', this.state.envelope.rules.bet.tcRound, value => { api.updateEnvelope(e => e.rules.bet.tcRound = value); o.drill.rounding = value; this.save(); }, { id: 'learn-rounding', options: { none: 'Unrounded', floor: 'Floor', trunc: 'Toward zero', round: 'Nearest integer' }, category: 'counting' }));
        fields.append(field('Deviation set', 'select', o.deviationSet || 'both', value => {
          o.deviationSet = value; api.updateEnvelope(e => { e.rules.play.mode = value === 'none' ? 'adjusted' : 'deviations'; const all = BJRules.defaults().play.deviations; e.rules.play.deviations = value === 'i18' ? all.slice(0, 17) : value === 'fab4' ? all.slice(17) : value === 'none' ? [] : all; if (value === 'fab4' || value === 'both') e.rules.dealer.surrender = true; }); this.save();
        }, { options: { none: 'Basic only', i18: 'Illustrious 18', fab4: 'Fab 4 (late surrender)', both: 'I18 + Fab 4 (late surrender)' }, category: 'strategy' }));
        const details = el('details'); details.append(api.summary('Individual instruction switches'));
        for (const [key, label] of [['hints', 'Basic-strategy recommendation'], ['explanations', 'Explain preferred actions'], ['showRC', 'Show running count'], ['askRC', 'Ask RC before revealing'], ['showTC', 'Show true count'], ['askTC', 'Ask TC before revealing'], ['askDecks', 'Ask decks remaining'], ['cardValues', 'Show each card’s count value'], ['betHints', 'Betting recommendation'], ['deviationHints', 'Selected-strategy / deviation hints'], ['ev', 'Estimated EV comparison'], ['postHand', 'Post-hand explanation']])
          details.append(field(label, 'checkbox', o[key], value => { o[key] = value; this.save(); this.refresh(); }, { id: 'learn-' + key, category: /count|RC|TC|decks|card/i.test(label) ? 'counting' : 'feedback' }));
        fields.append(details, button('Learning mathematics', () => api.help('Running count, Hi-Lo and true count', null, 'counting')));
        this.refresh(); if (reopen) modal.dialog.showModal();
      }
      save() {
        if (this.game) this.state.guided = { ...this.game.dump(), answers: this.answers, pending: this.pending, feedback: this.feedback, countChecks: this.countChecks, logged: this.guideLogged, elapsed: this.guideSeconds(), stamp: this.guideStamp };
        if (this.drill) this.state.drillSession = { ...this.drill.dump(), elapsed: this.questionSeconds(), logged: this.drillLogged };
        api.persist();
      }
      guideSeconds() { return this.guideElapsed + (this.guideStarted == null ? 0 : (performance.now() - this.guideStarted) / 1000); }
      pause() { if (this.guideStarted != null) this.guideElapsed += (performance.now() - this.guideStarted) / 1000; this.guideStarted = null; clearTimeout(this.timer); clearInterval(this.clock); if (this.clockStarted != null) this.elapsed += (performance.now() - this.clockStarted) / 1000; this.clockStarted = null; this.save(); }
      questionSeconds() { return this.elapsed + (this.clockStarted == null ? 0 : (performance.now() - this.clockStarted) / 1000); }
      refresh() {
        if (!this.content || api.active !== 'learn') return;
        clearTimeout(this.timer); this.content.replaceChildren();
        this.content.append(el('div', { class: 'mode-eyebrow' }, 'LEARN · UNDERSTAND THE DECISION'), heading('h1', 'Build your blackjack intuition', 'learn'), el('p', { class: 'mode-copy' }, 'Practice real hands or isolate a concept. Feedback, hints and progress belong to this workspace.'));
        this.content.append(button('Learning settings', () => this.settingsDialog.showModal()));
        const tabs = el('div', { class: 'mode-subtabs', 'aria-label': 'Learning submodes' });
        for (const [key, label] of [['guided', 'Guided Learning'], ['drills', 'Training / Drills'], ['progress', 'Progress']]) {
          const b = button(label, () => { this.pause(); this.opts.submode = key; this.save(); this.refresh(); }); b.setAttribute('aria-pressed', this.opts.submode === key); b.dataset.learnTab = key; tabs.append(b, api.info(label, null, key === 'drills' ? 'drills' : 'feedback'));
        }
        this.content.append(tabs);
        if (this.opts.submode === 'drills') this.renderDrills(); else if (this.opts.submode === 'progress') this.renderProgress(); else this.renderGuided();
      }
      beginGuided() {
        if (this.game && !this.game.ended && this.game.stats.rounds && !confirm('Replace this guided session?')) return;
        this.pause(); this.game = new M.InteractiveSession(api.configuration('learn', true), true); this.answers = []; this.pending = []; this.feedback = []; this.countChecks = {}; this.guideLogged = false;
        this.game.startRound(); this.save(); this.refresh();
      }
      stamp() { return this.game.serial + ':' + this.game.stats.rounds + ':' + this.game.sim.shoe.length; }
      renderGuided() {
        const g = this.game, o = this.opts, actions = el('div', { class: 'mode-controls' });
        actions.append(button(g ? 'New guided session' : 'Start guided session', () => this.beginGuided(), true));
        if (g) actions.append(button('Finish guided session', () => { g.finish(); this.flush('sessionEnd'); this.logProgress('guided', this.answers); this.guideLogged = true; this.save(); this.refresh(); }), button('Export learning session', () => api.download('blackjack-guided-session.json', { game: g.dump(), answers: this.answers, summary: M.learningSummary(this.answers) })));
        this.content.append(actions);
        if (!g) { this.content.append(api.table(null, api.configuration('learn'), null)); return; }
        if (g.prompt && !g.ended) { const stamp = this.stamp(); if (this.guideStamp !== stamp) { this.guideStamp = stamp; this.guideElapsed = 0; this.guideStarted = null; } if (this.guideStarted == null) this.guideStarted = performance.now(); }
        const summary = M.learningSummary(this.answers), hideGrade = o.timing === 'sessionEnd' && !g.ended, metrics = el('div', { class: 'metrics' });
        metric(metrics, 'Questions answered', summary.attempted, 'drills'); metric(metrics, 'Accuracy', hideGrade ? 'Held until session end' : pct(summary.accuracy), 'drills'); this.bankMetric = metric(metrics, 'Bankroll', money(g.sim.players.find(p => p.seat === g.config.heroSeat).balance)); metric(metrics, 'Hands played', g.stats.hands); metric(metrics, 'Average response time', summary.averageSeconds.toFixed(2) + ' s', 'drills'); this.content.append(metrics);
        this.tableHost = el('div'); this.content.append(this.tableHost); this.renderGuidedSnapshot(g.snapshot || g.sim.snap(null));
        if (g.ended) { this.flush('sessionEnd'); this.logProgress('guided', this.answers); this.guideLogged = true; this.save(); this.content.append(heading('h2', 'Guided session review', 'drills')); this.review(this.content, this.answers); this.renderProgress(this.content); return; }
        const bar = el('div', { class: 'game-action-bar', 'aria-label': 'Guided learning actions' }); this.content.append(bar);
        const p = g.prompt, checks = this.countChecks[this.stamp()];
        if (p && !checks && (o.askRC || o.askTC || o.askDecks)) {
          bar.append(heading('h3', 'Check the visible count before your decision', 'counting')); const row = el('div', { class: 'count-entry' }), inputs = {};
          for (const [key, label] of [['askRC', 'Running count'], ['askTC', 'True count'], ['askDecks', 'Decks remaining']]) if (o[key]) {
            const input = el('input', { id: 'guided-' + key, type: 'number', step: 'any', 'aria-label': label }); const wrapper = el('div', { class: 'field' }); wrapper.append(el('label', { for: input.id }, label), input); row.append(wrapper); inputs[key] = input;
          }
          row.append(button('Submit count estimates', () => {
            const rc = g.sim.count, decks = g.sim.shoe.length / 52, tc = R.roundCount(decks ? rc / decks : 0, g.sim.rules.bet.tcRound);
            for (const [key, input] of Object.entries(inputs)) if (input.value === '' || !Number.isFinite(+input.value)) throw Error('Enter every requested estimate.');
            for (const [key, input] of Object.entries(inputs)) {
              const expected = key === 'askRC' ? rc : key === 'askTC' ? tc : decks, tolerance = key === 'askRC' ? 0 : key === 'askDecks' ? o.drill.tolerance : g.sim.rules.bet.tcRound === 'none' ? .1 : 0;
              this.grade({ category: key === 'askRC' ? 'runningSingle' : key === 'askTC' ? 'trueCount' : 'decks', response: +input.value, answer: expected,
                correct: Math.abs(+input.value - expected) <= tolerance, seconds: this.guideSeconds(), round: g.stats.rounds + 1, hand: p.handIndex ?? 0,
                explanation: key === 'askTC' ? `TC = RC / decks = ${rc} / ${decks.toFixed(4)}; ${g.sim.rules.bet.tcRound} gives ${tc}.` : key === 'askDecks' ? `${g.sim.shoe.length} unseen positions / 52 = ${decks.toFixed(4)} decks.` : `The revealed-card running count is ${rc}; the hidden hole card is excluded.` });
            }
            this.countChecks[this.stamp()] = true; this.guideElapsed = 0; this.guideStarted = performance.now(); this.save(); this.refresh();
          }, true)); bar.append(row); return;
        }
        if (!p) {
          bar.append(el('p', { class: 'game-result' }, g.result?.voided ? 'The exhausted-shoe round was refunded.' : `Round ${g.stats.rounds} settled. Your result: ${money(g.sim.lastResult?.seats.find(p => p.seat === g.config.heroSeat)?.profit || 0)}.`), button('Next guided hand', () => { g.startRound(); this.save(); this.refresh(); }, true));
          if (o.postHand && this.answers.length && o.timing !== 'sessionEnd') bar.append(el('p', { class: 'mode-copy' }, this.answers.at(-1).explanation));
        } else if (p.kind === 'bet') {
          bar.append(heading('h3', 'Choose an opening wager', 'betting'));
          const input = el('input', { type: 'number', id: 'guided-wager', min: p.minimum, max: p.maximum, step: g.config.rules.limits.chip, value: p.suggested, 'aria-label': 'Guided opening wager' });
          bar.append(input, button('Deal guided hand', () => this.guideAnswer(+input.value), true));
          if (o.betHints && o.assistance !== 'expert' && o.hintLevel !== 'none') bar.append(el('p', { class: 'hint-box' }, `The selected bet model recommends ${money(p.suggested * 100)} after table, bankroll, and chip constraints. This is a model recommendation, not a guaranteed profitable wager.`));
        } else if (p.kind === 'insurance') {
          bar.append(heading('h3', 'Insurance decision', 'betting'), el('p', {}, 'Dealer shows an ace. Insurance costs ' + money(p.cost) + '.'));
          const take = button('Take insurance', () => this.guideAnswer(true)); take.disabled = !p.affordable; bar.append(take, button('Decline insurance', () => this.guideAnswer(false)));
        } else {
          bar.append(heading('h3', 'Your action · hand ' + (p.handIndex + 1), 'strategy')); const row = el('div', { class: 'mode-controls' });
          for (const action of R.ACTIONS) { const b = button(action[0].toUpperCase() + action.slice(1), () => this.guideAnswer(action), action === 'hit' || action === 'stand'); b.dataset.learnAction = action; b.disabled = !p.actions.includes(action); row.append(b); } bar.append(row);
          const show = () => {
            const rec = M.advise(p, g.sim, !!o.deviationHints, !!o.ev), text = o.explanations ? rec.explanation : 'Recommended: ' + rec.action;
            const box = el('div', { class: 'hint-box' }, text); if (rec.ev) box.append(el('p', {}, 'Estimated EV per initial wager: ' + Object.entries(rec.ev).map(([a, v]) => `${a} ${v.toFixed(3)}`).join(' · ') + '. Finite-composition Monte Carlo estimates have sampling error.')); bar.append(box);
          };
          if (o.hints && o.assistance !== 'expert' && o.hintLevel !== 'none') {
            if ((o.hintLevel || 'full') === 'full') show(); else bar.append(button('Show strategy hint', show));
          } else if (o.ev && o.assistance !== 'expert') bar.append(button('Compare estimated action EV', show));
        }
        if (this.feedback.length && o.feedbackLevel !== 'off') {
          const block = panel('Learning feedback', 'feedback');
          for (const answer of this.feedback.slice(-6)) { const p = el('div', { class: 'feedback-box ' + (answer.correct ? 'correct' : 'incorrect') }); p.append(el('strong', {}, answer.correct ? 'Correct' : 'Incorrect — preferred answer: ' + answer.answer)); if (o.feedbackLevel !== 'brief') p.append(el('p', {}, answer.explanation)); block.body.append(p); }
          this.content.append(block);
        }
      }
      renderGuidedSnapshot(snapshot) {
        if (!this.game || !this.tableHost) return; const o = this.opts, answered = this.countChecks[this.stamp()], earlyReveal = ['immediate', 'afterDecision'].includes(o.timing);
        const rc = snapshot.count, tc = snapshot.remaining ? R.roundCount(rc * 52 / snapshot.remaining, this.game.sim.rules.bet.tcRound) : 0;
        const r = o.showRC && (!o.askRC || answered && earlyReveal) ? 'RC ' + rc : 'RC hidden', t = o.showTC && (!o.askTC || answered && earlyReveal) ? 'TC ' + tc.toFixed(2) : 'TC hidden';
        const player = snapshot.players.find(p => p.seat === this.game.config.heroSeat); if (player && this.bankMetric) this.bankMetric.querySelector('.stat-value').textContent = money(player.balance);
        this.tableHost.replaceChildren(api.table(snapshot, this.game.config, this.game.prompt, o.cardValues && o.assistance !== 'expert', r + ' · ' + t, o.askDecks && (!answered || !earlyReveal)));
      }
      grade(row) { this.answers.push(row); if (['immediate', 'afterDecision'].includes(this.opts.timing)) this.feedback.push(row); else this.pending.push(row); }
      flush(boundary, hand) { const timing = this.opts.timing; const keep = [];
        for (const row of this.pending) { if (boundary === 'sessionEnd' || timing === 'afterRound' && boundary === 'afterRound' || timing === 'afterHand' && (boundary === 'afterRound' || boundary === 'afterHand' && row.hand === hand)) this.feedback.push(row); else keep.push(row); } this.pending = keep;
      }
      guideAnswer(value) {
        clearTimeout(this.timer); const g = this.game, p = g.prompt; let row;
        if (p.kind === 'decision') {
          const basic = M.advise(p, g.sim), rec = this.opts.deviationHints ? M.advise(p, g.sim, true) : basic;
          const hand = E.handValue(p.hand.cards), pair = p.hand.cards.length === 2 && E.rankValue(p.hand.cards[0].rank) === E.rankValue(p.hand.cards[1].rank);
          row = { category: rec.action !== basic.action ? rec.action === 'surrender' ? 'fab4' : 'i18' : pair ? 'pair' : hand.soft ? 'soft' : 'hard', response: value, answer: rec.action, correct: value === rec.action, seconds: this.guideSeconds(), round: g.stats.rounds + 1, hand: p.handIndex, explanation: rec.explanation };
        } else if (p.kind === 'bet') row = { category: 'bet', response: value, answer: p.suggested, correct: Math.abs(value - p.suggested) <= this.opts.drill.tolerance, seconds: this.guideSeconds(), round: g.stats.rounds + 1, hand: 0, explanation: 'The selected bet-sizing model recommends ' + money(p.suggested * 100) + ' after the common limits and chip grid.' };
        else row = { category: 'i18', response: value ? 'take' : 'decline', answer: g.sim.count * 52 / g.sim.shoe.length >= g.sim.rules.play.insuranceIndex && p.affordable ? 'take' : 'decline', correct: value === (g.sim.count * 52 / g.sim.shoe.length >= g.sim.rules.play.insuranceIndex && p.affordable), seconds: this.guideSeconds(), round: g.stats.rounds + 1, hand: 0, explanation: 'The configured Hi-Lo insurance index is ' + g.sim.rules.play.insuranceIndex + '. Insurance pays 2:1 and is a separate wager.' };
        g.answer(value); this.grade(row);
        if (!g.prompt) this.flush('afterRound'); else if (p.kind === 'decision' && g.prompt.handIndex !== p.handIndex) this.flush('afterHand', p.handIndex);
        this.save(); clearTimeout(this.timer);
        const frames = g.frames; if (!frames.length) { this.refresh(); return; }
        this.guideStarted = null; this.guideElapsed = 0; this.content.querySelectorAll('.game-action-bar button').forEach(b => b.disabled = true); let i = 0;
        const tick = () => { if (api.active !== 'learn' || this.opts.submode !== 'guided') return;
          if (i < frames.length) { this.renderGuidedSnapshot(frames[i++]); this.timer = setTimeout(tick, 400 / this.opts.speed); } else this.refresh(); }; tick();
      }
      logProgress(kind, answers) {
        if (kind === 'guided' && this.guideLogged || kind === 'drills' && this.drillLogged || !answers.length) return;
        for (const row of answers) M.scoring(this.state.progress, row);
        this.state.progress.sessions.push({ kind, date: new Date().toISOString(), assistance: this.opts.assistance, ...M.learningSummary(answers) });
        this.state.progress.sessions = this.state.progress.sessions.slice(-100); api.persist();
      }
      renderDrills() {
        const o = this.opts, settings = o.drill, configPanel = panel('Choose a focused drill', 'drills'), fields = el('div', { class: 'settings-grid' });
        fields.append(field('Question category', 'select', settings.category, value => { settings.category = value; this.save(); }, { id: 'drill-category', options: M.DRILLS, category: 'drills' }));
        fields.append(field('Difficulty', 'select', o.difficulty, value => { o.difficulty = value; Object.assign(settings, value === 'easy' ? { countMin: -5, countMax: 5, simultaneous: 3, timeLimit: 60, flashSeconds: 5 } : value === 'hard' ? { countMin: -20, countMax: 20, simultaneous: 10, timeLimit: 10, flashSeconds: 1 } : { countMin: -10, countMax: 10, simultaneous: 5, timeLimit: 30, flashSeconds: 3 }); this.save(); this.refresh(); }, { options: { easy: 'Easy', standard: 'Standard', hard: 'Hard' }, category: 'drills' }));
        for (const [key, label, min, max, step] of [['questions', 'Number of questions', 1, 500, 1], ['simultaneous', 'Cards shown together', 1, 30, 1], ['timeLimit', 'Seconds per question', 1, 600, 1], ['flashSeconds', 'Speed-drill card exposure, s', .1, 60, .1], ['countMin', 'Minimum running count', -100, 100, 1], ['countMax', 'Maximum running count', -100, 100, 1], ['tolerance', 'Numeric error tolerance', 0, 100, .01]])
          fields.append(field(label, 'number', settings[key], value => { settings[key] = value; this.save(); }, { id: 'drill-' + key, min, max, step, category: 'drills' }));
        const categories = el('details'); categories.append(api.summary('Categories in mixed practice'));
        for (const [key, title] of Object.entries(M.DRILLS)) if (key !== 'mixed') categories.append(field(title, 'checkbox', settings.categories.includes(key), value => { settings.categories = value ? [...new Set([...settings.categories, key])] : settings.categories.filter(x => x !== key); this.save(); }, { category: 'drills' }));
        configPanel.body.append(fields, categories, button('Start drill session', () => { this.pause(); const cfg = api.configuration('learn', true); this.drill = new M.DrillSession(settings, cfg, cfg.seed); this.drillLogged = false; this.lastDrill = null; this.elapsed = 0; this.drill.next(); this.save(); this.refresh(); }, true)); this.content.append(configPanel);
        if (!this.drill) return;
        const drill = this.drill, summary = M.learningSummary(drill.answers), held = o.timing === 'sessionEnd' && !drill.finished;
        const metrics = el('div', { class: 'metrics' }); metric(metrics, 'Answered', `${summary.attempted} / ${drill.settings.questions}`, 'drills'); metric(metrics, 'Accuracy', held ? 'Held until session end' : pct(summary.accuracy), 'drills'); metric(metrics, 'Average response time', summary.averageSeconds.toFixed(2) + ' s', 'drills'); metric(metrics, 'Current / best streak', held ? 'Held until session end' : summary.streak + ' / ' + summary.best, 'drills'); this.content.append(metrics);
        const stage = panel(drill.finished ? 'Drill results' : 'Practice', 'drills'); this.content.append(stage);
        if (drill.finished) { this.logProgress('drills', drill.answers); this.drillLogged = true; this.save(); stage.body.append(el('p', { class: 'game-result' }, `Session score ${summary.score} · ${summary.correct}/${summary.attempted} correct`)); this.review(stage.body, drill.answers); stage.body.append(button('Export drill review', () => api.download('blackjack-learning-review.json', { summary, answers: drill.answers }))); this.renderProgress(this.content); return; }
        const q = drill.question;
        if (!q) {
          const row = drill.answers.at(-1);
          if (!held && o.feedbackLevel !== 'off') stage.body.append(el('div', { class: 'feedback-box ' + (row.correct ? 'correct' : 'incorrect') }, `${row.correct ? 'Correct' : row.timedOut ? 'Time limit reached' : 'Incorrect'}. Answer: ${row.answer}. ${o.feedbackLevel === 'brief' ? '' : row.explanation}`));
          else stage.body.append(el('p', {}, 'Answer recorded. Feedback will appear in the session review.'));
          stage.body.append(button('Next question', () => { this.elapsed = 0; this.clockStarted = null; drill.next(); this.save(); this.refresh(); }, true));
        } else {
          const body = el('div', { class: 'drill-stage' }); body.append(el('span', { id: 'learn-clock', class: 'drill-timer', 'aria-live': 'off' }, ''), heading('h3', M.DRILLS[q.category], 'drills'), el('p', {}, q.prompt));
          if (q.cards?.length) { const cards = el('div', { class: 'cards', id: 'drill-cards' }); api.renderCards(cards, q.cards); body.append(cards); }
          if (q.dealer) { body.append(el('p', {}, 'Dealer upcard')); const dealer = el('div', { class: 'cards' }); api.renderCards(dealer, [q.dealer]); body.append(dealer); }
          if (q.fill != null) { const shoe = el('div', { class: 'deck-estimate', role: 'img', 'aria-label': 'A partially full shoe for deck estimation' }), fill = el('div', { class: 'deck-estimate-fill' }); fill.style.setProperty('--fill', 100 * q.fill + '%'); shoe.append(fill); body.append(shoe); }
          const answer = el('div', { class: 'drill-answer' });
          if (q.options) for (const action of q.options) answer.append(button(action[0].toUpperCase() + action.slice(1), () => this.submitDrill(action), action === 'hit' || action === 'stand'));
          else { const input = el('input', { id: 'drill-answer', type: 'number', step: 'any', 'aria-label': 'Your drill answer', autocomplete: 'off' }); input.onkeydown = e => { if (e.key === 'Enter') api.guarded(() => this.submitDrill(input.value)); }; answer.append(input, button('Submit answer', () => { if (input.value === '') throw Error('Enter an answer.'); this.submitDrill(input.value); }, true)); }
          body.append(answer);
          if (o.assistance !== 'expert' && o.hintLevel !== 'none') body.append(button('Hint / formula', () => { q.hintUsed = true; this.save(); api.help('Practice hint', q.category.startsWith('running') || q.category === 'cardValue' ? 'Apply the Hi-Lo tags to the cards shown and add the changes to the prior running count.' : q.category === 'trueCount' ? 'Divide running count by the displayed decks remaining, then apply the selected rounding convention.' : q.category === 'bet' ? 'Use the configured wager function, then enforce table, bankroll, spread and chip constraints.' : 'Identify hard/soft/pair totals, the dealer upcard and legal actions before applying the rule-adjusted strategy.', q.category === 'bet' ? 'betting' : 'counting'); }));
          stage.body.append(body); this.startClock();
        }
        stage.body.append(button('Finish practice now', () => { this.pause(); drill.finished = true; drill.question = null; this.logProgress('drills', drill.answers); this.drillLogged = true; this.save(); this.refresh(); }));
      }
      startClock() {
        clearInterval(this.clock); if (this.clockStarted == null) this.clockStarted = performance.now();
        const tick = () => { if (api.active !== 'learn' || this.opts.submode !== 'drills' || !this.drill?.question) return;
          const elapsed = this.questionSeconds(), left = Math.max(0, this.drill.settings.timeLimit - elapsed), label = document.getElementById('learn-clock'); if (label) label.textContent = left.toFixed(1) + ' s remaining';
          const cards = document.getElementById('drill-cards'); if (cards && this.drill.question.category === 'runningSpeed' && elapsed >= this.drill.settings.flashSeconds) { cards.replaceChildren(el('p', {}, 'Cards hidden · enter the running count')); }
          if (!left) api.guarded(() => this.submitDrill('', true)); };
        this.clock = setInterval(tick, 100); tick();
      }
      submitDrill(value, timedOut = false) {
        const seconds = this.questionSeconds(); clearInterval(this.clock); this.clockStarted = null; this.elapsed = 0;
        this.lastDrill = this.drill.answer(value, seconds, timedOut); this.save(); this.refresh();
      }
      review(parent, answers) {
        const summary = M.learningSummary(answers), topics = Object.entries(summary.byCategory).sort((a, b) => a[1].correct / a[1].attempted - b[1].correct / b[1].attempted);
        parent.append(heading('h3', 'Concept accuracy', 'drills')); const grid = el('div', { class: 'progress-topics' });
        for (const [category, stats] of topics) { const box = el('div', { class: 'topic-progress' }); box.append(el('strong', {}, M.DRILLS[category] || category), el('p', {}, `${stats.correct}/${stats.attempted} · ${pct(stats.correct / stats.attempted)} · ${(stats.seconds / stats.attempted).toFixed(2)} s average`)); grid.append(box); } parent.append(grid);
        const incorrect = answers.filter(row => !row.correct), review = el('div', { class: 'mode-review' });
        parent.append(heading('h3', 'Post-session answer review', 'drills'));
        if (!incorrect.length) review.append(el('p', {}, 'No incorrect answers in this session.'));
        for (const row of incorrect) { const line = el('div', { class: 'review-row' }); line.append(el('strong', {}, `${M.DRILLS[row.category] || row.category} · your answer ${row.response === '' ? '(no answer)' : row.response}; correct ${row.answer}`), el('p', {}, row.explanation)); if (row.rule) line.append(el('p', {}, row.rule)); if (row.cards?.length) { const cards = el('div', { class: 'cards' }); api.renderCards(cards, row.cards); line.append(cards); } review.append(line); } parent.append(review);
        if (topics.length) parent.append(el('p', { class: 'hint-box' }, `Suggested practice: ${topics.slice(0, 3).map(([key]) => M.DRILLS[key] || key).join(', ')}. Strongest concept: ${M.DRILLS[topics.at(-1)[0]] || topics.at(-1)[0]}.`));
      }
      renderProgress(parent = this.content) {
        const progress = this.state.progress, section = panel('Progress over time', 'drills');
        section.body.append(el('p', { class: 'mode-copy' }, `${progress.sessions.length} saved sessions. Scores reflect the selected assistance level, categories, timing, and rule set; they are not an unassisted-skill estimate.`));
        const chart = el('canvas', { 'aria-label': 'Learning accuracy across saved sessions' }), wrap = el('div', { class: 'game-chart' }); wrap.append(chart); section.body.append(wrap);
        const topics = Object.entries(progress.categories).sort((a, b) => a[1].correct / a[1].attempted - b[1].correct / b[1].attempted), list = el('div', { class: 'progress-topics' });
        for (const [key, value] of topics) { const p = el('div', { class: 'topic-progress' }); p.append(el('strong', {}, M.DRILLS[key] || key), el('p', {}, `${value.attempted} attempts · ${pct(value.correct / value.attempted)}`), button('Practice concept', () => { this.opts.submode = 'drills'; this.opts.drill.category = M.DRILLS[key] ? key : 'mixed'; this.save(); this.refresh(); })); list.append(p); }
        section.body.append(list); if (!topics.length) section.body.append(el('p', {}, 'Complete a guided or drill session to build a concept history.'));
        parent.append(section); requestAnimationFrame(() => api.chart(chart, [{ label: 'Accuracy', color: '#a5bfe5', points: progress.sessions.filter(s => s.accuracy != null).map((s, i) => ({ x: i + 1, y: s.accuracy })) }], { unit: '%' }));
      }
    };
  }
  return { create };
})();
