import { useEffect } from "react";

import { useAnnotationsSelector } from "../store";
import type { AnnotationToolRegistry } from "../registry/annotation-tool-plugin.types";
import type { AnnotationToolId } from "../registry/annotation-tool-id";

type RuntimeToolAvailabilityGuardProps = {
  registry: AnnotationToolRegistry;
  setActiveToolType: (toolId: AnnotationToolId) => void;
};

export const RuntimeToolAvailabilityGuard = ({
  registry,
  setActiveToolType,
}: RuntimeToolAvailabilityGuardProps) => {
  const activeToolType = useAnnotationsSelector(
    (state) => state.annotationToolType
  );

  useEffect(() => {
    if (registry.getPlugin(activeToolType)) {
      return;
    }

    const fallbackToolType = registry.orderedDescriptors[0]?.id;
    if (!fallbackToolType) {
      return;
    }
    setActiveToolType(fallbackToolType);
  }, [activeToolType, registry, setActiveToolType]);

  return null;
};
