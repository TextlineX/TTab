/**
 * 本地向量：不调用任何接口，基于字词特征的 TF-IDF + 特征哈希。
 * - 中文：二元组 + 单字（单字权重低）
 * - 英文/数字：单词
 * - 标签、域名单独作为强特征
 * 能识别"写法不同但用词相近"的网页，作为接口向量不可用时的兜底。
 */
import type { LibraryItem } from '../types';
import { fnv1a, normalize } from './vecmath';
import { isGenericFolder } from '../ruleTagger';

export const LOCAL_DIMS = 512;

export interface DocInput {
  key: string;
  title: string;
  domain: string;
  tags: string[];
  folderPath: string[];
  summary?: string;
  /** 网页简介（读取过的话） */
  description?: string;
}

/** 给向量接口用的文本 */
export function docText(d: DocInput): string {
  const folders = d.folderPath.filter(f => !isGenericFolder(f));
  const parts = [d.title, d.summary, d.description, d.tags.length ? `标签：${d.tags.join('、')}` : '', folders.length ? `分类：${folders.join('/')}` : '', d.domain];
  return parts.filter(Boolean).join('\n').slice(0, 600);
}

export const toDoc = (it: LibraryItem, description?: string): DocInput => ({
  key: it.key, title: it.title, domain: it.domain, tags: it.tags, folderPath: it.folderPath, summary: it.summary, description,
});

const STOP = new Set(['the', 'and', 'for', 'with', 'www', 'com', 'cn', 'net', 'org', 'html', 'http', 'https', 'index', '官网', '首页', '网站', '官方']);

/** 提取特征及权重 */
export function features(d: DocInput | string): Map<string, number> {
  const f = new Map<string, number>();
  const add = (k: string, w: number) => f.set(k, (f.get(k) || 0) + w);
  const folder = typeof d === 'string' ? '' : d.folderPath.filter(f => !isGenericFolder(f)).slice(-1)[0];
  // 标签文字也参与分词，这样"前端文档""移动开发"这类查询能对上标签
  const text = typeof d === 'string' ? d : [d.title, d.summary, d.description, folder, d.tags.join(' ')].filter(Boolean).join(' ');
  const lower = text.toLowerCase();
  for (const w of lower.match(/[a-z][a-z0-9+#.]{1,30}/g) || []) {
    const word = w.replace(/\.+$/, '');
    if (!STOP.has(word)) add(`w:${word}`, 1);
  }
  for (const seg of lower.match(/[一-龥]+/g) || []) {
    for (let i = 0; i < seg.length; i++) {
      add(`u:${seg[i]}`, 0.3);
      if (i + 1 < seg.length) {
        const bi = seg.slice(i, i + 2);
        if (!STOP.has(bi)) add(`b:${bi}`, 1);
      }
    }
  }
  if (typeof d !== 'string') {
    for (const t of d.tags) add(`t:${t.toLowerCase()}`, 2);
    if (d.domain) {
      add(`d:${d.domain}`, 1.5);
      const base = d.domain.split('.').slice(-2)[0];
      if (base && !STOP.has(base)) add(`w:${base}`, 1);
    }
  } else {
    // 查询里的词也可能正好是标签
    for (const w of lower.split(/\s+/).filter(Boolean)) add(`t:${w.replace(/^#/, '')}`, 1);
  }
  return f;
}

export interface LocalModel {
  idf: Map<string, number>;
  vectors: Map<string, Float32Array>;
}

function hashVector(feats: Map<string, number>, idf: Map<string, number>, defaultIdf: number): Float32Array {
  const v = new Float32Array(LOCAL_DIMS);
  for (const [k, tf] of feats) {
    const w = (tf <= 1 ? tf : 1 + Math.log(tf)) * (idf.get(k) ?? defaultIdf); // 次线性词频
    const h = fnv1a(k);
    v[h % LOCAL_DIMS] += h & 0x80000000 ? -w : w; // 带符号哈希，减少碰撞偏差
  }
  return normalize(v);
}

export function buildLocalModel(docs: DocInput[]): LocalModel {
  const df = new Map<string, number>();
  const feats = docs.map(d => {
    const f = features(d);
    for (const k of f.keys()) df.set(k, (df.get(k) || 0) + 1);
    return f;
  });
  const N = docs.length || 1;
  const idf = new Map<string, number>();
  for (const [k, c] of df) idf.set(k, Math.log(1 + N / c));
  const vectors = new Map<string, Float32Array>();
  const maxIdf = Math.log(1 + N);
  docs.forEach((d, i) => vectors.set(d.key, hashVector(feats[i], idf, maxIdf)));
  return { idf, vectors };
}

/** 把搜索词变成同一空间的向量 */
export function embedQueryLocal(model: LocalModel, query: string): Float32Array {
  // 只保留书签里出现过的特征：没出现过的词匹配不到任何网页，留着只会制造哈希碰撞噪音
  const f = new Map([...features(query)].filter(([k]) => model.idf.has(k)));
  return hashVector(f, model.idf, 0);
}
