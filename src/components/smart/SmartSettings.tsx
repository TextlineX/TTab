import React, { useEffect, useState } from 'react';
import { hasHistoryPermission, requestHistoryPermission, revokeHistoryPermission } from '../../core/usage';
import { hasPageAccess, requestPageAccess, revokePageAccess } from '../../core/pageInfo';
import { storage } from '../../utils/storage';
import { Group, Row } from '../settings/parts';
import Switch from '../../ui/Switch';

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex items-center h-6 min-w-6 px-1.5 rounded-md border border-line-strong bg-fill-2 text-[12px] text-fg font-sans">{children}</kbd>
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
    <div className="flex flex-col gap-7">
      <Group title="推荐" desc="这些开关需要浏览器额外授权，随时可以关闭；数据只在本机计算">
        <Row label="参考浏览历史" desc="统计最近 90 天访问书签的次数和时段，用于「常用」和「此刻常用」">
          <Switch label="参考浏览历史" checked={history} onChange={toggleHistory} disabled={!supported || busy} />
        </Row>
        <Row label="AI 打标签时读取网页简介" desc="先读取网页的标题和简介，标签会更准确。请求不带登录信息，结果只缓存在本机">
          <Switch label="读取网页简介" checked={pages} onChange={togglePages} disabled={!supported || busy} />
        </Row>
      </Group>

      <Group title="自动整理">
        <Row label="新收藏自动归类" desc="新书签落在收藏夹栏或其他收藏夹根目录、并且明显属于某个已有文件夹时，自动放进去。只放进已有文件夹，可在「整理书签 → 整理记录」里撤销">
          <Switch label="新收藏自动归类" checked={autoFile} onChange={v => { setAutoFile(v); void storage.updateSettings({ autoFile: v }); }} />
        </Row>
      </Group>

      <Group title="在浏览器其他地方使用">
        <Row label="地址栏搜索" desc="在地址栏输入 t 再按空格，就能直接搜书签，支持 #标签 和拼音">
          <span className="flex items-center gap-1"><Kbd>t</Kbd><Kbd>空格</Kbd></span>
        </Row>
        <Row label="右键收藏" desc="在网页或链接上右键选「收藏到 TTab」，会自动打标签" />
      </Group>
    </div>
  );
};

export default SmartSettings;
