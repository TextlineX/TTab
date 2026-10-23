/** 统一的动效参数：所有弹窗、抽屉、列表、指示器都从这里取，保证手感一致 */
import type { Transition, Variants } from 'framer-motion';

export const spring = {
  /** 小元素：按钮指示器、开关、标签 */
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 } as Transition,
  /** 面板、弹窗、卡片重排 */
  smooth: { type: 'spring', stiffness: 320, damping: 34 } as Transition,
  /** 抽屉、大面积移动 */
  gentle: { type: 'spring', stiffness: 220, damping: 30 } as Transition,
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.14 } },
};

/** 弹窗：从略小、略低处浮现 */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring.smooth },
  exit: { opacity: 0, scale: 0.97, y: 4, transition: { duration: 0.14 } },
};

/** 下拉菜单：从触发点展开 */
export const dropdown: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: -4 },
  show: { opacity: 1, scale: 1, y: 0, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.98, y: -2, transition: { duration: 0.1 } },
};

/** 右侧抽屉 */
export const drawer: Variants = {
  hidden: { x: 48, opacity: 0 },
  show: { x: 0, opacity: 1, transition: spring.gentle },
  exit: { x: 48, opacity: 0, transition: { duration: 0.18 } },
};

/** 列表项：首次进入时依次出现（只在页面首次加载时使用一次） */
export const stagger = (step = 0.035, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
});

export const rise: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: spring.smooth },
};

/** 卡片在筛选变化时的进出 */
export const cardPresence: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: spring.smooth },
  exit: { opacity: 0, scale: 0.97, transition: { duration: 0.12 } },
};
