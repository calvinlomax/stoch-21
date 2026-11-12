'use strict';
const BJLaboratoryUI = (() => {
  function create(api) {
    const L = BJLab, M = BJModes, { el, button, field, heading, panel, metric, pct, money } = api;
    return new class {
      constructor() {
        this.loaded = false; this.loading = false; this.state = null; this.workers = []; this.shards = []; this.running = false;
        this.stageIndex = 0; this.tick = 0; this.cursor = null; this.filter = ''; this.parameter = 'decks'; this.replayTimer = null; this.workerKind = 'Not started'; this.pendingUpdates = []; this.pendingStates = []; this.awaiting = 0; this.generation = 0; this.analysisId = 0; this.pendingPersists = new Set();
      }
      get mode() { return api.store.mode('laboratory'); }
      get settings() { return this.mode.labSettings ||= L.defaults(); }
      get strategies() { return this.settings.strategies ||= []; }
      ensureStrategies() {
        if (!this.strategies.length) this.strategies.push({ id: 's1', name: 'Strategy 1', envelope: M.clone(this.mode.envelope) }, { id: 's2', name: 'Strategy 2', envelope: M.clone(this.mode.envelope) });
      }
      strategyEnvelope(strategy) {
        const e = M.clone(this.mode.envelope), own = strategy.envelope;
        for (const key of ['starting', 'baseBet', 'finite', 'countSystem']) e.fields[key] = own.fields[key];
        for (const key of ['play', 'bet', 'analytics']) e.rules[key] = M.clone(own.rules[key]);
        e.rules.limits = { ...M.clone(own.rules.limits), tableMax: e.rules.limits.tableMax };
        return e;
      }
      editSettings(strategy = null) {
        const e = strategy ? this.strategyEnvelope(strategy) : M.clone(this.mode.envelope), o = this.mode.options;
        const enums = (...items) => Object.fromEntries(items);
        const rows = strategy ? [
          ['play.mode', 'Playing strategy', BJRules.PLAYS], ['bet.mode', 'Bet sizing strategy', BJRules.BETS],
          ['$countSystem', 'Count system', { hiLo: 'Hi-Lo', hiOptI: 'Hi-Opt I', none: 'No counting' }],
          ['starting', 'Starting bankroll $', 'number', 1, 100000000, 1], ['baseBet', 'Base wager $', 'number', 1, 1000000, 1], ['finite', 'Enforce bankroll limits', 'boolean'],
        ] : [
          ['decks', 'Decks', 'number', 1, 8, 1], ['penetration', 'Penetration %', 'number', 20, 95, .0001],
          ['dealer.mode', 'Dealer soft 17', { S17: 'Stand (S17)', H17: 'Hit (H17)', custom: 'Custom thresholds' }],
          ['payout.preset', 'Blackjack payout', enums(['3:2', '3:2'], ['6:5', '6:5'], ['1:1', '1:1'], ['2:1', '2:1'], ['custom', 'Custom ratio'])],
          ['minBet', 'Table minimum $', 'number', 1, 1000000, 1], ['limits.tableMax', 'Table maximum $', 'number', .01, 100000000, .01],
          ['$opponents', 'Number of opponents', 'number', 0, 4, 1], ['$heroSeat', 'Your seating position', { 0: 'First seat', 1: 'Second seat', 2: 'Center seat', 3: 'Fourth seat', 4: 'Last seat' }],
          ['opponents.skill', 'Opponent skill', BJRules.SKILLS], ['opponents.bet', 'Opponent betting', BJRules.OPPBETS],
          ['$speed', 'Game speed', { 1: '1×', 2: '2×', 5: '5×', 10: '10×', 25: '25×' }],
          ['seed', 'Random seed', 'number', 0, 4294967295, 1], ['$countVisibility', 'Count display', { hidden: 'Hidden', running: 'Running count', true: 'True count', both: 'Running & true' }],
        ];
        const extras = { countSystem: e.fields.countSystem || 'hiLo', opponents: e.seats.filter(p => p.active && p.seat !== +e.fields.heroSeat).length, heroSeat: String(e.fields.heroSeat), speed: String(o.speed), countVisibility: o.countVisibility }, initial = JSON.stringify([e, extras]);
        RuleSettings.open({ title: strategy ? `${strategy.name} settings` : 'Table settings', envelope: e, generalRows: rows, penetrationControl: !strategy,
          pages: strategy ? ['play', 'bet', 'limits', 'analytics'] : ['dealer', 'payout', 'opponents', 'analytics'], pageNames: strategy ? {} : { analytics: 'Display & analytics' }, decisionRules: !!strategy,
          excludePaths: strategy ? ['minBet', 'limits.tableMax', 'analytics.mode'] : ['analytics.precision', 'analytics.round', 'bet.edgeModel', 'bet.edgeBase', 'bet.edgeSlope', 'bet.edgeExpression', 'bet.variance'],
          extras,
          onApply: async (draft, extra) => {
            if (!Number.isInteger(+extra.opponents) || +extra.opponents < 0 || +extra.opponents > 4) throw Error('Number of opponents must be between 0 and 4.');
            if (JSON.stringify([draft, extra]) !== initial && !await this.beforeStrategyChange()) return false;
            if (strategy) { draft.fields.countSystem = extra.countSystem; strategy.envelope = draft; }
            else { o.speed = +extra.speed; o.countVisibility = extra.countVisibility; api.updateEnvelope(target => { for (const key of ['decks', 'penetration', 'penetrationMode', 'penetrationSigma', 'minBet', 'seed']) target.fields[key] = draft.fields[key]; const changedSeats = +target.fields.heroSeat !== +extra.heroSeat || target.seats.filter(p => p.active && p.seat !== +target.fields.heroSeat).length !== +extra.opponents; target.fields.heroSeat = extra.heroSeat; if (changedSeats) target.seats = M.seats(+extra.opponents, '', +extra.heroSeat); for (const key of ['dealer', 'payout', 'opponents', 'analytics']) target.rules[key] = M.clone(draft.rules[key]); target.rules.limits.tableMax = draft.rules.limits.tableMax; }); }
            api.persist();
          } });
      }
      designSettings() {
        const settings = M.clone(this.settings);
        if (settings.multiEnabled) { settings.compare = false; settings.strategies = this.strategies.map(s => ({ id: s.id, name: s.name, config: M.config(this.strategyEnvelope(s)) })); }
        return settings;
      }
      async database() {
        if (!('indexedDB' in window)) throw Error('IndexedDB is unavailable.');
        if (this.db) return this.db;
        this.db = await new Promise((resolve, reject) => { const r = indexedDB.open('blackjack-laboratory-v1', 1); r.onupgradeneeded = () => r.result.createObjectStore('runs'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); return this.db;
      }
      async clearSaved() {
        this.clearing = true; this.stop();
        if (this.state?.status === 'running') this.state.status = 'paused';
        try {
          await Promise.allSettled([...this.pendingPersists]);
          if ('indexedDB' in window) { const db = await this.database(); await new Promise((resolve, reject) => { const tx = db.transaction('runs', 'readwrite'); tx.objectStore('runs').delete('latest'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('Could not clear saved experiment.')); }); }
          try { localStorage.removeItem('blackjack.lab.backup'); } catch {}
          this.state = null; this.finalSummary = null; this.tick = 0; this.cursor = null; this.filter = ''; this.drillStrategy = ''; this.drillEnvironment = this.drillSession = null;
        } finally { this.clearing = false; }
      }
      async load() {
        if (this.loading || this.loaded) return; this.loading = true;
        try { const db = await this.database(); const saved = await new Promise((resolve, reject) => { const r = db.transaction('runs').objectStore('runs').get('latest'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
          if (saved?.version === 1) { this.state = saved; if (saved.status === 'running') this.state.status = 'paused'; this.tick = saved.tick || 0; this.stageIndex = 3; }
        } catch { try { this.state = JSON.parse(localStorage.getItem('blackjack.lab.backup')); if (this.state) { this.state.status = 'paused'; this.stageIndex = 3; } } catch {} }
        this.loaded = true; this.loading = false; if (api.active === 'laboratory') this.mount(document.getElementById('modeWorkspace'));
      }
      persist() {
        if (!this.state || this.clearing) return Promise.resolve();
        const state = this.state; state.tick = this.tick;
        const task = (async () => {
          try { const db = await this.database(); await new Promise((resolve, reject) => { const tx = db.transaction('runs', 'readwrite'); tx.objectStore('runs').put(state, 'latest'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('Experiment save was aborted.')); }); }
          catch { try { localStorage.setItem('blackjack.lab.backup', JSON.stringify(state)); } catch { api.notice('Laboratory results remain in memory; browser storage is unavailable or full. Export results to retain them.', true); } }
        })();
        this.pendingPersists.add(task); task.finally(() => this.pendingPersists.delete(task)); return task;
      }
      clearDialog(title, message, options) {
        return new Promise(resolve => {
          const dialog = el('dialog', { class: 'workspace-dialog lab-confirm-dialog', 'aria-label': title }), actions = el('div', { class: 'dialog-actions' }), status = el('p', { class: 'mode-copy', role: 'status' }); let finished = false;
          const finish = value => { if (finished) return; finished = true; dialog.close(); dialog.remove(); resolve(value); };
          dialog.append(el('h2', {}, title), el('p', { class: 'mode-copy' }, message));
          for (const option of options) actions.append(button(option.label, () => { if (option.action) { option.action(); status.textContent = 'Download requested. The experiment remains available until you choose to clear it.'; } else finish(option.value); }, !!option.primary));
          dialog.append(status, actions); dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); }); document.body.append(dialog); dialog.showModal();
        });
      }
      async requestClear(reason = 'Clear the current experiment?') {
        if (!this.state && !this.previewDesign) return true;
        if (!await this.clearDialog('Clear experiment?', reason, [{ label: 'Cancel', value: false }, { label: 'Clear experiment', value: true, primary: true }])) return false;
        const exportJSON = () => api.download('blackjack-laboratory-experiment.json', this.state ? { ...this.state, exportedAt: new Date().toISOString() } : { design: this.previewDesign, exportedAt: new Date().toISOString() });
        const options = [{ label: 'Export JSON', action: exportJSON }];
        if (this.state) options.push({ label: 'Export CSV', action: () => this.exportCSV() });
        options.push({ label: 'Cancel', value: false }, { label: 'Clear experiment', value: true, primary: true });
        if (!await this.clearDialog('Save or export first?', 'Export a copy before clearing, or continue without saving. Exporting leaves this prompt open until you choose to clear or cancel.', options)) return false;
        await this.clearSaved(); return true;
      }
      async beforeStrategyChange() {
        if (!await this.requestClear('Changing strategy or table settings will clear the current experiment. Continue?')) return false;
        this.previewDesign = null; this.previewSignature = null; return true;
      }
      mount(root) {
        const reopen = !!this.settingsDialog?.open;
        const shell = el('div', { class: 'workspace-shell workspace-full' }); this.content = el('main', { class: 'mode-content' }); shell.append(this.content); root.replaceChildren(shell);
        const modal = api.settingsDialog('laboratory', shell, 'Strategy and table settings'); this.settingsDialog = modal.dialog;
        api.setup('laboratory', modal.body);
        for (const input of modal.body.querySelectorAll('input, select')) {
          const original = input.onchange; if (!original) continue;
          let prior = input.type === 'checkbox' ? input.checked : input.value;
          input.onchange = () => api.guarded(async () => { const next = input.type === 'checkbox' ? input.checked : input.value; if (next === prior) return; if (!input.checkValidity()) { input.reportValidity(); return; } if (!await this.beforeStrategyChange()) { if (input.type === 'checkbox') input.checked = prior; else input.value = prior; return; } original.call(input); prior = input.type === 'checkbox' ? input.checked : input.value; });
        }
        if (!this.loaded) { this.content.append(el('p', { class: 'mode-loader' }, 'Restoring Laboratory results…')); this.load(); return; }
        this.refresh(); if (reopen) modal.dialog.showModal();
      }
      refresh() {
        if (!this.content || api.active !== 'laboratory') return;
        this.content.replaceChildren(el('div', { class: 'mode-eyebrow' }, 'LABORATORY · PUT A STRATEGY UNDER PRESSURE'));
        const head = el('div', { class: 'lab-heading-row' }), switcher = el('div', { class: 'segmented-control', role: 'group', 'aria-label': 'Laboratory strategy mode' });
        for (const [multi, label] of [[false, 'Single strategy'], [true, 'Compare multiple']]) { const choice = button(label, async () => { if (this.running || !!this.settings.multiEnabled === multi) return; if (!await this.beforeStrategyChange()) return; this.settings.multiEnabled = multi; if (multi) this.ensureStrategies(); if (this.stageIndex === 3) this.stageIndex = 0; api.persist(); this.refresh(); }); choice.disabled = this.running; choice.setAttribute('aria-pressed', !!this.settings.multiEnabled === multi); switcher.append(choice); }
        head.append(heading('h1', 'Build an experiment', 'laboratory'), switcher); this.content.append(head, el('p', { class: 'mode-copy' }, 'Choose a strategy, vary the conditions, then run and explore the results.'));
        const steps = el('div', { class: 'workflow-steps', 'aria-label': 'Laboratory workflow' });
        const labels = this.settings.multiEnabled ? ['Strategy', 'Test Environment', 'Experiment', 'Results'] : ['Setup', 'Test Environment', 'Experiment'];
        labels.forEach((title, index) => { const b = button(`${index + 1}. ${title}`, () => { this.stageIndex = index; this.refresh(); }); b.setAttribute('aria-current', this.stageIndex === index ? 'step' : 'false'); b.dataset.labStep = index; steps.append(b, api.info(title, null, index === 0 ? 'strategy' : 'inference')); }); this.content.append(steps);
        const guidance = ['Choose the strategy and table settings to test.', 'Choose which conditions stay fixed and which vary between environments.', 'Choose the size of the experiment and preview its design before running.', 'Follow progress, inspect uncertainty and explore individual runs.'];
        this.content.append(el('p', { class: 'lab-step-intro' }, `Step ${this.stageIndex + 1} of 4 · ${guidance[this.stageIndex]}`));
        if (this.stageIndex === 0) this.strategy(); else if (this.stageIndex === 1) this.environment(); else if (this.stageIndex === 2) this.experiment(); else this.results();
      }
      strategy() {
        const config = api.configuration('laboratory'), section = panel('Player strategy', 'strategy');
        if (this.settings.multiEnabled) {
          section.body.append(el('p', { class: 'mode-copy' }, 'Choose common table conditions, then configure two to five independent strategies.'), button('Table Settings', () => this.editSettings()));
          const list = el('div', { class: 'lab-strategy-list' });
          for (const [index, strategy] of this.strategies.entries()) {
            const row = el('div', { class: 'lab-strategy-row' }), name = el('input', { value: strategy.name, maxlength: 60, 'aria-label': `Strategy ${index + 1} name` });
            name.disabled = this.running; name.onchange = () => api.guarded(async () => { const next = name.value.trim() || `Strategy ${index + 1}`; if (next !== strategy.name && !await this.beforeStrategyChange()) { name.value = strategy.name; return; } strategy.name = next; name.value = strategy.name; api.persist(); });
            row.append(el('span', { class: 'lab-color-dot', style: `background:${this.color(strategy.id)}` }), name, button('Edit strategy', () => this.editSettings(strategy)), button('Remove', async () => { if (!await this.beforeStrategyChange()) return; this.settings.strategies = this.strategies.filter(s => s.id !== strategy.id); api.persist(); this.refresh(); }));
            row.lastChild.disabled = this.running || this.strategies.length <= 2; row.querySelectorAll('button')[0].disabled = this.running; list.append(row);
          }
          const add = button('+ Add strategy', async () => { if (!await this.beforeStrategyChange()) return; const id = 's' + (Math.max(0, ...this.strategies.map(s => Number(s.id.slice(1)) || 0)) + 1), strategy = { id, name: `Strategy ${this.strategies.length + 1}`, envelope: M.clone(this.mode.envelope) }; this.strategies.push(strategy); api.persist(); this.refresh(); this.editSettings(strategy); });
          add.disabled = this.running || this.strategies.length >= 5;
          section.body.append(list, add, button('Next: test environment →', () => { this.stageIndex = 1; this.refresh(); }, true)); this.content.append(section); return;
        }
        section.body.append(el('p', {}, `Playing: ${BJRules.PLAYS[config.rules.play.mode]}. Betting: ${BJRules.BETS[config.rules.bet.mode]}. Open settings to change the strategy, table and betting rules.`));
        section.body.append(button('Strategy & table settings', () => this.settingsDialog.showModal()));
        const details = el('details'); details.append(api.summary('Custom decision rules'));
        details.append(el('p', { class: 'mode-copy' }, 'First matching rule wins in Custom or Deviations mode. Each rule declares hand type, total range, dealer upcards (ace = 11), true-count range and action. All actions remain subject to legal-action fallback.'));
        const input = el('textarea', { id: 'lab-decision-rules', class: 'custom-rule-editor', 'aria-label': 'Custom decision rules JSON' }); input.value = JSON.stringify(config.rules.play.decisionRules || [], null, 2);
        details.append(input, button('Apply custom decision rules', async () => { const rows = JSON.parse(input.value); const candidate = M.clone(this.mode.envelope); candidate.rules.play.decisionRules = rows; candidate.rules.play.mode = 'custom'; RuleSettings.validateEnvelope(candidate); if (!await this.beforeStrategyChange()) return; api.updateEnvelope(e => { e.rules.play.decisionRules = rows; e.rules.play.mode = 'custom'; }); api.notice('Custom decision rules saved for the next experiment.'); }), button('Insert example rule', () => { input.value = JSON.stringify([{ type: 'hard', minTotal: 16, maxTotal: 16, upcards: [10], minTC: 0, maxTC: 100, action: 'stand' }], null, 2); }));
        section.body.append(details, button('Next: test environment →', () => { this.stageIndex = 1; this.refresh(); }, true)); this.content.append(section);
      }
      color(id) { const colors = ['#67d8ba', '#e6b96a', '#9daafa', '#f28da6', '#82c9f1']; const ids = this.stageIndex === 3 && this.state?.design?.settings?.strategies ? this.state.design.settings.strategies.map(s => s.id) : this.strategies.map(s => s.id); return colors[Math.max(0, ids.indexOf(id)) % colors.length]; }
      environment() {
        const section = panel('Fixed or randomized environment parameters', 'inference');
        section.body.append(el('p', { class: 'mode-copy' }, 'Each row can stay fixed, sample weighted allowed values, or use a supported numeric distribution. Fixed rows inherit the strategy setup unless explicitly set here. Invalid combinations are rejected and resampled, up to 100 attempts. Preview shows the actual accepted design.'));
        const common = el('details', { open: true, class: 'lab-disclosure' }); common.append(api.summary('Common conditions'), this.parameterTable(L.PARAMETERS.slice(0, 13)));
        const more = el('details', { class: 'lab-disclosure' }); more.append(api.summary('More rule, limit, count and opponent conditions'), this.parameterTable(L.PARAMETERS.slice(13)));
        section.body.append(common, more, button('Preview design →', () => { this.preview(); this.stageIndex = 2; this.refresh(); }, true)); this.content.append(section);
      }
      syncPenetrationRows(except) {
        for (const key of ['penetration', 'penetrationMode', 'penetrationSigma']) {
          if (key === except) continue;
          const old = this.content.querySelector(`tr[data-parameter="${key}"]`);
          const descriptor = L.PARAMETERS.find(d => d.key === key);
          if (old && descriptor) old.replaceWith(this.parameterTable([descriptor]).querySelector('tbody tr'));
        }
      }
      parameterTable(descriptors) {
        if (this.settings.multiEnabled) descriptors = descriptors.filter(d => d.key !== 'starting' && d.key !== 'countSystem' && (!d.key.startsWith('rules.limits.') || d.key === 'rules.limits.tableMax'));
        const table = el('table', { class: 'lab-design-table' }), head = el('thead'), tr = el('tr'); for (const title of ['Parameter', 'Distribution', 'Values / range']) tr.append(el('th', {}, title)); head.append(tr); const body = el('tbody'); table.append(head, body);
        const base = api.configuration('laboratory'); base.opponents = base.seats.filter(p => p.active && p.seat !== base.heroSeat).length; base.payout = base.rules.payout.numerator / base.rules.payout.denominator;
        for (const d of descriptors) {
          const spec = this.settings.parameters[d.key] || { mode: 'fixed' }, row = el('tr', { 'data-parameter': d.key }), name = el('td', {}, d.label);
          const help = api.info(d.label, `Fixed uses the setup value. Allowed values use relative probabilities; numeric ranges support uniform, truncated normal and positive log-uniform sampling. ${d.values ? 'Allowed options: ' + d.values.join(', ') : `Supported range ${d.min}–${d.max}${d.kind === 'integer' ? ', whole numbers' : ''}`}. Rejection sampling changes the marginal distribution when combinations violate constraints; the realized design is shown before running.`, 'inference');
          if (['penetration', 'penetrationMode', 'penetrationSigma'].includes(d.key)) help.onclick = () => document.getElementById('penDialog').showModal();
          name.append(help);
          const type = el('select', { 'aria-label': d.label + ' distribution' }); for (const [key, label] of Object.entries({ fixed: 'Fixed', choice: 'Allowed values (weighted)', ...(!d.values ? { uniform: 'Uniform range', normal: 'Truncated normal', logUniform: 'Log-uniform' } : {}) })) type.append(el('option', { value: key }, label)); type.value = spec.mode;
          type.disabled = this.running;
          type.onchange = () => api.guarded(() => { this.settings.parameters[d.key] = type.value === 'fixed' ? { mode: 'fixed', value: L.get(base, d.key) } : type.value === 'choice' ? { mode: 'choice', values: d.values ? [...d.values] : [L.get(base, d.key)], weights: d.values ? d.values.map(() => 1) : [1] } : { mode: type.value, min: d.min, max: d.max }; api.persist(); const replacement = this.parameterTable([d]).querySelector('tbody tr'); row.replaceWith(replacement); if (['penetration', 'penetrationMode', 'penetrationSigma'].includes(d.key)) this.syncPenetrationRows(d.key); replacement.querySelector('select')?.focus(); });
          const modeCell = el('td'); modeCell.append(type); const values = el('td'), targetFields = el('div');
          const save = value => { this.settings.parameters[d.key] = value; api.persist(); if (['penetrationMode', 'penetrationSigma'].includes(d.key)) this.syncPenetrationRows(d.key); };
          if (d.key === 'penetration') {
            const modeSpec = this.settings.parameters.penetrationMode || { mode: 'fixed' };
            const sigmaSpec = this.settings.parameters.penetrationSigma || { mode: 'fixed' };
            const cutMode = el('select', { 'aria-label': 'Penetration % shoe mode' });
            for (const [v, label] of [['fixed', 'Fixed'], ['simulated', 'Simulated'], ['gaussian', 'Gaussian']]) cutMode.append(el('option', { value: v }, label));
            if (modeSpec.mode !== 'fixed') cutMode.append(el('option', { value: 'varying' }, 'Varies by environment'));
            cutMode.value = modeSpec.mode === 'fixed' ? (modeSpec.value ?? base.penetrationMode) : 'varying'; cutMode.disabled = this.running;
            cutMode.onchange = () => { this.settings.parameters.penetrationMode = { mode: 'fixed', value: cutMode.value }; api.persist(); this.syncPenetrationRows(); };
            values.append(el('small', {}, 'Shoe cut mode'), cutMode);
            targetFields.hidden = cutMode.value === 'simulated' || cutMode.value === 'gaussian';
            type.disabled = this.running || targetFields.hidden;
            if (cutMode.value === 'gaussian' || cutMode.value === 'varying') {
              const sd = el('input', { type: 'number', min: 0, max: 30, step: .1, 'aria-label': 'Penetration % Gaussian standard deviation' });
              sd.value = sigmaSpec.mode === 'fixed' ? (sigmaSpec.value ?? base.penetrationSigma) : '';
              sd.disabled = this.running || sigmaSpec.mode !== 'fixed';
              sd.onchange = () => api.guarded(() => { if (!sd.value.trim() || !sd.checkValidity()) { sd.reportValidity(); return; } this.settings.parameters.penetrationSigma = { mode: 'fixed', value: +sd.value }; api.persist(); this.syncPenetrationRows(); });
              values.append(el('small', {}, sigmaSpec.mode === 'fixed' ? 'Gaussian σ (pp)' : 'Gaussian σ varies; edit under More conditions'), sd);
            }
            values.append(el('small', {}, targetFields.hidden ? 'The fixed target distribution is unused in this shoe mode.' : 'The distribution below sets the fixed cut target.'));
          }
          if (spec.mode === 'fixed') {
            const current = Object.hasOwn(spec, 'value') ? spec.value : L.get(base, d.key);
            if (d.values) { const input = el('select', { 'aria-label': d.label + ' fixed value' }); d.values.forEach(v => input.append(el('option', { value: String(v) }, String(v)))); input.value = String(current); input.disabled = this.running; input.onchange = () => save({ mode: 'fixed', value: d.values.find(v => String(v) === input.value) }); targetFields.append(input); }
            else { const input = el('input', { type: 'number', value: current, min: d.min, max: d.max, step: d.kind === 'integer' ? 1 : 'any', 'aria-label': d.label + ' fixed value' }); input.disabled = this.running; input.onchange = () => save({ mode: 'fixed', value: +input.value }); targetFields.append(input); }
          } else if (spec.mode === 'choice') {
            const input = el('input', { class: 'distribution-values', value: spec.values.join(', '), 'aria-label': d.label + ' allowed values' }), weights = el('input', { class: 'distribution-values', value: (spec.weights || spec.values.map(() => 1)).join(', '), 'aria-label': d.label + ' relative weights' });
            const change = () => api.guarded(() => { const strings = input.value.split(',').map(v => v.trim()), parsed = d.values ? strings.map(v => d.values.find(x => String(x) === v)) : strings.map(Number); if (parsed.some(x => x === undefined || typeof x === 'number' && !Number.isFinite(x))) throw Error('Invalid allowed value for ' + d.label); save({ mode: 'choice', values: parsed, weights: weights.value.split(',').map(Number) }); });
            input.onchange = weights.onchange = change; input.disabled = weights.disabled = this.running; targetFields.append(el('small', {}, 'Allowed values'), input, el('small', {}, 'Relative weights'), weights);
          } else {
            for (const [key, label] of [['min', 'Min'], ['max', 'Max'], ...(spec.mode === 'normal' ? [['mean', 'Mean'], ['sd', 'SD']] : [])]) {
              const value = spec[key] ?? (key === 'mean' ? (spec.min + spec.max) / 2 : (spec.max - spec.min) / 6);
              const input = el('input', { type: 'number', step: 'any', value, 'aria-label': d.label + ' ' + label }); input.disabled = this.running; input.onchange = () => save({ ...spec, [key]: +input.value }); targetFields.append(el('small', {}, label), input);
            }
          }
          values.append(targetFields); row.append(name, modeCell, values); body.append(row);
        }
        const scroll = el('div', { class: 'lab-scroll' }); scroll.append(table); return scroll;
      }
      preview() { const settings = this.designSettings(); this.previewDesign = L.design(api.configuration('laboratory'), settings); this.previewSignature = JSON.stringify([api.configuration('laboratory'), settings]); api.notice('Design ready: ' + this.previewDesign.environments.length + ' environments, ' + this.previewDesign.jobs.length + ' session/strategy runs before shared-seed clustering.'); }
      experiment() {
        const section = panel('Experiment controls', 'inference'), grid = el('div', { class: 'settings-grid' });
        for (const [key, label, min, max, step] of [['environments', 'Environments', 1, 128, 1], ['hands', 'Hands per session', 1, 100000, 1], ['sessions', 'Sessions per environment', 1, 20, 1], ['workers', 'Parallel worker count', 1, 8, 1], ['seed', 'Experiment seed', 0, 4294967295, 1], ['confidence', 'Confidence level', .8, .999, .001], ['tickHands', 'Rounds per synchronized tick', 1, 100, 1], ['stopProfit', 'Stop after profit $ (0 off)', 0, 100000000, 1], ['stopLoss', 'Stop after loss $ (0 off)', 0, 100000000, 1], ['stopDrawdown', 'Stop drawdown fraction (0 off)', 0, 1, .01]])
          grid.append(field(label, 'number', this.settings[key], value => { this.settings[key] = value; api.persist(); }, { id: 'lab-' + key, min, max, step, disabled: this.running, category: 'inference' }));
        grid.append(field('Bankruptcy behavior', 'select', this.settings.bankruptcy, value => { this.settings.bankruptcy = value; api.persist(); }, { options: { stop: 'Stop run', rebuy: 'Rebuy and retain total losses', unlimited: 'Allow negative bankroll' }, disabled: this.running, category: 'betting' }));
        if (!this.settings.multiEnabled) grid.append(field('Comparison / control group', 'checkbox', this.settings.compare, value => { this.settings.compare = value; api.persist(); this.refresh(); }, { id: 'lab-compare', disabled: this.running, category: 'inference' }));
        if (!this.settings.multiEnabled && this.settings.compare) {
          grid.append(field('Control playing strategy', 'select', this.settings.controlPlay, value => { this.settings.controlPlay = value; api.persist(); }, { options: BJRules.PLAYS, disabled: this.running, category: 'strategy' }), field('Control betting strategy', 'select', this.settings.controlBet, value => { this.settings.controlBet = value; api.persist(); }, { options: BJRules.BETS, disabled: this.running, category: 'betting' }), field('Paired / common shoe seeds', 'checkbox', this.settings.paired, value => { this.settings.paired = value; api.persist(); }, { disabled: this.running, category: 'inference' }));
        }
        const controls = el('div', { class: 'mode-controls lab-experiment-controls' }); controls.append(button('Preview actual design', () => { this.preview(); this.refresh(); }), button('Run experiment', () => this.start(), true)); controls.querySelectorAll('button').forEach(b => b.disabled = this.running);
        if (this.state) { const toggle = button(this.running ? 'Pause experiment' : this.state.status === 'complete' ? 'Experiment complete' : 'Resume experiment', () => this.running ? this.pauseExperiment() : this.resume()); toggle.disabled = this.state.status === 'complete' || !this.running && (this.checkpointing || !!this.awaiting); controls.append(toggle, button('Results & live metrics', () => { this.stageIndex = 3; this.refresh(); })); }
        section.body.append(el('p', { class: 'mode-copy' }, 'Set how many environments and hands to test. Preview shows the actual sampled conditions before you run.'), grid, controls);
        if (this.previewDesign) {
          const table = el('table', { class: 'lab-results-table' }), row = el('tr'); ['Environment', 'Decks', 'Cut', 'Dealer', 'Payout', 'Bankroll', 'Table $', 'Opponents', 'Seat', 'Shoe seed'].forEach(t => row.append(el('th', {}, t))); table.append(row);
          for (const env of this.previewDesign.environments) { const c = env.config, tr = el('tr'), cut = c.penetrationMode === 'fixed' ? `${c.penetration}% fixed` : c.penetrationMode === 'gaussian' ? `Gaussian σ ${c.penetrationSigma} pp` : 'Simulated'; [env.index + 1, c.decks, cut, c.rules.dealer.mode + '/' + c.rules.dealer.hole, c.payout + ':1', c.starting, c.minBet + '–' + c.rules.limits.tableMax, c.opponents + ' ' + c.rules.opponents.skill, c.heroSeat + 1, c.seed].forEach(t => tr.append(el('td', {}, t))); table.append(tr); }
          const scroll = el('div', { class: 'lab-scroll' }); scroll.append(table); section.body.append(heading('h3', 'Resulting experiment design', 'inference'), scroll, button('Export frozen design', () => api.download('blackjack-laboratory-design.json', this.previewDesign)));
        }
        this.content.append(section);
      }
      async start() {
        if (this.running) return;
        const signature = JSON.stringify([api.configuration('laboratory'), this.designSettings()]);
        if (!this.previewDesign || signature !== this.previewSignature) this.preview();
        if (this.state && !await this.requestClear('Starting a new experiment will clear the current results. Continue?')) return;
        this.stop(); this.state = { version: 1, status: 'running', design: M.clone(this.previewDesign), jobs: this.previewDesign.jobs.map(j => ({ ...M.clone(j), path: [M.ledger(j.config.seats.find(p => p.seat === j.config.heroSeat).amount * 100).path[0]], stats: null, done: false, bins: { count: {}, penetration: {}, bet: {} } })), checkpoints: [], tick: 0 };
        this.tick = 0; this.cursor = null; this.filter = ''; this.drillStrategy = ''; this.drillEnvironment = this.drillSession = null; this.hiddenStrategies = new Set(); this.reference = null; this.stageIndex = 3; this.running = true; this.launch(); this.refresh();
      }
      resume() { if (this.awaiting || this.checkpointing) throw Error('Wait for the synchronized checkpoint to finish.'); if (!this.state) throw Error('There is no experiment to resume.'); if (this.state.jobs.every(j => j.done)) { api.notice('This experiment is complete.'); return; }
        if (!this.state.checkpoints?.length && this.state.jobs.some(j => j.path.length > 1)) throw Error('No consistent checkpoint is available for this run. Export its results and start a new design.');
        this.recoverCheckpoint(); this.running = true; this.state.status = 'running'; this.launch(); this.refresh(); }
      recoverCheckpoint() {
        for (const job of this.state.jobs) {
          const checkpoint = this.state.checkpoints.find(s => s.id === job.id); if (!checkpoint) continue;
          job.path = job.path.filter(p => p.round <= checkpoint.rounds); const { path, ...stats } = checkpoint.stats;
          job.stats = stats; job.done = checkpoint.done; job.reason = checkpoint.reason; job.rebuys = checkpoint.rebuys;
          job.bins = this.binsFor(job.path.slice(1));
        }
        this.tick = this.state.tick || 0;
      }
      binsFor(points) {
        const bins = { count: {}, penetration: {}, bet: {} };
        for (const p of points) for (const [type, key] of [['count', Math.max(-20, Math.min(20, Math.floor(p.openingTC)))], ['penetration', Math.min(9, Math.floor(p.penetration * 10))], ['bet', Math.floor(Math.log2(Math.max(.01, p.bet / 100)) * 2)]]) {
          const bin = bins[type][key] ||= { profit: 0, wager: 0, n: 0 }; bin.profit += p.delta; bin.wager += p.roundWager; bin.n++;
        }
        return bins;
      }
      launch(cooperative = false) {
        this.terminateWorkers(); this.generation++; const generation = this.generation;
        const count = Math.min(this.state.design.settings.workers, this.state.design.jobs.length), batches = Array.from({ length: count }, () => []);
        this.state.design.jobs.forEach((job, i) => batches[i % count].push(job));
        this.ready = 0; this.shards = [];
        if (!cooperative && typeof Worker !== 'undefined') {
          this.workerKind = count + ' Web Workers';
          try {
            batches.forEach((jobs, index) => {
              const worker = new Worker('./lab-worker.js'); this.workers.push(worker);
              worker.onmessage = event => { if (generation !== this.generation) return; const d = event.data;
                if (d.type === 'ready') { if (++this.ready === count) this.dispatch(); }
                else if (d.type === 'tick') this.receive(d);
                else if (d.type === 'error') this.fail(d.message);
              };
              worker.onerror = error => { error.preventDefault(); if (generation !== this.generation) return;
                if (this.ready < count && this.tick === (this.state.tick || 0)) { this.launch(true); api.notice('Web Workers are unavailable here. Using cooperative tasks; serve over HTTP for worker parallelism.'); }
                else this.fail('Worker failed: ' + error.message);
              };
              worker.postMessage({ type: 'init', jobs, settings: this.state.design.settings, checkpoints: this.state.checkpoints.filter(c => jobs.some(j => j.id === c.id)) });
            }); return;
          } catch { this.terminateWorkers(); }
        }
        this.workerKind = 'Cooperative tasks (workers unavailable)';
        this.shards = batches.map(jobs => { const shard = new L.Shard(jobs, this.state.design.settings); shard.restore(this.state.checkpoints); return shard; }); this.dispatch();
      }
      dispatch() {
        if (!this.running) { this.checkpointPause(); return; }
        this.tick++; this.awaiting = this.workers.length || this.shards.length; this.pendingUpdates = []; this.pendingStates = [];
        const checkpoint = this.tick % 10 === 0;
        if (this.workers.length) for (const worker of this.workers) worker.postMessage({ type: 'tick', tick: this.tick, checkpoint });
        else this.shards.forEach(shard => setTimeout(() => { if (!this.running && !this.awaiting) return; try { this.receive({ type: 'tick', tick: this.tick, updates: shard.tick(), states: checkpoint ? shard.dump() : null }); } catch (error) { this.fail(error.message); } }, 0));
      }
      receive(message) {
        if (!this.state || message.tick !== this.tick) return;
        this.pendingUpdates.push(...message.updates); if (message.states) this.pendingStates.push(...message.states);
        if (--this.awaiting) return;
        for (const update of this.pendingUpdates) {
          const job = this.state.jobs.find(j => j.id === update.id); if (!job) continue;
          job.path.push(...update.points); if (update.stats) job.stats = update.stats; job.done = update.done; job.reason = update.reason || job.reason; job.rebuys = update.rebuys || 0;
          for (const [type, values] of Object.entries(update.bins || {})) for (const [key, delta] of Object.entries(values)) { const bin = job.bins[type][key] ||= { profit: 0, wager: 0, n: 0 }; bin.profit += delta.profit; bin.wager += delta.wager; bin.n += delta.n; }
        }
        if (this.pendingStates.length) { this.state.checkpoints = this.pendingStates; this.state.tick = this.tick; this.persist(); }
        const allDone = this.state.jobs.every(j => j.done);
        if (allDone) { this.running = false; this.state.status = 'complete'; this.finalSummary = this.state.design.settings.multiEnabled ? this.strategySummaries(this.state.jobs, true) : L.summarize(this.state.jobs, this.state.design.settings.confidence, true); this.state.summary = this.finalSummary; this.checkpointPause(); api.notice('Laboratory experiment complete. Verdicts use uncertainty across independent environment clusters.'); }
        this.schedulePaint();
        if (this.running) setTimeout(() => this.dispatch(), 0); else if (!allDone) this.checkpointPause();
      }
      schedulePaint() {
        if (api.active !== 'laboratory' || this.stageIndex !== 3 || this.paintPending) return;
        this.paintPending = true;
        const frame = time => { if (api.active !== 'laboratory' || this.stageIndex !== 3) { this.paintPending = false; return; } if (time - (this.lastPaint || 0) < 125) { requestAnimationFrame(frame); return; } this.lastPaint = time; this.paintPending = false; this.renderLive(); };
        requestAnimationFrame(frame);
      }
      pauseExperiment() { this.running = false; if (this.state) this.state.status = 'paused'; if (!this.awaiting) this.checkpointPause(); api.notice('Pausing after the synchronized tick; saving all worker states.'); this.refresh(); }
      checkpointPause() {
        if (!this.state || this.checkpointing) return;
        if (this.shards.length) { this.state.checkpoints = this.shards.flatMap(s => s.dump()); this.state.tick = this.tick; this.persist(); return; }
        if (!this.workers.length) { this.persist(); return; }
        this.checkpointing = true; let pending = this.workers.length, states = [];
        for (const worker of this.workers) {
          const receive = event => { if (event.data.type !== 'checkpoint') return; worker.removeEventListener('message', receive); states.push(...event.data.states);
            if (!--pending) { this.state.checkpoints = states; this.state.tick = this.tick; this.checkpointing = false; this.persist(); if (api.active === 'laboratory' && this.stageIndex === 3) this.renderLive(); else if (api.active === 'laboratory' && this.stageIndex === 2) this.refresh(); } };
          worker.addEventListener('message', receive); worker.postMessage({ type: 'checkpoint' });
        }
      }
      fail(message) { this.running = false; if (this.state) this.state.status = 'error'; this.terminateWorkers(); this.persist(); api.notice('Experiment stopped: ' + message, true); if (api.active === 'laboratory') this.refresh(); }
      terminateWorkers() { for (const worker of this.workers) worker.terminate(); this.workers = []; this.shards = []; this.awaiting = 0; this.checkpointing = false; }
      stop() { this.running = false; this.generation++; this.terminateWorkers(); this.analysisWorker?.terminate(); this.analysisWorker = null; this.analysisBusy = false; this.analysisActive = this.analysisPending = null; clearInterval(this.replayTimer); }
      pause() { clearInterval(this.replayTimer); }
      selectedConfig() { return this.state?.jobs.find(j => j.id === this.filter)?.config || null; }
      selectedJobs(comparisonScope = false) {
        const jobs = this.state?.jobs.filter(j => (comparisonScope || !this.filter || j.id === this.filter) && (!this.state.design.settings.multiEnabled || ((comparisonScope || !this.hiddenStrategies?.has(j.strategyId)) && (comparisonScope || !this.drillStrategy || j.strategyId === this.drillStrategy) && (this.drillEnvironment == null || j.environment === this.drillEnvironment) && (this.drillSession == null || j.session === this.drillSession)))) || [];
        if (this.cursor == null) return jobs;
        return jobs.map(job => { const path = job.path.filter(p => p.round <= this.cursor), point = path.at(-1) || job.path[0];
          return { ...job, path, done: job.done && point.round === job.path.at(-1).round,
            stats: { ...job.stats, rounds: point.round, profit: point.profit, wager: point.wager, drawdown: point.drawdown,
              hands: point.hands || 0, wins: point.wins || 0, losses: point.losses || 0, pushes: point.pushes || 0, blackjacks: point.blackjacks || 0,
              openingWager: point.openingSum || 0, largestWager: point.largestWager || 0, squares: point.squares || 0, bankrupt: !!point.bankrupt, actions: point.actions || {} },
            bins: this.binsFor(path.slice(1)) };
        });
      }
      analysisViewKey() { return JSON.stringify([this.filter, this.cursor, this.drillStrategy, this.drillEnvironment, this.drillSession, [...(this.hiddenStrategies || [])].sort()]); }
      queueDistributions(jobs, multi) {
        if (!this.distributionHost?.parentElement.open) return true;
        if (this.analysisUnavailable || typeof Worker === 'undefined') return false;
        if (!this.analysisWorker) {
          try {
            this.analysisWorker = new Worker('./lab-analysis-worker.js');
            this.analysisWorker.onmessage = event => {
              const request = this.analysisActive; this.analysisBusy = false; this.analysisActive = null;
              if (event.data.error) { this.analysisUnavailable = true; this.analysisWorker.terminate(); this.analysisWorker = null; api.notice('Distribution worker unavailable: ' + event.data.error, true); if (api.active === 'laboratory' && this.stageIndex === 3) this.renderLive(); return; }
              if (request?.host === this.distributionHost && request.viewKey === this.analysisViewKey() && request.host.parentElement.open && api.active === 'laboratory' && this.stageIndex === 3) this.paintDistributions(event.data.cards, request.multi);
              if (this.analysisPending) { const next = this.analysisPending; this.analysisPending = null; if (next.host === this.distributionHost && next.host.parentElement.open && api.active === 'laboratory' && this.stageIndex === 3) this.queueDistributions(this.selectedJobs(), next.multi); }
            };
            this.analysisWorker.onerror = event => { event.preventDefault(); this.analysisUnavailable = true; this.analysisWorker?.terminate(); this.analysisWorker = null; this.analysisBusy = false; this.analysisPending = null; if (api.active === 'laboratory' && this.stageIndex === 3) this.renderLive(); };
          } catch { this.analysisUnavailable = true; return false; }
        }
        if (this.analysisBusy) { this.analysisPending = { host: this.distributionHost, multi }; return true; }
        const snapshot = { host: this.distributionHost, viewKey: this.analysisViewKey(), multi, selected: !!this.filter, confidence: this.state.design.settings.confidence,
          strategies: multi ? this.state.design.settings.strategies.map(({ id, name }) => ({ id, name })) : [],
          jobs: jobs.map(j => ({ id: j.id, environment: j.environment, arm: j.arm, strategyId: j.strategyId, stats: j.stats, bins: j.bins, config: { seed: j.config.seed, rules: { dealer: j.config.rules.dealer, payout: j.config.rules.payout } } })) };
        this.dispatchAnalysis(snapshot);
        return true;
      }
      dispatchAnalysis(snapshot) {
        this.analysisBusy = true; this.analysisActive = snapshot;
        const { host, ...message } = snapshot; this.analysisWorker.postMessage({ ...message, id: ++this.analysisId });
      }
      paintDistributions(cards, multi) {
        this.distributionHost.replaceChildren();
        for (const data of cards) { const card = el('section', { class: 'lab-chart-panel' }), wrap = el('div', { class: 'lab-chart' }), canvas = el('canvas', { 'aria-label': data.title }), caption = el('div', { class: 'chart-caption' }); wrap.append(canvas); card.append(heading('h3', data.title, 'inference'), wrap, caption); this.distributionHost.append(card);
          const values = data.values.map(v => ({ ...v, color: v.strategyId ? this.color(v.strategyId) : undefined }));
          api.bars(canvas, values, { caption, select: data.selectable ? value => { const job = this.state.jobs.find(j => j.id === value.runId); if (!job) return; this.filter = job.id; if (multi) { this.drillStrategy = job.strategyId; this.drillEnvironment = job.environment; this.drillSession = job.session; } this.refresh(); } : null });
        }
      }
      strategyName(id) { return this.state?.design?.settings?.strategies?.find(s => s.id === id)?.name || (id === 'control' ? 'Control' : id === 'strategy' ? 'Strategy' : id || 'Strategy'); }
      strategySummaries(jobs, bootstrap = false) {
        const confidence = this.state.design.settings.confidence;
        return this.state.design.settings.strategies.map(s => ({ ...s, summary: L.summarize(jobs.filter(j => j.strategyId === s.id), confidence, bootstrap) }));
      }
      clearResultsButton() {
        const clear = button('Clear Results', async () => { if (!await this.requestClear('Clear the current Laboratory results?')) return; this.previewDesign = null; this.previewSignature = null; this.stageIndex = 2; this.refresh(); api.notice('Laboratory results cleared.'); });
        clear.classList.add('lab-clear-results'); return clear;
      }
      multiResults() {
        const strategies = this.state.design.settings.strategies;
        this.hiddenStrategies ||= new Set(); this.reference ||= strategies[0].id;
        const controls = el('div', { class: 'mode-controls' });
        this.runToggle = button(this.running ? 'Pause experiment' : 'Resume experiment', () => this.running ? this.pauseExperiment() : this.resume());
        controls.append(this.runToggle, button('Export summary JSON', () => api.download('blackjack-laboratory-summary.json', { design: this.state.design, strategies: this.strategySummaries(this.state.jobs, true), comparisons: strategies.map(s => ({ strategyId: s.id, referenceId: this.reference, difference: this.compareStrategies(this.state.jobs, s.id, this.reference) })), jobs: this.state.jobs.map(({ path, ...job }) => job) })), button('Export all paths JSON', () => api.download('blackjack-laboratory-paths.json', { design: this.state.design, jobs: this.state.jobs })), button('Export CSV', () => this.exportCSV()), this.clearResultsButton());
        this.content.append(controls);
        const completion = el('div', { class: 'lab-completion' }); this.progress = el('progress', { max: 1, value: 0 }); this.statusLabel = el('span'); completion.append(this.progress, this.statusLabel); this.content.append(completion);
        const legend = el('div', { class: 'lab-legend', 'aria-label': 'Strategy visibility' });
        for (const strategy of strategies) {
          const label = el('label', { class: 'lab-legend-item' }), check = el('input', { type: 'checkbox', checked: !this.hiddenStrategies.has(strategy.id), 'aria-label': `Show ${strategy.name}` });
          check.checked = !this.hiddenStrategies.has(strategy.id); check.onchange = () => { if (check.checked) this.hiddenStrategies.delete(strategy.id); else this.hiddenStrategies.add(strategy.id); this.renderLive(); };
          label.append(check, el('span', { class: 'lab-color-dot', style: `background:${this.color(strategy.id)}` }), document.createTextNode(strategy.name)); legend.append(label);
        }
        const focus = el('select', { 'aria-label': 'Focus strategy' }); focus.append(el('option', { value: '' }, 'All strategies'));
        for (const strategy of strategies) focus.append(el('option', { value: strategy.id }, strategy.name)); focus.value = this.drillStrategy || '';
        focus.onchange = () => { this.drillStrategy = focus.value; if (focus.value) this.hiddenStrategies.delete(focus.value); this.drillEnvironment = this.drillSession = null; this.filter = ''; this.refresh(); };
        legend.append(el('span', {}, 'Focus strategy'), focus); this.content.append(legend);
        const verdict = panel('Strategy comparison & uncertainty', 'inference'); this.verdictHost = verdict.body;
        const reference = el('select', { 'aria-label': 'Difference vs.' }); for (const s of strategies) reference.append(el('option', { value: s.id }, s.name)); reference.value = this.reference; reference.onchange = () => { this.reference = reference.value; this.renderLive(); };
        const refRow = el('div', { class: 'mode-controls' }); refRow.append(el('label', {}, 'Difference vs.'), reference); verdict.insertBefore(refRow, verdict.body); this.content.append(verdict);
        this.metricHost = el('div', { class: 'metrics' }); this.content.append(this.metricHost);
        const fits = el('div', { class: 'lab-fit-controls' }); fits.append(heading('h3', 'Live overlays', 'fits'));
        for (const [key, label] of [['average', 'Average'], ['lr', 'LR'], ['gam', 'GAM spline'], ['sma', 'SMA']]) { const input = el('input', { type: 'checkbox', id: 'lab-fit-' + key }); input.checked = !!this.settings.fits[key]; input.onchange = () => { this.settings.fits[key] = input.checked; api.persist(); this.refreshMultiCharts(); }; const wrap = el('label'); wrap.append(input, document.createTextNode(label)); fits.append(wrap, api.info(label, null, 'fits')); }
        fits.append(field('SMA window', 'number', this.settings.window, value => { this.settings.window = Math.max(1, Math.min(1000, value)); api.persist(); this.refreshMultiCharts(); }, { min: 1, max: 1000, step: 1 }), field('GAM smoothing penalty', 'number', this.settings.smoothing, value => { this.settings.smoothing = Math.max(.0001, value); api.persist(); this.refreshMultiCharts(); }, { min: .0001, max: 100000, step: .1 })); this.content.append(fits);
        const replay = el('div', { class: 'lab-replay' }); this.replaySlider = el('input', { type: 'range', min: 0, max: 1, 'aria-label': 'Replay round cursor' }); this.replayLabel = el('span'); this.replaySlider.oninput = () => { this.cursor = +this.replaySlider.value; this.renderLive(); };
        replay.append(button('Replay all paths', () => { clearInterval(this.replayTimer); this.cursor = 0; this.replayTimer = setInterval(() => { const max = this.maxRound(); this.cursor = Math.min(max, this.cursor + Math.max(1, Math.ceil(max / 400))); this.renderLive(); if (this.cursor >= max) clearInterval(this.replayTimer); }, 50); }), this.replaySlider, this.replayLabel, button('Follow live', () => { clearInterval(this.replayTimer); this.cursor = null; this.renderLive(); })); this.content.append(replay);
        const drill = el('div', { class: 'mode-controls lab-drill' });
        const select = (label, value, options, handler) => { const wrapper = el('label', {}, label + ' '), input = el('select', { 'aria-label': label }); for (const [key, name] of options) input.append(el('option', { value: key }, name)); input.value = value == null ? '' : String(value); input.onchange = () => { handler(input.value); this.filter = ''; this.refresh(); }; wrapper.append(input); drill.append(wrapper); return input; };
        select('Strategy', this.drillStrategy, [['', 'All strategies'], ...strategies.map(s => [s.id, s.name])], v => { this.drillStrategy = v; if (v) this.hiddenStrategies.delete(v); this.drillEnvironment = this.drillSession = null; });
        const env = select('Environment', this.drillEnvironment, [['', 'All environments'], ...this.state.design.environments.map(e => [e.index, `Environment ${e.index + 1}`])], v => { this.drillEnvironment = v === '' ? null : +v; this.drillSession = null; }); env.disabled = !this.drillStrategy;
        const session = select('Session / run', this.drillSession, [['', 'All sessions'], ...Array.from({ length: this.state.design.settings.sessions }, (_, i) => [i, `Session ${i + 1}`])], v => { this.drillSession = v === '' ? null : +v; }); session.disabled = this.drillEnvironment == null;
        const show = el('input', { type: 'checkbox', id: 'lab-individual-runs' }); show.checked = !!this.showRuns; show.onchange = () => { this.showRuns = show.checked; this.refreshMultiCharts(); }; const showLabel = el('label', { for: show.id }); showLabel.append(show, document.createTextNode('Show individual runs')); drill.append(showLabel);
        const bands = el('input', { type: 'checkbox', id: 'lab-uncertainty-bands' }); bands.checked = !!this.showBands; bands.onchange = () => { this.showBands = bands.checked; this.refreshMultiCharts(); }; const bandsLabel = el('label', { for: bands.id }); bandsLabel.append(bands, document.createTextNode('Show uncertainty bands')); drill.append(bandsLabel); this.content.append(drill);
        this.lineCharts = []; const grid = el('div', { class: 'lab-grid' });
        for (const [key, label, unit] of [['profit', 'Profit', '$'], ['bankroll', 'Bankroll', '$'], ['drawdown', 'Drawdown', '%'], ['roi', 'ROI', '%'], ['bet', 'Opening wager', '$'], ['tc', 'True count', '']]) { const card = el('section', { class: 'lab-chart-panel' }), wrap = el('div', { class: 'lab-chart' }), canvas = el('canvas', { 'aria-label': label }), caption = el('div', { class: 'chart-caption' }); wrap.append(canvas); card.append(heading('h3', label, 'fits'), wrap, caption); grid.append(card); this.lineCharts.push({ key, label, unit, canvas, caption }); }
        this.content.append(heading('h2', 'Run trajectories', 'fits'), el('p', { class: 'mode-copy' }, 'Colored lines show each strategy average. Optional bands show intervals for the mean across independent environment clusters; turn on individual runs to inspect paths.'), grid);
        const distributions = el('details', { class: 'lab-disclosure' }); distributions.append(api.summary('Outcome distributions')); this.distributionHost = el('div', { class: 'lab-grid' }); distributions.append(this.distributionHost); distributions.ontoggle = () => { if (distributions.open) this.renderMultiAnalysis(); }; this.content.append(distributions);
        this.tableHost = panel('Best / worst environments and run details', 'inference'); this.content.append(this.tableHost);
        this.sensitivityHost = panel('Parameter sensitivity', 'inference'); const parameter = el('select', { 'aria-label': 'Sensitivity parameter' }); L.PARAMETERS.forEach(d => parameter.append(el('option', { value: d.key }, d.label))); parameter.value = this.parameter; parameter.onchange = () => { this.parameter = parameter.value; this.renderMultiAnalysis(); }; this.sensitivityHost.body.append(parameter); this.sensitivityPlot = el('div', { class: 'lab-chart' }); this.sensitivityCanvas = el('canvas', { 'aria-label': 'Return by selected parameter' }); this.sensitivityCaption = el('div', { class: 'chart-caption' }); this.sensitivityPlot.append(this.sensitivityCanvas); this.sensitivityHost.body.append(this.sensitivityPlot, this.sensitivityCaption); this.content.append(this.sensitivityHost);
        this.detailHost = panel('Individual run / environment', 'inference'); this.content.append(this.detailHost); this.renderLive();
      }
      compareStrategies(jobs, id, reference) {
        if (id === reference) return null;
        return L.comparison(jobs.filter(j => j.strategyId === id || j.strategyId === reference).map(j => ({ ...j, arm: j.strategyId === id ? 'strategy' : 'control' })), this.state.design.settings.confidence);
      }
      renderMultiLive() {
        const jobs = this.selectedJobs(), all = this.state.design.settings.strategies, visible = all.filter(s => !this.hiddenStrategies.has(s.id) && (!this.drillStrategy || this.drillStrategy === s.id)), summaries = this.strategySummaries(jobs).filter(s => visible.some(v => v.id === s.id));
        this.runToggle.textContent = this.running ? 'Pause experiment' : this.state.status === 'complete' ? 'Experiment complete' : 'Resume experiment'; this.runToggle.disabled = this.state.status === 'complete' || !this.running && (this.checkpointing || !!this.awaiting);
        this.progress.value = this.state.jobs.reduce((sum, j) => sum + (j.done ? 1 : Math.min(1, (j.stats?.rounds || 0) / this.state.design.settings.hands)), 0) / this.state.jobs.length; this.statusLabel.textContent = `${this.state.status} · ${this.state.jobs.filter(j => j.done).length}/${this.state.jobs.length} runs complete · tick ${this.tick} · ${this.workerKind}`;
        const leader = summaries.filter(s => s.summary.wager > 0).sort((a, b) => b.summary.roi.point - a.summary.roi.point)[0]; this.verdictHost.replaceChildren();
        for (const s of summaries) { const x = s.summary, row = el('div', { class: 'lab-comparison-row', style: `border-left-color:${this.color(s.id)}` }); const diff = this.compareStrategies(this.selectedJobs(true), s.id, this.reference); row.append(el('strong', {}, s.name + (s.id === leader?.id ? ' · highest observed ROI' : '')), el('div', {}, `${x.verdict} · edge ${x.wager ? pct(x.roi.point) : 'Unavailable'} · CI ${x.roi.ci ? x.roi.ci.map(pct).join(' to ') : 'Unavailable'} · ${x.varianceClass} variance · ${x.drawdownClass} drawdown · ${x.sensitivity}`)); if (s.id !== this.reference) row.append(el('small', {}, `Difference vs. ${this.strategyName(this.reference)}: ${diff ? `${pct(diff.point)} (${diff.ci.map(pct).join(' to ')})` : 'Unavailable'}`)); this.verdictHost.append(row); }
        if (this.state.status === 'complete' && this.cursor == null && !this.drillStrategy && !this.hiddenStrategies.size && summaries.some(s => s.summary.wager)) { const best = key => [...summaries].sort((a, b) => key(b.summary) - key(a.summary))[0]?.name, robust = summaries.filter(s => s.summary.betweenEnvironmentSD != null).sort((a, b) => a.summary.betweenEnvironmentSD - b.summary.betweenEnvironmentSD)[0]; this.verdictHost.append(el('p', { class: 'mode-copy' }, `Final observed leaders: return — ${best(s => s.roi.point)}; risk-adjusted return — ${best(s => s.riskAdjusted)}; lowest maximum drawdown — ${best(s => -s.maxDrawdown)}; lowest measured environment sensitivity — ${robust?.name || 'not established'}.`)); }
        const metrics = [['Net player result', s => money(s.profit)], ['Expected profit / 100 rounds', s => money(s.profit100)], ['Total wagered', s => money(s.wager)], ['Average opening wager', s => money(s.averageWager)], ['SD per round', s => money(s.sd)], ['Variance ($²)', s => (s.variance / 10000).toFixed(2)], ['Risk-adjusted mean / SD', s => s.riskAdjusted.toFixed(4)], ['Maximum drawdown', s => pct(s.maxDrawdown)], ['Bankruptcy / minimum crossing', s => pct(s.ruin.point)], ['Ruin-frequency CI', s => s.ruin.ci ? s.ruin.ci.map(pct).join(' to ') : 'Unavailable'], ['Win / loss / push rates', s => [s.wins, s.losses, s.pushes].map(v => pct(s.hands ? v / s.hands : null)).join(' / ')], ['Blackjack frequency', s => pct(s.hands ? s.blackjacks / s.hands : null)]];
        this.metricHost.replaceChildren(); for (const [label, value] of metrics) { const card = metric(this.metricHost, label, '', 'inference'), host = card.querySelector('.stat-value'); host.classList.add('lab-metric-values'); for (const s of summaries) host.append(el('div', { style: `color:${this.color(s.id)}` }, `${s.name}: ${s.summary.rounds ? value(s.summary) : '—'}`)); }
        const max = this.maxRound(), cursor = this.cursor == null ? max : Math.min(max, this.cursor); this.replaySlider.max = max || 1; this.replaySlider.value = cursor; this.replayLabel.textContent = `Round ${cursor} / ${max}`;
        requestAnimationFrame(() => this.refreshMultiCharts()); this.renderMultiAnalysis();
      }
      refreshMultiCharts() {
        if (!this.state?.design.settings.multiEnabled || api.active !== 'laboratory' || this.stageIndex !== 3) return;
        const jobs = this.selectedJobs(), max = this.cursor ?? this.maxRound(), samples = Math.min(251, max + 1), xs = [...new Set(Array.from({ length: samples }, (_, i) => Math.round(i / Math.max(1, samples - 1) * max)))];
        for (const chart of this.lineCharts || []) { const scale = chart.unit === '$' ? 100 : 1, series = [];
          for (const strategy of this.state.design.settings.strategies) { const group = jobs.filter(j => j.strategyId === strategy.id); if (!group.length) continue; const color = this.color(strategy.id);
            if (this.showRuns) for (const job of group) series.push({ id: job.id, label: `${strategy.name} · E${job.environment + 1} / S${job.session + 1}`, color, alpha: .3, points: xs.filter(x => x <= job.path.at(-1).round || job.done).map(x => ({ x, y: (this.pointAt(job, x)?.[chart.key] || 0) / scale })) });
            const clusters = this.showBands ? L.clusterGroups(group) : [];
            const mean = xs.map(x => { const values = group.filter(j => j.path.at(-1).round >= x || j.done).map(j => (this.pointAt(j, x)?.[chart.key] || 0) / scale), point = { x, y: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0 }; if (this.showBands) { const clusterValues = clusters.map(rows => rows.filter(j => j.path.at(-1).round >= x || j.done).map(j => (this.pointAt(j, x)?.[chart.key] || 0) / scale)).filter(v => v.length); const interval = L.ratioInterval(clusterValues, v => v.reduce((a, b) => a + b, 0), v => v.length, this.state.design.settings.confidence); if (interval.ci) [point.low, point.high] = interval.ci; } return point; });
            if (this.settings.fits.average) series.push({ id: 'strategy:' + strategy.id, label: strategy.name + ' average', color, width: 2.5, alpha: 1, points: mean });
            for (const [kind, enabled] of Object.entries(this.settings.fits)) if (enabled && kind !== 'average') series.push({ overlay: true, label: `${strategy.name} ${kind.toUpperCase()}`, color, width: 1.5, alpha: .65, points: L.fit(mean, kind, this.settings.window, this.settings.smoothing) });
          }
          api.chart(chart.canvas, series, { unit: chart.unit, caption: chart.caption, select: id => { if (id.startsWith('strategy:')) { this.drillStrategy = id.slice(9); this.drillEnvironment = this.drillSession = null; this.filter = ''; } else { const j = this.state.jobs.find(x => x.id === id); if (!j) return; this.drillStrategy = j.strategyId; this.drillEnvironment = j.environment; this.drillSession = j.session; this.filter = j.id; } this.refresh(); } });
        }
      }
      renderMultiAnalysis() {
        const jobs = this.selectedJobs(), strategies = this.state.design.settings.strategies;
        if (this.distributionHost.parentElement.open && !this.queueDistributions(jobs, true)) {
        this.distributionHost.replaceChildren();
        for (const [title, accessor] of [['Session profit distribution $', j => j.stats.profit / 100], ['Drawdown distribution', j => j.stats.drawdown]]) {
          const valid = jobs.filter(j => j.stats), vals = valid.map(accessor), lo = Math.min(0, ...vals), hi = Math.max(lo + 1e-6, ...vals), bins = 10, values = [];
          for (let i = 0; i < bins; i++) for (const s of strategies) { const count = valid.filter(j => j.strategyId === s.id && Math.min(bins - 1, Math.floor((accessor(j) - lo) / (hi - lo) * bins)) === i).length; if (valid.some(j => j.strategyId === s.id)) values.push({ label: `${s.name}: ${(lo + i * (hi - lo) / bins).toFixed(2)}–${(lo + (i + 1) * (hi - lo) / bins).toFixed(2)}`, value: count, color: this.color(s.id) }); }
          const card = el('section', { class: 'lab-chart-panel' }), wrap = el('div', { class: 'lab-chart' }), canvas = el('canvas', { 'aria-label': title }), caption = el('div', { class: 'chart-caption' }); wrap.append(canvas); card.append(heading('h3', title, 'inference'), wrap, caption); this.distributionHost.append(card); requestAnimationFrame(() => api.bars(canvas, values, { caption }));
        }
        const chart = (title, values) => { const card = el('section', { class: 'lab-chart-panel' }), wrap = el('div', { class: 'lab-chart' }), canvas = el('canvas', { 'aria-label': title }), caption = el('div', { class: 'chart-caption' }); wrap.append(canvas); card.append(heading('h3', title, 'inference'), wrap, caption); this.distributionHost.append(card); requestAnimationFrame(() => api.bars(canvas, values, { caption })); };
        for (const [type, title] of [['count', 'Return by opening true count'], ['penetration', 'Return by shoe penetration'], ['bet', 'Opening wager distribution $']]) {
          const grouped = new Map(); for (const job of jobs.filter(j => j.stats)) for (const [key, bin] of Object.entries(job.bins[type])) { const id = `${key}\u0000${job.strategyId}`; if (!grouped.has(id)) grouped.set(id, []); grouped.get(id).push({ ...job, stats: { ...job.stats, profit: bin.profit, wager: bin.wager, rounds: bin.n } }); }
          const values = [...grouped].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([key, group]) => { const [bucket, id] = key.split('\u0000'), summary = L.summarize(group, this.state.design.settings.confidence); return { label: `${bucket} · ${this.strategyName(id)}`, value: type === 'bet' ? group.reduce((n, j) => n + j.stats.rounds, 0) : summary.roi.point, ci: type === 'bet' ? null : summary.roi.ci, color: this.color(id) }; }); chart(title, values);
        }
        for (const [key, title, categories] of [['outcomes', 'Settled outcomes', ['wins', 'losses', 'pushes', 'blackjacks']], ['actions', 'Strategy decision frequencies', ['hit', 'stand', 'double', 'split', 'surrender']]]) {
          const values = []; for (const category of categories) for (const s of strategies) { const group = jobs.filter(j => j.strategyId === s.id && j.stats); if (!group.length) continue; values.push({ label: `${category} · ${s.name}`, value: group.reduce((sum, j) => sum + (key === 'actions' ? j.stats.actions?.[category] || 0 : j.stats[category] || 0), 0), color: this.color(s.id) }); } chart(title, values);
        }
        const ruleGroups = new Map(); for (const job of jobs.filter(j => j.stats)) { const r = job.config.rules, label = `${r.dealer.mode}/${r.dealer.hole}/${r.payout.numerator / r.payout.denominator}/${r.dealer.das ? 'DAS' : 'NDAS'}/${r.dealer.surrender ? 'LS' : 'NS'}`, key = `${label}\u0000${job.strategyId}`; if (!ruleGroups.has(key)) ruleGroups.set(key, []); ruleGroups.get(key).push(job); }
        chart('Expected return by realized rule configuration', [...ruleGroups].map(([key, group]) => { const [label, id] = key.split('\u0000'), summary = L.summarize(group, this.state.design.settings.confidence); return { label: `${label} · ${this.strategyName(id)}`, value: summary.roi.point, ci: summary.roi.ci, color: this.color(id) }; }));
        }
        this.renderRunTable(jobs);
        const descriptor = L.PARAMETERS.find(d => d.key === this.parameter), valid = jobs.filter(j => j.stats), values = valid.map(j => this.parameter === 'payout' ? j.config.rules.payout.numerator / j.config.rules.payout.denominator : L.get(j.config, this.parameter));
        const numeric = !descriptor.values && new Set(values).size > 8, min = Math.min(...values.filter(Number.isFinite)), max = Math.max(...values.filter(Number.isFinite)), groups = new Map();
        valid.forEach((j, i) => { const bucket = numeric ? `${(min + Math.min(4, Math.floor((values[i] - min) / Math.max(1e-6, max - min) * 5)) / 5 * (max - min)).toFixed(2)} bin` : String(values[i]), key = `${bucket}\u0000${j.strategyId}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(j); });
        const bars = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => { const [bucket, id] = key.split('\u0000'), summary = L.summarize(group, this.state.design.settings.confidence); return { label: `${bucket} · ${this.strategyName(id)}`, value: summary.roi.point, ci: summary.roi.ci, color: this.color(id) }; }); requestAnimationFrame(() => api.bars(this.sensitivityCanvas, bars, { caption: this.sensitivityCaption })); this.sensitivityCaption.textContent = 'Associations across realized conditions, not isolated causal effects.';
        this.renderDetails();
      }
      results() {
        if (!this.state) { this.content.append(el('p', { class: 'mode-copy' }, 'Preview a design, then run the experiment to generate real results.')); return; }
        if (this.state.design.settings.multiEnabled) { this.multiResults(); return; }
        const controls = el('div', { class: 'mode-controls' }); this.runToggle = button(this.running ? 'Pause experiment' : 'Resume experiment', () => this.running ? this.pauseExperiment() : this.resume()); controls.append(this.runToggle, button('Export summary JSON', () => api.download('blackjack-laboratory-summary.json', { design: this.state.design, summary: L.summarize(this.state.jobs, this.state.design.settings.confidence, true), jobs: this.state.jobs.map(({ path, ...j }) => j) })), button('Export all paths JSON', () => api.download('blackjack-laboratory-paths.json', { design: this.state.design, jobs: this.state.jobs })), button('Export CSV', () => this.exportCSV()), this.clearResultsButton()); this.content.append(controls);
        const completion = el('div', { class: 'lab-completion' }); this.progress = el('progress', { max: 1, value: 0 }); this.statusLabel = el('span'); completion.append(this.progress, this.statusLabel); this.content.append(completion);
        const verdict = panel('Strategy verdict & uncertainty', 'inference'); this.verdictHost = verdict.body; this.content.append(verdict);
        this.metricHost = el('div', { class: 'metrics' }); this.content.append(this.metricHost);
        const fits = el('div', { class: 'lab-fit-controls' }); fits.append(heading('h3', 'Live overlays', 'fits'));
        for (const [key, label] of [['average', 'Average'], ['lr', 'LR'], ['gam', 'GAM spline'], ['sma', 'SMA']]) {
          const checkbox = el('input', { type: 'checkbox', id: 'lab-fit-' + key, checked: this.settings.fits[key] }), title = el('label', { for: checkbox.id }, label); title.prepend(checkbox); checkbox.onchange = () => { this.settings.fits[key] = checkbox.checked; api.persist(); this.refreshCharts(); }; fits.append(title, api.info(label, null, 'fits'));
        }
        fits.append(field('SMA window', 'number', this.settings.window, value => { this.settings.window = Math.max(1, Math.min(1000, value)); api.persist(); this.refreshCharts(); }, { min: 1, max: 1000, step: 1, category: 'fits' }), field('GAM smoothing penalty', 'number', this.settings.smoothing, value => { this.settings.smoothing = Math.max(.0001, value); api.persist(); this.refreshCharts(); }, { min: .0001, max: 100000, step: .1, category: 'fits' })); this.content.append(fits);
        const replay = el('div', { class: 'lab-replay' }); this.replaySlider = el('input', { type: 'range', min: 0, max: 1, value: 1, 'aria-label': 'Replay round cursor' }); this.replayLabel = el('span');
        this.replaySlider.oninput = () => { this.cursor = +this.replaySlider.value; this.renderLive(); };
        replay.append(button('Replay all paths', () => { clearInterval(this.replayTimer); this.cursor = 0; this.replayTimer = setInterval(() => { const max = this.maxRound(); this.cursor = Math.min(max, this.cursor + Math.max(1, Math.ceil(max / 400))); this.renderLive(); if (this.cursor >= max) clearInterval(this.replayTimer); }, 50); }), this.replaySlider, this.replayLabel, button('Follow live', () => { clearInterval(this.replayTimer); this.cursor = null; this.renderLive(); })); this.content.append(replay);
        const filter = el('select', { id: 'lab-run-filter', 'aria-label': 'Filter or drill into a run' }); filter.append(el('option', { value: '' }, 'All runs concurrently'));
        for (const job of this.state.jobs) filter.append(el('option', { value: job.id }, `Environment ${job.environment + 1} · session ${job.session + 1} · ${job.arm}`)); filter.value = this.filter;
        filter.onchange = () => { this.filter = filter.value; this.renderLive(); }; this.content.append(filter);
        this.lineCharts = []; const grid = el('div', { class: 'lab-grid' });
        for (const [key, label, unit] of [['profit', 'Net player result · every run', '$'], ['bankroll', 'Bankroll / total equity · every run', '$'], ['drawdown', 'Maximum drawdown · every run', '%'], ['roi', 'Return on wager · every run', '%'], ['bet', 'Opening wager · every run', '$'], ['tc', 'True count · every run', '']]) {
          const card = el('section', { class: 'lab-chart-panel' }); card.append(heading('h3', label, 'fits')); const wrap = el('div', { class: 'lab-chart' }), canvas = el('canvas', { 'aria-label': label }), caption = el('div', { class: 'chart-caption' }); wrap.append(canvas); card.append(wrap, caption); grid.append(card); this.lineCharts.push({ key, label, unit, canvas, caption });
        }
        this.content.append(heading('h2', 'Run trajectories', 'fits'), el('p', { class: 'mode-copy' }, 'Each line follows a run. Use the filter and replay controls above to inspect a particular run or point in time.'), grid);
        const distributions = el('details', { class: 'lab-disclosure' }); distributions.append(api.summary('Outcome distributions')); this.distributionHost = el('div', { class: 'lab-grid' }); distributions.append(this.distributionHost); distributions.ontoggle = () => { if (distributions.open) this.renderDistributions(this.selectedJobs()); }; this.content.append(distributions);
        this.tableHost = panel('Best / worst environments and run details', 'inference'); this.content.append(this.tableHost);
        this.sensitivityHost = panel('Parameter sensitivity', 'inference');
        const select = el('select', { 'aria-label': 'Sensitivity parameter' }); L.PARAMETERS.forEach(d => select.append(el('option', { value: d.key }, d.label))); select.value = this.parameter; select.onchange = () => { this.parameter = select.value; this.renderSensitivity(); }; this.sensitivityHost.body.append(select); this.sensitivityPlot = el('div', { class: 'lab-chart' }); this.sensitivityCanvas = el('canvas', { 'aria-label': 'Return by selected parameter' }); this.sensitivityPlot.append(this.sensitivityCanvas); this.sensitivityCaption = el('div', { class: 'chart-caption' }); this.sensitivityHost.body.append(this.sensitivityPlot, this.sensitivityCaption); this.content.append(this.sensitivityHost);
        this.detailHost = panel('Individual run / environment', 'inference'); this.content.append(this.detailHost); this.renderLive();
      }
      maxRound() { return this.state ? Math.max(0, ...this.state.jobs.map(j => j.path.at(-1)?.round || 0)) : 0; }
      pointAt(job, round) { let lo = 0, hi = job.path.length - 1; while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (job.path[mid].round <= round) lo = mid; else hi = mid - 1; } return job.path[lo]; }
      renderLive() {
        if (!this.state || api.active !== 'laboratory' || this.stageIndex !== 3 || !this.metricHost) return;
        if (this.state.design.settings.multiEnabled) { this.renderMultiLive(); return; }
        const settings = this.state.design.settings, jobs = this.selectedJobs(), max = this.maxRound(), cursor = this.cursor == null ? max : Math.min(max, this.cursor), summary = L.summarize(this.filter ? jobs.map(j => ({ ...j, arm: 'strategy' })) : jobs, settings.confidence, false);
        if (this.runToggle) { this.runToggle.textContent = this.running ? 'Pause experiment' : this.state.status === 'complete' ? 'Experiment complete' : 'Resume experiment'; this.runToggle.disabled = this.state.status === 'complete' || !this.running && (this.checkpointing || !!this.awaiting); }
        this.progress.value = this.state.jobs.filter(j => j.done).length / this.state.jobs.length;
        this.statusLabel.textContent = `${this.state.status} · ${this.state.jobs.filter(j => j.done).length}/${this.state.jobs.length} runs complete · tick ${this.tick} · ${this.workerKind}`;
        this.verdictHost.replaceChildren(el('div', { class: 'lab-verdict' }, summary.verdict), el('p', {}, `Estimated edge ${pct(summary.roi.point)} · ${Math.round(settings.confidence * 100)}% CI ${summary.roi.ci ? summary.roi.ci.map(pct).join(' to ') : 'unavailable'} · ${summary.clusters} independent clusters · ${summary.environments} environments · ${summary.sessions} sessions · ${summary.rounds.toLocaleString()} hands/rounds.`));
        const chips = el('div', { class: 'mode-controls' }); for (const text of [`${summary.varianceClass} variance`, `${summary.drawdownClass} drawdown risk`, summary.sensitivity]) chips.append(el('span', { class: 'lab-chip' }, text)); this.verdictHost.append(chips);
        const compare = settings.compare ? L.comparison(jobs, settings.confidence) : null;
        if (compare) this.verdictHost.append(el('p', {}, `Strategy minus control ROI: ${pct(compare.point)} [${compare.ci.map(pct).join(', ')}]. ${settings.paired ? 'Common shoe seeds; decisions can consume cards differently.' : 'Independent arm seeds; environment-cluster comparison.'}`));
        if (this.cursor == null && this.state.status === 'complete' && !this.filter && this.state.summary?.bootstrapPositive != null) this.verdictHost.append(el('p', {}, 'Bootstrap estimates above zero: ' + pct(this.state.summary.bootstrapPositive) + ' (resampling stability, not a posterior probability).'));
        this.metricHost.replaceChildren();
        for (const [label, value] of [['Net player result', money(summary.profit)], ['Expected profit / 100 rounds', money(summary.profit100)], ['Total wagered', money(summary.wager)], ['Average opening wager', money(summary.averageWager)], ['SD per round', money(summary.sd)], ['Variance ($²)', (summary.variance / 10000).toFixed(2)], ['Risk-adjusted mean / SD', summary.riskAdjusted.toFixed(4)], ['Maximum drawdown', pct(summary.maxDrawdown)], ['Bankruptcy / minimum crossing', pct(summary.ruin.point)], ['Ruin-frequency CI', summary.ruin.ci ? summary.ruin.ci.map(v => pct(Math.max(0, Math.min(1, v)))).join(' to ') : 'Unavailable'], ['Win / loss / push rates', [summary.wins, summary.losses, summary.pushes].map(v => pct(summary.hands ? v / summary.hands : null)).join(' / ')], ['Blackjack frequency', pct(summary.hands ? summary.blackjacks / summary.hands : null)]]) metric(this.metricHost, label, value, 'inference');
        this.replaySlider.max = max || 1; this.replaySlider.value = cursor; this.replayLabel.textContent = `Round ${cursor} / ${max}`;
        requestAnimationFrame(() => this.refreshCharts()); this.renderDistributions(jobs); this.renderRunTable(jobs); this.renderSensitivity(); this.renderDetails();
      }
      refreshCharts() {
        if (this.state?.design.settings.multiEnabled) { this.refreshMultiCharts(); return; }
        if (!this.state || api.active !== 'laboratory' || this.stageIndex !== 3) return;
        const jobs = this.selectedJobs(), max = this.cursor ?? this.maxRound(), samples = Math.min(251, max + 1), xs = [...new Set(Array.from({ length: samples }, (_, i) => Math.round(i / Math.max(1, samples - 1) * max)))];
        for (const chart of this.lineCharts || []) {
          const scale = chart.unit === '$' ? 100 : 1;
          const series = jobs.map((job, index) => ({ id: job.id, label: `${job.environment + 1}/${job.session + 1} ${job.arm}`, color: `hsl(${job.environment * 137.5 % 360} ${job.arm === 'control' ? 25 : 45}% ${job.arm === 'control' ? 47 : 67}%)`,
            points: xs.filter(x => x <= (job.path.at(-1)?.round || 0) || job.done).map(x => ({ x, y: (this.pointAt(job, x)?.[chart.key] || 0) / scale })) }));
          const mean = xs.map(x => { const values = jobs.filter(j => j.path.at(-1).round >= x || j.done).map(j => this.pointAt(j, x)?.[chart.key] || 0); return { x, y: values.length ? values.reduce((a, b) => a + b, 0) / values.length / scale : 0 }; });
          const colors = { average: '#ffffff', lr: '#e7bd7b', gam: '#e5a3c2', sma: '#8bcee2' };
          for (const [kind, on] of Object.entries(this.settings.fits)) if (on) series.push({ label: kind.toUpperCase(), overlay: true, color: colors[kind], width: 2.5, alpha: 1, points: L.fit(mean, kind, this.settings.window, this.settings.smoothing) });
          api.chart(chart.canvas, series, { unit: chart.unit, caption: chart.caption, select: id => { this.filter = id; document.getElementById('lab-run-filter').value = id; this.renderLive(); } });
        }
      }
      renderDistributions(jobs) {
        if (this.queueDistributions(jobs, false)) return;
        if (this.filter) jobs = jobs.map(j => ({ ...j, arm: 'strategy' }));
        this.distributionHost.replaceChildren();
        const cards = [];
        const histogram = (key, title, accessor, bins = 12) => {
          const vals = jobs.filter(j => j.stats && j.arm === 'strategy').map(accessor), lo = Math.min(0, ...vals), hi = Math.max(lo + 1e-6, ...vals), counts = Array(bins).fill(0); vals.forEach(v => counts[Math.min(bins - 1, Math.floor((v - lo) / (hi - lo) * bins))]++);
          cards.push({ title, values: counts.map((n, i) => ({ label: `${(lo + i / bins * (hi - lo)).toFixed(2)} to ${(lo + (i + 1) / bins * (hi - lo)).toFixed(2)}`, value: n, low: lo + i / bins * (hi - lo), high: lo + (i + 1) / bins * (hi - lo) })), select: value => { const match = jobs.find(j => j.stats && accessor(j) >= value.low && accessor(j) <= value.high); if (match) { this.filter = match.id; this.refresh(); } } });
        };
        histogram('profit', 'Session profit histogram $', j => j.stats.profit / 100); histogram('drawdown', 'Drawdown distribution (fraction)', j => j.stats.drawdown);
        for (const [type, title] of [['count', 'Return by opening true count'], ['penetration', 'Return by shoe penetration'], ['bet', 'Opening wager distribution $']]) {
          const groups = new Map();
          for (const job of jobs.filter(j => j.arm === 'strategy')) for (const [key, value] of Object.entries(job.bins[type])) { const g = groups.get(+key) || []; g.push({ ...job, stats: { ...job.stats, profit: value.profit, wager: value.wager, rounds: value.n } }); groups.set(+key, g); }
          cards.push({ title, values: [...groups].sort((a, b) => a[0] - b[0]).map(([key, group]) => { const s = L.summarize(group, this.state.design.settings.confidence), label = type === 'count' ? String(key) : type === 'penetration' ? `${key * 10}–${key * 10 + 10}%` : `${(2 ** (key / 2)).toFixed(2)}–${(2 ** ((key + 1) / 2)).toFixed(2)}`; return { label, value: type === 'bet' ? group.reduce((n, j) => n + j.stats.rounds, 0) : s.roi.point, ci: type === 'bet' ? null : s.roi.ci }; }) });
        }
        const strategyJobs = jobs.filter(j => j.arm === 'strategy' && j.stats), total = key => strategyJobs.reduce((s, j) => s + (j.stats[key] || 0), 0);
        cards.push({ title: 'Settled outcomes (blackjacks are a win/push subset)', values: [['wins', 'Wins'], ['losses', 'Losses'], ['pushes', 'Pushes'], ['blackjacks', 'Blackjacks']].map(([key, label]) => ({ label, value: total(key) })) });
        const actions = {}; for (const job of strategyJobs) for (const [key, n] of Object.entries(job.stats.actions)) actions[key] = (actions[key] || 0) + n;
        cards.push({ title: 'Strategy decision frequencies', values: Object.entries(actions).map(([label, value]) => ({ label, value })) });
        const ruleGroups = new Map(); for (const job of strategyJobs) { const r = job.config.rules, key = `${r.dealer.mode}/${r.dealer.hole}/${r.payout.numerator / r.payout.denominator}/${r.dealer.das ? 'DAS' : 'NDAS'}/${r.dealer.surrender ? 'LS' : 'NS'}`; const group = ruleGroups.get(key) || []; group.push(job); ruleGroups.set(key, group); }
        cards.push({ title: 'Expected return by realized rule configuration', values: [...ruleGroups].map(([label, group]) => { const s = L.summarize(group, this.state.design.settings.confidence); return { label, value: s.roi.point, ci: s.roi.ci }; }) });
        for (const card of cards) { const container = el('section', { class: 'lab-chart-panel' }); container.append(heading('h3', card.title, 'inference')); const wrap = el('div', { class: 'lab-chart' }), canvas = el('canvas', { 'aria-label': card.title }), caption = el('div', { class: 'chart-caption' }); wrap.append(canvas); container.append(wrap, caption); this.distributionHost.append(container); requestAnimationFrame(() => api.bars(canvas, card.values, { caption, select: card.select })); }
      }
      renderRunTable(jobs) {
        this.tableHost.body.replaceChildren(); const table = el('table', { class: 'lab-results-table' }), header = el('tr'); ['Run', 'Rules', 'Rounds', 'Profit', 'ROI', 'Drawdown', 'Status'].forEach(x => header.append(el('th', {}, x))); table.append(header);
        for (const job of [...jobs].sort((a, b) => (b.stats?.profit || 0) - (a.stats?.profit || 0))) {
          const tr = el('tr'), name = el('td'); name.append(button(`Env ${job.environment + 1} / S${job.session + 1} / ${this.strategyName(job.strategyId || job.arm)}`, () => { this.filter = job.id; if (job.strategyId) { this.drillStrategy = job.strategyId; this.drillEnvironment = job.environment; this.drillSession = job.session; } this.refresh(); })); tr.append(name);
          for (const value of [job.config.decks + 'D ' + job.config.rules.dealer.mode, job.stats?.rounds || 0, money(job.stats?.profit || 0), pct(job.stats?.wager ? job.stats.profit / job.stats.wager : null), pct(job.stats?.drawdown || 0), job.done ? job.reason : 'In progress']) tr.append(el('td', {}, value)); table.append(tr);
        }
        const scroll = el('div', { class: 'lab-scroll' }); scroll.append(table); this.tableHost.body.append(scroll);
      }
      renderSensitivity() {
        if (!this.state || !this.sensitivityCanvas) return; const jobs = this.selectedJobs().filter(j => (this.filter || j.arm === 'strategy') && j.stats), descriptor = L.PARAMETERS.find(d => d.key === this.parameter), groups = new Map();
        const values = jobs.map(j => this.parameter === 'payout' ? j.config.rules.payout.numerator / j.config.rules.payout.denominator : L.get(j.config, this.parameter));
        const numeric = !descriptor.values && new Set(values).size > 8, min = Math.min(...values.filter(Number.isFinite)), max = Math.max(...values.filter(Number.isFinite));
        jobs.forEach((j, i) => { const key = numeric ? `${(min + Math.floor((values[i] - min) / Math.max(1e-6, max - min) * 5) / 5 * (max - min)).toFixed(2)} bin` : String(values[i]); const g = groups.get(key) || []; g.push(j); groups.set(key, g); });
        const bars = [...groups].map(([label, group]) => { const summary = L.summarize(group, this.state.design.settings.confidence); return { label, value: summary.roi.point, ci: summary.roi.ci }; });
        requestAnimationFrame(() => api.bars(this.sensitivityCanvas, bars, { caption: this.sensitivityCaption })); this.sensitivityCaption.textContent = 'Associations across the realized design, not isolated causal effects. Intervals are unavailable for fewer than two independent clusters.';
      }
      renderDetails() {
        if (!this.detailHost) return; this.detailHost.body.replaceChildren(); const selected = this.selectedJobs(); const job = this.state.jobs.find(j => j.id === this.filter) || (selected.length === 1 ? selected[0] : null);
        if (!job) {
          const multi = !!this.state.design.settings.multiEnabled, examples = L.exampleRuns(multi ? this.selectedJobs(true) : selected, multi ? (this.reference || this.state.design.settings.strategies[0].id) : null);
          if (!examples.length) { this.detailHost.body.append(el('p', { class: 'mode-copy' }, multi ? 'Matched examples appear as strategies complete rounds in the same environment and session.' : 'Run examples appear as rounds are completed.')); return; }
          this.detailHost.body.append(el('p', { class: 'mode-copy' }, multi ? 'Matched examples compare return on wager against the selected reference in the same environment and session.' : 'Examples use return on wager. Anomalous combines unusual return and volatility relative to the other runs.'));
          const list = el('div', { class: 'lab-example-grid' });
          for (const example of examples) { const run = this.state.jobs.find(j => j.id === example.jobId), ref = example.referenceId ? this.state.jobs.find(j => j.id === example.referenceId) : null, card = el('div', { class: 'lab-example' });
            card.append(el('strong', {}, example.label), el('span', {}, `${multi ? this.strategyName(run.strategyId) + ' vs ' + this.strategyName(ref.strategyId) + ' · ' : ''}Env ${run.environment + 1} / session ${run.session + 1}`), el('span', {}, `${multi ? 'ROI difference' : 'ROI'}: ${pct(example.value)}`), button('Inspect', () => { this.filter = run.id; if (multi) { this.drillStrategy = run.strategyId; this.drillEnvironment = run.environment; this.drillSession = run.session; } this.refresh(); })); list.append(card); }
          this.detailHost.body.append(list, el('small', { class: 'mode-copy' }, 'Anomaly is a descriptive rank, not a probability or significance test.')); return;
        }
        this.detailHost.body.append(el('p', {}, `${this.strategyName(job.strategyId || job.arm)} · Environment ${job.environment + 1}, session ${job.session + 1}. Seed ${job.config.seed}; rebuys ${job.rebuys || 0}.`));
        if (job.strategyId) { const other = el('select', { 'aria-label': 'Inspect another strategy in this environment and session' }); for (const s of this.state.design.settings.strategies) other.append(el('option', { value: s.id }, s.name)); other.value = job.strategyId; other.onchange = () => { const next = this.state.jobs.find(j => j.strategyId === other.value && j.environment === job.environment && j.session === job.session); if (next) { this.hiddenStrategies.delete(next.strategyId); this.drillStrategy = next.strategyId; this.drillEnvironment = next.environment; this.drillSession = next.session; this.filter = next.id; this.refresh(); } }; this.detailHost.body.append(other); }
        const controls = el('div', { class: 'transfer-row' }); controls.append(button('Open this environment in Simulator', () => api.transferConfig('simulator', job.config)), button('Play this strategy', () => api.transferConfig('play', job.config)), button('Practice this strategy in Learn', () => api.transferConfig('learn', job.config)), button('Replay table at cursor', () => this.replayTable(job))); this.detailHost.body.append(controls);
        const detail = el('details'); detail.append(api.summary('Realized environment configuration'), el('pre', { class: 'mode-review' }, JSON.stringify(job.config, null, 2))); this.detailHost.body.append(detail);
      }
      async replayTable(job) {
        const target = Math.max(1, Math.min(this.cursor ?? this.maxRound(), job.stats?.rounds || 1)), settings = { ...this.state.design.settings, tickHands: 1, hands: target };
        const dialog = el('dialog', { class: 'mode-help' }), host = el('div'); dialog.append(heading('h2', `Replay environment ${job.environment + 1}, round ${target}`, 'statistics'), host); const cancel = button('Close', () => { worker?.terminate(); dialog.close(); dialog.remove(); }); dialog.append(cancel); document.body.append(dialog); dialog.showModal(); host.append(el('p', {}, 'Reconstructing the exact seeded run…')); let worker = null;
        const done = snapshot => { host.replaceChildren(api.table(snapshot, job.config, null, false, 'RC ' + snapshot.count)); worker?.terminate(); };
        try {
          worker = new Worker('./lab-worker.js'); worker.onmessage = event => { if (event.data.type === 'replay') done(event.data.snapshot); else if (event.data.type === 'error') host.textContent = event.data.message; };
          worker.onerror = event => { event.preventDefault(); worker?.terminate(); worker = null; fallback(); }; worker.postMessage({ type: 'replay', job, settings, round: target });
        } catch { fallback(); }
        function fallback() { const shard = new L.Shard([job], settings); const step = () => { if (!dialog.open) return; const start = performance.now(); do { shard.tick(); } while (!shard.jobs[0].done && shard.jobs[0].rounds < target && performance.now() - start < 8); if (shard.jobs[0].done || shard.jobs[0].rounds >= target) done(shard.jobs[0].sim.snap(null)); else setTimeout(step, 0); }; step(); }
      }
      exportCSV() {
        const rows = [['strategy_id', 'strategy_name', 'environment', 'session', 'arm', 'round', 'net_profit_dollars', 'bankroll_equity_dollars', 'opening_wager_dollars', 'total_wager_dollars', 'drawdown', 'roi', 'running_count', 'true_count', 'opening_tc', 'penetration', 'configuration_json']];
        for (const job of this.state.jobs) for (const p of job.path.slice(1)) rows.push([job.strategyId || job.arm, this.strategyName(job.strategyId || job.arm), job.environment + 1, job.session + 1, job.arm, p.round, p.profit / 100, p.bankroll / 100, p.bet / 100, p.wager / 100, p.drawdown, p.roi, p.rc, p.tc, p.openingTC, p.penetration, JSON.stringify(job.config)]);
        api.download('blackjack-laboratory-all-runs.csv', rows.map(row => row.map(v => '"' + String(v).replaceAll('"', '""') + '"').join(',')).join('\r\n'));
      }
    };
  }
  return { create };
})();
