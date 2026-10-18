import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { pdfFilename } from '../src/download.js';
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
  const automatic = page.waitForEvent('download');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', {name:'写真ライブラリ',exact:true}).click();
  await (await chooserPromise).setFiles(input);
  await expect(page.locator('#badge')).toHaveText('1ページ保存済み', {timeout:100000});
  await expect(page.locator('#summary-preview')).toContainText('電源');
  const first = (await saved(page)).find(d => d.bytes);
  expect((await automatic).suggestedFilename()).toBe(pdfFilename(first.title, first.updated));
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
  expect((await download).suggestedFilename()).toBe(pdfFilename(second.title, second.updated));
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
  expect(draft.pending).toHaveLength(0);
  await expect(page.locator('#retry')).toBeVisible();
});

test('horizontal Japanese image files also proceed automatically', async ({ page }) => {
  test.setTimeout(120000); await mockAI(page);
  await page.goto('/'); await expect(page.locator('#photos')).toBeEnabled();
  const image = await photo(page, {vertical:false,dark:true});
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', {name:'ファイルを選択',exact:true}).click();
  await (await chooserPromise).setFiles(image);
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

test('interrupted AI work restores paused and resumes only on request', async ({ page }) => {
  test.setTimeout(120000);
  await mockAI(page);
  await page.goto('/'); await expect(page.locator('#photos')).toBeEnabled();
  await page.evaluate(async () => {
    const db = await new Promise(res => {const r=indexedDB.open('picture-to-manual',1);r.onsuccess=()=>res(r.result);});
    await new Promise(res => { const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({id:'__draft__',version:3,phase:'ai',title:'復元',source:'使用後は電源を切ります。',pending:[],summary:'',paused:false});tx.oncomplete=res; });db.close();
  });
  await page.reload();
  await expect(page.locator('#status')).toContainText('自動再実行を止めました');
  await expect(page.locator('#badge')).toHaveText('新規作成');
  expect((await saved(page)).find(d=>d.id==='__draft__').paused).toBe(true);
  await page.locator('#retry').click();
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


test('only the newest PDF survives migration and a new PDF replaces it after successful automatic download', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#photos')).toBeEnabled();
  const pdf=await PDFDocument.create();pdf.addPage();const bytes=Array.from(await pdf.save());
  await page.evaluate(async ({bytes})=>{
    const db=await new Promise(res=>{const r=indexedDB.open('picture-to-manual',1);r.onsuccess=()=>res(r.result);});
    await new Promise(res=>{const tx=db.transaction('documents','readwrite');const s=tx.objectStore('documents');
      s.put({id:'old',title:'古いPDF',bytes:new Uint8Array(bytes),count:1,updated:1});
      s.put({id:'latest',title:'最新のPDF',bytes:new Uint8Array(bytes),count:1,updated:2});
      s.put({id:'__draft__',activeId:'old',title:'古いPDF',pending:[],source:'',summary:''});tx.oncomplete=res;});db.close();
  },{bytes});
  await page.reload();await expect(page.locator('.document')).toHaveCount(1);
  await expect(page.locator('.document')).toContainText('最新のPDF');
  expect((await saved(page)).filter(d=>d.bytes).map(d=>d.id)).toEqual(['latest']);
  // Simulate a recovered completed summary for a different PDF, using real PDF creation/export.
  await page.evaluate(async()=>{
    const db=await new Promise(res=>{const r=indexedDB.open('picture-to-manual',1);r.onsuccess=()=>res(r.result);});
    await new Promise(res=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({id:'__draft__',activeId:null,title:'新しい要約',pending:[],source:'電源を切ります。',summary:'使用後は電源を切ります。',paused:false});tx.oncomplete=res;});db.close();
  });
  const automatic=page.waitForEvent('download');await page.reload();
  const exported=await automatic;await expect(page.locator('#status')).toContainText('自動ダウンロードを開始');
  const docs=(await saved(page)).filter(d=>d.bytes);expect(docs).toHaveLength(1);expect(docs[0].title).toBe('新しい要約');
  expect(docs[0].id).not.toBe('latest');expect(exported.suggestedFilename()).toBe(pdfFilename(docs[0].title,docs[0].updated));
});

test('failed replacement keeps the previous PDF and retry saves exactly one latest PDF', async ({ page }) => {
  await page.goto('/');await expect(page.locator('#photos')).toBeEnabled();
  const pdf=await PDFDocument.create();pdf.addPage();const bytes=Array.from(await pdf.save());
  await page.evaluate(async ({bytes})=>{
    const db=await new Promise(res=>{const r=indexedDB.open('picture-to-manual',1);r.onsuccess=()=>res(r.result);});
    await new Promise(res=>{const tx=db.transaction('documents','readwrite');const s=tx.objectStore('documents');
      s.put({id:'original',title:'残すPDF',bytes:new Uint8Array(bytes),count:1,updated:1});
      s.put({id:'__draft__',activeId:null,title:'置き換えるPDF',pending:[],source:'電源を切る。',summary:'使用後は電源を切る。',paused:true});tx.oncomplete=res;});db.close();
  },{bytes});
  await page.reload();await expect(page.locator('#retry')).toBeVisible();
  await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value,...args){if(value.bytes)throw new DOMException('Quota exceeded','QuotaExceededError');return original.call(this,value,...args);};
    window.restoreStorage=()=>IDBObjectStore.prototype.put=original;
  });
  await page.locator('#retry').click();await expect(page.locator('#status')).toContainText('保存容量が足りません');
  let docs=(await saved(page)).filter(d=>d.bytes);expect(docs).toHaveLength(1);expect(docs[0].id).toBe('original');expect(docs[0].bytes).toEqual(bytes);
  await page.evaluate(()=>window.restoreStorage());const automatic=page.waitForEvent('download');await page.locator('#retry').click();await automatic;
  docs=(await saved(page)).filter(d=>d.bytes);expect(docs).toHaveLength(1);expect(docs[0].title).toBe('置き換えるPDF');
});

test.describe('local calendar filenames',()=>{
  test.use({timezoneId:'Asia/Tokyo'});
  test('automatic and manual exports use the creation date in YYYYMMDD form',async({page})=>{
    await page.clock.setFixedTime(new Date('2026-10-17T15:30:00Z'));
    await page.goto('/');await expect(page.locator('#photos')).toBeEnabled();
    await page.evaluate(async()=>{
      const db=await new Promise(res=>{const r=indexedDB.open('picture-to-manual',1);r.onsuccess=()=>res(r.result);});
      await new Promise(res=>{const tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({id:'__draft__',title:'読書メモ',pending:[],source:'電源を切る。',summary:'電源を切る。',paused:false});tx.oncomplete=res;});db.close();
    });
    const automatic=page.waitForEvent('download');await page.reload();expect((await automatic).suggestedFilename()).toBe('読書メモ_20261018.pdf');
    await expect(page.locator('#download')).toBeVisible();
    await page.clock.setFixedTime(new Date('2026-10-18T15:30:00Z'));
    const manual=page.waitForEvent('download');await page.locator('#download').click();expect((await manual).suggestedFilename()).toBe('読書メモ_20261018.pdf');
  });
});

test('reloading a stuck AI worker does not start it again and releases stored photos', async ({ page }) => {
  test.setTimeout(120000); let workers = 0;
  await page.route('**/assets/ai-worker-*.js', r => { workers++; return r.fulfill({contentType:'application/javascript',body:'self.onmessage=()=>{};'}); });
  await page.goto('/'); await expect(page.locator('#photos')).toBeEnabled();
  await page.locator('#photos').setInputFiles(await photo(page));
  await expect.poll(()=>workers,{timeout:100000}).toBe(1);
  const draft=(await saved(page)).find(d=>d.id==='__draft__');
  expect(draft.phase).toBe('ai');expect(draft.pending).toHaveLength(0);expect(draft.source).toContain('電源');
  page.on('dialog', dialog=>dialog.accept());await page.reload();
  await expect(page.locator('#status')).toContainText('自動再実行を止めました');
  expect(workers).toBe(1);expect((await saved(page)).find(d=>d.id==='__draft__').source).toContain('電源');
  await expect(page.locator('#retry')).toBeVisible();
});

test('an unresponsive AI worker times out with the source preserved', async ({ page }) => {
  test.setTimeout(120000);let workers=0;
  await page.clock.install();
  await page.route('**/assets/ai-worker-*.js', r=>{workers++;return r.fulfill({contentType:'application/javascript',body:'self.onmessage=()=>{};'});});
  await page.goto('/');await expect(page.locator('#photos')).toBeEnabled();
  await page.locator('#photos').setInputFiles(await photo(page));
  await expect.poll(()=>workers,{timeout:100000}).toBe(1);
  await page.clock.fastForward(91000);
  await expect(page.locator('#status')).toContainText('AIからの応答が止まった');
  await expect(page.locator('#retry')).toBeVisible();
  const draft=(await saved(page)).find(d=>d.id==='__draft__');expect(draft.source).toContain('電源');expect(draft.paused).toBe(true);
});
