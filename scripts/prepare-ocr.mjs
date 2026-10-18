import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const target = new URL('../public/ocr/', import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(require.resolve('tesseract.js/dist/worker.min.js'), new URL('worker.min.js', target));
const core = path.dirname(require.resolve('tesseract.js-core'));
for (const name of await readdir(core)) {
  if (name.endsWith('.wasm.js') || name.endsWith('.wasm')) await copyFile(path.join(core, name), new URL(name, target));
}
for (const language of ['jpn', 'eng', 'jpn_vert']) {
  const base = path.dirname(require.resolve(`@tesseract.js-data/${language}/package.json`));
  await copyFile(path.join(base, '4.0.0_best_int', `${language}.traineddata.gz`), new URL(`${language}.traineddata.gz`, target));
}
console.log('Local OCR worker, WASM and vertical/horizontal Japanese + English models prepared.');
const aiTarget = new URL('../public/ai/', import.meta.url);
await mkdir(aiTarget, { recursive: true });
const ort = path.dirname(require.resolve('onnxruntime-web'));
for (const name of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  await copyFile(path.join(ort, name), new URL(name, aiTarget));
}

await copyFile(require.resolve('tesseract.js/LICENSE.md'), new URL('TESSERACT-LICENSE.md', target));
await copyFile(path.join(core, 'LICENSE'), new URL('TESSERACT-CORE-LICENSE.txt', target));
