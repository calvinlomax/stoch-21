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
  await expect(page.locator('.lab-completion')).toContainText('8/8 runs complete', { timeout: 30000 }); expect(await page.locator('.lab-grid canvas').count()).toBeGreaterThanOrEqual(10);
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
  await page.getByRole('button', { name: 'Resume experiment', exact: true }).click(); await expect(page.locator('.lab-completion')).toContainText('3/3 runs complete', { timeout: 30000 }); expect(errors).toEqual([]);
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
