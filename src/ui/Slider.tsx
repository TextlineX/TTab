import React from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  ariaLabel: string;
  format?: (v: number) => string;
}

/** 滑块：轨道已走过的部分用强调色填充 */
const Slider: React.FC<Props> = ({ value, min, max, step = 1, onChange, ariaLabel, format }) => {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range" min={min} max={max} step={step} value={value} aria-label={ariaLabel}
        onChange={e => onChange(Number(e.target.value))}
        className="tt-slider flex-1"
        style={{ background: `linear-gradient(to right, var(--accent) ${pct}%, var(--fill-3) ${pct}%)` }}
      />
      {format && <span className="w-12 text-right text-[12.5px] text-muted tabular-nums">{format(value)}</span>}
    </div>
  );
};

export default Slider;
