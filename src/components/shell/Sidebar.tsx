import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, Library, Clock3, Star, CalendarPlus, Tag, CopyX, Inbox, ChevronRight, Folder, Layers, Sparkles,
  Hash, FolderInput, LayoutGrid, Settings, PanelLeftClose, PanelLeftOpen, Pin,
} from 'lucide-react';
import type { FolderNode } from '../../core/nav';
import type { Collection } from '../../core/types';
import type { SmartView, TagStat, Combo } from '../../core/tagGraph';
import type { Cluster } from '../../core/vectors/semantic';
import { isGenericFolder } from '../../core/ruleTagger';
import { slotLabel, slotOf } from '../../core/usage';
import { spring } from '../../ui/motion';
import { tagChipStyle } from '../smart/tagColor';

export interface SidebarData {
  total: number;
  looseCount: number;
  views: SmartView[];
  collections: { col: Collection; count: number }[];
  groups: { cluster: Cluster; count: number }[];
  combos: { combo: Combo; count: number }[];
  folders: FolderNode[];
  tags: TagStat[];
}

interface Props {
  data: SidebarData;
  active: string;
  collapsed: boolean;
  onSelect: (key: string) => void;
  onToggleCollapsed: () => void;
  onOrganize: () => void;
  onTagManager: () => void;
  onSettings: () => void;
  onClassic: () => void;
}

const VIEW_ICON: Record<SmartView['id'], React.ElementType> = { now: Clock3, frequent: Star, recent: CalendarPlus, untagged: Tag, duplicates: CopyX };

/** 记住每个分组的展开状态 */
function useSectionOpen(id: string, initial = true): [boolean, () => void] {
  const k = `ttab_side_${id}`;
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(k); return v === null ? initial : v === '1'; } catch { return initial; } });
  return [open, () => setOpen(o => { try { localStorage.setItem(k, o ? '0' : '1'); } catch { /* ignore */ } return !o; })];
}

const Row: React.FC<{
  k: string; active: string; collapsed: boolean; onSelect: (k: string) => void;
  icon: React.ReactNode; label: string; count?: number; depth?: number; tone?: 'warn'; trailing?: React.ReactNode;
}> = ({ k, active, collapsed, onSelect, icon, label, count, depth = 0, tone, trailing }) => {
  const on = active === k;
  return (
    <button
      onClick={() => onSelect(k)}
      title={collapsed ? `${label}${count !== undefined ? `（${count}）` : ''}` : undefined}
      aria-current={on ? 'page' : undefined}
      className={`relative w-full flex items-center gap-2.5 h-9 rounded-xl text-left text-[13.5px] transition-colors ${collapsed ? 'justify-center px-0' : 'px-2.5'} ${on ? 'text-fg' : 'text-muted hover:text-fg hover:bg-fill-1'}`}
      style={!collapsed && depth ? { paddingLeft: 10 + depth * 16 } : undefined}
    >
      {on && <motion.span layoutId="side-active" transition={spring.snappy} className="absolute inset-0 rounded-xl bg-accent-soft border border-[color:var(--accent-line)]" />}
      <span className={`relative shrink-0 w-[18px] flex justify-center ${on ? 'text-accent-text' : tone === 'warn' ? 'text-warn' : ''}`}>{icon}</span>
      {!collapsed && <span className="relative flex-1 min-w-0 truncate">{label}</span>}
      {!collapsed && trailing}
      {!collapsed && count !== undefined && <span className={`relative text-[11.5px] tabular-nums ${tone === 'warn' && !on ? 'text-warn' : 'text-faint'}`}>{count}</span>}
    </button>
  );
};

const Section: React.FC<{ id: string; title: string; collapsed: boolean; count?: number; children: React.ReactNode; initial?: boolean; action?: React.ReactNode }> = ({ id, title, collapsed, count, children, initial, action }) => {
  const [open, toggle] = useSectionOpen(id, initial);
  if (collapsed) return <div className="flex flex-col gap-0.5 pt-2 mt-2 border-t border-line">{children}</div>;
  return (
    <div className="pt-4">
      <div className="group flex items-center px-2.5 mb-1">
        <button onClick={toggle} aria-expanded={open} className="flex-1 flex items-center gap-1 text-[12px] text-faint hover:text-muted">
          <ChevronRight size={13} className={`transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
          {title}{count !== undefined && <span className="ml-1 tabular-nums">{count}</span>}
        </button>
        {action}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden flex flex-col gap-0.5">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FolderRows: React.FC<{ nodes: FolderNode[]; depth: number; active: string; collapsed: boolean; onSelect: (k: string) => void }> = ({ nodes, depth, active, collapsed, onSelect }) => {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  return (
    <>
      {nodes.filter(n => n.total > 0).map(n => {
        const hasKids = n.children.some(c => c.total > 0);
        const isOpen = open.has(n.folder.id) || isGenericFolder(n.folder.title);
        return (
          <React.Fragment key={n.folder.id}>
            <Row
              k={`folder:${n.folder.id}`} active={active} collapsed={collapsed} onSelect={onSelect} depth={depth}
              icon={<Folder size={16} />} label={n.folder.title} count={n.total}
              trailing={hasKids ? (
                <span
                  role="button" tabIndex={-1} aria-label={isOpen ? '收起' : '展开'}
                  onClick={e => { e.stopPropagation(); setOpen(s => { const x = new Set(s); if (x.has(n.folder.id)) x.delete(n.folder.id); else x.add(n.folder.id); return x; }); }}
                  className="relative p-0.5 rounded-md text-faint hover:text-fg hover:bg-fill-2"
                >
                  <ChevronRight size={13} className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                </span>
              ) : undefined}
            />
            {hasKids && isOpen && !collapsed && <FolderRows nodes={n.children} depth={depth + 1} active={active} collapsed={collapsed} onSelect={onSelect} />}
          </React.Fragment>
        );
      })}
    </>
  );
};

/** 侧边栏：所有分类完整列出，带数量；可收起成图标栏 */
const Sidebar: React.FC<Props> = ({ data, active, collapsed, onSelect, onToggleCollapsed, onOrganize, onTagManager, onSettings, onClassic }) => {
  const nowLabel = `${slotLabel(slotOf(new Date()))}常用`;
  const viewName = (id: SmartView['id']) => (id === 'now' ? nowLabel : { frequent: '常用', recent: '最近添加', untagged: '未打标签', duplicates: '重复书签' }[id]);
  const rowProps = { active, collapsed, onSelect };

  return (
    <nav aria-label="分类导航" className={`tt-glass h-full flex flex-col rounded-[22px] overflow-hidden transition-[width] duration-300 ease-[var(--ease-out-soft)] ${collapsed ? 'tt-sidebar-collapsed' : 'tt-sidebar'}`}>
      <div className={`flex items-center gap-2 h-14 shrink-0 ${collapsed ? 'justify-center' : 'px-4'}`}>
        {!collapsed && <span className="tt-display flex-1 text-[20px] text-fg">TTab</span>}
        <button onClick={onToggleCollapsed} aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} title={collapsed ? '展开侧边栏 ( [ )' : '收起侧边栏 ( [ )'} className="p-2 rounded-xl text-muted hover:text-fg hover:bg-fill-2">
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        <div className="flex flex-col gap-0.5">
          <Row k="overview" {...rowProps} icon={<LayoutDashboard size={16} />} label="分类总览" />
          <Row k="all" {...rowProps} icon={<Library size={16} />} label="全部网页" count={data.total} />
          {data.views.filter(v => v.keys.length).map(v => {
            const Icon = VIEW_ICON[v.id];
            return <Row key={v.id} k={`view:${v.id}`} {...rowProps} icon={<Icon size={16} />} label={viewName(v.id)} count={v.keys.length} tone={v.id === 'duplicates' ? 'warn' : undefined} />;
          })}
          {data.looseCount > 0 && <Row k="loose" {...rowProps} icon={<Inbox size={16} />} label="散落的书签" count={data.looseCount} tone="warn" />}
        </div>

        {data.collections.length > 0 && (
          <Section id="cols" title="我的组合" collapsed={collapsed} count={data.collections.length}>
            {data.collections.map(({ col, count }) => (
              <Row key={col.id} k={`col:${col.id}`} {...rowProps} count={count}
                icon={col.emoji ? <span className="text-[15px] leading-none">{col.emoji}</span> : <Layers size={16} />}
                label={col.name} trailing={col.pinned ? <Pin size={11} className="relative text-faint" /> : undefined} />
            ))}
          </Section>
        )}

        {data.groups.length > 0 && (
          <Section id="groups" title="自动分组" collapsed={collapsed} count={data.groups.length}>
            {data.groups.map(({ cluster, count }) => <Row key={cluster.id} k={`grp:${cluster.id}`} {...rowProps} icon={<Layers size={16} />} label={cluster.label} count={count} />)}
          </Section>
        )}

        {data.combos.length > 0 && (
          <Section id="combos" title="推荐组合" collapsed={collapsed} count={data.combos.length} initial={false}>
            {data.combos.map(({ combo, count }) => <Row key={combo.id} k={`combo:${combo.id}`} {...rowProps} icon={<Sparkles size={15} />} label={combo.tags.join(' + ')} count={count} />)}
          </Section>
        )}

        {data.folders.length > 0 && (
          <Section id="folders" title="文件夹" collapsed={collapsed}>
            <FolderRows nodes={data.folders} depth={0} {...rowProps} />
          </Section>
        )}

        {data.tags.length > 0 && !collapsed && (
          <Section id="tags" title="标签" collapsed={collapsed} count={data.tags.length}
            action={<button onClick={onTagManager} className="text-[11.5px] text-faint hover:text-fg">管理</button>}>
            <div className="flex flex-wrap gap-1.5 px-2 pt-1">
              {data.tags.slice(0, 40).map(t => (
                <button
                  key={t.tag}
                  onClick={() => onSelect(`tag:${t.tag}`)}
                  style={tagChipStyle(t.tag, active === `tag:${t.tag}` ? 'solid' : 'soft')}
                  className="h-6 px-2 rounded-lg border text-[12px] hover:brightness-110 transition-[filter]"
                >{t.tag}<span className="ml-1 opacity-60 tabular-nums">{t.count}</span></button>
              ))}
            </div>
          </Section>
        )}
        {collapsed && data.tags.length > 0 && (
          <div className="pt-2 mt-2 border-t border-line"><Row k="tags" active="" collapsed onSelect={onTagManager} icon={<Hash size={16} />} label="标签" /></div>
        )}
      </div>

      <div className={`shrink-0 border-t border-line py-2 flex ${collapsed ? 'flex-col items-center gap-1 px-2' : 'items-center gap-1 px-3'}`}>
        <button onClick={onOrganize} title="整理书签" className={`flex items-center gap-2 h-9 rounded-xl text-[13px] text-muted hover:text-fg hover:bg-fill-2 ${collapsed ? 'w-10 justify-center' : 'flex-1 px-2.5'}`}>
          <FolderInput size={16} />{!collapsed && '整理书签'}
        </button>
        <button onClick={onClassic} title="经典磁贴视图" aria-label="经典磁贴视图" className="p-2 rounded-xl text-muted hover:text-fg hover:bg-fill-2"><LayoutGrid size={16} /></button>
        <button onClick={onSettings} title="设置" aria-label="设置" className="p-2 rounded-xl text-muted hover:text-fg hover:bg-fill-2"><Settings size={16} /></button>
      </div>
    </nav>
  );
};

export default Sidebar;
