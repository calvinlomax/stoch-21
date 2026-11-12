const { test, expect } = require('@playwright/test');
const mode = (page, name) => page.getByRole('tab', { name, exact: true }).click();
test.beforeEach(async ({ page }) => { await page.goto('/'); });
test('mode switching isolates settings, saves presets and transfers cloned configurations', async ({ page }) => {
  await mode(page, 'Play'); await page.getByRole('button', { name: 'New session', exact: true }).click(); await page.locator('#play-decks').fill('2'); await page.locator('#play-starting').click(); await page.locator('.mode-settings').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Presets & transfer' }).click(); await page.locator('#modePresetName').fill('Two deck practice'); await page.locator('#modeToolbar').getByRole('button', { name: 'Save', exact: true }).click(); await page.locator('#modeToolbar').getByRole('button', { name: 'Close', exact: true }).click();
  await mode(page, 'Simulator'); await expect(page.locator('#decks')).toHaveValue('6'); await mode(page, 'Play'); await page.getByRole('button', { name: 'New session', exact: true }).click(); await expect(page.locator('#play-decks')).toHaveValue('2'); await page.locator('.mode-settings').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Presets & transfer' }).click(); await page.locator('#modeTransferTarget').selectOption('learn'); await page.getByRole('button', { name: 'Open configuration →' }).click(); await page.getByRole('button', { name: 'Learning settings' }).click(); await page.getByText('Table & strategy settings').click(); await expect(page.locator('#learn-decks')).toHaveValue('2');
  await page.locator('#learn-decks').fill('8'); await page.locator('#learn-penetration').click(); await page.locator('.mode-settings').getByRole('button', { name: 'Done', exact: true }).click(); await mode(page, 'Play'); await page.getByRole('button', { name: 'New session', exact: true }).click(); await expect(page.locator('#play-decks')).toHaveValue('2'); await page.locator('.mode-settings').getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload(); await page.getByRole('button', { name: 'New session', exact: true }).click(); await expect(page.locator('#play-decks')).toHaveValue('2'); await page.locator('.mode-settings').getByRole('button', { name: 'Close', exact: true }).click(); await page.getByRole('button', { name: 'Presets & transfer' }).click(); await expect(page.locator('#modePreset')).toContainText('Two deck practice');
});
test('Play deals actual cards, offers legal actions, persists active state and settles wagers', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await mode(page, 'Play'); await page.getByRole('button', { name: 'New session', exact: true }).click(); await page.getByRole('button', { name: 'Advanced settings', exact: true }).click(); await page.locator('#play-speed').selectOption('25'); await page.locator('#play-opponents').fill('0'); await page.locator('#play-seed').fill('12345'); await page.locator('.mode-settings-more').getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Start session', exact: true }).click(); await page.getByRole('button', { name: 'Deal', exact: true }).click();
  for (let i = 0; i < 10; i++) {
    await page.waitForFunction(() => [...document.querySelectorAll('.game-action-bar button')].some(b => !b.disabled && ['Stand', 'Decline', 'Next hand'].includes(b.textContent)));
    if (await page.getByRole('button', { name: 'Next hand', exact: true }).count()) break;
    const insurance = page.getByRole('button', { name: 'Decline', exact: true });
    if (await insurance.count()) await insurance.click(); else await page.locator('[data-action="stand"]').click();
  }
  await expect(page.getByRole('button', { name: 'Next hand', exact: true })).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: '/private/tmp/stoch21-play-mode.png' });
  await page.getByRole('button', { name: 'Next hand', exact: true }).click(); await expect(page.locator('#play-wager')).toBeVisible();
  await page.reload(); await expect(page.locator('#play-wager')).toBeVisible(); await page.getByRole('button', { name: 'Finish session', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Session review', exact: true })).toBeVisible();
  const result = await page.evaluate(() => { const g = BJModes.InteractiveSession.restore(BJWorkspace.store.mode('play').game); return { rounds: g.stats.rounds, profit: g.stats.profit, bank: g.sim.players.find(p => p.seat === g.config.heroSeat).balance, initial: g.stats.initial }; });
  expect(result.rounds).toBe(1); expect(result.bank - result.initial).toBe(result.profit); expect(errors).toEqual([]);
});
test('Learn drills score errors, show explanations and retain progress after reload', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await mode(page, 'Learn'); await page.locator('[data-learn-tab="drills"]').click(); await page.locator('#drill-category').selectOption('cardValue'); await page.locator('#drill-questions').fill('2'); await page.getByRole('button', { name: 'Start drill session', exact: true }).click();
  await page.locator('#drill-answer').fill('100'); await page.getByRole('button', { name: 'Submit answer', exact: true }).click(); await expect(page.locator('.feedback-box')).toContainText('Incorrect');
  await page.getByRole('button', { name: 'Next question', exact: true }).click(); const rank = (await page.locator('.drill-stage img').first().getAttribute('alt')).split(' ')[0]; const answer = rank === 'ace' || ['10', 'jack', 'queen', 'king'].includes(rank) ? -1 : +rank <= 6 ? 1 : 0;
  await page.locator('#drill-answer').fill(String(answer)); await page.getByRole('button', { name: 'Submit answer', exact: true }).click(); await expect(page.getByText(/1\/2 correct/)).toBeVisible();
  await page.reload(); const progress = await page.evaluate(() => BJWorkspace.store.mode('learn').progress.categories.cardValue); expect(progress.attempted).toBe(2); expect(progress.correct).toBe(1); expect(errors).toEqual([]);
});
test('Guided feedback honors session-end timing and reveals incorrect actions in review', async ({ page }) => {
  await mode(page, 'Learn'); await page.getByRole('button', { name: 'Learning settings' }).click(); await page.getByText('Table & strategy settings').click(); await page.locator('#learn-speed').selectOption('25'); await page.locator('#learn-opponents').fill('0'); await page.locator('#learn-seed').fill('12345'); await page.locator('#learn-timing').selectOption('sessionEnd'); await page.locator('.mode-settings').getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Start guided session', exact: true }).click(); await page.getByRole('button', { name: 'Deal guided hand', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.game-action-bar button')].some(b => !b.disabled && ['Stand', 'Decline insurance', 'Next guided hand'].includes(b.textContent)));
  if (await page.getByRole('button', { name: 'Decline insurance', exact: true }).count()) await page.getByRole('button', { name: 'Decline insurance', exact: true }).click();
  const wrong = await page.evaluate(() => { const g = BJModes.InteractiveSession.restore(BJWorkspace.store.mode('learn').guided); if (g.prompt?.kind !== 'decision') return null; return BJModes.advise(g.prompt, g.sim, true).action === 'stand' ? 'hit' : 'stand'; });
  expect(wrong).not.toBeNull(); await page.locator(`[data-learn-action="${wrong}"]`).click();
  for (let i = 0; i < 10; i++) { await page.waitForFunction(() => [...document.querySelectorAll('.game-action-bar button')].some(b => !b.disabled && ['Stand', 'Next guided hand'].includes(b.textContent))); if (await page.getByRole('button', { name: 'Next guided hand', exact: true }).count()) break; await page.locator('[data-learn-action="stand"]').click(); }
  await expect(page.getByRole('button', { name: 'Next guided hand', exact: true })).toBeVisible(); expect(await page.locator('.feedback-box.incorrect').count()).toBe(0);
  await page.getByRole('button', { name: 'Finish guided session', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Guided session review', exact: true })).toBeVisible(); await expect(page.locator('.review-row').first()).toContainText('correct');
});
test('Laboratory executes real parallel arms, updates every trajectory and persists results', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await mode(page, 'Laboratory'); await page.locator('[data-lab-step="2"]').click();
  for (const [id, value] of [['environments', 4], ['sessions', 1], ['hands', 30], ['workers', 2]]) await page.locator('#lab-' + id).fill(String(value));
  await page.locator('#lab-compare').check(); await page.getByRole('button', { name: 'Preview actual design', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Resulting experiment design', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Run experiment', exact: true }).click();
  await expect(page.locator('.lab-completion')).toContainText('8/8 runs complete', { timeout: 30000 }); await page.locator('summary').filter({ hasText: 'Outcome distributions' }).click(); await expect.poll(() => page.locator('.lab-grid canvas').count()).toBeGreaterThanOrEqual(10);
  await page.locator('.lab-grid').first().screenshot({ path: '/private/tmp/stoch21-laboratory-charts.png' });
  await page.locator('#lab-fit-gam').check(); await page.locator('#lab-fit-lr').check(); await page.locator('#lab-fit-sma').check(); await page.getByRole('button', { name: 'Replay all paths', exact: true }).click();
  await page.getByRole('button', { name: 'Follow live', exact: true }).click(); await page.locator('#lab-run-filter').selectOption('0:0:strategy'); await expect(page.getByRole('button', { name: 'Open this environment in Simulator', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Replay table at cursor', exact: true }).click(); await expect(page.locator('dialog .live-table')).toBeVisible(); await page.locator('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(async () => page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('blackjack-laboratory-v1', 1); r.onsuccess = () => { const q = r.result.transaction('runs').objectStore('runs').get('latest'); q.onsuccess = () => resolve(q.result?.status); }; }))).toBe('complete');
  await page.reload(); await expect(page.locator('.lab-completion')).toContainText('8/8 runs complete'); expect(errors).toEqual([]);
});
test('mode help typesets math and all new modes fit a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'About Learn', exact: true }).click(); await expect(page.locator('#modeHelp math')).toHaveCount(2); expect(await page.locator('#modeHelp').innerText()).not.toContain('\\frac'); await page.locator('#modeHelp').getByRole('button', { name: 'Close' }).click();
  for (const name of ['Play', 'Learn', 'Laboratory', 'Simulator']) { await mode(page, name); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true); }
});
test('Laboratory pauses, checkpoints all shards and resumes to completion', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await mode(page, 'Laboratory'); await page.locator('[data-lab-step="2"]').click();
  for (const [id, value] of [['environments', 3], ['sessions', 1], ['hands', 2000], ['tickHands', 1], ['workers', 2]]) await page.locator('#lab-' + id).fill(String(value));
  await page.getByRole('button', { name: 'Preview actual design', exact: true }).click(); await page.getByRole('button', { name: 'Run experiment', exact: true }).click();
  await page.getByRole('button', { name: 'Pause experiment', exact: true }).click(); await expect(page.locator('.lab-completion')).toContainText('paused');
  await expect.poll(() => page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('blackjack-laboratory-v1', 1); r.onsuccess = () => { const q = r.result.transaction('runs').objectStore('runs').get('latest'); q.onsuccess = () => resolve(q.result?.checkpoints?.length || 0); }; }))).toBe(3);
  await page.locator('[data-lab-step="2"]').click(); await expect(page.getByRole('button', { name: 'Resume experiment', exact: true })).toBeEnabled(); await page.getByRole('button', { name: 'Resume experiment', exact: true }).click(); await page.getByRole('button', { name: 'Results & live metrics' }).click(); await expect(page.locator('.lab-completion')).toContainText('3/3 runs complete', { timeout: 30000 }); expect(errors).toEqual([]);
});
test('global reset clears separate mode state and does not save it again during unload', async ({ page }) => {
  await mode(page, 'Play'); await page.getByRole('button', { name: 'New session', exact: true }).click(); await page.locator('#play-decks').fill('2'); await page.locator('#play-starting').click(); await page.locator('.mode-settings').getByRole('button', { name: 'Close', exact: true }).click(); await page.getByRole('button', { name: 'Presets & transfer' }).click();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Reset all modes', exact: true }).click();
  await expect(page.locator('#decks')).toBeVisible(); await expect(page.locator('#decks')).toHaveValue('6'); await mode(page, 'Play'); await page.getByRole('button', { name: 'New session', exact: true }).click(); await expect(page.locator('#play-decks')).toHaveValue('6');
});
test('advanced guided estimation withholds the exact count and deck answers', async ({ page }) => {
  await mode(page, 'Learn'); await page.getByRole('button', { name: 'Learning settings' }).click(); await page.locator('#learn-assistance').selectOption('advanced'); await page.locator('.mode-settings').getByRole('button', { name: 'Done', exact: true }).click(); await page.getByRole('button', { name: 'Start guided session', exact: true }).click();
  await expect(page.locator('#guided-askDecks')).toBeVisible(); await expect(page.locator('.game-table-footer')).toContainText('Estimate decks from the shoe stack');
  await expect(page.locator('.game-table-footer')).toContainText('RC hidden'); await expect(page.locator('.game-table-footer')).toContainText('TC hidden'); await expect(page.locator('.game-table-footer')).not.toContainText('6.00 decks');
});
test('settings dialogs keep the workspace focused and return from advanced rules', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await mode(page, 'Play');
  await expect(page.locator('#modeWorkspace aside.mode-setup')).toHaveCount(0);
  await expect(page.locator('#modeToolbar')).not.toBeVisible();
  await page.getByRole('button', { name: 'New session', exact: true }).click();
  await expect(page.locator('.mode-settings')).toBeVisible();
  await expect(page.locator('#play-wager')).toHaveCount(0);
  await page.locator('#play-decks').fill('4'); await page.locator('#play-starting').click();
  await page.getByRole('button', { name: 'Advanced settings', exact: true }).click();
  await expect(page.locator('.mode-settings-more')).toBeVisible();
  await page.locator('.mode-settings-more').getByRole('button', { name: 'All rules & strategy' }).click();
  await expect(page.locator('#advancedDialog')).toBeVisible(); await page.locator('#advancedCancel').click();
  await expect(page.locator('.mode-settings-more')).toBeVisible();
  await page.locator('.mode-settings-more').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('#play-decks')).toHaveValue('4');
  await page.locator('.mode-settings').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('#play-wager')).toHaveCount(0);
  await mode(page, 'Learn'); await expect(page.locator('#modeWorkspace aside.mode-setup')).toHaveCount(0);
  await page.getByRole('button', { name: 'Learning settings' }).click(); await expect(page.locator('#learn-assistance')).toBeVisible();
  await page.locator('.mode-settings').getByRole('button', { name: 'Done', exact: true }).click();
  await mode(page, 'Laboratory'); await expect(page.getByText('Step 1 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Strategy & table settings' }).click(); await expect(page.locator('#laboratory-decks')).toBeVisible();
  expect(errors).toEqual([]);
});
test('Laboratory compares independently configured strategies live and supports replay and drill-down', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await mode(page, 'Laboratory'); await page.getByRole('button', { name: 'Compare multiple', exact: true }).click();
  await expect(page.locator('.lab-strategy-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Table Settings', exact: true }).click();
  await expect(page.locator('#advancedTitle')).toHaveText('Table settings'); await page.locator('#adv-decks').fill('2'); await page.locator('#advancedApply').click();
  await page.locator('.lab-strategy-row').nth(1).getByRole('button', { name: 'Edit strategy' }).click();
  await page.locator('#adv-play-mode').selectOption('stand'); await page.locator('#adv-baseBet').fill('50'); await page.locator('#advancedApply').click();
  await page.getByRole('button', { name: '+ Add strategy' }).click(); await expect(page.locator('#advancedTitle')).toHaveText('Strategy 3 settings'); await page.locator('#advancedApply').click(); await expect(page.locator('.lab-strategy-row')).toHaveCount(3);
  await page.getByRole('button', { name: '+ Add strategy' }).click(); await page.locator('#advancedApply').click(); await page.getByRole('button', { name: '+ Add strategy' }).click(); await page.locator('#advancedApply').click(); await expect(page.getByRole('button', { name: '+ Add strategy' })).toBeDisabled();
  await page.locator('.lab-strategy-row').last().getByRole('button', { name: 'Remove' }).click(); await page.locator('.lab-strategy-row').last().getByRole('button', { name: 'Remove' }).click();
  await page.locator('[data-lab-step="2"]').click();
  for (const [id, value] of [['environments', 3], ['sessions', 1], ['hands', 30], ['workers', 2], ['tickHands', 2]]) await page.locator('#lab-' + id).fill(String(value));
  await page.getByRole('button', { name: 'Preview actual design', exact: true }).click(); await page.getByRole('button', { name: 'Run experiment', exact: true }).click();
  await expect(page.locator('.lab-completion')).toContainText('9/9 runs complete', { timeout: 30000 });
  const data = await page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('blackjack-laboratory-v1', 1); r.onsuccess = () => { const q = r.result.transaction('runs').objectStore('runs').get('latest'); q.onsuccess = () => resolve(q.result); }; }));
  expect(data.jobs).toHaveLength(9); expect(data.jobs.filter(j => j.strategyId === 's2')[0].config.rules.play.mode).toBe('stand'); expect(data.jobs.filter(j => j.strategyId === 's2')[0].config.baseBet).toBe(50); expect(data.jobs[0].config.seed).toBe(data.jobs[1].config.seed);
  await expect(page.locator('.lab-comparison-row')).toHaveCount(3); await expect(page.locator('.lab-example')).toHaveCount(4); await expect(page.locator('.lab-example').first()).toContainText('vs'); await page.getByLabel('Show Strategy 2').uncheck(); await expect(page.locator('.lab-comparison-row')).toHaveCount(2); await page.getByLabel('Show Strategy 2').check();
  await page.getByLabel('Show individual runs').check(); await page.getByLabel('Show uncertainty bands').check(); await page.getByRole('button', { name: 'Replay all paths' }).click(); await page.getByRole('button', { name: 'Follow live' }).click();
  await page.getByLabel('Strategy', { exact: true }).selectOption('s2'); await page.getByLabel('Environment', { exact: true }).selectOption('0'); await page.getByLabel('Session / run').selectOption('0');
  await expect(page.getByLabel('Inspect another strategy in this environment and session')).toBeVisible();
  await page.getByLabel('Inspect another strategy in this environment and session').selectOption('s1'); await expect(page.locator('.lab-comparison-row')).toHaveCount(1); expect(errors).toEqual([]);
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export summary JSON' }).click(); const download = await downloadPromise;
  const exported = JSON.parse(await require('node:fs/promises').readFile(await download.path(), 'utf8')); expect(exported.strategies).toHaveLength(3); expect(exported.comparisons).toHaveLength(3);
});
test('comparison dashboard updates every strategy before the experiment finishes', async ({ page }) => {
  const errors = [], workers = []; page.on('pageerror', e => errors.push(e.message)); page.on('worker', worker => workers.push(worker.url()));
  await mode(page, 'Laboratory'); await page.getByRole('button', { name: 'Compare multiple', exact: true }).click(); await page.locator('[data-lab-step="2"]').click();
  for (const [id, value] of [['environments', 2], ['sessions', 1], ['hands', 10000], ['workers', 2], ['tickHands', 1]]) await page.locator('#lab-' + id).fill(String(value));
  await page.getByRole('button', { name: 'Preview actual design' }).click(); await page.getByRole('button', { name: 'Run experiment', exact: true }).click();
  await expect(page.locator('.lab-comparison-row')).toHaveCount(2); await expect(page.locator('.lab-completion')).toContainText('running');
  await expect.poll(async () => page.locator('.lab-metric-values').first().innerText()).not.toContain('—');
  await page.locator('summary').filter({ hasText: 'Outcome distributions' }).click(); await expect(page.getByRole('heading', { name: 'Session profit histogram $' })).toBeVisible(); expect(workers.some(url => url.endsWith('/lab-analysis-worker.js'))).toBe(true);
  await page.getByRole('button', { name: 'Pause experiment', exact: true }).click(); await expect(page.locator('.lab-completion')).toContainText('paused');
  await expect.poll(() => page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('blackjack-laboratory-v1', 1); r.onsuccess = () => { const q = r.result.transaction('runs').objectStore('runs').get('latest'); q.onsuccess = () => resolve(q.result?.checkpoints?.length || 0); }; }))).toBe(4);
  await page.getByRole('button', { name: 'Resume experiment', exact: true }).click(); await expect(page.locator('.lab-completion')).toContainText('running'); expect(errors).toEqual([]);
});
test('sweep presets expose their source, remain distinct, and apply to the active mode', async ({ page }) => {
  const items = await page.evaluate(() => BJSweepPresets.presets.map(p => ({ ...p })));
  expect(items).toHaveLength(10);
  for (let i = 0; i < items.length; i++) for (let j = 0; j < i; j++) expect(['play', 'bet', 'decks', 'penetration', 'dealer'].filter(k => items[i][k] !== items[j][k]).length).toBeGreaterThanOrEqual(3);
  await mode(page, 'Play'); await page.getByRole('button', { name: 'Presets & transfer' }).click(); await page.locator('#modePreset').selectOption('sweep:eight-linear');
  await expect(page.locator('.preset-details')).toContainText('confidence intervals overlap zero'); await expect(page.locator('.preset-details')).toContainText('three settings');
  await page.locator('#modeToolbar').getByRole('button', { name: 'Load', exact: true }).click();
  const stored = await page.evaluate(() => BJWorkspace.store.mode('play').envelope); expect(stored.rules.play.mode).toBe('deviations'); expect(stored.rules.bet.mode).toBe('linear'); expect(stored.fields.seed).toBe('4138020132'); expect(+stored.fields.penetration).toBe(60.7221);
  await page.locator('#modeToolbar').getByRole('button', { name: 'Close' }).click(); await mode(page, 'Simulator'); await page.locator('#advancedOpen').click(); await page.locator('#advancedPreset').selectOption('sweep:two-power'); await expect(page.locator('#advancedNotice')).toContainText('Source: environment 9'); await page.locator('#advancedApply').click(); await expect(page.locator('#decks')).toHaveValue('2');
});
test('Play wager information control changes the table footer and guidance', async ({ page }) => {
  await mode(page, 'Play'); await page.getByRole('button', { name: 'New session', exact: true }).click(); await page.locator('.mode-settings').getByRole('button', { name: 'Start session' }).click();
  await expect(page.locator('.game-table-footer')).toBeVisible(); await expect(page.locator('.wager-context')).toContainText('Available bankroll');
  await page.getByRole('group', { name: 'Table information' }).getByRole('button', { name: 'Hide' }).click(); await expect(page.locator('.game-table-footer')).toBeHidden();
  await page.getByRole('group', { name: 'Table information' }).getByRole('button', { name: 'Guidance' }).click(); await expect(page.locator('.game-table-footer')).toBeVisible(); await expect(page.locator('.wager-guidance')).toContainText('betting strategy suggests');
  await page.locator('.game-action-bar').screenshot({ path: '/private/tmp/stoch21-wager-controls.png' });
  await page.getByRole('group', { name: 'Table information' }).getByRole('button', { name: 'Details' }).click(); await expect(page.locator('.wager-guidance')).toHaveCount(0);
});
test('desktop workspaces fit common window sizes and initialize simulator charts after mode changes', async ({ page }) => {
  for (const width of [800, 1024, 1280, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['Play', 'Learn', 'Laboratory', 'Simulator']) { await mode(page, name); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true); }
    await expect.poll(() => page.locator('#equityChart').evaluate(el => el.width)).toBeGreaterThan(0);
  }
  await mode(page, 'Laboratory'); await expect(page.getByRole('button', { name: '1. Setup' })).toBeVisible(); await expect(page.locator('[data-lab-step="3"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Compare multiple', exact: true }).click(); await expect(page.getByRole('button', { name: '1. Strategy' })).toBeVisible(); await expect(page.getByRole('button', { name: '4. Results' })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 900 }); await page.screenshot({ path: '/private/tmp/stoch21-lab-desktop.png' });
});
test('Laboratory table settings offer simulator penetration modes and environment sections stay open', async ({ page }) => {
  await mode(page, 'Laboratory'); await page.getByRole('button', { name: 'Compare multiple', exact: true }).click();
  await page.getByRole('button', { name: 'Table Settings' }).click();
  const modeSelect = page.locator('#adv-penetrationMode'); await expect(modeSelect.locator('option')).toHaveText(['Fixed', 'Simulated', 'Gaussian']);
  await page.locator('.advanced-field').filter({ has: modeSelect }).getByRole('button', { name: 'About Penetration %' }).click();
  await expect(page.locator('#penDialog').getByRole('heading', { name: 'Gaussian' })).toBeVisible();
  await page.locator('#penDialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#adv-penetration')).toBeVisible(); await expect(page.locator('#adv-penetrationSigma')).toBeHidden();
  await modeSelect.selectOption('simulated'); await expect(page.locator('#adv-penetration')).toBeHidden(); await expect(page.locator('#adv-penetrationSigma')).toBeHidden();
  await modeSelect.selectOption('gaussian'); await expect(page.locator('#adv-penetrationSigma')).toBeVisible(); await page.locator('#adv-penetrationSigma').fill('4.5'); await page.locator('#advancedApply').click();
  const fields = await page.evaluate(() => BJWorkspace.store.mode('laboratory').envelope.fields); expect(fields.penetrationMode).toBe('gaussian'); expect(+fields.penetrationSigma).toBe(4.5);
  await page.locator('[data-lab-step="1"]').click(); const more = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'More rule, limit, count and opponent conditions' }) }); await more.locator('summary').click();
  await more.getByLabel('Hole card distribution').selectOption('choice'); await expect(more).toHaveAttribute('open', ''); await expect(more.getByLabel('Hole card allowed values')).toBeVisible();
  await more.getByLabel('Double after split distribution').selectOption('choice'); await expect(more).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Preview design →' }).click(); await expect(page.getByRole('heading', { name: 'Resulting experiment design' })).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export frozen design' }).click(); expect((await download).suggestedFilename()).toBe('blackjack-laboratory-design.json');
});
test('penetration modes and mathematical help work across Play, Learn, and Laboratory', async ({ page }) => {
  const checkHelp = async field => {
    await field.getByRole('button', { name: 'About Penetration %' }).click();
    const dialog = page.locator('#penDialog'); await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Simulated' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Gaussian' })).toBeVisible();
    await expect(dialog.locator('math')).toHaveCount(5);
    await dialog.getByRole('button', { name: 'Close' }).click();
  };
  await mode(page, 'Play'); await page.getByRole('button', { name: 'New session', exact: true }).click();
  await page.getByRole('button', { name: 'Advanced settings', exact: true }).click();
  const play = page.locator('.field').filter({ has: page.locator('#play-penetrationMode') });
  await expect(page.locator('#play-penetration')).toHaveValue('75'); await checkHelp(play);
  await page.locator('#play-penetrationMode').selectOption('simulated'); await expect(page.locator('#play-penetration')).toBeHidden();
  await page.locator('#play-penetrationMode').selectOption('gaussian'); await page.locator('#play-penetrationSigma').fill('4.5'); await page.locator('#play-penetrationSigma').blur();
  expect((await page.evaluate(() => BJWorkspace.store.mode('play').envelope.fields)).penetrationMode).toBe('gaussian');
  expect(+(await page.evaluate(() => BJWorkspace.store.mode('play').envelope.fields)).penetrationSigma).toBe(4.5);
  await page.locator('.mode-settings-more').getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('.mode-settings').getByRole('button', { name: 'Close', exact: true }).click();
  await mode(page, 'Learn'); await page.getByRole('button', { name: 'Learning settings' }).click(); await page.getByText('Table & strategy settings').click();
  const learn = page.locator('.field').filter({ has: page.locator('#learn-penetrationMode') }); await checkHelp(learn);
  await page.locator('#learn-penetrationMode').selectOption('simulated');
  expect((await page.evaluate(() => BJWorkspace.store.mode('learn').envelope.fields)).penetrationMode).toBe('simulated');
  await page.locator('.mode-settings').getByRole('button', { name: 'Done', exact: true }).click();
  await mode(page, 'Laboratory'); await page.getByRole('button', { name: 'Strategy & table settings' }).click();
  const lab = page.locator('.field').filter({ has: page.locator('#laboratory-penetrationMode') }); await checkHelp(lab);
  await page.locator('#laboratory-penetrationMode').selectOption('gaussian'); await page.locator('#laboratory-penetrationSigma').fill('6'); await page.locator('#laboratory-penetrationSigma').blur();
  await page.locator('.mode-settings').getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('[data-lab-step="1"]').click(); const row = page.locator('tr[data-parameter="penetration"]'); await checkHelp(row);
  await expect(row.getByLabel('Penetration % shoe mode')).toHaveValue('gaussian');
  await row.getByLabel('Penetration % shoe mode').selectOption('simulated');
  await expect(row.getByLabel('Penetration % fixed value')).toBeHidden();
  await expect(row.getByLabel('Penetration % Gaussian standard deviation')).toHaveCount(0);
  await row.getByLabel('Penetration % shoe mode').selectOption('gaussian');
  await expect(row.getByLabel('Penetration % fixed value')).toBeHidden();
  const sd = page.getByLabel('Penetration % Gaussian standard deviation'); await sd.fill('4.5'); await sd.blur();
  await page.getByRole('button', { name: 'Preview design →' }).click();
  await expect(page.getByRole('heading', { name: 'Resulting experiment design' })).toBeVisible();
  await expect(page.getByText('Gaussian σ 4.5 pp').first()).toBeVisible();
});
test('Laboratory strategy changes and Clear Results preserve or export results on request', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await mode(page, 'Laboratory'); await page.getByRole('button', { name: 'Compare multiple', exact: true }).click(); await page.locator('[data-lab-step="2"]').click();
  for (const [id, value] of [['environments', 2], ['sessions', 1], ['hands', 20], ['workers', 2]]) await page.locator('#lab-' + id).fill(String(value));
  const bankruptcy = await page.getByLabel('Bankruptcy behavior', { exact: true }).boundingBox(), run = await page.getByRole('button', { name: 'Run experiment', exact: true }).boundingBox(); expect(bankruptcy.y + bankruptcy.height).toBeLessThanOrEqual(run.y);
  await page.getByRole('button', { name: 'Run experiment', exact: true }).click(); await expect(page.locator('.lab-completion')).toContainText('4/4 runs complete', { timeout: 30000 });
  await page.locator('[data-lab-step="0"]').click(); await page.locator('.lab-strategy-row').first().getByRole('button', { name: 'Edit strategy' }).click(); await page.locator('#adv-play-mode').selectOption('stand'); await page.locator('#advancedApply').click();
  await page.getByRole('dialog', { name: 'Clear experiment?' }).getByRole('button', { name: 'Cancel' }).click(); await expect(page.locator('#advancedDialog')).toBeVisible();
  await page.locator('#advancedApply').click(); await page.getByRole('dialog', { name: 'Clear experiment?' }).getByRole('button', { name: 'Clear experiment' }).click(); await page.getByRole('dialog', { name: 'Save or export first?' }).getByRole('button', { name: 'Cancel' }).click(); await expect(page.locator('#advancedDialog')).toBeVisible();
  const old = await page.evaluate(() => BJWorkspace.store.mode('laboratory').labSettings.strategies[0].envelope.rules.play.mode); expect(old).not.toBe('stand');
  await page.locator('#advancedApply').click(); await page.getByRole('dialog', { name: 'Clear experiment?' }).getByRole('button', { name: 'Clear experiment' }).click();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('dialog', { name: 'Save or export first?' }).getByRole('button', { name: 'Export JSON' }).click(); const download = await downloadPromise;
  const saved = JSON.parse(await require('node:fs/promises').readFile(await download.path(), 'utf8')); expect(saved.jobs).toHaveLength(4);
  await page.getByRole('dialog', { name: 'Save or export first?' }).getByRole('button', { name: 'Clear experiment' }).click(); await expect(page.locator('#advancedDialog')).toBeHidden();
  expect(await page.evaluate(() => BJWorkspace.store.mode('laboratory').labSettings.strategies[0].envelope.rules.play.mode)).toBe('stand');
  await page.reload(); await expect(page.getByRole('button', { name: '1. Strategy' })).toBeVisible();
  await page.locator('[data-lab-step="2"]').click(); await page.getByRole('button', { name: 'Run experiment', exact: true }).click(); await expect(page.locator('.lab-completion')).toContainText('4/4 runs complete', { timeout: 30000 });
  const clear = page.getByRole('button', { name: 'Clear Results' }), clearBox = await clear.boundingBox(), exportBox = await page.getByRole('button', { name: 'Export CSV', exact: true }).boundingBox(); expect(clearBox.y).toBe(exportBox.y); expect(clearBox.x).toBeGreaterThan(exportBox.x);
  await clear.click(); await page.getByRole('dialog', { name: 'Clear experiment?' }).getByRole('button', { name: 'Clear experiment' }).click(); await page.getByRole('dialog', { name: 'Save or export first?' }).getByRole('button', { name: 'Clear experiment' }).click();
  await expect(page.getByRole('button', { name: 'Run experiment', exact: true })).toBeVisible(); await page.reload(); await expect(page.locator('.lab-completion')).toHaveCount(0); expect(errors).toEqual([]);
});
test('single-strategy setup changes can be canceled without losing the experiment', async ({ page }) => {
  await mode(page, 'Laboratory'); await page.locator('[data-lab-step="2"]').click();
  for (const [id, value] of [['environments', 1], ['sessions', 1], ['hands', 10], ['workers', 1]]) await page.locator('#lab-' + id).fill(String(value));
  await page.getByRole('button', { name: 'Run experiment', exact: true }).click(); await expect(page.locator('.lab-completion')).toContainText('1/1 runs complete', { timeout: 30000 });
  await page.locator('[data-lab-step="0"]').click(); await page.getByRole('button', { name: 'Strategy & table settings' }).click();
  const decks = page.locator('#laboratory-decks'); await decks.fill('2'); await decks.press('Tab');
  await page.getByRole('dialog', { name: 'Clear experiment?' }).getByRole('button', { name: 'Cancel' }).click(); await expect(decks).toHaveValue('6');
  await decks.fill('2'); await decks.press('Tab'); await page.getByRole('dialog', { name: 'Clear experiment?' }).getByRole('button', { name: 'Clear experiment' }).click(); await page.getByRole('dialog', { name: 'Save or export first?' }).getByRole('button', { name: 'Clear experiment' }).click();
  await expect.poll(() => page.evaluate(() => BJWorkspace.store.mode('laboratory').envelope.fields.decks)).toBe('2'); await page.locator('.mode-settings').getByRole('button', { name: 'Done' }).click(); await page.reload(); await expect(page.locator('.lab-completion')).toHaveCount(0);
});
test('clearing a running Laboratory experiment cannot restore an old checkpoint', async ({ page }) => {
  await mode(page, 'Laboratory'); await page.getByRole('button', { name: 'Compare multiple', exact: true }).click(); await page.locator('[data-lab-step="2"]').click();
  for (const [id, value] of [['environments', 2], ['sessions', 1], ['hands', 10000], ['workers', 2], ['tickHands', 1]]) await page.locator('#lab-' + id).fill(String(value));
  await page.getByRole('button', { name: 'Run experiment', exact: true }).click(); await expect(page.locator('.lab-completion')).toContainText('running');
  await page.getByRole('button', { name: 'Clear Results' }).click(); await page.getByRole('dialog', { name: 'Clear experiment?' }).getByRole('button', { name: 'Clear experiment' }).click(); await page.getByRole('dialog', { name: 'Save or export first?' }).getByRole('button', { name: 'Clear experiment' }).click();
  await expect(page.getByRole('button', { name: 'Run experiment', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('blackjack-laboratory-v1', 1); r.onsuccess = () => { const q = r.result.transaction('runs').objectStore('runs').get('latest'); q.onsuccess = () => resolve(q.result ?? null); }; }))).toBeNull();
  await page.reload(); await expect(page.locator('.lab-completion')).toHaveCount(0);
});
