import { test, expect } from '@playwright/test';

test('real on-device AI summarizes Japanese text and creates a PDF', async ({ page }) => {
  test.skip(process.env.RUN_AI_SMOKE !== '1', 'Explicit model download/inference validation; not part of the offline regression suite.');
  test.setTimeout(600000);
  const uploads = []; page.context().on('request', r => { if (/^https?:/.test(r.url()) && !['GET', 'HEAD'].includes(r.method())) uploads.push(r.url()); });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log(msg.text()); });
  await page.goto('/');await expect(page.locator('#source-text')).toBeEnabled();
  await page.locator('#source-text').fill('コーヒーマシンの使い方。最初にタンクに水を入れます。次に電源を入れ、30秒待ちます。カップを置いて抽出ボタンを押します。使用後は必ず電源を切ります。本体を水で洗わないでください。');
  await page.locator('#summarize').click();
  await expect(page.locator('#summary-text')).not.toHaveValue('', { timeout: 540000 });
  const summary = await page.locator('#summary-text').inputValue();
  console.log('Actual AI summary:', summary);
  expect(summary).toMatch(/[ぁ-んァ-ン一-龠]/);
  expect(summary).toMatch(/電源/);
  await page.locator('#save').click();
  await expect(page.locator('#badge')).toHaveText('1ページ保存済み', { timeout: 30000 });
  expect(errors).toEqual([]);
  expect(uploads).toEqual([]);
});
