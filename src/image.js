export async function readPhoto(file) {
  if (file.size > 40 * 1024 * 1024) throw new Error(`${file.name}は40MBを超えています。`);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 3200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Lossless storage avoids introducing JPEG artifacts around small characters.
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    canvas.width = canvas.height = 1;
    if (!blob) throw new Error('画像を変換できませんでした。');
    return { bytes: new Uint8Array(await blob.arrayBuffer()), name: file.name, type: 'image/png' };
  } finally { URL.revokeObjectURL(url); }
}

export async function improveContrast(photo) {
  const url = URL.createObjectURL(new Blob([photo.bytes], { type: photo.type || 'image/jpeg' }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), histogram = new Uint32Array(256);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const grey = Math.round(pixels.data[i] * 0.299 + pixels.data[i + 1] * 0.587 + pixels.data[i + 2] * 0.114);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = grey; histogram[grey]++;
    }
    const total = canvas.width * canvas.height;
    let low = 0, high = 255, sum = 0;
    while (low < 254 && sum + histogram[low] < total * 0.01) sum += histogram[low++];
    sum = 0;
    while (high > low + 1 && sum + histogram[high] < total * 0.01) sum += histogram[high--];
    for (let i = 0; i < pixels.data.length; i += 4) {
      const grey = Math.max(0, Math.min(255, (pixels.data[i] - low) * 255 / Math.max(1, high - low)));
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = grey;
    }
    ctx.putImageData(pixels, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    canvas.width = canvas.height = 1;
    if (!blob) throw new Error('画像を補正できませんでした。');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}
