import { useEffect, useMemo } from "react";
import { useSelector } from "react-redux";

import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import {
  resolvePrimaryAnnotationInteractionToolId,
  resolveAnnotationToolShortcutTarget,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import { isManagedAnnotationKeyboardEvent } from "@carma-mapping/annotations/core";

import { getUIMode, UIMode } from "../../store/slices/ui";
import { useGeoportalCesiumAnnotationToolPlugins } from "../../hooks/use-geoportal-cesium-annotation-tool-plugins";

const CesiumAnnotationShortcutManager = () => {
  const { isCesium } = useMapFrameworkSwitcherContext();
  const uiMode = useSelector(getUIMode);
  const { registry, activeToolType, requestModeChange } =
    useAnnotationsRuntime();
  const visiblePlugins = useGeoportalCesiumAnnotationToolPlugins(
    registry.plugins
  );
  const visibleDescriptors = useMemo(
    () => visiblePlugins.map((plugin) => plugin.descriptor),
    [visiblePlugins]
  );
  const primaryInteractionToolId = useMemo(
    () => resolvePrimaryAnnotationInteractionToolId(visiblePlugins),
    [visiblePlugins]
  );
  const shortcutsEnabled = isCesium && uiMode === UIMode.MEASUREMENT;

  useEffect(() => {
    if (!shortcutsEnabled) {
      return;
    }

    const handleToolShortcutKeyDown = (event: KeyboardEvent) => {
      if (!isManagedAnnotationKeyboardEvent(event)) {
        return;
      }

      const targetToolType = resolveAnnotationToolShortcutTarget(
        event.key,
        visibleDescriptors,
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
    primaryInteractionToolId,
    requestModeChange,
    shortcutsEnabled,
    visibleDescriptors,
  ]);

  return null;
};

export default CesiumAnnotationShortcutManager;
