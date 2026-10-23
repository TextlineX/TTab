import React, { useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import { hasHistoryPermission, requestHistoryPermission, revokeHistoryPermission } from '../../core/usage';
import { hasPageAccess, requestPageAccess, revokePageAccess } from '../../core/pageInfo';
import { storage } from '../../utils/storage';

const Row: React.FC<{ on: boolean; onClick: () => void; title: string; desc: string; disabled: boolean }> = ({ on, onClick, title, desc, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center justify-between gap-3 p-4 rounded-2xl border text-left transition-all disabled:opacity-50 ${on ? 'bg-sky-400/10 border-sky-300/30' : 'bg-white/5 border-white/5'}`}
  >
    <span className="flex flex-col gap-1">
      <span className={`text-xs font-bold ${on ? 'text-sky-200' : 'text-white/70'}`}>{title}</span>
      <span className="text-[11px] text-white/40 leading-relaxed">{desc}</span>
    </span>
    <span className={`shrink-0 w-8 h-4 rounded-full p-0.5 transition-colors ${on ? 'bg-sky-400' : 'bg-white/10'}`}>
      <span className={`block w-3 h-3 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`} />
    </span>
  </button>
);

/** 智能推荐相关的可选权限开关，以及地址栏/右键菜单的使用说明 */
const SmartSettings: React.FC = () => {
  const [history, setHistory] = useState(false);
  const [pages, setPages] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autoFile, setAutoFile] = useState(false);
  const supported = typeof chrome !== 'undefined' && !!chrome.permissions?.request;

  useEffect(() => {
    void hasHistoryPermission().then(setHistory);
    void hasPageAccess().then(setPages);
    void storage.getSettings().then(s => setAutoFile(!!s.autoFile));
  }, []);

  const toggleHistory = () => {
    if (history) {
      setBusy(true);
      void revokeHistoryPermission().then(() => { setHistory(false); setBusy(false); window.dispatchEvent(new Event('ttab_usage_refresh')); });
      return;
    }
    // 必须在点击里同步发起申请
    requestHistoryPermission().then(ok => {
      setHistory(ok);
      if (ok) window.dispatchEvent(new Event('ttab_usage_refresh'));
    });
  };

  const togglePages = () => {
    if (pages) { void revokePageAccess().then(() => setPages(false)); return; }
    requestPageAccess().then(setPages);
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sky-300/80 text-[12px] font-bold">
        <Compass size={14} /> <span>智能推荐</span>
      </div>
      <Row
        on={history} onClick={toggleHistory} disabled={!supported || busy}
        title="参考浏览历史"
        desc="统计最近 90 天访问书签的次数和时段，用于“常用”和“此刻常用”。只在本机计算，不会上传。"
      />
      <Row
        on={pages} onClick={togglePages} disabled={!supported || busy}
        title="AI 打标签时读取网页简介"
        desc="打标签前读取网页的标题和简介，标签会更准确。请求不带登录信息，结果只缓存在本机。"
      />
      <Row
        on={autoFile} disabled={false}
        onClick={() => { const v = !autoFile; setAutoFile(v); void storage.updateSettings({ autoFile: v }); }}
        title="新收藏自动归类"
        desc="新加的书签如果落在收藏夹栏或其他收藏夹根目录，并且很明显属于某个已有文件夹，就自动放进去。只会放进已有文件夹，可在“整理书签 → 整理记录”里撤销。"
      />
      <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-[11px] text-white/50 leading-relaxed flex flex-col gap-1.5">
        <span>地址栏搜索：输入 <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/80">t</kbd> 再按空格，就能直接搜书签，支持 #标签 和拼音。</span>
        <span>右键收藏：在网页或链接上右键选“收藏到 TTab”，会自动打标签。</span>
      </div>
    </section>
  );
};

export default SmartSettings;
