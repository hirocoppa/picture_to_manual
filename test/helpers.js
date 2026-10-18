export async function photo(page, { vertical = true, blank = false, dark = false } = {}) {
  const base64 = await page.evaluate(async ({ vertical, blank, dark }) => {
    const face = new FontFace('TestJapanese', 'url(/fonts/NotoSansJP-Regular.ttf)'); await face.load(); document.fonts.add(face);
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1300;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = dark ? '#aaa' : '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = dark ? '#666' : '#111'; ctx.font = '44px TestJapanese';
    if (!blank) {
      if (vertical) {
        const columns = ['使用後は必ず電源を切ってください', '本体は水で洗わないでください', 'タンクは毎日洗ってください'];
        columns.forEach((text, column) => [...text].forEach((char, row) => ctx.fillText(char, 1000 - column * 170, 110 + row * 53)));
      } else {
        ['使用後は必ず電源を切ってください。', '本体は水で洗わないでください。', 'タンクは毎日洗ってください。'].forEach((text, row) => ctx.fillText(text, 70, 150 + row * 130));
      }
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, { vertical, blank, dark });
  return { name: vertical ? '縦書き.png' : '横書き.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}
export async function saved(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('picture-to-manual', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const docs = await new Promise(res => { const r = db.transaction('documents').objectStore('documents').getAll(); r.onsuccess = () => res(r.result); }); db.close();
    return docs.map(doc => ({ ...doc, ...doc.bytes ? {bytes:Array.from(doc.bytes)} : {} }));
  });
}
export async function mockAI(page, result = '・使用後は必ず電源を切ります。\n・本体を水で洗わず、タンクを毎日洗います。') {
  await page.route('**/assets/ai-worker-*.js', route => route.fulfill({
    contentType: 'application/javascript', body: `self.onmessage = () => self.postMessage({type:'result',text:${JSON.stringify(result)}});`,
  }));
}
