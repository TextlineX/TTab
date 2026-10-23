import React, { useState } from 'react';
import { ListTodo, Plus, X } from 'lucide-react';
import type { BuiltinWidget, WidgetProps } from '../types';
import { useWidgetData } from '../store';
import Checkbox from '../../ui/Checkbox';

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
      <div className="flex items-center justify-between text-[12px] text-muted">
        <span>待办{items.length ? `，还剩 ${left} 项` : ''}</span>
        {items.some(i => i.done) && <button onClick={() => setItems(prev => prev.filter(i => !i.done))} className="hover:text-fg">清除已完成</button>}
      </div>
      <ul className="flex-1 overflow-y-auto flex flex-col gap-0.5 -mx-1">
        {items.map(i => (
          <li key={i.id} className="group flex items-center gap-2 px-1 py-0.5 rounded-md hover:bg-fill-1">
            <Checkbox checked={i.done} onChange={() => setItems(prev => prev.map(x => (x.id === i.id ? { ...x, done: !x.done } : x)))} ariaLabel={i.text} />
            <span className={`flex-1 min-w-0 truncate text-[13px] ${i.done ? 'line-through text-muted' : 'text-fg'}`}>{i.text}</span>
            <button onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))} aria-label="删除" className="opacity-0 group-hover:opacity-100 text-muted hover:text-fg"><X size={12} /></button>
          </li>
        ))}
        {!items.length && <li className="text-[12px] text-muted px-1">还没有待办事项</li>}
      </ul>
      <form onSubmit={e => { e.preventDefault(); add(); }} className="flex items-center gap-1.5">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="添加待办，回车保存" className="flex-1 min-w-0 h-8 px-2.5 rounded-[8px] bg-fill-2 border border-line outline-none text-[12px] text-fg placeholder:text-muted" />
        <button type="submit" aria-label="添加" className="h-8 w-8 rounded-[8px] bg-fill-2 hover:bg-fill-3 flex items-center justify-center text-fg"><Plus size={14} /></button>
      </form>
    </div>
  );
};

export const todoWidget: BuiltinWidget = {
  type: 'todo', name: '待办', description: '简单的待办清单，保存在本机，多个标签页同步。',
  icon: ListTodo, sizes: ['s', 'm', 'l'], defaultSize: 's', defaultConfig: {}, Component: TodoWidget,
};
