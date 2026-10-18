import { test, expect } from '@playwright/test';
import { photo, saved } from './helpers.js';

test('real vertical photo automatically becomes an AI summary PDF', async ({ page }) => {
  test.skip(process.env.RUN_AI_SMOKE !== '1', 'Explicit model download and inference validation.');
  test.setTimeout(600000);
  const uploads=[];page.context().on('request',r=>{if(/^https?:/.test(r.url())&&!['GET','HEAD'].includes(r.method()))uploads.push(r.url());});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('#photos')).toBeEnabled();
  await page.locator('#photos').setInputFiles(await photo(page));
  await expect(page.locator('#badge')).toHaveText('1ページ保存済み',{timeout:540000});
  const docs=await saved(page);const doc=docs.find(d=>d.bytes);
  console.log('Actual AI summary:',doc.lastSummary);
  expect(doc.lastSummary).toMatch(/[ぁ-んァ-ン一-龠]/);
  expect(doc.lastSummary).toMatch(/電源/);
  expect(uploads).toEqual([]);expect(errors).toEqual([]);
});
