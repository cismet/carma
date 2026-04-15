import { useCallback, useEffect, useState } from "react";

export const useSelectionAdditiveModifierState = (modifierKey: string) => {
  const [isSelectionAdditiveModifierPressed, setIsPressed] = useState(false);

  const syncSelectionAdditiveModifierPressed = useCallback(
    (nextIsPressed: boolean) => {
      setIsPressed((currentIsPressed) =>
        currentIsPressed === nextIsPressed ? currentIsPressed : nextIsPressed
      );
    },
    []
  );

  useEffect(() => {
    const clearModifierState = () => {
      syncSelectionAdditiveModifierPressed(false);
    };

    const handlePointerDown = (event: PointerEvent) => {
      syncSelectionAdditiveModifierPressed(event.shiftKey);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === modifierKey || event.shiftKey) {
        syncSelectionAdditiveModifierPressed(event.shiftKey);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === modifierKey || !event.shiftKey) {
        syncSelectionAdditiveModifierPressed(event.shiftKey);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearModifierState();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("blur", clearModifierState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("blur", clearModifierState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [modifierKey, syncSelectionAdditiveModifierPressed]);

  return isSelectionAdditiveModifierPressed;
};
