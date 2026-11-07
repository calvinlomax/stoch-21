const { test, expect } = require("@playwright/test");
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("Advanced Apply and Cancel preserve standard settings and reload persistence", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.locator("#advancedOpen").click();
  await page.locator("#adv-bet-mode").selectOption("polynomial");
  await page.locator("#adv-bet-coefficient").fill("2");
  await page.locator("#advancedCancel").click();
  await expect(page.locator("#betMode")).toHaveValue("flat");
  await page.locator("#advancedOpen").click();
  await page.locator("#adv-bet-mode").selectOption("tcContinuous");
  await page.locator("#advancedApply").click();
  await expect(page.locator("#betMode")).toHaveValue("tcContinuous");
  await page.reload();
  await expect(page.locator("#betMode")).toHaveValue("tcContinuous");
  expect(errors).toEqual([]);
});
test("conditional fields, safe expressions, search, math help, and reset", async ({
  page,
}) => {
  await page.locator("#advancedOpen").click();
  await page.locator("#adv-bet-mode").selectOption("custom");
  await page.locator("#adv-bet-expression").fill("globalThis.alert(1)");
  await expect(page.locator("#advancedApply")).toBeDisabled();
  await expect(page.locator("#advancedError")).not.toBeEmpty();
  await page.locator("#adv-bet-expression").fill("base * max(1, c)");
  await expect(page.locator("#advancedApply")).toBeEnabled();
  await page
    .locator("#advancedDialog")
    .getByRole("button", { name: "About Bet sizing", exact: true })
    .click();
  await expect(page.locator("#settingsHelp math")).not.toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.locator("#advancedSearch").fill("hole");
  await expect(page.locator("#adv-dealer-hole")).toBeVisible();
  await page.locator("#advancedSearch").fill("");
  await page.locator("#advancedResetSection").click();
  await expect(page.locator("#adv-bet-mode")).toHaveValue("flat");
});
test("editable strategy and independent per-seat profiles apply to the engine", async ({
  page,
}) => {
  await page.locator("#advancedOpen").click();
  await page.locator("[data-section=play]").click();
  await page
    .getByLabel("hard 16 versus 10", { exact: true })
    .selectOption("stand");
  await expect(page.locator("#adv-play-mode")).toHaveValue("custom");
  await page.locator("[data-section=opponents]").click();
  await page.locator(".seat-profile summary").first().click();
  await page
    .getByLabel("Seat 1: Playing strategy", { exact: true })
    .selectOption("hit");
  await page
    .getByLabel("Seat 1: Betting behavior", { exact: true })
    .selectOption("martingale");
  await page.locator("#advancedApply").click();
  let r = await page.evaluate(() => RuleSettings.get());
  expect(r.play.table["hard:16:10"]).toBe("stand");
  expect(r.opponents.seats["0"].play).toBe("hit");
  expect(r.opponents.seats["0"].bet).toBe("martingale");
});
test("final-only run completes with custom payout and exported settings can be imported", async ({
  page,
}) => {
  await page.locator("#advancedOpen").click();
  await page.locator("[data-section=payout]").click();
  await page.locator("#adv-payout-preset").selectOption("2:1");
  let [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#advancedExport").click(),
  ]);
  let path = await download.path();
  await page.locator("#advancedResetAll").click();
  await page.locator("#advancedImport").setInputFiles(path);
  await expect(page.locator("#adv-payout-numerator")).toHaveValue("2");
  await page.locator("#advancedApply").click();
  await page.locator("#rounds").fill("100");
  await page.locator("#seed").fill("22");
  await page.locator("#displayMode").selectOption("final");
  await page.locator("#start").click();
  await expect(page.locator("#status")).toHaveText("Complete");
  await expect(page.locator("#roundMetric")).toHaveText("100");
  await expect(page.locator("#error")).toBeEmpty();
});
test("speed button works during animated runs without skipping pending events", async ({
  page,
}) => {
  await page.locator("#start").click();
  for (const speed of ["2x", "5x", "10x", "25x", "1x"]) {
    await page.locator("#playbackSpeed").click();
    await expect(page.locator("#playbackSpeed")).toHaveText(speed);
  }
  await page.locator("#pause").click();
  await expect(page.locator("#status")).toHaveText("Paused");
  await page.locator("#stop").click();
});
test("mobile dialog fits viewport, keyboard cancel works, and dark theme stays readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.locator("#advancedOpen").click();
  let box = await page.locator("#advancedDialog").boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  await page.locator("[data-section=play]").click();
  await expect(page.locator(".strategy-matrix")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#advancedDialog")).not.toBeVisible();
});

test("all display analytics and advanced modes render without browser errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.locator("#advancedOpen").click();
  for (const section of ["dealer", "limits", "analytics", "opponents", "bet"]) {
    await page.locator("[data-section=" + section + "]").click();
  }
  await page.locator("[data-section=analytics]").click();
  await page.locator("#adv-analytics-mode").selectOption("full");
  await page.locator("#advancedApply").click();
  await page.locator("#displayMode").selectOption("final");
  await page.locator("#rounds").fill("25");
  await page.locator("#start").click();
  await expect(page.locator("#status")).toHaveText("Complete");
  await expect(page.locator("#analyticsOverlay")).toBeVisible();
  await expect(page.locator("#analyticsOverlay")).toContainText("requested");
  expect(errors).toEqual([]);
  await page.locator("#advancedOpen").click();
  await page.screenshot({ path: "test-results/advanced-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/advanced-mobile.png" });
});
