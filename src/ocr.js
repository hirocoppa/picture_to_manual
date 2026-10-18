import { createWorker, PSM } from 'tesseract.js';
import { improveContrast } from './image.js';

function cleanText(text) {
  return text.replace(/\r/g, '').replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]) +(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu, '$1').trim();
}
function candidate(data, layout) {
  const text = cleanText(data.text || '');
  const characters = (text.match(/[\p{L}\p{N}]/gu) || []).length;
  const confidence = Number(data.confidence) || 0;
  return { text, confidence, layout, characters, score: characters < 4 ? -100 : confidence + Math.min(10, Math.log2(characters + 1) * 2) };
}

export async function recognizePhotos(photos, onProgress = () => {}, signal = new AbortController().signal) {
  const base = new URL(`${import.meta.env.BASE_URL}ocr/`, location.href).href;
  let index = 0, worker;
  const cancelled = new Promise((_, reject) => {
    const abort = () => reject(new DOMException('処理を中止しました', 'AbortError'));
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
  const progress = event => { if (!signal.aborted) onProgress(`文字を読み取り中 ${index + 1}/${photos.length}枚 · ${Math.round((event.progress || 0) * 100)}%`); };
  const ready = createWorker('jpn_vert', 1, {
    workerPath: `${base}worker.min.js`, corePath: base, langPath: base,
    workerBlobURL: false, logger: progress,
  });
  // If cancelled during model initialization, release the worker when it arrives.
  ready.then(w => { if (signal.aborted) w.terminate(); }, () => {});
  try {
    worker = await Promise.race([ready, cancelled]);
    const recognize = async (image, layout) => {
      await Promise.race([worker.reinitialize(layout === 'vertical' ? 'jpn_vert' : ['jpn', 'eng']), cancelled]);
      const { data } = await Promise.race([worker.recognize(image, {
        tessedit_pageseg_mode: layout === 'vertical' ? PSM.SINGLE_BLOCK_VERT_TEXT : PSM.AUTO,
        user_defined_dpi: '300', rotateAuto: true,
      }), cancelled]);
      return candidate(data, layout);
    };
    const results = [];
    for (index = 0; index < photos.length; index++) {
      const image = new Blob([photos[index].bytes], { type: photos[index].type || 'image/jpeg' });
      // True Japanese vertical text requires jpn_vert, not a rotated horizontal model.
      const candidates = [await recognize(image, 'vertical'), await recognize(image, 'horizontal')];
      let best = candidates.sort((a, b) => b.score - a.score)[0];
      if (best.confidence < 55 || best.characters < 4) {
        onProgress(`写真${index + 1}の明るさを補正して再読み取り中…`);
        const improved = await improveContrast(photos[index]);
        candidates.push(await recognize(improved, 'vertical'), await recognize(improved, 'horizontal'));
        best = candidates.sort((a, b) => b.score - a.score)[0];
      }
      results.push(best);
    }
    return {
      text: results.map(r => r.text).filter(Boolean).join('\n\n'),
      unreadable: results.flatMap((r, i) => r.characters < 4 || r.confidence < 35 ? [i + 1] : []),
      results,
    };
  } finally { if (worker) await worker.terminate(); }
}
