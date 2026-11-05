import { useEffect, useState } from "react";
import { isHeldByOtherTab } from "./tabLock";

// Checked when the object opens and when this tab comes to the front, so a
// form is read-only before the first change, not after it.
export const useOtherTabLock = (name: string | undefined) => {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    setHeld(false);
    if (!name) {
      return undefined;
    }
    let current = true;
    const check = () => {
      void isHeldByOtherTab(name).then((value) => {
        if (current) {
          setHeld(value);
        }
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        check();
      }
    };
    check();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      current = false;
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [name]);

  return held;
};
