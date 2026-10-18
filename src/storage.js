const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('picture-to-manual', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('documents', { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function store(mode, operation) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', mode);
    let request;
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('保存を中断しました'));
    try { request = operation(tx.objectStore('documents')); }
    catch (error) { tx.abort(); reject(error); }
  });
}
