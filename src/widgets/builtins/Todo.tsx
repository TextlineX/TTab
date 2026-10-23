import React, { useState } from 'react';
import { ListTodo, Plus, X } from 'lucide-react';
import type { BuiltinWidget, WidgetProps } from '../types';
import { useWidgetData } from '../store';

interface Item { id: string; text: string; done: boolean }

const TodoWidget: React.FC<WidgetProps> = ({ instance }) => {
  const [items, setItems] = useWidgetData<Item[]>(instance.id, []);
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    setItems(prev => [...prev, { id: Date.now().toString(36), text: t, done: false }]);
    setText('');
  };
  const left = items.filter(i => !i.done).length;
  return (
    <div className="h-full flex flex-col p-3 gap-2">
      <div className="flex items-center justify-between text-[12px] text-[color:var(--muted)]">
        <span>待办{items.length ? `，还剩 ${left} 项` : ''}</span>
        {items.some(i => i.done) && <button onClick={() => setItems(prev => prev.filter(i => !i.done))} className="hover:text-[color:var(--text)]">清除已完成</button>}
      </div>
      <ul className="flex-1 overflow-y-auto flex flex-col gap-0.5 -mx-1">
        {items.map(i => (
          <li key={i.id} className="group flex items-center gap-2 px-1 py-0.5 rounded-md hover:bg-white/5">
            <input type="checkbox" checked={i.done} onChange={() => setItems(prev => prev.map(x => (x.id === i.id ? { ...x, done: !x.done } : x)))} className="accent-sky-300 shrink-0" aria-label={i.text} />
            <span className={`flex-1 min-w-0 truncate text-[13px] ${i.done ? 'line-through text-[color:var(--muted)]' : 'text-[color:var(--text)]'}`}>{i.text}</span>
            <button onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))} aria-label="删除" className="opacity-0 group-hover:opacity-100 text-[color:var(--muted)] hover:text-[color:var(--text)]"><X size={12} /></button>
          </li>
        ))}
        {!items.length && <li className="text-[12px] text-[color:var(--muted)] px-1">还没有待办事项</li>}
      </ul>
      <form onSubmit={e => { e.preventDefault(); add(); }} className="flex items-center gap-1.5">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="添加待办，回车保存" className="flex-1 min-w-0 h-8 px-2.5 rounded-[8px] bg-white/8 border border-white/10 outline-none text-[12px] text-[color:var(--text)] placeholder:text-[color:var(--muted)]" />
        <button type="submit" aria-label="添加" className="h-8 w-8 rounded-[8px] bg-white/10 hover:bg-white/15 flex items-center justify-center text-[color:var(--text)]"><Plus size={14} /></button>
      </form>
    </div>
  );
};

export const todoWidget: BuiltinWidget = {
  type: 'todo', name: '待办', description: '简单的待办清单，保存在本机，多个标签页同步。',
  icon: ListTodo, sizes: ['s', 'm', 'l'], defaultSize: 's', defaultConfig: {}, Component: TodoWidget,
};
