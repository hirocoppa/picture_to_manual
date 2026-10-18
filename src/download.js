export function pdfFilename(title, timestamp = Date.now()) {
  const date = new Date(timestamp);
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const name = title.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/\.pdf$/i, '').trim() || '新しいマニュアル';
  return `${name}_${stamp}.pdf`;
}
export function pdfFile(doc) {
  return new File([doc.bytes], pdfFilename(doc.title, doc.updated), { type: 'application/pdf' });
}
export function downloadPdf(doc) {
  const file = pdfFile(doc), url = URL.createObjectURL(file);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name;
  document.body.append(anchor);
  try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
  return file.name;
}
