let worker;
export function stopAI() { worker?.terminate(); worker = null; }
export function summarizeWithAI(text, onProgress) {
  stopAI();
  return new Promise((resolve, reject) => {
    const current = worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    const fail = error => { stopAI(); reject(error); };
    current.onerror = () => fail(new Error('AIを起動できません。端末の空きメモリや通信を確認してください。'));
    current.onmessage = ({ data }) => {
      if (data.type === 'progress') onProgress(data.text);
      if (data.type === 'result') { stopAI(); resolve(data.text); }
      if (data.type === 'error') fail(new Error(data.text));
    };
    current.postMessage({ text, assetBase: new URL(import.meta.env.BASE_URL, location.href).href });
  });
}
