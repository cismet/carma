import { useEffect } from "react";

let users = 0;

const KEYBOARD_CLASS = "cr-keyboard-open";
const KEYBOARD_MIN_HEIGHT = 150;

const update = () => {
  const vv = window.visualViewport;
  if (!vv) {
    return;
  }
  const root = document.documentElement;
  root.style.setProperty("--cr-vv-height", `${vv.height}px`);
  root.style.setProperty("--cr-vv-top", `${vv.offsetTop}px`);
  // a focused field alone is no proof: iOS keeps focus after the keyboard is dismissed
  root.classList.toggle(
    KEYBOARD_CLASS,
    root.clientHeight - vv.height * vv.scale > KEYBOARD_MIN_HEIGHT
  );
};

const TEXT_FIELD =
  'input:not([type="checkbox"], [type="radio"], [type="file"], [type="button"], [type="submit"]), textarea, select';
const FOCUS_MARGIN = 12;
const FOCUS_ANCHOR_ATTRIBUTE = "data-cr-focus-anchor";

type ScrollBlock = "start" | "nearest" | "end";

// element.scrollIntoView also scrolls the page and the .modal container on iOS, which moves the whole dialog
export const scrollIntoModalBody = (
  element: HTMLElement,
  block: ScrollBlock = "nearest",
  behavior: ScrollBehavior = "smooth"
) => {
  const body = element.closest<HTMLElement>(".modal-body");
  if (!body) {
    return;
  }
  const bodyRect = body.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  const toStart = rect.top - bodyRect.top - FOCUS_MARGIN;
  const toEnd = rect.bottom - bodyRect.bottom + FOCUS_MARGIN;
  let delta = 0;
  if (block === "start") {
    delta = toStart;
  } else if (block === "end") {
    delta = toEnd;
  } else if (toStart < 0 || rect.height > bodyRect.height) {
    delta = toStart;
  } else if (toEnd > 0) {
    delta = toEnd;
  }
  if (Math.abs(delta) > 1) {
    body.scrollTo({ top: body.scrollTop + delta, behavior });
  }
};

// mark a wrapper with data-cr-focus-anchor="start|nearest|end" to keep more than the field itself in view
const onFocusIn = (event: FocusEvent) => {
  const field = event.target;
  if (
    !(field instanceof HTMLElement) ||
    !field.matches(TEXT_FIELD) ||
    !field.closest(".cr-modal-phone .modal-body")
  ) {
    return;
  }
  afterKeyboardSettles(() => {
    if (document.activeElement !== field) {
      return;
    }
    const anchor = field.closest<HTMLElement>(`[${FOCUS_ANCHOR_ATTRIBUTE}]`);
    const block = anchor?.getAttribute(FOCUS_ANCHOR_ATTRIBUTE);
    scrollIntoModalBody(
      anchor ?? field,
      block === "start" || block === "end" ? block : "nearest"
    );
  });
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
      document.addEventListener("focusin", onFocusIn);
    }
    return () => {
      users--;
      if (users === 0) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
        document.removeEventListener("focusin", onFocusIn);
        document.documentElement.style.removeProperty("--cr-vv-height");
        document.documentElement.style.removeProperty("--cr-vv-top");
        document.documentElement.classList.remove(KEYBOARD_CLASS);
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
