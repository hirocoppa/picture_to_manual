import './style.css';
import { appendImages, appendSummary } from './pdf.js';
import { store } from './storage.js';
import { recognizePhotos } from './ocr.js';
import { summarizeWithAI, stopAI } from './ai.js';

let documents = [], active = null, pending = [], busy = false;
let draftWrites = Promise.resolve();
let cancelAI;
let fontPromise;
async function japaneseFont() {
  if (!fontPromise) fontPromise = fetch(new URL(`${import.meta.env.BASE_URL}fonts/NotoSansJP-Regular.ttf`, location.href)).then(r => { if (!r.ok) throw new Error('日本語フォントを取得できません'); return r.arrayBuffer(); }).catch(error => { fontPromise = null; throw error; });
  return fontPromise;
}
const app = document.querySelector('#app');
app.innerHTML = `
<header><a class="brand" href="./"><span class="logo">▧</span> Picture to Manual</a><span class="local">この端末に保存</span></header>
<main><section class="intro"><div class="eyebrow">YOUR PHOTOS, ONE MANUAL</div><h1>写真の文字を、<br>わかりやすい要約に。</h1><p>文字を読み取り、無料の端末内AIで要点を整理。<br class="desktop">内容を確認して、読みやすいPDFにまとめます。</p></section>
<div class="workspace"><aside><div class="section-heading"><h2>マイマニュアル</h2><button id="new" class="icon" aria-label="新しいマニュアル">＋</button></div><div id="documents"></div><p class="privacy">写真とPDFはサーバーに送信されません。<br>このブラウザ内に保存されます。</p></aside>
<section class="editor"><div class="section-heading"><span class="eyebrow">MANUAL EDITOR</span><span id="badge">新規作成</span></div><label for="title">マニュアル名</label><input id="title" maxlength="100" placeholder="例：コーヒーマシンの使い方" value="新しいマニュアル"><div id="existing"></div>
<label class="drop" for="photos"><span class="photo-icon">＋</span><strong>写真を読み込む</strong><span>複数の写真をまとめて追加できます</span><span class="format">JPEG・PNG・WebP など、端末で読み込める画像</span></label><input type="file" id="photos" accept="image/*" multiple hidden><div id="queue"></div>
<fieldset class="output-mode"><legend>PDFの内容</legend><label><input type="radio" name="mode" value="summary" checked> 文字を要約してPDF</label><label><input type="radio" name="mode" value="photos"> 写真をそのままPDF</label></fieldset>
<section id="text-editor"><div class="section-heading"><h2>文字を読み取り・要約</h2><button id="read-text" class="secondary">写真の文字を読み取る</button></div>
<label for="source-text">読み取った文字（修正できます）</label><textarea id="source-text" rows="6" placeholder="写真から読み取るか、文章をここに入力してください。"></textarea>
<p class="hint">文字の読み間違いはここで修正してください。初回は文字認識データを取得します。写真・文章は外部に送信しません。</p>
<button id="summarize" class="secondary">無料のAIで要約する</button><button id="cancel-ai" class="secondary" hidden>AI処理を中止</button>
<p class="hint">AIモデルの初回取得に数百MB程度の通信と、端末の空きメモリが必要です。Wi-Fiでの利用をおすすめします。機種によっては動作しません。API料金はかかりません。</p>
<label for="summary-text">要約（PDFに入る内容・修正できます）</label><textarea id="summary-text" rows="7" placeholder="AIの要約を確認・修正してからPDFにしてください。"></textarea><p class="hint">AIの要約には誤りや情報の抜けがあり得ます。特に数値・手順・注意点を元の写真と照合してください。</p></section>
<p id="status" role="status" aria-live="polite"></p><div class="actions"><button id="save" class="primary">PDFを作成</button><button id="download" class="secondary" disabled>PDFを保存・共有</button></div><p class="hint">要約はA4縦のPDFに整えます。更新時は既存ページを残して末尾に追加します。</p></section></div>
<section class="steps"><div><b>01</b><span>写真を選ぶ</span></div><div><b>02</b><span>文字を読み取り・AIで要約</span></div><div><b>03</b><span>確認してPDFに保存</span></div></section><footer>Picture to Manual <span>日々の手順を、写真で残そう。</span></footer></main>`;
const $ = id => document.getElementById(id);
function mode() { return document.querySelector('input[name="mode"]:checked').value; }
function confirmTextChange() { return !($('source-text').value || $('summary-text').value) || confirm('写真を変更すると、読み取り済みの文章と要約がクリアされます。変更しますか？'); }
function invalidateText() { $('source-text').value = ''; $('summary-text').value = ''; }
function selectedPhotos() { return pending.filter(p => p.selected !== false); }
function textState() { return { mode: mode(), source: $('source-text').value, summary: $('summary-text').value }; }
function resetText() { invalidateText(); document.querySelector('input[value="summary"]').checked = true; }

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
  $('existing').textContent = active ? `✓ 既存の${active.count}ページを維持して、新しい内容を末尾に追加します。` : '';
  $('queue').replaceChildren();
  pending.forEach((photo, index) => {
    const card = document.createElement('div'); card.className = 'thumbnail';
    const img = document.createElement('img'); img.src = photo.url; img.alt = photo.name;
    const label = document.createElement('span'); label.textContent = `${index + 1}. ${photo.name}`;
    const remove = document.createElement('button'); remove.textContent = '×'; remove.setAttribute('aria-label', `${photo.name}を取り消す`); remove.disabled = busy;
    remove.onclick = () => { if (!confirmTextChange()) return; URL.revokeObjectURL(photo.url); pending.splice(index, 1); invalidateText(); persistDraft(); render(); };
    const controls = document.createElement('div'); controls.className = 'photo-controls';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = photo.selected !== false; check.disabled = busy; check.setAttribute('aria-label', `${photo.name}をPDFに含める`);
    check.onchange = () => { if (!confirmTextChange()) { check.checked = photo.selected !== false; return; } photo.selected = check.checked; invalidateText(); persistDraft(); render(); };
    for (const [text, offset] of [['←', -1], ['→', 1]]) {
      const move = document.createElement('button'); move.textContent = text; move.disabled = busy || index + offset < 0 || index + offset >= pending.length; move.setAttribute('aria-label', offset < 0 ? '前へ移動' : '後ろへ移動');
      move.onclick = () => { if (!confirmTextChange()) return; [pending[index], pending[index + offset]] = [pending[index + offset], pending[index]]; invalidateText(); persistDraft(); render(); }; controls.append(move);
    }
    controls.prepend(check); card.append(img, label, remove, controls); $('queue').append(card);
  });
  $('save').textContent = busy ? '処理中…' : active ? '内容を追加してPDFを更新' : 'PDFを作成';
  $('save').disabled = busy || (mode() === 'summary' ? !$('summary-text').value.trim() : !selectedPhotos().length); $('download').disabled = busy || !active;
  $('text-editor').hidden = mode() !== 'summary';
  $('read-text').disabled = busy || !selectedPhotos().length;
  $('summarize').disabled = busy || !$('source-text').value.trim();
  document.querySelectorAll('input[name="mode"]').forEach(input => input.disabled = busy);
  for (const id of ['new', 'photos', 'title', 'source-text', 'summary-text']) $(id).disabled = busy;
}
function select(doc) { if (busy) return; if ((pending.length || $('source-text').value || $('summary-text').value) && !confirm('作成中の写真・文章・要約を取り消して切り替えますか？')) return; release(); resetText(); active = doc; $('title').value = doc?.title || '新しいマニュアル'; message(''); persistDraft(); render(); }
$('new').onclick = () => select(null);
$('photos').onchange = async event => {
  const files = [...event.target.files]; event.target.value = ''; if (!files.length) return;
  if (!confirmTextChange()) return;
  busy = true; render(); message('写真を読み込んでいます…');
  let rejected = 0;
  for (const file of files) {
    try {
      if (file.size > 40 * 1024 * 1024) throw new Error('写真が大きすぎます');
      const bytes = await jpeg(file);
      invalidateText();
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
  if (busy || (mode() === 'summary' ? !$('summary-text').value.trim() : !selectedPhotos().length)) return; busy = true; render(); message('PDFを保存しています…');
  try {
    const result = mode() === 'summary'
      ? await appendSummary(active?.bytes, { title: $('title').value.trim() || '要約マニュアル', summary: $('summary-text').value }, await japaneseFont())
      : await appendImages(active?.bytes, selectedPhotos().map(p => p.bytes));
    const doc = { id: active?.id || crypto.randomUUID(), title: $('title').value.trim() || '新しいマニュアル', bytes: result.bytes, count: result.count, updated: Date.now() };
    await draftWrites;
    await store('readwrite', s => {
      s.put(doc);
      return s.put({ id: '__draft__', activeId: doc.id, title: doc.title, pending: [], text: { mode: mode(), source: '', summary: '' } });
    });
    active = doc; documents = [doc, ...documents.filter(d => d.id !== doc.id)]; release(); invalidateText(); message(`${doc.count}ページのPDFを保存しました。`);
  } catch (error) { console.error(error); message('保存できませんでした。端末の空き容量を確認して再試行してください。作業内容はそのまま残っています。'); }
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
  const draft = { id: '__draft__', activeId: active?.id || null, title: $('title').value, text: textState(), pending: pending.map(({ bytes, name, selected }) => ({ bytes, name, selected })) };
  draftWrites = draftWrites.catch(() => {}).then(() => store('readwrite', s => s.put(draft))).then(() => true).catch(() => {
    message('作業内容を端末に保存できませんでした。容量制限やブラウザの設定を確認してください。このまま閉じると未保存の写真が失われます。');
    return false;
  });
  return draftWrites;
}
$('title').oninput = () => persistDraft();
$('source-text').oninput = () => { $('summary-text').value = ''; persistDraft(); render(); };
$('summary-text').oninput = () => { persistDraft(); render(); };
document.querySelectorAll('input[name="mode"]').forEach(input => input.onchange = () => { persistDraft(); render(); });
$('read-text').onclick = async () => {
  if (busy || !selectedPhotos().length) return;
  if ($('source-text').value && !confirm('読み取り済みの文字と要約を置き換えますか？')) return;
  busy = true; render(); message('文字認識を準備しています…');
  try {
    const { text, unreadable } = await recognizePhotos(selectedPhotos(), message);
    if (!text) { message('文字を見つけられませんでした。鮮明な写真に変えるか、文章を入力してください。'); return; }
    $('source-text').value = text; $('summary-text').value = '';
    if (await persistDraft()) message((unreadable ? `${unreadable}枚の写真からは文字を読み取れませんでした。必要な内容を確認・追記してください。` : '文字を読み取りました。') + '読み間違いを修正して「無料のAIで要約する」を押してください。');
  } catch (error) { console.error(error); message('文字を読み取れませんでした。通信・端末の空きメモリを確認して再試行するか、文章を入力してください。'); }
  finally { busy = false; render(); }
};
$('summarize').onclick = async () => {
  const text = $('source-text').value.trim();
  if (busy || !text) return;
  if (text.length > 12000) { message('一度に要約できるのは12,000文字までです。文章を分けてPDFに追記してください。'); return; }
  busy = true; render(); $('cancel-ai').hidden = false; message('AIを準備しています…初回のモデル取得には時間がかかります。');
  try {
    const cancelled = new Promise((_, reject) => { cancelAI = () => { stopAI(); reject(new Error('cancelled')); }; });
    const summary = await Promise.race([summarizeWithAI(text, message), cancelled]);
    $('summary-text').value = summary;
    if (await persistDraft()) message('AIの要約ができました。内容を確認・修正してPDFを作成してください。');
  } catch (error) {
    console.error(error);
    message(error.message === 'cancelled' ? 'AI処理を中止しました。作業内容は残っています。' : 'AIを実行できませんでした。通信や空きメモリを確認してください。端末によっては対応できません。要約欄に文章を入力してPDFを作成することもできます。');
  } finally { stopAI(); cancelAI = null; busy = false; $('cancel-ai').hidden = true; render(); }
};
$('cancel-ai').onclick = () => cancelAI?.();
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
      $('source-text').value = draft.text?.source || '';
      $('summary-text').value = draft.text?.summary || '';
      document.querySelector(`input[value="${draft.text?.mode === 'photos' ? 'photos' : 'summary'}"]`).checked = true;
      if (pending.length || draft.text?.summary) message('前回の作業内容を復元しました。');
    }
  } catch { message('端末内の保存領域を利用できません。ブラウザの設定を確認してください。'); }
  busy = false; render();
}
initialize();
