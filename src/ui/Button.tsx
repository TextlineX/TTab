import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'ai' | 'warn' | 'danger';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:brightness-110',
  secondary: 'bg-fill-2 text-fg hover:bg-fill-3',
  ghost: 'text-muted hover:text-fg hover:bg-fill-2',
  ai: 'bg-ai text-on-ai hover:brightness-110',
  warn: 'bg-warn text-on-warn hover:brightness-105',
  danger: 'text-danger hover:bg-[color:var(--danger)]/12',
};

/** 统一按钮：主要 / 次要 / 文字 / AI / 警示 / 危险 */
const Button = React.forwardRef<HTMLButtonElement, Props>(({ variant = 'secondary', size = 'md', icon, className = '', children, ...rest }, ref) => (
  <button
    ref={ref}
    {...rest}
    className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-medium transition-[background-color,color,filter,transform] duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none ${size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-10 px-4 text-[14px]'} ${VARIANT[variant]} ${className}`}
  >
    {icon}
    {children}
  </button>
));
Button.displayName = 'Button';

export default Button;
