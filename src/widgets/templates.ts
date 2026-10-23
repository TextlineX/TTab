/** 小组件工作室的示例模板，同时也是开发参考 */
import type { CustomWidgetDef } from './types';

export const TEMPLATES: { id: string; label: string; def: CustomWidgetDef }[] = [
  {
    id: 'blank',
    label: '空白',
    def: {
      id: 'my.widget', name: '我的小组件', version: '1.0.0', sizes: ['s', 'm'], defaultSize: 's', permissions: [],
      html: '<div class="box">你好，TTab</div>',
      css: '.box { height: 100%; display: flex; align-items: center; justify-content: center; font-size: 16px; }',
      js: '// ttab 对象提供配置、存储、书签、打开网页、联网等能力，详见文档\n',
    },
  },
  {
    id: 'pomodoro',
    label: '番茄钟',
    def: {
      id: 'example.pomodoro', name: '番茄钟', version: '1.0.0', author: 'TTab', description: '专注 25 分钟，休息 5 分钟。',
      sizes: ['s', 'm'], defaultSize: 's', permissions: ['storage'],
      config: [{ key: 'minutes', label: '专注时长（分钟）', type: 'number', default: 25 }],
      html: '<div class="wrap"><div id="time">25:00</div><div class="row"><button id="go">开始</button><button id="reset">重置</button></div><div id="done"></div></div>',
      css: `.wrap { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
#time { font-size: 34px; font-variant-numeric: tabular-nums; }
.row { display: flex; gap: 6px; }
button { background: var(--fill-2); color: var(--text); border: 0; border-radius: 8px; padding: 4px 12px; cursor: pointer; }
button:hover { background: var(--accent-soft); }
#done { font-size: 11px; color: var(--muted); }`,
      js: `const $ = id => document.getElementById(id);
let left = (ttab.config.minutes || 25) * 60, timer = null;
const show = () => { $('time').textContent = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0'); };
const today = new Date().toDateString();
const refreshDone = async () => {
  const log = (await ttab.storage.get('log')) || {};
  $('done').textContent = '今天完成 ' + (log[today] || 0) + ' 个';
};
$('go').onclick = () => {
  if (timer) { clearInterval(timer); timer = null; $('go').textContent = '继续'; return; }
  $('go').textContent = '暂停';
  timer = setInterval(async () => {
    left--; show();
    if (left <= 0) {
      clearInterval(timer); timer = null; $('go').textContent = '开始';
      left = (ttab.config.minutes || 25) * 60; show();
      const log = (await ttab.storage.get('log')) || {};
      log[today] = (log[today] || 0) + 1;
      await ttab.storage.set('log', log);
      ttab.notify('完成一个番茄，休息一下吧');
      refreshDone();
    }
  }, 1000);
};
$('reset').onclick = () => { clearInterval(timer); timer = null; left = (ttab.config.minutes || 25) * 60; $('go').textContent = '开始'; show(); };
ttab.onConfigChange(() => { if (!timer) { left = (ttab.config.minutes || 25) * 60; show(); } });
show(); refreshDone();`,
    },
  },
  {
    id: 'random',
    label: '随机书签',
    def: {
      id: 'example.random-bookmark', name: '今天看看', version: '1.0.0', author: 'TTab', description: '随机推荐一个很久没打开的书签。',
      sizes: ['s', 'm'], defaultSize: 'm', permissions: ['bookmarks', 'open'],
      config: [{ key: 'tag', label: '只从这个标签里挑（可留空）', type: 'text', default: '' }],
      html: '<div class="wrap"><div class="hint">随手翻翻</div><a id="title" href="#"></a><div id="meta"></div><button id="next">换一个</button></div>',
      css: `.wrap { height: 100%; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; justify-content: center; }
.hint, #meta { font-size: 11px; color: var(--muted); }
#title { color: var(--text); font-size: 15px; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#title:hover { text-decoration: underline; }
button { align-self: flex-start; margin-top: 4px; background: var(--line); color: var(--text); border: 0; border-radius: 8px; padding: 2px 10px; cursor: pointer; font-size: 12px; }`,
      js: `let current = null;
async function pick() {
  const list = await ttab.bookmarks.list({ sort: 'random', limit: 1, tag: ttab.config.tag || undefined });
  current = list[0];
  document.getElementById('title').textContent = current ? current.title : '没有找到书签';
  document.getElementById('meta').textContent = current ? [current.domain, ...current.tags.map(t => '#' + t)].join('  ') : '';
}
document.getElementById('title').onclick = e => { e.preventDefault(); if (current) ttab.open(current.url); };
document.getElementById('next').onclick = pick;
ttab.onConfigChange(pick);
pick();`,
    },
  },
  {
    id: 'hitokoto',
    label: '每日一句（联网）',
    def: {
      id: 'example.hitokoto', name: '一言', version: '1.0.0', author: 'TTab', description: '来自 hitokoto.cn 的一句话，演示如何联网。',
      sizes: ['m', 'w'], defaultSize: 'm', permissions: ['net:v1.hitokoto.cn', 'storage'],
      html: '<div class="wrap"><p id="text">……</p><span id="from"></span></div>',
      css: `.wrap { height: 100%; padding: 12px 16px; display: flex; flex-direction: column; justify-content: center; gap: 6px; cursor: pointer; }
#text { margin: 0; font-size: 15px; line-height: 1.6; }
#from { font-size: 11px; color: var(--muted); text-align: right; }`,
      js: `async function load(force) {
  // 每小时最多请求一次，结果缓存在小组件自己的存储里
  const cache = await ttab.storage.get('cache');
  if (!force && cache && Date.now() - cache.at < 3600e3) return render(cache.data);
  try {
    const data = await ttab.fetchJSON('https://v1.hitokoto.cn/?c=d&c=i&c=k');
    await ttab.storage.set('cache', { at: Date.now(), data });
    render(data);
  } catch (e) {
    if (cache) render(cache.data); else document.getElementById('text').textContent = '获取失败：' + e.message;
  }
}
function render(d) {
  document.getElementById('text').textContent = d.hitokoto;
  document.getElementById('from').textContent = '—— ' + (d.from_who ? d.from_who + '《' + d.from + '》' : '《' + d.from + '》');
}
document.querySelector('.wrap').onclick = () => load(true);
load();`,
    },
  },
];
