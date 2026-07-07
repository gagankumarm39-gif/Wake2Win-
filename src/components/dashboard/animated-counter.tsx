"use client";

import { useEffect, useRef } from "react";
import { animate, useInView } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
  duration?: number;
}

/** Counts up from 0 when scrolled into view. Updates the DOM directly — no re-renders. */
export function AnimatedCounter({
  value,
  decimals = 0,
  suffix = "",
  className,
  duration = 1.4,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-30px" });

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        if (ref.current) {
          ref.current.textContent =
            v.toLocaleString("en", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            }) + suffix;
        }
      },
    });
    return () => controls.stop();
  }, [inView, value, decimals, suffix, duration]);

  return (
    <span ref={ref} className={className}>
      {(0).toLocaleString("en", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}
