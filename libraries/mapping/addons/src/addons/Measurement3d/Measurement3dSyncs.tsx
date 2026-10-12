import { useEffect, useMemo } from "react";
import { isManagedAnnotationKeyboardEvent } from "@carma-mapping/annotations/core";
import {
  resolveAnnotationToolShortcutTarget,
  resolvePrimaryAnnotationInteractionToolId,
  selectAuthoringAnnotationEntries,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import { useMeasurement3dActions } from "./measurement3d-state";
import { setMeasurement3dRuntimeServices } from "./measurement3d-runtime-services";

/** Keeps the channel's count in step with the authored measurements. */
export const Measurement3dCountSync = () => {
  const { annotationEntries } = useAnnotationsRuntime();
  const { setCount } = useMeasurement3dActions();
  const count = selectAuthoringAnnotationEntries({ annotationEntries }).length;
  useEffect(() => {
    setCount(count);
  }, [count, setCount]);
  return null;
};

/** Whether a saved set (read-only external entries) is shown right now. */
export const Measurement3dSavedSetPresenceSync = ({
  onChange,
}: {
  onChange: (present: boolean) => void;
}) => {
  const { annotationEntries } = useAnnotationsRuntime();
  const present = annotationEntries.some(
    (entry) => entry.externalCollection !== undefined && !entry.hidden
  );
  useEffect(() => {
    onChange(present);
  }, [onChange, present]);
  return null;
};

/** The runtime services the host uses outside this provider, while it is mounted. */
export const Measurement3dRuntimeServicesSync = () => {
  const {
    annotationEntries,
    nodes,
    engine,
    setSelectedAnnotationId,
    appendAnnotationsRuntimePersistenceState,
    removeExternalAnnotationsByCollection,
    buildAllAnnotationsGeoJson,
    removeAnnotationsByIds,
    flyToAllAnnotations,
    exportAllAnnotationsGeoJson,
  } = useAnnotationsRuntime();
  useEffect(() => {
    setMeasurement3dRuntimeServices({
      annotationEntries,
      nodes,
      engine,
      setSelectedAnnotationId,
      appendAnnotationsRuntimePersistenceState,
      removeExternalAnnotationsByCollection,
      buildAllAnnotationsGeoJson,
      removeAnnotationsByIds,
      flyToAllAnnotations,
      exportAllAnnotationsGeoJson,
    });
  }, [
    annotationEntries,
    appendAnnotationsRuntimePersistenceState,
    buildAllAnnotationsGeoJson,
    engine,
    exportAllAnnotationsGeoJson,
    flyToAllAnnotations,
    nodes,
    removeAnnotationsByIds,
    removeExternalAnnotationsByCollection,
    setSelectedAnnotationId,
  ]);
  useEffect(() => () => setMeasurement3dRuntimeServices(null), []);
  return null;
};

/** Tool shortcut keys, bound while the tool is on. */
export const Measurement3dShortcutBindings = () => {
  const { registry, activeToolType, requestModeChange } =
    useAnnotationsRuntime();
  const descriptors = useMemo(
    () => registry.plugins.map((plugin) => plugin.descriptor),
    [registry.plugins]
  );
  const primaryInteractionToolId = useMemo(
    () => resolvePrimaryAnnotationInteractionToolId(registry.plugins),
    [registry.plugins]
  );
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isManagedAnnotationKeyboardEvent(event)) return;
      const targetToolType = resolveAnnotationToolShortcutTarget(
        event.key,
        descriptors,
        primaryInteractionToolId
      );
      if (!targetToolType || targetToolType === activeToolType) return;
      event.preventDefault();
      event.stopPropagation();
      requestModeChange(targetToolType);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [
    activeToolType,
    descriptors,
    primaryInteractionToolId,
    requestModeChange,
  ]);
  return null;
};
