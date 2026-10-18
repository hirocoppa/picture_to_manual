import { pipeline, env } from '@huggingface/transformers';
import { splitSentences, selectSummary } from './summary.js';
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
self.onmessage = async ({ data: { text, assetBase } }) => {
  let extractor;
  try {
    const sentences = splitSentences(text);
    if (!sentences.length) throw new Error('要約する文章がありません。');
    env.backends.onnx.wasm.wasmPaths = `${assetBase}ai/`;
    extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
      device: 'wasm', dtype: 'q8', revision: '2c4055b12046f11709e9df2c122e59ffbdc2f900',
      progress_callback: event => {
        if (event.status === 'progress') self.postMessage({ type: 'progress', text: `小型AIを準備中 · ${Math.round(event.progress || 0)}%` });
      },
    });
    extractor.tokenizer.model_max_length = 128;
    const vectors = [];
    for (let i = 0; i < sentences.length; i++) {
      self.postMessage({ type: 'progress', text: `AIで要点を整理中 ${i + 1}/${sentences.length}` });
      // One short segment at a time bounds attention and activation memory.
      const characters = [...sentences[i]], parts = [];
      for (let start = 0; start < characters.length; start += 64) {
        const tensor = await extractor(characters.slice(start, start + 64).join(''), { pooling: 'mean', normalize: true });
        parts.push(Array.from(tensor.data));
      }
      const vector = parts[0].map((_, j) => parts.reduce((sum, part) => sum + part[j], 0) / parts.length);
      const norm = Math.hypot(...vector) || 1;
      vectors.push(vector.map(value => value / norm));
    }
    const summary = selectSummary(sentences, vectors);
    await extractor.dispose(); extractor = null;
    self.postMessage({ type: 'result', text: summary });
  } catch (error) {
    if (extractor) await extractor.dispose().catch(() => {});
    self.postMessage({ type: 'error', text: error.message || 'AI処理に失敗しました' });
  }
};
