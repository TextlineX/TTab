import React, { useEffect, useRef, useState } from 'react';
import { StickyNote } from 'lucide-react';
import type { BuiltinWidget, WidgetProps } from '../types';
import { useWidgetData } from '../store';

const NotesWidget: React.FC<WidgetProps> = ({ instance }) => {
  const [saved, setSaved, loaded] = useWidgetData<string>(instance.id, '');
  const [text, setText] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editing = useRef(false);
  // 别的标签页改了内容时同步过来（自己正在输入时不覆盖）
  useEffect(() => { if (!editing.current) setText(saved); }, [saved, loaded]);
  return (
    <textarea
      value={text}
      onChange={e => {
        editing.current = true;
        setText(e.target.value);
        clearTimeout(timer.current);
        const v = e.target.value;
        timer.current = setTimeout(() => { setSaved(v); editing.current = false; }, 500);
      }}
      placeholder="随手记点什么……"
      aria-label="便签"
      className="w-full h-full resize-none bg-transparent outline-none p-3 text-[13px] leading-relaxed text-fg placeholder:text-muted"
    />
  );
};

export const notesWidget: BuiltinWidget = {
  type: 'notes', name: '便签', description: '随手记，自动保存在本机。',
  icon: StickyNote, sizes: ['s', 'm', 'l'], defaultSize: 's', defaultConfig: {}, Component: NotesWidget,
};
