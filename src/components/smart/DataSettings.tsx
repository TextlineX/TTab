import React, { useState } from 'react';
import { Database, Download, Upload } from 'lucide-react';
import { exportPayload, loadMeta, parseImport, saveMeta } from '../../core/metaStore';
import { loadAllBookmarks, bookmarkOps, hasBookmarkApi } from '../../core/bookmarkSource';
import { mergeMeta } from '../../core/library';

/**
 * 导出 / 导入标签和组合。
 * 用途：在 Edge 和 Chrome 之间同步、备份。数据以网址为键，所以跨浏览器也能对上。
 */
const DataSettings: React.FC = () => {
  const [msg, setMsg] = useState('');

  const doExport = async () => {
    const [meta, { records }] = await Promise.all([loadMeta(), loadAllBookmarks()]);
    const text = exportPayload(meta, records.map(r => ({ url: r.url, title: r.title, folderPath: r.folderPath })));
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ttab-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMsg(`已导出 ${Object.keys(meta.pages).length} 个网页的标签和 ${meta.collections.length} 个组合`);
  };

  const doImport = async (file: File) => {
    try {
      const { meta: incoming, bookmarks } = parseImport(await file.text());
      const current = await loadMeta();
      await saveMeta(mergeMeta(current, incoming));
      let created = 0;
      if (hasBookmarkApi() && bookmarks.length) {
        const { records } = await loadAllBookmarks();
        const have = new Set(records.map(r => r.url));
        const missing = bookmarks.filter(b => b.url && !have.has(b.url));
        if (missing.length && confirm(`导入文件里有 ${missing.length} 个书签在这个浏览器中不存在，要把它们添加到"其他收藏夹/TTab 导入"文件夹吗？`)) {
          const folderId = await bookmarkOps.createFolder('TTab 导入');
          for (const b of missing) { await bookmarkOps.create(b.title, b.url, folderId); created++; }
        }
      }
      window.dispatchEvent(new Event('ttab_meta_imported'));
      setMsg(`导入完成：合并了 ${Object.keys(incoming.pages).length} 个网页的标签、${incoming.collections.length} 个组合${created ? `，新建 ${created} 个书签` : ''}`);
    } catch (e) {
      setMsg(`导入失败：${(e as Error).message}`);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-emerald-300/80 text-[12px] font-bold">
        <Database size={14} /> <span>标签数据</span>
      </div>
      <p className="text-[11px] text-white/40 leading-relaxed">在 Edge 和 Chrome 之间迁移或备份：在一边导出，另一边导入，标签和组合会合并，不会覆盖已有内容。</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={doExport} className="h-9 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-white flex items-center justify-center gap-1.5"><Download size={13} /> 导出</button>
        <label className="h-9 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-white flex items-center justify-center gap-1.5 cursor-pointer">
          <Upload size={13} /> 导入
          <input type="file" accept="application/json,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
        </label>
      </div>
      {msg && <p className="text-[11px] text-white/60 leading-relaxed">{msg}</p>}
    </section>
  );
};

export default DataSettings;
