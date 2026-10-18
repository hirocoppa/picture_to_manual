import { PDFDocument } from 'pdf-lib';

// Load the existing PDF itself; its pages are never rendered back into images.
export async function appendImages(existing, images) {
  const pdf = existing ? await PDFDocument.load(existing) : await PDFDocument.create();
  for (const bytes of images) {
    const image = await pdf.embedJpg(bytes);
    const width = 595.28;
    const height = 841.89;
    const margin = 24;
    const scale = Math.min((width - margin * 2) / image.width, (height - margin * 2) / image.height);
    const w = image.width * scale, h = image.height * scale;
    pdf.addPage([width, height]).drawImage(image, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
  }
  return { bytes: await pdf.save(), count: pdf.getPageCount() };
}

export async function appendSummary(existing, { title, summary }, fontBytes) {
  const { default: fontkit } = await import('@pdf-lib/fontkit');
  const pdf = existing ? await PDFDocument.load(existing) : await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const characters = new Set(font.getCharacterSet());
  const safe = value => [...value].map(c => c === '\n' || characters.has(c.codePointAt(0)) ? c : '□').join('');
  let page, y;
  const newPage = () => { page = pdf.addPage([595.28, 841.89]); y = 791.89; };
  const line = (text, size, leading) => {
    if (y - leading < 50) newPage();
    if (text) page.drawText(text, { x: 44, y: y - size, size, font });
    y -= leading;
  };
  const paragraph = (text, size, leading) => {
    let buffer = '';
    for (const char of safe(text)) {
      if (char === '\n') { line(buffer, size, leading); buffer = ''; continue; }
      if (font.widthOfTextAtSize(buffer + char, size) > 507 && buffer) { line(buffer, size, leading); buffer = ''; }
      buffer += char;
    }
    if (buffer) line(buffer, size, leading);
  };
  newPage();
  paragraph(title, 19, 29);
  line('写真からまとめた要点', 10, 26);
  paragraph(summary, 12, 23);
  return { bytes: await pdf.save(), count: pdf.getPageCount() };
}
