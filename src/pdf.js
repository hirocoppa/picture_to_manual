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
