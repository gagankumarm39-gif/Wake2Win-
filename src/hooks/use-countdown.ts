"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Wall-clock countdown (drift-free: derives remaining time from Date.now()
 * rather than counting ticks, so a throttled background tab stays accurate).
 * onExpire fires exactly once.
 */
export function useCountdown(initialSeconds: number, onExpire: () => void) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const endRef = useRef(Date.now() + initialSeconds * 1000);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return secondsLeft;
}

export function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
