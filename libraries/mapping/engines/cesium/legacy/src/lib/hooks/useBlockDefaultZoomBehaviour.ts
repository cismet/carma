import { useEffect } from "react";

interface UseViewerRetryEffectArgs {
  enabled: boolean;
  enable: () => boolean;
  disable: () => boolean;
  pendingWheelBlocker: (event: WheelEvent) => void;
  ref: React.MutableRefObject<boolean>;
}

export const useBlockDefaultZoomBehaviour = ({
  enabled,
  enable,
  disable,
  pendingWheelBlocker,
  ref,
}: UseViewerRetryEffectArgs) =>
  useEffect(() => {
    let cancelled = false;

    const tryApply = (attemptsLeft: number) => {
      if (cancelled) return;
      const ok = enabled ? enable() : disable();
      if (!ok && attemptsLeft > 0) {
        requestAnimationFrame(() => tryApply(attemptsLeft - 1));
        if (enabled && !ref.current) {
          window.addEventListener("wheel", pendingWheelBlocker, {
            passive: false,
            capture: true,
          });
          ref.current = true;
        }
      }
    };

    tryApply(3);

    return () => {
      cancelled = true;
      disable();
      if (ref.current) {
        window.removeEventListener("wheel", pendingWheelBlocker, {
          capture: true,
        } as AddEventListenerOptions);
        ref.current = false;
      }
    };
  }, [enabled, enable, disable, pendingWheelBlocker, ref]);
