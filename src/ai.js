export function summarizeWithAI(text, onProgress, signal = new AbortController().signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = (error, result) => {
      if (settled) return; settled = true;
      signal.removeEventListener('abort', abort); worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new DOMException('処理を中止しました', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = () => finish(new Error('AIを起動できません。通信と端末の空きメモリを確認してください。'));
    worker.onmessage = ({ data }) => {
      if (settled) return;
      if (data.type === 'progress') onProgress(data.text);
      if (data.type === 'result') finish(null, data.text);
      if (data.type === 'error') finish(new Error('AIを実行できませんでした。通信と端末の空きメモリを確認してください。'));
    };
    worker.postMessage({ text, assetBase: new URL(import.meta.env.BASE_URL, location.href).href });
  });
}
