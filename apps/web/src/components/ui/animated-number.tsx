import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';
import { cn } from '@/lib/utils';

/** 与 token --ease-out (cubic-bezier(0.16,1,0.3,1)) 一致 */
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface AnimatedNumberProps {
  value: number;
  /** 动画时长 (秒), 默认 0.4s */
  duration?: number;
  className?: string;
  locale?: string;
}

/**
 * 数字变化 (framer-motion 特批边界之一)。
 * 挂载时从 0 起数、value 变化时平滑过渡;
 * 展示值由 state 驱动 (非直接改 DOM), tabular-nums 等宽数字保证无宽度抖动。
 */
export function AnimatedNumber({
  value,
  duration = 0.4,
  className,
  locale = 'zh-CN',
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const controls = animate(from, value, {
      duration,
      ease: EASE_OUT,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prevRef.current = value;
    return () => controls.stop();
  }, [value, duration]);

  return (
    <span className={cn('tabular-nums', className)}>
      {display.toLocaleString(locale)}
    </span>
  );
}
