import './style.css';
import { appendSummary } from './pdf.js';
import { store } from './storage.js';
import { recognizePhotos } from './ocr.js';
import { summarizeWithAI } from './ai.js';
import { readPhoto } from './image.js';

let documents = [], active = null, pending = [], source = '', summary = '';
let busy = true, paused = false, phase = '', controller, draftWrites = Promise.resolve(), fontPromise;
const app = document.querySelector('#app');
app.innerHTML = `
<header><a class="brand" href="./"><span class="logo">▧</span> Picture to Manual</a><span class="local">無料・端末内で処理</span></header>
<main>
<section class="intro"><div class="eyebrow">PHOTO → SUMMARY → PDF</div><h1>写真を選ぶだけ。<br>要点をまとめたPDFに。</h1><p>縦書き・横書きの文字を読み取り、<br>AIで要約して自動でPDFを作ります。</p></section>
<section class="editor" aria-label="PDFを作る">
<div class="section-heading"><h2 id="editor-heading">新しいPDF</h2><span id="badge">新規作成</span></div>
<label for="title">PDFの名前</label><input id="title" maxlength="100" value="新しいマニュアル" placeholder="例：読書メモ">
<p id="existing"></p>
<label class="drop" id="photo-picker" for="photos" tabindex="0" role="button"><span class="photo-icon">＋</span><strong id="picker-label">写真を選んでPDFを作る</strong><span>複数の写真をまとめて選べます</span></label>
<input type="file" id="photos" accept="image/*" multiple hidden>
<div id="progress" hidden><ol><li data-phase="ocr">文字を読み取り</li><li data-phase="ai">AIで要約</li><li data-phase="pdf">PDFを作成</li></ol></div>
<p id="status" role="status" aria-live="polite"></p>
<div class="actions"><button id="retry" class="secondary" hidden>もう一度作成する</button><button id="cancel" class="secondary" hidden>中止する</button><button id="download" class="primary" hidden>PDFを保存・共有</button></div>
<div id="preview" hidden><h3>最後にまとめた内容</h3><p id="summary-preview"></p></div>
<p class="hint">写真・文章は外部に送信しません。要約には誤りや情報の抜けがあり得ます。</p>
<details><summary>初めて使うとき・文字が読めないとき</summary><p>初回はAIモデル（約512MB）を取得します。Wi-Fiをご利用ください。端末によってはメモリ不足で動作しません。</p><p>縦書きの日本語に対応しています。文字が小さい・ぼけている・斜めの写真は、文字を大きく、明るい場所で正面から撮ると読み取りやすくなります。手書きや複雑な紙面では認識できない場合があります。</p><p>大切なPDFは「ファイル」に保存してください。ブラウザのデータが削除されると端末内の内容も失われます。</p></details>
</section>
<section class="library"><div class="section-heading"><h2>保存したPDF</h2><button id="new" class="secondary">新しいPDF</button></div><div id="documents"></div></section>
<footer>Picture to Manual</footer>
</main>`;
const $ = id => document.getElementById(id);
function message(text) { $('status').textContent = text; }
function render() {
  $('title').disabled = busy; $('photos').disabled = busy; $('new').disabled = busy;
  $('photo-picker').classList.toggle('disabled', busy);
  $('photo-picker').setAttribute('aria-disabled', String(busy));
  $('photo-picker').tabIndex = busy ? -1 : 0;
  $('picker-label').textContent = paused && pending.length ? '写真を選び直す' : active ? '写真を追加してPDFを更新' : '写真を選んでPDFを作る';
  $('badge').textContent = active ? `${active.count}ページ保存済み` : '新規作成';
  $('existing').textContent = active ? `今の${active.count}ページを残して、新しい要約を末尾に追加します。` : '';
  $('editor-heading').textContent = active ? 'PDFに追加' : '新しいPDF';
  $('retry').hidden = busy || !(pending.length || source || summary);
  $('cancel').hidden = !busy || !controller || phase === 'saving';
  $('download').hidden = busy || !active;
  $('progress').hidden = !busy || !phase;
  $('progress').setAttribute('aria-busy', String(busy));
  const order = ['ocr', 'ai', 'pdf', 'saving'];
  document.querySelectorAll('[data-phase]').forEach(el => {
    el.classList.toggle('current', el.dataset.phase === phase || (phase === 'saving' && el.dataset.phase === 'pdf'));
    el.classList.toggle('complete', order.indexOf(el.dataset.phase) < order.indexOf(phase));
  });
  $('preview').hidden = !active?.lastSummary;
  $('summary-preview').textContent = active?.lastSummary || '';
  $('documents').replaceChildren();
  if (!documents.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = '作成したPDFがここに並びます。'; $('documents').append(p); }
  for (const doc of documents) {
    const button = document.createElement('button'); button.className = 'document' + (active?.id === doc.id ? ' selected' : ''); button.disabled = busy;
    const name = document.createElement('strong'); name.textContent = doc.title;
    const detail = document.createElement('span'); detail.textContent = `${doc.count}ページ · ${new Date(doc.updated).toLocaleDateString('ja-JP')}`;
    button.append(name, detail); button.onclick = () => select(doc); $('documents').append(button);
  }
}
function saveDraft() {
  const draft = { id: '__draft__', version: 2, activeId: active?.id || null, title: $('title').value, pending, source, summary, paused };
  draftWrites = draftWrites.catch(() => {}).then(() => store('readwrite', s => s.put(draft)));
  return draftWrites;
}
function select(doc) {
  if (busy) return;
  if ((pending.length || source || summary) && !confirm('中断している作業を取り消して切り替えますか？')) return;
  active = doc; pending = []; source = summary = ''; paused = false; $('title').value = doc?.title || '新しいマニュアル';
  message(''); render(); saveDraft().catch(() => message('作業状態を保存できませんでした。端末の空き容量を確認してください。'));
}
async function japaneseFont(signal) {
  if (!fontPromise) fontPromise = fetch(new URL(`${import.meta.env.BASE_URL}fonts/NotoSansJP-Regular.ttf`, location.href))
    .then(r => { if (!r.ok) throw new Error('PDF用フォントを取得できませんでした。通信を確認してください。'); return r.arrayBuffer(); })
    .catch(error => { fontPromise = null; throw error; });
  const bytes = await fontPromise; signal.throwIfAborted(); return bytes;
}
function setPhase(value, text) { phase = value; message(text); render(); }
async function runPipeline() {
  if (busy || !(pending.length || source || summary)) return;
  busy = true; paused = false; controller = new AbortController(); const signal = controller.signal;
  try {
    await saveDraft(); signal.throwIfAborted();
    if (!source && !summary) {
      setPhase('ocr', '文字の読み取りを準備しています…');
      const result = await recognizePhotos(pending, message, signal); signal.throwIfAborted();
      if (result.unreadable.length || !result.text) {
        const list = result.unreadable.length ? result.unreadable.join('・') : 'すべて';
        throw new Error(`写真${list}の文字を十分に読み取れませんでした。明るい場所で文字を大きく、正面から撮った写真を選び直してください。PDFは変更していません。`);
      }
      source = result.text; await saveDraft(); signal.throwIfAborted();
    }
    if (!summary) {
      setPhase('ai', 'AIで要約しています。初回のモデル取得には時間がかかります…');
      summary = await summarizeWithAI(source, message, signal); signal.throwIfAborted();
      if (!summary.trim()) throw new Error('要約を作成できませんでした。もう一度お試しください。');
      await saveDraft(); signal.throwIfAborted();
    }
    setPhase('pdf', '要約したPDFを作成しています…');
    const title = $('title').value.trim() || '新しいマニュアル';
    const result = await appendSummary(active?.bytes, { title, summary }, await japaneseFont(signal)); signal.throwIfAborted();
    const doc = { id: active?.id || crypto.randomUUID(), title, bytes: result.bytes, count: result.count, lastSummary: summary, updated: Date.now() };
    setPhase('saving', 'PDFを端末に保存しています…');
    await draftWrites;
    await store('readwrite', s => {
      s.put(doc);
      return s.put({ id: '__draft__', version: 2, activeId: doc.id, title, pending: [], source: '', summary: '', paused: false });
    });
    active = doc; documents = [doc, ...documents.filter(d => d.id !== doc.id)]; pending = []; source = summary = ''; $('title').value = title;
    message(`完成しました。${doc.count}ページのPDFを保存・共有できます。`);
  } catch (error) {
    console.error(error); paused = true;
    const text = error.name === 'AbortError' ? '処理を中止しました。「もう一度作成する」で再開できます。'
      : error.name === 'QuotaExceededError' ? '保存容量が足りません。空き容量を確保して、もう一度作成してください。以前のPDFは残っています。'
      : error.message || '作成できませんでした。通信と端末の空き容量を確認してください。';
    try { await saveDraft(); } catch { /* Preserve the working state in memory. */ }
    message(text);
  } finally { busy = false; controller = null; phase = ''; render(); }
}
$('photos').onchange = async event => {
  const files = [...event.target.files]; event.target.value = ''; if (!files.length || busy) return;
  busy = true; message('写真を読み込んでいます…'); render();
  try {
    const imported = [];
    for (const file of files) imported.push(await readPhoto(file));
    pending = imported; source = summary = ''; paused = false;
    await saveDraft(); busy = false; await runPipeline();
  } catch (error) {
    paused = true; busy = false; message(error.name === 'QuotaExceededError' ? '写真を保存できませんでした。端末の空き容量を確認してください。' : '写真を読み込めませんでした。40MB以下のJPEG・PNGなどを選んでください。'); render();
  }
};
$('photo-picker').onkeydown = event => { if (!busy && ['Enter', ' '].includes(event.key)) { event.preventDefault(); $('photos').click(); } };
$('cancel').onclick = () => { if (phase !== 'saving') controller?.abort(); };
$('retry').onclick = runPipeline;
$('new').onclick = () => select(null);
$('title').oninput = () => saveDraft().catch(() => message('名前を保存できませんでした。端末の空き容量を確認してください。'));
$('download').onclick = async () => {
  if (!active || busy) return;
  const file = new File([active.bytes], active.title.replace(/[\\/:*?"<>|]/g, '_') + '.pdf', { type: 'application/pdf' });
  try {
    if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: active.title });
    else { const url = URL.createObjectURL(file); const a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  } catch (error) { if (error.name !== 'AbortError') message('共有できませんでした。もう一度お試しください。'); }
};
window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
async function initialize() {
  try {
    const saved = await store('readonly', s => s.getAll());
    documents = saved.filter(d => d.id !== '__draft__').sort((a, b) => b.updated - a.updated);
    const draft = saved.find(d => d.id === '__draft__');
    if (draft) {
      active = documents.find(d => d.id === draft.activeId) || null; $('title').value = draft.title || '新しいマニュアル';
      pending = (draft.pending || []).filter(p => p.selected !== false);
      source = draft.source || draft.text?.source || ''; summary = draft.summary || draft.text?.summary || ''; paused = draft.paused || false;
    }
    busy = false; render();
    if (pending.length || source || summary) {
      if (paused) message('中断した作業があります。「もう一度作成する」で再開できます。');
      else await runPipeline();
    }
  } catch (error) { console.error(error); busy = false; render(); message('端末内の保存領域を利用できません。ブラウザの設定を確認してください。'); }
}
initialize();
