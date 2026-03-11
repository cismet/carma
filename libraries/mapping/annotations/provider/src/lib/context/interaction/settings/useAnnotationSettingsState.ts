import { useCallback, type Dispatch, type SetStateAction } from "react";

import { useStoreSelector } from "@carma-commons/react-store";
import type {
  DirectLineLabelMode,
  LinearSegmentLineMode,
  ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";

import type { AnnotationsStore } from "../../store";

const resolveSetStateAction = <TValue>(
  action: SetStateAction<TValue>,
  previousValue: TValue
): TValue =>
  typeof action === "function"
    ? (action as (previousValue: TValue) => TValue)(previousValue)
    : action;

export const useAnnotationSettingsState = (
  annotationsStore: AnnotationsStore
) => {
  const settingsState = useStoreSelector(
    annotationsStore,
    (state) => state.settingsState
  );
  const pointQuerySettings = settingsState.pointQuery;
  const pointSettings = settingsState.point;
  const distanceSettings = settingsState.distance;
  const polylineSettings = settingsState.polyline;

  const setSettingsState = useCallback<
    Dispatch<SetStateAction<typeof settingsState>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousStoreState) => {
        const nextSettingsState = resolveSetStateAction(
          nextValueOrUpdater,
          previousStoreState.settingsState
        );

        return Object.is(nextSettingsState, previousStoreState.settingsState)
          ? previousStoreState
          : {
              ...previousStoreState,
              settingsState: nextSettingsState,
            };
      });
    },
    [annotationsStore, settingsState]
  );

  const setPointSettings = useCallback<
    Dispatch<SetStateAction<typeof pointSettings>>
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
    Dispatch<SetStateAction<typeof distanceSettings>>
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
    Dispatch<SetStateAction<typeof polylineSettings>>
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
    Dispatch<SetStateAction<number>>
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

  const setPointTemporaryMode = useCallback<Dispatch<SetStateAction<boolean>>>(
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
    Dispatch<SetStateAction<number>>
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
    Dispatch<SetStateAction<LinearSegmentLineMode>>
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
    Dispatch<SetStateAction<boolean>>
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
    Dispatch<
      SetStateAction<{
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
      setDistanceCreationLineVisibility((prev) =>
        prev[kind] === visible
          ? prev
          : {
              ...prev,
              [kind]: visible,
            }
      );
    },
    [setDistanceCreationLineVisibility]
  );

  return {
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

export type AnnotationSettingsState = ReturnType<
  typeof useAnnotationSettingsState
>;
