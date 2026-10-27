import { buildItems, applyRuleTags } from '../src/core/library';
import { emptyMeta } from '../src/core/types';
import { normalizeUrl, getDomain } from '../src/core/normalize';
import { parseQuery, searchItems } from '../src/core/search';
import { topTags, relatedItems, suggestCombos, smartViews, relatedTags } from '../src/core/tagGraph';
import { buildLocalModel, toDoc } from '../src/core/vectors/localEmbed';
import { stampChanges } from '../src/core/cloud/sync';
import { addTags } from '../src/core/library';

const N = Number(process.argv[2] || 5000);
const words = ['react','vue','设计','工具','学习','视频','新闻','购物','github','文档','教程','音乐','AI','大模型','python','go','rust','论坛','博客','地图'];
const recs = Array.from({ length: N }, (_, i) => {
  const url = `https://site${i % 400}.example.com/${words[i % 20]}/${i}`;
  return { id: String(i), url, title: `${words[i % 20]} ${words[(i * 7) % 20]} 页面 ${i}`, folderPath: [`文件夹${i % 30}`], key: normalizeUrl(url), domain: getDomain(url), dateAdded: Date.now() - i * 1000 };
});
const t = <T,>(name: string, fn: () => T): T => { const s = performance.now(); const r = fn(); console.log(name.padEnd(34), (performance.now() - s).toFixed(1).padStart(8), 'ms'); return r; };

let meta = t('applyRuleTags(全部)', () => applyRuleTags(emptyMeta(), recs as any));
const items = t('buildItems', () => buildItems(recs as any, meta));
t('JSON.stringify(meta)', () => JSON.stringify(meta).length);
t('搜索 "react 设计"', () => searchItems(items, parseQuery('react 设计')));
t('搜索 拼音 "sj"', () => searchItems(items, parseQuery('sj')));
t('topTags', () => topTags(items, 40));
t('relatedTags', () => relatedTags(['react'], items));
t('relatedItems(单个)', () => relatedItems(items[10], items));
t('suggestCombos', () => suggestCombos(items));
t('smartViews', () => smartViews(items));
t('本地向量模型(全部)', () => buildLocalModel(items.map(i => toDoc(i))));
t('单次 addTags 后 stampChanges', () => { const n = addTags(meta, [items[5].key], ['x'], 'manual'); return stampChanges(meta, n); });
t('批量 addTags 1000 页', () => addTags(meta, items.slice(0, 1000).map(i => i.key), ['批量'], 'manual'));

import { VectorIndex } from '../src/core/vectors/semantic';
import { planOrganize } from '../src/core/organize/organizer';
const model = buildLocalModel(items.map(i => toDoc(i)));
const idx = new VectorIndex('local', model.vectors);
t('向量 similarTo(单个)', () => idx.similarTo(items[10].key));
t('向量 clusters(全部)', () => idx.clusters(items));
const folders = Array.from({ length: 30 }, (_, i) => ({ id: `f${i}`, title: `文件夹${i}`, path: [`文件夹${i}`], parentId: '1', index: i }));
const itemsLoose = items.map((it, i) => ({ ...it, folderPath: i % 3 ? it.folderPath : ['其他书签'] }));
t('planOrganize', () => planOrganize(itemsLoose as any, folders as any, idx));
