export function splitSentences(text) {
  return [...new Set((text.replace(/\r/g, '').match(/[^。！？!?\n]+[。！？!?]?/gu) || []).map(s => s.trim()).filter(Boolean))];
}
function dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }
export function selectSummary(sentences, vectors) {
  if (!sentences.length || sentences.length !== vectors.length) throw new Error('要約に必要な文章を取得できませんでした。');
  if (!vectors[0]?.length || vectors.some(v => v.length !== vectors[0].length || v.some(value => !Number.isFinite(value)))) throw new Error('AIの解析結果を取得できませんでした。');
  const center = vectors[0].map((_, i) => vectors.reduce((sum, vector) => sum + vector[i], 0) / vectors.length);
  const norm = Math.hypot(...center) || 1; for (let i = 0; i < center.length; i++) center[i] /= norm;
  const selected = [], limit = Math.min(sentences.length, 12, Math.max(3, Math.ceil(sentences.length * 0.4)));
  while (selected.length < limit) {
    let best = -1, score = -Infinity;
    for (let i = 0; i < sentences.length; i++) {
      if (selected.includes(i)) continue;
      const redundancy = selected.length ? Math.max(...selected.map(j => dot(vectors[i], vectors[j]))) : 0;
      const important = /注意|危険|禁止|必ず|してはいけ|しないで|ないこと|warning|must|never/i.test(sentences[i]) ? 0.15 : 0;
      const value = 0.75 * dot(vectors[i], center) - 0.25 * redundancy + important;
      if (value > score) { score = value; best = i; }
    }
    selected.push(best);
  }
  return selected.sort((a, b) => a - b).map(i => `・${sentences[i]}`).join('\n\n');
}
