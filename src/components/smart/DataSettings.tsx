import React, { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { exportPayload, loadMeta, parseImport, saveMeta } from '../../core/metaStore';
import { loadAllBookmarks, bookmarkOps, hasBookmarkApi } from '../../core/bookmarkSource';
import { mergeMeta } from '../../core/library';
import { Group, Row } from '../settings/parts';
import Button from '../../ui/Button';

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
    <div className="flex flex-col gap-7">
      <Group title="备份与迁移" desc="在 Edge 和 Chrome 之间迁移或备份：在一边导出，另一边导入。标签和组合会合并，不会覆盖已有内容">
        <Row label="导出标签和组合" desc="保存为一个 JSON 文件，包含书签网址，方便在另一个浏览器补齐">
          <Button size="sm" onClick={() => void doExport()} icon={<Download size={14} />}>导出</Button>
        </Row>
        <Row label="导入" desc="选择之前导出的 JSON 文件">
          <label className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-xl bg-fill-2 hover:bg-fill-3 text-[12.5px] font-medium text-fg cursor-pointer transition-colors">
            <Upload size={14} /> 选择文件
            <input type="file" accept="application/json,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
          </label>
        </Row>
        {msg && <p className="px-4 py-3 text-[12.5px] text-accent-text leading-relaxed">{msg}</p>}
      </Group>
    </div>
  );
};

export default DataSettings;
