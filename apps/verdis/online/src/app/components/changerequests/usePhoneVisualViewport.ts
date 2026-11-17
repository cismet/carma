import { useEffect } from "react";

let users = 0;

const update = () => {
  const vv = window.visualViewport;
  if (!vv) {
    return;
  }
  const style = document.documentElement.style;
  style.setProperty("--cr-vv-height", `${vv.height}px`);
  style.setProperty("--cr-vv-top", `${vv.offsetTop}px`);
};

// iOS keeps the page size when the keyboard opens and only shifts the visible part.
export const usePhoneVisualViewport = (enabled: boolean) => {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) {
      return;
    }
    users++;
    if (users === 1) {
      update();
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    }
    return () => {
      users--;
      if (users === 0) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
        document.documentElement.style.removeProperty("--cr-vv-height");
        document.documentElement.style.removeProperty("--cr-vv-top");
      }
    };
  }, [enabled]);
};

export const afterKeyboardSettles = (callback: () => void) => {
  const vv = window.visualViewport;
  let done = false;
  const run = () => {
    if (done) {
      return;
    }
    done = true;
    vv?.removeEventListener("resize", onResize);
    clearTimeout(fallback);
    callback();
  };
  const onResize = () => requestAnimationFrame(run);
  const fallback = setTimeout(run, 400);
  vv?.addEventListener("resize", onResize);
};
