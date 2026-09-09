import { useEffect, useMemo } from "react";

import type { CardinalDirection } from "../types";
import { CardinalDirectionEnum, headingRelativeSlots } from "../utils/orientation";

type Params = {
  enabled?: boolean;
  activeDirection?: CardinalDirection | null;
  siblingCallbacks?: Partial<Record<CardinalDirection, () => void>>;
};

const isEditableTarget = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (["input", "textarea", "select"].includes(tag)) return true;
  return el.isContentEditable;
};

/**
 * WASD, the arrow keys and the numpad step to the sibling images, relative
 * to the way the camera looks: "up" is the image ahead.
 */
export const useObliqueDirectionKeybindings = ({
  enabled = true,
  activeDirection,
  siblingCallbacks,
}: Params): void => {
  const { topDir, rightDir, bottomDir, leftDir } = useMemo(
    () => headingRelativeSlots(activeDirection ?? CardinalDirectionEnum.North),
    [activeDirection]
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();
      const code = (e.code || "").toLowerCase();
      const isNumpad = code.startsWith("numpad");

      let target: CardinalDirection | null = null;
      if (key === "w" || key === "arrowup" || (isNumpad && key === "8")) {
        target = bottomDir;
      } else if (key === "a" || key === "arrowleft" || (isNumpad && key === "4")) {
        target = rightDir;
      } else if (key === "s" || key === "arrowdown" || (isNumpad && key === "2")) {
        target = topDir;
      } else if (key === "d" || key === "arrowright" || (isNumpad && key === "6")) {
        target = leftDir;
      }
      if (target === null) return;
      const cb = siblingCallbacks?.[target];
      if (cb) {
        e.preventDefault();
        cb();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, siblingCallbacks, topDir, rightDir, bottomDir, leftDir]);
};
