import { test, expect } from '@playwright/test';

// Full user journey in demo mode (localStorage data + mock AI/Strava/WHOOP).
// One shared page: the journey builds state step by step, and demo mode
// persists it in localStorage (which lives in the shared browser context).
test.describe.configure({ mode: 'serial' });

let page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/');
});

test.afterAll(async () => {
  await page.close();
});

test('demo user lands on the dashboard', async () => {
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.getByText('ADAPTIVE RUNNING PLAN')).toBeVisible();
  await expect(page.getByTestId('stat-weekly-km')).toBeVisible();
  await expect(page.getByTestId('stat-recovery')).toBeVisible();
  await expect(page.getByTestId('stat-acwr')).toBeVisible();
});

test('profile saves and persists across reload', async () => {
  await page.getByTestId('tab-profile').click();
  await page.getByTestId('profile-name').fill('Test Runner');
  await page.getByTestId('profile-goal').selectOption('Half Marathon');

  const raceDate = new Date(Date.now() + 84 * 864e5).toISOString().split('T')[0];
  await page.getByTestId('profile-race-date').fill(raceDate);
  await page.getByTestId('profile-weekly-km').fill('25');
  await page.getByTestId('profile-fitness').selectOption('Intermediate');
  await page.getByTestId('save-profile').click();
  await expect(page.getByTestId('profile-saved')).toBeVisible();

  await page.reload();
  await page.getByTestId('tab-profile').click();
  await expect(page.getByTestId('profile-name')).toHaveValue('Test Runner');
  await expect(page.getByTestId('profile-goal')).toHaveValue('Half Marathon');
  await expect(page.getByTestId('profile-weekly-km')).toHaveValue('25');
});

test('manual check-in with poor recovery saves and lists', async () => {
  await page.getByTestId('tab-checkin').click();
  // Poor recovery: sleep 2, energy 2, mood 3, soreness 4
  await page.getByTestId('rate-sleep').locator('button').nth(1).click();
  await page.getByTestId('rate-energy').locator('button').nth(1).click();
  await page.getByTestId('rate-mood').locator('button').nth(2).click();
  await page.getByTestId('rate-soreness').locator('button').nth(3).click();
  await page.getByTestId('input-sleep-hours').fill('5.5');
  await page.getByTestId('save-checkin').click();
  await expect(page.getByTestId('checkin-saved')).toBeVisible();
  await expect(page.getByTestId('checkin-row').first()).toContainText('sleep 2/5');
  await expect(page.getByTestId('checkin-row').first()).toContainText('soreness 4/5');
});

test('WHOOP connect + sync fills recent check-ins', async () => {
  await page.getByTestId('tab-profile').click();
  await page.getByTestId('connect-whoop').click();
  await expect(page.getByTestId('whoop-connected')).toBeVisible();

  await page.getByTestId('tab-checkin').click();
  await page.getByTestId('sync-whoop').click();
  await expect(page.getByTestId('whoop-sync-msg')).toContainText('Synced', { timeout: 15_000 });
  // Mock WHOOP has poor recovery for the 2 most recent days
  await expect(page.locator('.badge-whoop').first()).toBeVisible();
});

test('manual run log computes pace and lists the run', async () => {
  await page.getByTestId('tab-runs').click();
  await page.getByTestId('run-distance').fill('8');
  await page.getByTestId('run-duration').fill('48');
  await page.getByTestId('run-rpe').selectOption('6');
  await page.getByTestId('add-run').click();
  const row = page.getByTestId('run-row').first();
  await expect(row).toContainText('8km');
  await expect(row).toContainText('6:00/km');
  await expect(row).toContainText('RPE 6');
});

test('Strava connect + sync imports mock runs and dedupes', async () => {
  await page.getByTestId('tab-profile').click();
  await page.getByTestId('connect-strava').click();
  await expect(page.getByTestId('strava-connected')).toBeVisible();

  await page.getByTestId('tab-runs').click();
  await page.getByTestId('sync-strava').click();
  await expect(page.getByTestId('strava-sync-msg')).toContainText('Imported 8 runs', { timeout: 15_000 });
  await expect(page.locator('.badge-strava').first()).toBeVisible();

  // Second sync must not duplicate anything
  await page.getByTestId('sync-strava').click();
  await expect(page.getByTestId('strava-sync-msg')).toContainText('Imported 0 runs', { timeout: 15_000 });
});

test('adaptation flags reflect poor condition and AI plan adapts down', async () => {
  await page.getByTestId('tab-plan').click();

  // Poor manual check-in + WHOOP low recovery days must surface flags
  await expect(page.getByTestId('flag-WHOOP_LOW_RECOVERY')).toBeVisible();

  await page.getByTestId('generate-plan').click();
  await expect(page.getByTestId('plan-result')).toBeVisible({ timeout: 20_000 });

  // Low recovery → mock AI must choose the recovery adaptation
  await expect(page.getByTestId('plan-decision')).toContainText('RECOVERY');
  await expect(page.getByTestId('plan-day')).toHaveCount(7);
  await expect(page.getByTestId('plan-note')).not.toBeEmpty();

  // Plan persists across reload
  await page.reload();
  await page.getByTestId('tab-plan').click();
  await expect(page.getByTestId('plan-result')).toBeVisible();
  await expect(page.getByTestId('plan-day')).toHaveCount(7);
});

test('dashboard shows computed metrics after all activity', async () => {
  await page.getByTestId('tab-dashboard').click();
  const weeklyKm = await page.getByTestId('stat-weekly-km').locator('.stat-value').textContent();
  expect(weeklyKm.trim()).not.toBe('');
  const recovery = await page.getByTestId('stat-recovery').locator('.stat-value').textContent();
  expect(recovery.trim()).not.toBe('—');
  // Wellbeing table shows WHOOP-synced data
  await expect(page.locator('.badge-whoop').first()).toBeVisible();
  await page.screenshot({ path: 'e2e-results/dashboard.png', fullPage: true });
});
