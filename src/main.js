import './style.css';
import { appendImages } from './pdf.js';
import { store } from './storage.js';

let documents = [], active = null, pending = [], busy = false;
let draftWrites = Promise.resolve();
const app = document.querySelector('#app');
app.innerHTML = `
<header><a class="brand" href="./"><span class="logo">▧</span> Picture to Manual</a><span class="local">この端末に保存</span></header>
<main><section class="intro"><div class="eyebrow">YOUR PHOTOS, ONE MANUAL</div><h1>写真をまとめて、<br>使えるマニュアルに。</h1><p>写真を選ぶだけでPDFに。あとから写真を追加して、<br class="desktop">同じマニュアルを育てていけます。</p></section>
<div class="workspace"><aside><div class="section-heading"><h2>マイマニュアル</h2><button id="new" class="icon" aria-label="新しいマニュアル">＋</button></div><div id="documents"></div><p class="privacy">写真とPDFはサーバーに送信されません。<br>このブラウザ内に保存されます。</p></aside>
<section class="editor"><div class="section-heading"><span class="eyebrow">MANUAL EDITOR</span><span id="badge">新規作成</span></div><label for="title">マニュアル名</label><input id="title" maxlength="100" placeholder="例：コーヒーマシンの使い方" value="新しいマニュアル"><div id="existing"></div>
<label class="drop" for="photos"><span class="photo-icon">＋</span><strong>写真を読み込む</strong><span>複数の写真をまとめて追加できます</span><span class="format">JPEG・PNG・WebP など、端末で読み込める画像</span></label><input type="file" id="photos" accept="image/*" multiple hidden><div id="queue"></div><p id="status" role="status" aria-live="polite"></p><div class="actions"><button id="save" class="primary">PDFを作成</button><button id="download" class="secondary" disabled>PDFを保存・共有</button></div><p class="hint">写真1枚につき1ページ。追加した写真は既存ページの後ろに入ります。</p></section></div>
<section class="steps"><div><b>01</b><span>写真を選ぶ</span></div><div><b>02</b><span>PDFにまとめる</span></div><div><b>03</b><span>いつでも写真を追加</span></div></section><footer>Picture to Manual <span>日々の手順を、写真で残そう。</span></footer></main>`;
const $ = id => document.getElementById(id);
function message(text) { $('status').textContent = text; }
function release() { pending.forEach(p => URL.revokeObjectURL(p.url)); pending = []; }
function render() {
  $('documents').replaceChildren();
  if (!documents.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'まだマニュアルがありません。最初の1冊を作りましょう。'; $('documents').append(p); }
  for (const doc of documents) {
    const button = document.createElement('button'); button.className = 'document' + (active?.id === doc.id ? ' selected' : '');
    const name = document.createElement('strong'); name.textContent = doc.title;
    const detail = document.createElement('span'); detail.textContent = `${doc.count}ページ · ${new Date(doc.updated).toLocaleDateString('ja-JP')}`;
    button.append(name, detail); button.onclick = () => select(doc); button.disabled = busy; $('documents').append(button);
  }
  $('badge').textContent = active ? `${active.count}ページ保存済み` : '新規作成';
  $('existing').textContent = active ? `✓ 既存の${active.count}ページを維持して、写真を末尾に追加します。` : '';
  $('queue').replaceChildren();
  pending.forEach((photo, index) => {
    const card = document.createElement('div'); card.className = 'thumbnail';
    const img = document.createElement('img'); img.src = photo.url; img.alt = photo.name;
    const label = document.createElement('span'); label.textContent = `${index + 1}. ${photo.name}`;
    const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', `${photo.name}を取り消す`); remove.disabled = busy;
    remove.onclick = () => { URL.revokeObjectURL(photo.url); pending.splice(index, 1); persistDraft(); render(); };
    const controls = document.createElement('div'); controls.className = 'photo-controls';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = photo.selected !== false; check.disabled = busy; check.setAttribute('aria-label', `${photo.name}をPDFに含める`);
    check.onchange = () => { photo.selected = check.checked; persistDraft(); render(); };
    for (const [text, offset] of [['←', -1], ['→', 1]]) {
      const move = document.createElement('button'); move.textContent = text; move.disabled = busy || index + offset < 0 || index + offset >= pending.length; move.setAttribute('aria-label', offset < 0 ? '前へ移動' : '後ろへ移動');
      move.onclick = () => { [pending[index], pending[index + offset]] = [pending[index + offset], pending[index]]; persistDraft(); render(); }; controls.append(move);
    }
    controls.prepend(check); card.append(img, label, remove, controls); $('queue').append(card);
  });
  $('save').textContent = busy ? '処理中…' : active ? '写真を追加してPDFを更新' : 'PDFを作成';
  $('save').disabled = busy || !pending.some(p => p.selected !== false); $('download').disabled = busy || !active;
  for (const id of ['new', 'photos', 'title']) $(id).disabled = busy;
}
function select(doc) { if (busy) return; if (pending.length && !confirm('未保存の写真を取り消して切り替えますか？')) return; release(); active = doc; $('title').value = doc?.title || '新しいマニュアル'; message(''); persistDraft(); render(); }
$('new').onclick = () => select(null);
$('photos').onchange = async event => {
  const files = [...event.target.files]; event.target.value = ''; if (!files.length) return;
  busy = true; render(); message('写真を読み込んでいます…');
  let rejected = 0;
  for (const file of files) {
    try {
      if (file.size > 40 * 1024 * 1024) throw new Error('写真が大きすぎます');
      const bytes = await jpeg(file);
      pending.push({ bytes, name: file.name, selected: true, url: URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })) });
    } catch { rejected++; }
  }
  const persisted = await persistDraft(); busy = false; if (persisted) message(rejected ? `${rejected}枚は読み込めませんでした。JPEGまたはPNGに変換するか、40MB以下の写真を選んでください。` : `${pending.length}枚の写真を追加できます。`); render();
};
async function jpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const ratio = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('画像変換失敗'); return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}
$('save').onclick = async () => {
  if (busy || !pending.some(p => p.selected !== false)) return; busy = true; render(); message('PDFを保存しています…');
  try {
    const result = await appendImages(active?.bytes, pending.filter(p => p.selected !== false).map(p => p.bytes));
    const doc = { id: active?.id || crypto.randomUUID(), title: $('title').value.trim() || '新しいマニュアル', bytes: result.bytes, count: result.count, updated: Date.now() };
    await draftWrites;
    await store('readwrite', s => {
      s.put(doc);
      return s.put({ id: '__draft__', activeId: doc.id, title: doc.title, pending: [] });
    });
    active = doc; documents = [doc, ...documents.filter(d => d.id !== doc.id)]; release(); message(`${doc.count}ページのPDFを保存しました。`);
  } catch (error) { console.error(error); message('保存できませんでした。端末の空き容量を確認して再試行してください。写真は選択したまま残っています。'); }
  finally { busy = false; render(); }
};
$('download').onclick = async () => {
  if (!active) return;
  const name = active.title.replace(/[\\/:*?"<>|]/g, '_') + '.pdf';
  const file = new File([active.bytes], name, { type: 'application/pdf' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: active.title });
    else { const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  } catch (error) { if (error.name !== 'AbortError') message('共有できませんでした。もう一度お試しください。'); }
};
window.addEventListener('beforeunload', event => { if (pending.length || busy) { event.preventDefault(); event.returnValue = ''; } });
function persistDraft() {
  const draft = { id: '__draft__', activeId: active?.id || null, title: $('title').value, pending: pending.map(({ bytes, name, selected }) => ({ bytes, name, selected })) };
  draftWrites = draftWrites.catch(() => {}).then(() => store('readwrite', s => s.put(draft))).then(() => true).catch(() => {
    message('作業内容を端末に保存できませんでした。容量制限やブラウザの設定を確認してください。このまま閉じると未保存の写真が失われます。');
    return false;
  });
  return draftWrites;
}
$('title').oninput = () => persistDraft();
async function initialize() {
  busy = true; render();
  try {
    const saved = await store('readonly', s => s.getAll());
    documents = saved.filter(d => d.id !== '__draft__').sort((a, b) => b.updated - a.updated);
    const draft = saved.find(d => d.id === '__draft__');
    if (draft) {
      active = documents.find(d => d.id === draft.activeId) || null;
      $('title').value = draft.title || '新しいマニュアル';
      pending = draft.pending.map(p => ({ ...p, url: URL.createObjectURL(new Blob([p.bytes], { type: 'image/jpeg' })) }));
      if (pending.length) message('前回の作業内容を復元しました。');
    }
  } catch { message('端末内の保存領域を利用できません。ブラウザの設定を確認してください。'); }
  busy = false; render();
}
initialize();
