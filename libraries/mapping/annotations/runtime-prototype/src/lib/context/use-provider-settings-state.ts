import { useCallback, useMemo } from "react";
import {
  type LinearSegmentLineMode,
  ANNOTATION_TYPES,
} from "@carma-mapping/annotations/core";
import {
  replaceAnnotationsStoreState,
  type AnnotationsStore,
  useStoreSelector,
} from "../store";
import { resolveSetStateAction } from "../store/state-update-utils";
import type {
  AnnotationSettingsByToolKey,
  AnnotationSettingsContextType,
  AnnotationSettingsToolKey,
} from "./annotations-context.types";
const {
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  POINT: ANNOTATION_TYPE_POINT,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
} = ANNOTATION_TYPES;

export const useProviderSettingsState = (
  annotationsStore: AnnotationsStore
) => {
  const annotationToolType = useStoreSelector(
    annotationsStore,
    (state) => state.annotationToolType
  );
  const pointQuerySettings = useStoreSelector(
    annotationsStore,
    (state) => state.settingsState.pointQuery
  );
  const pointSettings = useStoreSelector(
    annotationsStore,
    (state) => state.settingsState.point
  );
  const distanceSettings = useStoreSelector(
    annotationsStore,
    (state) => state.settingsState.distance
  );
  const polylineSettings = useStoreSelector(
    annotationsStore,
    (state) => state.settingsState.polyline
  );

  const setSettingsState = useCallback<
    React.Dispatch<
      React.SetStateAction<{
        pointQuery: typeof pointQuerySettings;
        point: typeof pointSettings;
        distance: typeof distanceSettings;
        polyline: typeof polylineSettings;
      }>
    >
  >(
    (nextValueOrUpdater) => {
      const previousStoreState = annotationsStore.getState();
      const nextSettingsState = resolveSetStateAction(
        nextValueOrUpdater,
        previousStoreState.settingsState
      );

      if (Object.is(nextSettingsState, previousStoreState.settingsState)) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousStoreState,
          settingsState: nextSettingsState,
        })
      );
    },
    [annotationsStore]
  );

  const setPointSettings = useCallback<
    React.Dispatch<React.SetStateAction<typeof pointSettings>>
  >(
    (nextValueOrUpdater) => {
      setSettingsState((previousState) => {
        const nextPointSettings = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.point
        );

        return Object.is(nextPointSettings, previousState.point)
          ? previousState
          : {
              ...previousState,
              point: nextPointSettings,
            };
      });
    },
    [setSettingsState]
  );

  const setDistanceSettings = useCallback<
    React.Dispatch<React.SetStateAction<typeof distanceSettings>>
  >(
    (nextValueOrUpdater) => {
      setSettingsState((previousState) => {
        const nextDistanceSettings = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.distance
        );

        return Object.is(nextDistanceSettings, previousState.distance)
          ? previousState
          : {
              ...previousState,
              distance: nextDistanceSettings,
            };
      });
    },
    [setSettingsState]
  );

  const setPolylineSettings = useCallback<
    React.Dispatch<React.SetStateAction<typeof polylineSettings>>
  >(
    (nextValueOrUpdater) => {
      setSettingsState((previousState) => {
        const nextPolylineSettings = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.polyline
        );

        return Object.is(nextPolylineSettings, previousState.polyline)
          ? previousState
          : {
              ...previousState,
              polyline: nextPolylineSettings,
            };
      });
    },
    [setSettingsState]
  );

  const pointRadius = pointQuerySettings.radius;
  const pointVerticalOffsetMeters = pointSettings.verticalOffsetMeters;
  const pointTemporaryMode = pointSettings.temporaryMode;
  const defaultPolylineVerticalOffsetMeters =
    polylineSettings.defaultVerticalOffsetMeters;
  const defaultPolylineSegmentLineMode =
    polylineSettings.defaultSegmentLineMode;
  const distanceModeStickyToFirstPoint = distanceSettings.stickyToFirstPoint;
  const distanceCreationLineVisibility =
    distanceSettings.creationLineVisibility;
  const distanceDefaultLabelVisibilityByKind =
    distanceSettings.defaultLabelVisibilityByKind;
  const distanceDefaultDirectLineLabelMode =
    distanceSettings.defaultDirectLineLabelMode;
  const heightOffset = pointQuerySettings.heightOffset;

  const setPointVerticalOffsetMeters = useCallback<
    React.Dispatch<React.SetStateAction<number>>
  >(
    (nextValueOrUpdater) => {
      setPointSettings((previousState) => {
        const nextVerticalOffsetMeters =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(previousState.verticalOffsetMeters)
            : nextValueOrUpdater;

        return nextVerticalOffsetMeters === previousState.verticalOffsetMeters
          ? previousState
          : {
              ...previousState,
              verticalOffsetMeters: nextVerticalOffsetMeters,
            };
      });
    },
    [setPointSettings]
  );

  const setPointTemporaryMode = useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >(
    (nextValueOrUpdater) => {
      setPointSettings((previousState) => {
        const nextTemporaryMode =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(previousState.temporaryMode)
            : nextValueOrUpdater;

        return nextTemporaryMode === previousState.temporaryMode
          ? previousState
          : {
              ...previousState,
              temporaryMode: nextTemporaryMode,
            };
      });
    },
    [setPointSettings]
  );

  const setDefaultPolylineVerticalOffsetMeters = useCallback<
    React.Dispatch<React.SetStateAction<number>>
  >(
    (nextValueOrUpdater) => {
      setPolylineSettings((previousState) => {
        const nextDefaultVerticalOffsetMeters =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(previousState.defaultVerticalOffsetMeters)
            : nextValueOrUpdater;

        return nextDefaultVerticalOffsetMeters ===
          previousState.defaultVerticalOffsetMeters
          ? previousState
          : {
              ...previousState,
              defaultVerticalOffsetMeters: nextDefaultVerticalOffsetMeters,
            };
      });
    },
    [setPolylineSettings]
  );

  const setDefaultPolylineSegmentLineMode = useCallback<
    React.Dispatch<React.SetStateAction<LinearSegmentLineMode>>
  >(
    (nextValueOrUpdater) => {
      setPolylineSettings((previousState) => {
        const nextDefaultSegmentLineMode =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(previousState.defaultSegmentLineMode)
            : nextValueOrUpdater;

        return nextDefaultSegmentLineMode ===
          previousState.defaultSegmentLineMode
          ? previousState
          : {
              ...previousState,
              defaultSegmentLineMode: nextDefaultSegmentLineMode,
            };
      });
    },
    [setPolylineSettings]
  );

  const setDistanceModeStickyToFirstPoint = useCallback<
    React.Dispatch<React.SetStateAction<boolean>>
  >(
    (nextValueOrUpdater) => {
      setDistanceSettings((previousState) => {
        const nextStickyToFirstPoint =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(previousState.stickyToFirstPoint)
            : nextValueOrUpdater;

        return nextStickyToFirstPoint === previousState.stickyToFirstPoint
          ? previousState
          : {
              ...previousState,
              stickyToFirstPoint: nextStickyToFirstPoint,
            };
      });
    },
    [setDistanceSettings]
  );

  const setDistanceCreationLineVisibility = useCallback<
    React.Dispatch<
      React.SetStateAction<{
        direct: boolean;
        vertical: boolean;
        horizontal: boolean;
      }>
    >
  >(
    (nextValueOrUpdater) => {
      setDistanceSettings((previousState) => {
        const nextCreationLineVisibility =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(previousState.creationLineVisibility)
            : nextValueOrUpdater;

        return Object.is(
          nextCreationLineVisibility,
          previousState.creationLineVisibility
        )
          ? previousState
          : {
              ...previousState,
              creationLineVisibility: nextCreationLineVisibility,
            };
      });
    },
    [setDistanceSettings]
  );

  const setDistanceCreationLineVisibilityByKind = useCallback(
    (kind: "direct" | "vertical" | "horizontal", visible: boolean) => {
      setDistanceCreationLineVisibility((previousState) =>
        previousState[kind] === visible
          ? previousState
          : {
              ...previousState,
              [kind]: visible,
            }
      );
    },
    [setDistanceCreationLineVisibility]
  );

  const pointSettingsValue = useMemo(
    () => ({
      verticalOffsetMeters: pointVerticalOffsetMeters,
      temporaryMode: pointTemporaryMode,
    }),
    [pointTemporaryMode, pointVerticalOffsetMeters]
  );
  const distanceSettingsValue = useMemo(
    () => ({
      stickyToFirstPoint: distanceModeStickyToFirstPoint,
      creationLineVisibility: distanceCreationLineVisibility,
    }),
    [distanceCreationLineVisibility, distanceModeStickyToFirstPoint]
  );
  const polylineSettingsValue = useMemo(
    () => ({
      verticalOffsetMeters: defaultPolylineVerticalOffsetMeters,
      segmentLineMode: defaultPolylineSegmentLineMode,
    }),
    [defaultPolylineSegmentLineMode, defaultPolylineVerticalOffsetMeters]
  );
  const contextValue = useMemo<AnnotationSettingsContextType>(
    () => ({
      get: ((toolKey) => {
        switch (toolKey) {
          case ANNOTATION_TYPE_POINT:
            return pointSettingsValue;
          case ANNOTATION_TYPE_DISTANCE:
            return distanceSettingsValue;
          case ANNOTATION_TYPE_POLYLINE:
            return polylineSettingsValue;
          default:
            throw new Error(
              `Unsupported settings tool key: ${String(toolKey)}`
            );
        }
      }) as AnnotationSettingsContextType["get"],
      update: (toolKey, patch) => {
        switch (toolKey) {
          case ANNOTATION_TYPE_POINT: {
            const pointPatch = patch as Partial<typeof pointSettingsValue>;
            if (pointPatch.verticalOffsetMeters !== undefined) {
              setPointVerticalOffsetMeters(pointPatch.verticalOffsetMeters);
            }
            if (pointPatch.temporaryMode !== undefined) {
              setPointTemporaryMode(pointPatch.temporaryMode);
            }
            return;
          }
          case ANNOTATION_TYPE_DISTANCE: {
            const distancePatch = patch as {
              stickyToFirstPoint?: boolean;
              creationLineVisibility?: Partial<
                typeof distanceSettingsValue.creationLineVisibility
              >;
            };
            if (distancePatch.stickyToFirstPoint !== undefined) {
              setDistanceModeStickyToFirstPoint(
                distancePatch.stickyToFirstPoint
              );
            }
            if (distancePatch.creationLineVisibility) {
              Object.entries(distancePatch.creationLineVisibility).forEach(
                ([kind, visible]) => {
                  if (visible !== undefined) {
                    setDistanceCreationLineVisibilityByKind(
                      kind as "direct" | "vertical" | "horizontal",
                      visible
                    );
                  }
                }
              );
            }
            return;
          }
          case ANNOTATION_TYPE_POLYLINE: {
            const polylinePatch = patch as Partial<
              typeof polylineSettingsValue
            >;
            if (polylinePatch.verticalOffsetMeters !== undefined) {
              setDefaultPolylineVerticalOffsetMeters(
                polylinePatch.verticalOffsetMeters
              );
            }
            if (polylinePatch.segmentLineMode !== undefined) {
              setDefaultPolylineSegmentLineMode(polylinePatch.segmentLineMode);
            }
            return;
          }
          default:
            throw new Error(
              `Unsupported settings tool key: ${String(toolKey)}`
            );
        }
      },
    }),
    [
      distanceSettingsValue,
      pointSettingsValue,
      polylineSettingsValue,
      setDefaultPolylineSegmentLineMode,
      setDefaultPolylineVerticalOffsetMeters,
      setDistanceCreationLineVisibilityByKind,
      setDistanceModeStickyToFirstPoint,
      setPointTemporaryMode,
      setPointVerticalOffsetMeters,
    ]
  );

  const activeSettingsToolKey =
    useMemo<AnnotationSettingsToolKey | null>(() => {
      if (annotationToolType === ANNOTATION_TYPE_POINT) {
        return ANNOTATION_TYPE_POINT;
      }
      if (annotationToolType === ANNOTATION_TYPE_DISTANCE) {
        return ANNOTATION_TYPE_DISTANCE;
      }
      if (annotationToolType === ANNOTATION_TYPE_POLYLINE) {
        return ANNOTATION_TYPE_POLYLINE;
      }
      return null;
    }, [annotationToolType]);

  const activeToolSettings = useMemo<
    AnnotationSettingsByToolKey[AnnotationSettingsToolKey] | null
  >(() => {
    if (!activeSettingsToolKey) {
      return null;
    }

    return contextValue.get(activeSettingsToolKey);
  }, [activeSettingsToolKey, contextValue]);

  return {
    contextValue,
    activeSettingsToolKey,
    activeToolSettings,
    pointRadius,
    pointVerticalOffsetMeters,
    pointTemporaryMode,
    defaultPolylineVerticalOffsetMeters,
    defaultPolylineSegmentLineMode,
    distanceModeStickyToFirstPoint,
    distanceCreationLineVisibility,
    distanceDefaultLabelVisibilityByKind,
    distanceDefaultDirectLineLabelMode,
    heightOffset,
    setPointVerticalOffsetMeters,
    setPointTemporaryMode,
    setDefaultPolylineVerticalOffsetMeters,
    setDefaultPolylineSegmentLineMode,
    setDistanceModeStickyToFirstPoint,
    setDistanceCreationLineVisibilityByKind,
  };
};

export type ProviderSettingsState = ReturnType<typeof useProviderSettingsState>;
