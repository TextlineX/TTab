import React from 'react';

/** 设置页的一组：标题 + 卡片 */
export const Group: React.FC<{ title?: string; desc?: React.ReactNode; children: React.ReactNode }> = ({ title, desc, children }) => (
  <section className="flex flex-col gap-2">
    {title && <h3 className="px-1 text-[13px] font-medium text-muted">{title}</h3>}
    {desc && <p className="px-1 -mt-1 text-[12.5px] text-faint leading-relaxed">{desc}</p>}
    <div className="rounded-2xl border border-line bg-fill-1 divide-y divide-[color:var(--line)]">{children}</div>
  </section>
);

/** 一行设置：左边说明，右边控件；stack 时控件换到下一行 */
export const Row: React.FC<{ label: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode; stack?: boolean }> = ({ label, desc, children, stack }) => (
  <div className={`px-4 py-3.5 ${stack ? 'flex flex-col gap-3' : 'flex items-center gap-4'}`}>
    <div className="flex-1 min-w-0">
      <div className="text-[14px] text-fg">{label}</div>
      {desc && <div className="mt-0.5 text-[12.5px] text-muted leading-relaxed">{desc}</div>}
    </div>
    {children && <div className={stack ? '' : 'shrink-0'}>{children}</div>}
  </div>
);

export const inputCls = 'w-full h-10 px-3 rounded-xl bg-fill-1 border border-line focus:border-[color:var(--accent-line)] outline-none text-[13.5px] text-fg placeholder:text-faint transition-colors';
