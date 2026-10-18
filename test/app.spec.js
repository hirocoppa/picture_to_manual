import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

async function photos(page) {
  return page.evaluate(() => {
    return ['#f00', '#00f', '#0f0'].map((color, i) => {
      const c = document.createElement('canvas'); c.width = i === 1 ? 300 : 100; c.height = 150;
      const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height);
      return c.toDataURL('image/png').split(',')[1];
    });
  });
}
async function saved(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('picture-to-manual', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const docs = await new Promise(res => { const r = db.transaction('documents').objectStore('documents').getAll(); r.onsuccess = () => res(r.result); }); db.close();
    const doc = docs.find(d => d.id !== '__draft__'); return { ...doc, bytes: Array.from(doc.bytes) };
  });
}

test('select, reorder, restore draft, create PDF, append and retain original pages, download', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#photos')).toBeEnabled();
  await page.getByRole('radio', { name: '写真をそのままPDF', exact: true }).check();
  const images = await photos(page);
  await page.locator('#title').fill('操作マニュアル');
  await page.locator('#photos').setInputFiles(images.map((base64, i) => ({ name: `${i}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })));
  await expect(page.locator('.thumbnail')).toHaveCount(3);
  await page.getByRole('button', { name: '後ろへ移動', exact: true }).first().click();
  await page.getByRole('checkbox').last().uncheck();
  await page.reload();
  await expect(page.locator('.thumbnail')).toHaveCount(3);
  await expect(page.locator('.thumbnail span').first()).toHaveText('1. 1.png');
  await expect(page.getByRole('checkbox').last()).not.toBeChecked();
  await page.locator('#save').click();
  await expect(page.locator('#badge')).toHaveText('2ページ保存済み');
  const first = await saved(page);
  const original = await PDFDocument.load(Uint8Array.from(first.bytes));
  expect(original.getPageCount()).toBe(2);
  for (const p of original.getPages()) { expect(p.getWidth()).toBeCloseTo(595.28); expect(p.getHeight()).toBeCloseTo(841.89); }
  const content = original.getPages().map(p => p.node.Contents().toString());
  await page.locator('#photos').setInputFiles({ name: 'added.png', mimeType: 'image/png', buffer: Buffer.from(images[2], 'base64') });
  await expect(page.locator('#save')).toBeEnabled();
  await page.locator('#save').click();
  await expect(page.locator('#badge')).toHaveText('3ページ保存済み');
  const second = await saved(page);
  expect(second.id).toBe(first.id);
  const updated = await PDFDocument.load(Uint8Array.from(second.bytes));
  expect(updated.getPageCount()).toBe(3);
  expect(updated.getPages().slice(0, 2).map(p => p.node.Contents().toString())).toEqual(content);
  // Verify original image and drawing streams are retained byte-for-byte.
  for (const [ref, object] of original.context.enumerateIndirectObjects()) {
    if (typeof object.getContents === 'function') expect(updated.context.lookup(ref).getContents()).toEqual(object.getContents());
  }
  await page.reload(); await expect(page.locator('#badge')).toHaveText('3ページ保存済み');
  const download = page.waitForEvent('download'); await page.locator('#download').click();
  expect((await download).suggestedFilename()).toBe('操作マニュアル.pdf');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('invalid image and storage failure show warnings without losing queued photos', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#photos')).toBeEnabled();
  await page.getByRole('radio', { name: '写真をそのままPDF', exact: true }).check();
  await page.locator('#photos').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
  await expect(page.locator('#status')).toContainText('読み込めません');
  const images = await photos(page);
  await page.locator('#photos').setInputFiles({ name: 'ok.png', mimeType: 'image/png', buffer: Buffer.from(images[0], 'base64') });
  await expect(page.locator('#save')).toBeEnabled();
  await page.evaluate(() => { IDBDatabase.prototype.transaction = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
  await page.locator('#save').click();
  await expect(page.locator('#status')).toContainText('保存できませんでした');
  await expect(page.locator('.thumbnail')).toHaveCount(1);
  await expect(page.locator('#badge')).toHaveText('新規作成');
});


test('Japanese summary can be edited, restored, paginated and appended without changing existing pages', async ({ page }) => {
  await page.goto('/'); await expect(page.locator('#source-text')).toBeEnabled();
  await page.locator('#source-text').fill('使用後は電源を切ってください。');
  await page.locator('#summary-text').fill('・使用後は必ず電源を切ります。\n・水で洗わないでください。');
  await page.reload();
  await expect(page.locator('#summary-text')).toHaveValue(/電源/);
  await page.locator('#save').click(); await expect(page.locator('#badge')).toHaveText('1ページ保存済み');
  const first = await saved(page);
  const original = await PDFDocument.load(Uint8Array.from(first.bytes));
  expect(original.getPageCount()).toBe(1);
  await page.locator('#summary-text').fill('追加の注意事項を確認します。\n'.repeat(75));
  await page.locator('#save').click(); await expect(page.locator('#badge')).toHaveText('4ページ保存済み');
  const second = await saved(page);
  const updated = await PDFDocument.load(Uint8Array.from(second.bytes));
  expect(updated.getPageCount()).toBe(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const p of updated.getPages()) { expect(p.getWidth()).toBeCloseTo(595.28); expect(p.getHeight()).toBeCloseTo(841.89); }
  for (const [ref, object] of original.context.enumerateIndirectObjects()) {
    if (typeof object.getContents === 'function') expect(updated.context.lookup(ref).getContents()).toEqual(object.getContents());
  }
});

test('real OCR recognizes photo text without sending images outside the site', async ({ page }) => {
  test.setTimeout(120000);
  const outside = []; page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:5174') && !r.url().startsWith('blob:')) outside.push(r.url()); });
  await page.goto('/'); await expect(page.locator('#photos')).toBeEnabled();
  const base64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 600;
    const ctx = c.getContext('2d');ctx.fillStyle = 'white';ctx.fillRect(0,0,1200,600);ctx.fillStyle='black';ctx.font='48px sans-serif';
    ctx.fillText('Turn off the power after use.', 60, 150); ctx.fillText('Do not wash with water.', 60, 260);
    return c.toDataURL('image/png').split(',')[1];
  });
  const blank = await page.evaluate(() => {
    const c=document.createElement('canvas');c.width=400;c.height=400;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,400,400);return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#photos').setInputFiles([{ name:'manual.png', mimeType:'image/png', buffer:Buffer.from(base64,'base64') }, {name:'blank.png',mimeType:'image/png',buffer:Buffer.from(blank,'base64')}]);
  await expect(page.locator('#read-text')).toBeEnabled();await page.locator('#read-text').click();
  await expect(page.locator('#source-text')).toHaveValue(/Turn off the power/i, { timeout: 100000 });
  await expect(page.locator('#status')).toContainText('1枚の写真からは文字を読み取れませんでした');
  expect(outside).toEqual([]);
});


test('Japanese photo text is recognized locally', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/'); await expect(page.locator('#photos')).toBeEnabled();
  const base64 = await page.evaluate(async () => {
    const face = new FontFace('TestJapanese', 'url(/fonts/NotoSansJP-Regular.ttf)'); await face.load(); document.fonts.add(face);
    const c = document.createElement('canvas'); c.width=1400;c.height=500;
    const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1400,500);ctx.fillStyle='black';ctx.font='48px TestJapanese';
    ctx.fillText('使用後は電源を切ってください。',60,150);ctx.fillText('水で洗わないでください。',60,260);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#photos').setInputFiles({name:'日本語.png',mimeType:'image/png',buffer:Buffer.from(base64,'base64')});
  await expect(page.locator('#read-text')).toBeEnabled();await page.locator('#read-text').click();
  await expect(page.locator('#source-text')).toHaveValue(/電\s*源/, {timeout:100000});
});

test('AI model download errors preserve editable text', async ({ page }) => {
  await page.route('https://huggingface.co/**', route => route.abort());
  await page.goto('/');await expect(page.locator('#source-text')).toBeEnabled();
  await page.locator('#source-text').fill('使用後は電源を切ってください。');
  await page.locator('#summarize').click();
  await expect(page.locator('#status')).toContainText('AIを実行できませんでした', {timeout:20000});
  await expect(page.locator('#source-text')).toHaveValue('使用後は電源を切ってください。');
  await expect(page.locator('#summary-text')).toHaveValue('');
  await expect(page.locator('#summarize')).toBeEnabled();
});


test('AI processing can be cancelled while retaining the draft', async ({ page }) => {
  await page.route('https://huggingface.co/**', () => new Promise(() => {}));
  await page.goto('/'); await expect(page.locator('#source-text')).toBeEnabled();
  await page.locator('#source-text').fill('使用後は電源を切ってください。');
  await page.locator('#summarize').click();
  await expect(page.locator('#cancel-ai')).toBeVisible();
  await page.locator('#cancel-ai').click();
  await expect(page.locator('#status')).toContainText('AI処理を中止しました');
  await expect(page.locator('#source-text')).toHaveValue('使用後は電源を切ってください。');
  await expect(page.locator('#summarize')).toBeEnabled();
});
