import { useEffect } from "react";

type Params = {
  enabled?: boolean;
  onPan: (horizontal: number, vertical: number) => void;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    ["input", "textarea", "select"].includes(target.tagName.toLowerCase()) ||
    target.isContentEditable
  );
};

/** Keyboard requests move the ground target in the current camera frame. */
export const useObliqueDirectionKeybindings = ({
  enabled = true,
  onPan,
}: Params): void => {
  useEffect(() => {
    if (!enabled) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const numpad = event.code.toLowerCase().startsWith("numpad");
      let offset: [number, number] | null = null;
      if (key === "w" || key === "arrowup" || (numpad && key === "8"))
        offset = [0, 1];
      else if (key === "a" || key === "arrowleft" || (numpad && key === "4"))
        offset = [-1, 0];
      else if (key === "s" || key === "arrowdown" || (numpad && key === "2"))
        offset = [0, -1];
      else if (key === "d" || key === "arrowright" || (numpad && key === "6"))
        offset = [1, 0];
      if (!offset) return;
      event.preventDefault();
      onPan(...offset);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onPan]);
};
