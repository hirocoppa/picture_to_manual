import { createWorker } from 'tesseract.js';

export async function recognizePhotos(photos, onProgress) {
  const base = new URL(`${import.meta.env.BASE_URL}ocr/`, location.href).href;
  let index = 0, worker;
  const progress = event => onProgress(`文字を読み取り中 ${index + 1}/${photos.length}枚 · ${Math.round((event.progress || 0) * 100)}%`);
  try {
    worker = await createWorker(['jpn', 'eng'], 1, {
      workerPath: `${base}worker.min.js`, corePath: base, langPath: base,
      workerBlobURL: false, logger: progress,
    });
    const results = [];
    for (index = 0; index < photos.length; index++) {
      progress({ progress: 0 });
      const { data } = await worker.recognize(new Blob([photos[index].bytes], { type: 'image/jpeg' }));
      results.push(data.text.trim());
    }
    return results.filter(Boolean).join('\n\n');
  } finally { if (worker) await worker.terminate(); }
}
