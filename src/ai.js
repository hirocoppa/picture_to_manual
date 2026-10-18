export function summarizeWithAI(text, onProgress, signal = new AbortController().signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    let settled = false, timeout;
    const finish = (error, result) => {
      if (settled) return; settled = true;
      clearTimeout(timeout); signal.removeEventListener('abort', abort); worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const watchdog = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => finish(new Error('AIからの応答が止まったため処理を中断しました。文章は保存されています。もう一度作成してください。')), 90000);
    };
    const abort = () => finish(new DOMException('処理を中止しました', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = () => finish(new Error('AIが停止しました。文章は保存されています。端末の空きメモリを確認して、もう一度作成してください。'));
    worker.onmessageerror = () => finish(new Error('AIの結果を受け取れませんでした。文章は保存されています。もう一度作成してください。'));
    worker.onmessage = ({ data }) => {
      if (settled) return;
      watchdog();
      if (data.type === 'progress') onProgress(data.text);
      if (data.type === 'result') finish(null, data.text);
      if (data.type === 'error') finish(new Error('AIを実行できませんでした。文章は保存されています。通信と端末の空きメモリを確認してください。'));
    };
    watchdog(); worker.postMessage({ text, assetBase: new URL(import.meta.env.BASE_URL, location.href).href });
  });
}
