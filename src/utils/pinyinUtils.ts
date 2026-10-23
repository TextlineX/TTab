/**
 * 拼音匹配：支持全拼、首字母、混合输入，多音字任一读音都能匹配。
 *   "知乎"  ← zhihu / zh / zhh / zhih / 知h
 *   "哔哩哔哩" ← bilibili / blbl / bili
 */
import { PINYIN_DATA } from './pinyinData';

let table: Map<string, string[]> | null = null;

function getTable(): Map<string, string[]> {
  if (table) return table;
  table = new Map();
  // 主读音在前、次要读音（~ 前缀）在后，保证每个字的第一个读音是最常用的
  for (const group of PINYIN_DATA.split('|')) {
    const i = group.indexOf(':');
    const py = group.slice(group.startsWith('~') ? 1 : 0, i);
    for (const ch of group.slice(i + 1)) {
      const list = table.get(ch);
      if (list) list.push(py); else table.set(ch, [py]);
    }
  }
  return table;
}

/** 单个字的所有读音（非汉字返回 null） */
export function readingsOf(ch: string): string[] | null {
  return getTable().get(ch) || null;
}

/** 拼音首字母串（多音字取第一个读音），保留给旧代码使用 */
export function getPinyinInitials(str: string): string {
  let out = '';
  for (const ch of str) {
    const r = readingsOf(ch);
    out += r ? r[0][0] : ch.toLowerCase();
  }
  return out;
}

/** 完整拼音串（多音字取第一个读音） */
export function getPinyinFull(str: string): string {
  let out = '';
  for (const ch of str) {
    const r = readingsOf(ch);
    out += r ? r[0] : ch.toLowerCase();
  }
  return out;
}

const DOUBLE_INITIALS = ['zh', 'ch', 'sh'];

/**
 * 判断 query 能否从 text 的某个位置开始连续匹配。
 * 每个汉字可以用：完整拼音、首字母、zh/ch/sh 双字母声母，或（在末尾）拼音前缀来匹配。
 */
function matchAt(chars: string[], start: number, q: string): boolean {
  const memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    if (j >= q.length) return true;
    if (i >= chars.length) return false;
    const k = i * 1000 + j;
    const hit = memo.get(k);
    if (hit !== undefined) return hit;
    let ok = false;
    const ch = chars[i];
    const reads = readingsOf(ch);
    if (!reads) {
      ok = ch.toLowerCase() === q[j] && go(i + 1, j + 1);
    } else if (ch === q[j]) {
      ok = go(i + 1, j + 1); // 直接输入汉字
    } else {
      const rest = q.slice(j);
      for (const r of reads) {
        if (rest.startsWith(r) && go(i + 1, j + r.length)) { ok = true; break; }
        if (r.startsWith(rest)) { ok = true; break; } // 查询在这个字的拼音中途结束
        const di = DOUBLE_INITIALS.find(d => r.startsWith(d));
        if (di && rest.startsWith(di) && go(i + 1, j + 2)) { ok = true; break; }
        if (r[0] === q[j] && go(i + 1, j + 1)) { ok = true; break; }
      }
    }
    memo.set(k, ok);
    return ok;
  };
  return go(start, 0);
}

/**
 * 判断搜索词是否匹配字符串（原文包含、或拼音全拼/首字母/混合匹配）
 */
export function pinyinMatch(text: string, query: string): boolean {
  if (!text || !query) return false;
  const t = text.toLowerCase();
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return false;
  if (t.includes(q)) return true;
  if (!/[a-z]/.test(q)) return false; // 不含字母时没有拼音可匹配
  const chars = [...t].slice(0, 80);
  if (!chars.some(c => readingsOf(c))) return false;
  for (let s = 0; s < chars.length; s++) {
    const c = chars[s];
    const r = readingsOf(c);
    // 起点剪枝：首字符必须对得上
    if (r ? !(r.some(x => x[0] === q[0]) || c === q[0]) : c !== q[0]) continue;
    if (matchAt(chars, s, q)) return true;
  }
  return false;
}
