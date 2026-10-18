import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { photo, saved, mockAI } from './helpers.js';

test('vertical photos automatically become a summary PDF and append without altering previous pages', async ({ page }) => {
  test.setTimeout(120000);
  await mockAI(page);
  const uploads = []; page.context().on('request', r => { if (/^https?:/.test(r.url()) && !['GET', 'HEAD'].includes(r.method())) uploads.push(r.url()); });
  await page.goto('/'); await expect(page.locator('#photos')).toBeEnabled();
  await expect(page.locator('textarea, input[type=radio]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '写真の文字を読み取る', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'PDFを作成', exact: true })).toHaveCount(0);
  await page.locator('#title').fill('縦書きの要約');
  const input = await photo(page);
  await page.locator('#photos').setInputFiles(input);
  await expect(page.locator('#badge')).toHaveText('1ページ保存済み', {timeout:100000});
  await expect(page.locator('#summary-preview')).toContainText('電源');
  const first = (await saved(page)).find(d => d.bytes);
  const original = await PDFDocument.load(Uint8Array.from(first.bytes));
  expect(original.getPageCount()).toBe(1);
  await page.locator('#photos').setInputFiles(input);
  await expect(page.locator('#badge')).toHaveText('2ページ保存済み', {timeout:100000});
  const second = (await saved(page)).find(d => d.bytes);
  expect(second.id).toBe(first.id);
  const updated = await PDFDocument.load(Uint8Array.from(second.bytes));
  for (const p of updated.getPages()) { expect(p.getWidth()).toBeCloseTo(595.28); expect(p.getHeight()).toBeCloseTo(841.89); }
  for (const [ref, object] of original.context.enumerateIndirectObjects()) {
    if (typeof object.getContents === 'function') expect(updated.context.lookup(ref).getContents()).toEqual(object.getContents());
  }
  await page.reload(); await expect(page.locator('#badge')).toHaveText('2ページ保存済み');
  const download = page.waitForEvent('download'); await page.locator('#download').click();
  expect((await download).suggestedFilename()).toBe('縦書きの要約.pdf');
  expect(uploads).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('real vertical OCR preserves Japanese words and column reading order; failed AI retains recognized text', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('https://huggingface.co/**', r => r.abort());
  await page.goto('/'); await expect(page.locator('#photos')).toBeEnabled();
  await page.locator('#photos').setInputFiles(await photo(page));
  await expect(page.locator('#status')).toContainText('AIを実行できませんでした', {timeout:100000});
  const draft = (await saved(page)).find(d => d.id === '__draft__');
  console.log('Vertical OCR:', draft.source);
  expect(draft.source).toMatch(/電源/);
  expect(draft.source).toMatch(/水で洗わない/);
  expect(draft.source).toMatch(/タンク/);
  expect(draft.source.indexOf('電源')).toBeLessThan(draft.source.indexOf('水で洗わない'));
  expect(draft.source.indexOf('水で洗わない')).toBeLessThan(draft.source.indexOf('タンク'));
  expect(draft.pending).toHaveLength(1);
  await expect(page.locator('#retry')).toBeVisible();
});

test('horizontal Japanese photos also proceed automatically', async ({ page }) => {
  test.setTimeout(120000); await mockAI(page);
  await page.goto('/'); await expect(page.locator('#photos')).toBeEnabled();
  await page.locator('#photos').setInputFiles(await photo(page, {vertical:false,dark:true}));
  await expect(page.locator('#badge')).toHaveText('1ページ保存済み', {timeout:100000});
});

test('blank photos stop before AI; selecting a replacement recovers', async ({ page }) => {
  test.setTimeout(120000); let aiCalls = 0;
  await page.route('**/assets/ai-worker-*.js', route => { aiCalls++; return route.fulfill({contentType:'application/javascript',body:"self.onmessage=()=>self.postMessage({type:'result',text:'使用後は電源を切ります。'});"}); });
  await page.goto('/'); await expect(page.locator('#photos')).toBeEnabled();
  await page.locator('#photos').setInputFiles(await photo(page, {blank:true}));
  await expect(page.locator('#status')).toContainText('文字を十分に読み取れませんでした', {timeout:100000});
  expect(aiCalls).toBe(0);
  expect((await saved(page)).filter(d => d.bytes)).toHaveLength(0);
  await page.locator('#photos').setInputFiles(await photo(page));
  await expect(page.locator('#badge')).toHaveText('1ページ保存済み', {timeout:100000});
});

test('interrupted automatic work restores and resumes without OCR confirmation', async ({ page }) => {
  test.setTimeout(120000);
  await mockAI(page);
  await page.goto('/'); await expect(page.locator('#photos')).toBeEnabled();
  await page.evaluate(async () => {
    const db = await new Promise(res => {const r=indexedDB.open('picture-to-manual',1);r.onsuccess=()=>res(r.result);});
    await new Promise(res => { const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({id:'__draft__',title:'復元',source:'使用後は電源を切ります。',pending:[],summary:'',paused:false});tx.oncomplete=res; });db.close();
  });
  await page.reload();
  await expect(page.locator('#badge')).toHaveText('1ページ保存済み', {timeout:30000});
});

test('failed atomic PDF save retains the summary and retry does not duplicate pages', async ({ page }) => {
  test.setTimeout(120000);await mockAI(page);
  await page.goto('/');await expect(page.locator('#photos')).toBeEnabled();
  await page.evaluate(() => {
    const original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,...args){
      if(value.id==='__draft__' && this.documentQueued){throw new DOMException('Quota exceeded','QuotaExceededError');}
      if(value.bytes)this.documentQueued=true;
      return original.call(this,value,...args);
    };
    window.restoreStorage=()=>IDBObjectStore.prototype.put=original;
  });
  await page.locator('#photos').setInputFiles(await photo(page));
  await expect(page.locator('#status')).toContainText('保存容量が足りません', {timeout:100000});
  expect((await saved(page)).filter(d=>d.bytes)).toHaveLength(0);
  expect((await saved(page)).find(d=>d.id==='__draft__').summary).toContain('電源');
  await page.evaluate(()=>window.restoreStorage());await page.locator('#retry').click();
  await expect(page.locator('#badge')).toHaveText('1ページ保存済み');
  expect((await saved(page)).filter(d=>d.bytes)).toHaveLength(1);
});

test('cancel stops automatic AI and retains the source for retry', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/assets/ai-worker-*.js', r=>r.fulfill({contentType:'application/javascript',body:'self.onmessage=()=>{};'}));
  await page.goto('/');await expect(page.locator('#photos')).toBeEnabled();
  await page.locator('#photos').setInputFiles(await photo(page));
  await expect(page.locator('[data-phase=ai]')).toHaveClass(/current/,{timeout:100000});
  await page.locator('#cancel').click();
  await expect(page.locator('#status')).toContainText('処理を中止しました');
  expect((await saved(page)).find(d=>d.id==='__draft__').source).toContain('電源');
  await expect(page.locator('#retry')).toBeVisible();
});
