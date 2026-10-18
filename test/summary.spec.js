import { test, expect } from '@playwright/test';
import { splitSentences, selectSummary } from '../src/summary.js';
test('AI relevance selection keeps original wording and order while avoiding duplicated sentences',()=>{
  const text='使用後は電源を切る。\n使用後は電源を切る。\n水洗いは禁止。\n広告のご案内。\nイベント情報。\nコードを抜く。\n掃除して保管する。';
  const sentences=splitSentences(text);expect(sentences).toHaveLength(6);
  const result=selectSummary(sentences,[[1,0],[1,0],[0,1],[0,1],[1,0],[1,0]]);
  expect(result).toContain('水洗いは禁止。');
  expect(result).not.toContain('広告');expect(result).not.toContain('イベント');
  expect(result.match(/電源/g)).toHaveLength(1);
  const chosen=result.split('\n\n').map(line=>line.slice(1));
  expect(chosen.every(sentence=>sentences.includes(sentence))).toBe(true);
  expect(chosen.map(s=>sentences.indexOf(s))).toEqual([...chosen.map(s=>sentences.indexOf(s))].sort((a,b)=>a-b));
});
