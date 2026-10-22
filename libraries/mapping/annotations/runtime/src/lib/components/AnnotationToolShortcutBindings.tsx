import { useEffect, useMemo } from "react";

import { isManagedAnnotationKeyboardEvent } from "@carma-mapping/annotations/core";

import { useAnnotationsRuntime } from "../context/AnnotationsProvider";
import type { AnnotationToolPlugin } from "../registry";
import { resolveAnnotationToolShortcutTarget } from "../registry/annotation-tool-shortcuts";
import { resolvePrimaryAnnotationInteractionToolId } from "../utils/annotation-tool-collections";

export type AnnotationToolShortcutBindingsProps = {
  /** The tools whose shortcut keys switch the active tool; the ones the host shows. */
  plugins: readonly AnnotationToolPlugin[];
  enabled?: boolean;
};

/** Binds the tool shortcut keys to the runtime's active tool; mount it inside the provider. */
export const AnnotationToolShortcutBindings = ({
  plugins,
  enabled = true,
}: AnnotationToolShortcutBindingsProps) => {
  const { activeToolType, requestModeChange } = useAnnotationsRuntime();
  const descriptors = useMemo(
    () => plugins.map((plugin) => plugin.descriptor),
    [plugins]
  );
  const primaryInteractionToolId = useMemo(
    () => resolvePrimaryAnnotationInteractionToolId(plugins),
    [plugins]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleToolShortcutKeyDown = (event: KeyboardEvent) => {
      if (!isManagedAnnotationKeyboardEvent(event)) {
        return;
      }

      const targetToolType = resolveAnnotationToolShortcutTarget(
        event.key,
        descriptors,
        primaryInteractionToolId
      );
      if (!targetToolType || targetToolType === activeToolType) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      requestModeChange(targetToolType);
    };

    window.addEventListener("keydown", handleToolShortcutKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleToolShortcutKeyDown, true);
    };
  }, [
    activeToolType,
    descriptors,
    enabled,
    primaryInteractionToolId,
    requestModeChange,
  ]);

  return null;
};
