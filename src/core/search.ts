/**
 * 本地搜索，支持简单语法：
 *   react 文档        普通关键词（标题/网址/标签/文件夹/摘要，支持拼音首字母）
 *   #前端 #文档        必须包含标签
 *   -#视频             排除标签
 *   site:github.com    限定域名
 */
import type { LibraryItem } from './types';
import { normalizeTag } from './normalize';
import { pinyinMatch } from '../utils/pinyinUtils';

export interface ParsedQuery {
  terms: string[];
  include: string[];
  exclude: string[];
  site?: string;
}

export function parseQuery(q: string): ParsedQuery {
  const out: ParsedQuery = { terms: [], include: [], exclude: [] };
  for (const tok of q.trim().split(/\s+/).filter(Boolean)) {
    if (/^-#.+/.test(tok)) out.exclude.push(normalizeTag(tok.slice(1)));
    else if (/^#.+/.test(tok)) out.include.push(normalizeTag(tok));
    else if (/^site:.+/i.test(tok)) out.site = tok.slice(5).toLowerCase().replace(/^www\./, '');
    else out.terms.push(tok.toLowerCase());
  }
  return out;
}

export const isEmptyQuery = (p: ParsedQuery) => !p.terms.length && !p.include.length && !p.exclude.length && !p.site;

function termScore(it: LibraryItem, term: string): number {
  const title = it.title.toLowerCase();
  if (title === term) return 10;
  if (title.startsWith(term)) return 7;
  if (title.includes(term)) return 5;
  if (it.tags.some(t => t.toLowerCase() === term)) return 5;
  if (it.tags.some(t => t.toLowerCase().includes(term))) return 3;
  if (pinyinMatch(it.title, term)) return 3;
  if (it.tags.some(t => pinyinMatch(t, term))) return 2;
  if (it.folderPath.some(f => f.toLowerCase().includes(term))) return 2;
  if (it.domain.includes(term)) return 2;
  if (it.url.toLowerCase().includes(term)) return 1;
  if (it.summary?.toLowerCase().includes(term)) return 1;
  return 0;
}

export function searchItems(items: LibraryItem[], p: ParsedQuery, limit = 200): LibraryItem[] {
  const scored: { it: LibraryItem; s: number }[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (seen.has(it.key)) continue;
    if (p.include.length && !p.include.every(t => it.tags.includes(t))) continue;
    if (p.exclude.length && p.exclude.some(t => it.tags.includes(t))) continue;
    if (p.site && !(it.domain === p.site || it.domain.endsWith('.' + p.site))) continue;
    let s = 1;
    for (const term of p.terms) {
      const ts = termScore(it, term);
      if (!ts) { s = 0; break; }
      s += ts;
    }
    if (!s) continue;
    s += Math.min(3, Math.log(1 + it.opens * 2 + it.visits) * 0.6); // 常用的排前面
    seen.add(it.key);
    scored.push({ it, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.it);
}

/** 输入框里正在输入的 #标签 前缀（用于自动补全） */
export function currentTagPrefix(q: string): string | null {
  const m = q.match(/(?:^|\s)-?#([^\s#]*)$/);
  return m ? m[1] : null;
}
