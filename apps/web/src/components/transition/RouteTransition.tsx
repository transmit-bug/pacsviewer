import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Variants } from 'framer-motion';

/** 页面过渡: 200ms 淡入 + 8px 上滑 (与 token --duration-slow / --ease-out 一致) */
const PAGE_TRANSITION = { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };

const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
};

/**
 * 路由级页面过渡 (framer-motion 特批边界: 仅路由过渡 + 入场 + 数字变化)。
 *
 * 用法: 包裹 <Routes location={location}> —— 显式传入 location 并以 pathname
 * 作为 key, 保证退出动画渲染的是旧路由内容 (react-router 官方推荐模式,
 * 避免退出瞬间闪出新页面内容)。
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="enter"
        exit="exit"
        transition={PAGE_TRANSITION}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
