import React, { useState } from 'react';
import { Cloud, LogOut, RefreshCw, Share2, Trash2, GitCompareArrows, Undo2 } from 'lucide-react';
import type { CloudApi } from '../../state/useCloud';
import { normalizeServer, signedIn } from '../../core/cloud/config';
import { cloudRequest } from '../../core/cloud/api';
import { requestHostPermission } from '../../core/ai/client';
import type { Proposal } from '../../core/cloud/community';
import { Group, Row, inputCls } from './parts';
import Switch from '../../ui/Switch';
import Button from '../../ui/Button';

const when = (t: number) => (t ? new Date(t).toLocaleString() : '还没有同步过');

/** 云端与同步：账号、跨浏览器同步、社区标签比对 */
const CloudSettings: React.FC<{ cloud?: CloudApi }> = ({ cloud }) => {
  const [server, setServer] = useState(cloud?.cfg.server || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  if (!cloud) {
    return <Group desc="云端与同步需要在智能视图里设置。点左上角「回到智能视图」后再打开设置。"><Row label="当前在经典视图" /></Group>;
  }
  const { cfg, busy, error } = cloud;
  const loggedIn = signedIn(cfg);
  const supportsSync = typeof chrome !== 'undefined' && !!chrome.storage?.sync;

  const connect = () => {
    const url = normalizeServer(server);
    if (!url) { setNote('服务器地址不对：需要 https:// 开头（本机测试可用 http://localhost）'); return; }
    const perm = requestHostPermission(url); // 必须在点击里同步发起
    void perm.then(async ok => {
      if (!ok) { setNote('没有授权访问这个服务器，无法连接'); return; }
      try {
        const h = await cloudRequest<{ ok: boolean; version: string; registration: boolean }>({ server: url, token: '' }, 'GET', '/api/health');
        await cloud.setServer(url);
        setServer(url);
        setNote(`已连接：TTab 云端服务 v${h.version}${h.registration ? '' : '（不开放注册，请用已有账号登录）'}`);
      } catch (e) { setNote((e as Error).message); }
    });
  };

  const run = async (fn: () => Promise<string>) => { setNote(await fn()); };

  const doCompare = async () => {
    setNote('');
    const ps = await cloud.compare();
    setProposals(ps);
    if (!ps.length) setNote('社区里暂时没有更好的建议——也许是票数还不够，或者你的标签已经和大家一致');
  };

  return (
    <div className="flex flex-col gap-7">
      <Group title="服务器" desc="TTab 云端服务由你自己部署（见项目里的 server 目录），也可以使用朋友或团队提供的服务器。没有账号和服务器时，TTab 完全在本机运行。">
        <Row label="服务器地址" stack>
          <div className="flex gap-2">
            <input className={inputCls} value={server} onChange={e => setServer(e.target.value)} placeholder="https://ttab.example.com" spellCheck={false} />
            <Button variant="secondary" onClick={connect} disabled={!server.trim() || !!busy}>连接</Button>
          </div>
        </Row>
      </Group>

      {cfg.server && !loggedIn && (
        <Group title="账号" desc="邮箱和密码只发给你填写的服务器。密码在服务器上经过加盐哈希保存。">
          <Row label="邮箱" stack><input className={inputCls} type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></Row>
          <Row label="密码（至少 8 位）" stack><input className={inputCls} type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></Row>
          <div className="px-4 py-3.5 flex gap-2">
            <Button variant="primary" disabled={!email || !password || !!busy} onClick={() => void cloud.auth('login', email, password).then(ok => { if (ok) { setPassword(''); setNote('已登录'); } })}>登录</Button>
            <Button variant="secondary" disabled={!email || !password || !!busy} onClick={() => void cloud.auth('register', email, password).then(ok => { if (ok) { setPassword(''); setNote('注册成功，已登录'); } })}>注册新账号</Button>
          </div>
        </Group>
      )}

      {loggedIn && (
        <>
          <Group title="账号">
            <Row label={cfg.email} desc={cfg.server}>
              <Button size="sm" variant="ghost" icon={<LogOut size={14} />} onClick={() => void cloud.logout()}>退出登录</Button>
            </Row>
          </Group>

          <Group title="同步" desc="按网页和组合分别比较修改时间，谁最后改的算谁的。在每个浏览器里登录同一个账号即可。删除操作也会同步。">
            <Row label="跨浏览器同步标签和组合" desc="打开新标签页时、修改后几秒内、以及每 5 分钟自动同步">
              <Switch label="同步标签和组合" checked={cfg.sync} onChange={v => { void cloud.patch({ sync: v }); if (v) void run(cloud.syncNow); }} />
            </Row>
            <Row label="立即同步" desc={`上次同步：${when(cfg.lastSyncAt)}`}>
              <Button size="sm" icon={<RefreshCw size={14} className={busy ? 'animate-spin' : ''} />} disabled={!!busy} onClick={() => void run(cloud.syncNow)}>同步</Button>
            </Row>
          </Group>

          <Group title="社区标签" desc="大家给同一个网页打的标签会汇总成「共识」。没有 AI 也能用共识补齐标签、纠正明显不一致的自动标签。你的网址不会上传：只发送网址的 SHA-256 哈希，和你手动打的标签。">
            <Row label="匿名贡献我的手动标签" desc="只贡献你亲手打的标签，每人对同一网页同一标签只算一票。随时可以收回">
              <Switch label="匿名贡献" checked={cfg.contribute} onChange={v => void cloud.patch({ contribute: v })} />
            </Row>
            <Row label="新书签自动与社区比对" desc="还没有标签的书签会自动补上社区共识，标记为「云端」来源，可撤销。默认关闭">
              <Switch label="自动比对" checked={cfg.autoCompare} onChange={v => void cloud.patch({ autoCompare: v })} />
            </Row>
            <Row label="立即比对全部书签" desc="先给你看建议，确认后才会修改；手动打的标签不会被改动">
              <Button size="sm" icon={<GitCompareArrows size={14} />} disabled={!!busy} onClick={() => void doCompare()}>比对</Button>
            </Row>
            <Row label="立即贡献一次">
              <Button size="sm" icon={<Share2 size={14} />} disabled={!!busy} onClick={() => void run(cloud.shareNow)}>贡献</Button>
            </Row>
            <Row label="收回我的全部贡献" desc="从社区里删掉我投过的票">
              <Button size="sm" variant="ghost" icon={<Undo2 size={14} />} disabled={!!busy} onClick={() => void run(cloud.withdraw)}>收回</Button>
            </Row>
          </Group>

          {proposals && proposals.length > 0 && (
            <Group title={`比对建议（${proposals.length} 个网页）`}>
              <div className="max-h-64 overflow-y-auto divide-y divide-[color:var(--line)]">
                {proposals.slice(0, 200).map(p => (
                  <div key={p.key} className="px-4 py-2.5 text-[12.5px]">
                    <div className="truncate text-muted">{p.key.replace(/^https?:\/\//, '')}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {p.add.map(t => <span key={t} className="px-2 h-6 inline-flex items-center rounded-full bg-accent-soft text-accent-text">+ {t}</span>)}
                      {p.remove.map(t => <span key={t} className="px-2 h-6 inline-flex items-center rounded-full bg-fill-2 text-muted line-through">{t}</span>)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3.5 flex gap-2">
                <Button variant="primary" onClick={() => { cloud.applyCompare(proposals); setNote(`已应用 ${proposals.length} 个网页的建议，可在首页用 Ctrl+Z 撤销`); setProposals(null); }}>全部应用</Button>
                <Button variant="ghost" onClick={() => setProposals(null)}>放弃</Button>
              </div>
            </Group>
          )}

          <Group title="危险操作">
            <Row label="删除云端账号" desc="删除服务器上的账号、同步数据和我投过的票。本机数据不受影响">
              {!confirmDel
                ? <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={() => setConfirmDel(true)}>删除…</Button>
                : <span className="flex items-center gap-2">
                    <input className={`${inputCls} !h-8 !w-36`} type="password" placeholder="输入密码确认" value={password} onChange={e => setPassword(e.target.value)} />
                    <Button size="sm" variant="danger" disabled={!password || !!busy} onClick={() => void cloud.deleteAccount(password).then(ok => { if (ok) { setConfirmDel(false); setPassword(''); setNote('账号已删除'); } })}>确认删除</Button>
                  </span>}
            </Row>
          </Group>
        </>
      )}

      <Group title="浏览器自带同步" desc="用 Edge / Chrome 账号的同步功能，在你登录同一个浏览器账号的设备之间同步外观、首页视图这类轻量设置。不包含 AI 密钥、令牌和书签标签。">
        <Row label="同步外观和首页设置" desc={supportsSync ? undefined : '当前环境不支持'}>
          <Switch label="浏览器同步设置" checked={cfg.mirror} disabled={!supportsSync} onChange={v => void cloud.patch({ mirror: v })} />
        </Row>
      </Group>

      {(busy || error || note) && (
        <p className={`px-1 text-[12.5px] leading-relaxed flex items-center gap-1.5 ${error && !busy ? 'text-warn' : 'text-accent-text'}`}>
          <Cloud size={14} /> {busy || error || note}
        </p>
      )}
    </div>
  );
};

export default CloudSettings;
