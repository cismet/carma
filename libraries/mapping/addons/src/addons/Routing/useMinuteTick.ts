import { useEffect, useState } from "react";

/**
 * Re-render on every full minute.
 *
 * An arrival time moves on with the clock even when nothing else does: a route
 * that is only in focus, or a navigation standing at a light. The arrival is
 * read off `Date.now()` whenever it renders; this only makes sure it renders
 * when "an 14:32" could read differently, and not every second in between.
 */
export const useMinuteTick = (): void => {
  const [, setTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setTick((tick) => tick + 1);
        schedule();
      }, 60_000 - (Date.now() % 60_000));
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
};
