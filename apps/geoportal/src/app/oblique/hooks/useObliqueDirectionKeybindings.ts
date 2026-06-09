import { useEffect, useMemo } from "react";
import { CardinalDirectionEnum } from "../utils/orientationUtils";

type Params = {
  enabled?: boolean;
  activeDirection?: CardinalDirectionEnum;
  siblingCallbacks?: Partial<Record<CardinalDirectionEnum, () => void>>;
};

export function useObliqueDirectionKeybindings({
  enabled = true,
  activeDirection,
  siblingCallbacks,
}: Params) {
  const { topDir, rightDir, bottomDir, leftDir } = useMemo(() => {
    const order: CardinalDirectionEnum[] = [
      CardinalDirectionEnum.North,
      CardinalDirectionEnum.East,
      CardinalDirectionEnum.South,
      CardinalDirectionEnum.West,
    ];
    const top = activeDirection ?? CardinalDirectionEnum.North;
    const topIdx = order.indexOf(top);
    return {
      topDir: top,
      rightDir: order[(topIdx + 1) % 4],
      bottomDir: order[(topIdx + 2) % 4],
      leftDir: order[(topIdx + 3) % 4],
    };
  }, [activeDirection]);

  useEffect(() => {
    if (!enabled) return;

    const isEditableTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      const editableTags = ["input", "textarea", "select"];
      if (editableTags.includes(tag)) return true;
      return el.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();
      const code = (e.code || "").toLowerCase();
      const isNumpad = code.startsWith("numpad");
      const num = key;

      // Move: heading-relative mapping
      if (key === "w" || key === "arrowup" || (isNumpad && num === "8")) {
        const cb = siblingCallbacks?.[bottomDir];
        if (cb) {
          e.preventDefault();
          cb();
        }
        return;
      }
      if (key === "a" || key === "arrowleft" || (isNumpad && num === "4")) {
        const cb = siblingCallbacks?.[rightDir];
        if (cb) {
          e.preventDefault();
          cb();
        }
        return;
      }
      if (key === "s" || key === "arrowdown" || (isNumpad && num === "2")) {
        const cb = siblingCallbacks?.[topDir];
        if (cb) {
          e.preventDefault();
          cb();
        }
        return;
      }
      if (key === "d" || key === "arrowright" || (isNumpad && num === "6")) {
        const cb = siblingCallbacks?.[leftDir];
        if (cb) {
          e.preventDefault();
          cb();
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, siblingCallbacks, topDir, rightDir, bottomDir, leftDir]);
}
