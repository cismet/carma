import { useCallback, useEffect } from "react";
import type { Vector3 } from "three";

import { getEllipsoidalUpDirectionAtAnchor } from "@carma-geo/proj";
import {
  AXIS_NUMERIC_EPSILON,
  ENU_UP_AXIS_COLOR,
  SECONDARY_AXIS_COLOR,
} from "@carma-mapping/gizmo/core";

import type {
  AnnotationGizmoAxisCandidate,
  AnnotationGizmoLabels,
} from "@carma-mapping/annotations/core";
import { getEnabledDefaultAxisCandidatesAtPosition } from "./engine-point-move-gizmo-default-axes";
import type { PointMoveGizmoState } from "./engine-point-move-gizmo-state";

const AXIS_DIRECTION_MATCH_MIN_DOT = 0.999;

const isUsableDirection = (
  direction: Vector3 | null | undefined
): direction is Vector3 =>
  !!direction && direction.lengthSq() > AXIS_NUMERIC_EPSILON;

/** Axis candidates, the active axis and the disc plane of the gizmo. */
export const usePointMoveGizmoAxes = (
  gizmo: PointMoveGizmoState,
  {
    movePointKey,
    labels,
    axisTitle,
    axisCandidates,
    axisDirection,
    preferredAxisId,
  }: {
    movePointKey: string | null;
    labels: AnnotationGizmoLabels;
    axisTitle: string | null;
    axisCandidates: AnnotationGizmoAxisCandidate[] | null;
    axisDirection: Vector3 | null;
    preferredAxisId: string | null;
  }
) => {
  useEffect(() => {
    // Synced to this render's point by the earlier movePoint effect.
    const movePoint = gizmo.movePoint;
    if (!movePoint) return;

    const candidates =
      axisCandidates && axisCandidates.length > 0
        ? axisCandidates
        : getEnabledDefaultAxisCandidatesAtPosition(
            movePoint.geometryECEF,
            labels,
            axisTitle
          );
    if (candidates.length === 0) return;

    if (preferredAxisId) {
      const preferredAxis = candidates.find(
        (candidate) => candidate.id === preferredAxisId
      );
      if (preferredAxis) {
        gizmo.activeAxisId = preferredAxis.id;
        return;
      }
    }

    const normalizedOverride = isUsableDirection(axisDirection)
      ? axisDirection.clone().normalize()
      : null;
    if (normalizedOverride) {
      const matchedByDirection = candidates.find(
        (candidate) =>
          isUsableDirection(candidate.direction) &&
          Math.abs(
            candidate.direction.clone().normalize().dot(normalizedOverride)
          ) > AXIS_DIRECTION_MATCH_MIN_DOT
      );
      if (matchedByDirection) {
        gizmo.activeAxisId = matchedByDirection.id;
        return;
      }
    }

    if (candidates.some((candidate) => candidate.id === gizmo.activeAxisId)) {
      return;
    }
    gizmo.activeAxisId = candidates[0].id;
  }, [
    axisCandidates,
    axisDirection,
    axisTitle,
    gizmo,
    labels,
    movePointKey,
    preferredAxisId,
  ]);

  const getAxisCandidatesAtPosition = useCallback(
    (origin: Vector3): AnnotationGizmoAxisCandidate[] => {
      const configuredCandidates = gizmo.axisCandidates;
      if (!configuredCandidates || configuredCandidates.length === 0) {
        return getEnabledDefaultAxisCandidatesAtPosition(
          origin,
          labels,
          axisTitle
        );
      }

      const normalizedCandidates = configuredCandidates.flatMap(
        (candidate): AnnotationGizmoAxisCandidate[] =>
          !candidate.direction ||
          candidate.direction.lengthSq() <= AXIS_NUMERIC_EPSILON
            ? []
            : [
                {
                  ...candidate,
                  direction: candidate.direction.clone().normalize(),
                  color: candidate.color ?? SECONDARY_AXIS_COLOR,
                },
              ]
      );

      const movePointId = gizmo.movePoint?.id ?? "";
      const rotationState = gizmo.rotationState;
      if (
        !rotationState ||
        rotationState.pointId !== movePointId ||
        Math.abs(rotationState.angleRad) <= AXIS_NUMERIC_EPSILON
      ) {
        return normalizedCandidates;
      }

      // While rotated, the active axis follows the rotation normal and the
      // others turn with it from their directions at rotation start.
      const rotationFrame = gizmo.rotationFrame;
      const frameActiveAxisId =
        rotationFrame?.pointId === movePointId
          ? rotationFrame.activeAxisId
          : gizmo.activeAxisId;
      const rotationAxis = rotationState.normal.clone().normalize();

      return normalizedCandidates.map((candidate) => ({
        ...candidate,
        direction:
          candidate.id === frameActiveAxisId
            ? rotationAxis.clone()
            : (
                rotationFrame?.baseDirections[candidate.id] ??
                candidate.direction
              )
                .clone()
                .applyAxisAngle(rotationAxis, rotationState.angleRad)
                .normalize(),
      }));
    },
    [axisTitle, gizmo, labels]
  );

  const getActiveAxisAtPosition = useCallback(
    (origin: Vector3): AnnotationGizmoAxisCandidate => {
      const candidates = getAxisCandidatesAtPosition(origin);
      if (candidates.length === 0) {
        return {
          id: "vertical",
          direction: getEllipsoidalUpDirectionAtAnchor(origin),
          color: ENU_UP_AXIS_COLOR,
          title: axisTitle ?? labels.verticalAxis,
        };
      }

      const byId = candidates.find(
        (candidate) => candidate.id === gizmo.activeAxisId
      );
      if (byId) return byId;

      const preferredId = gizmo.preferredAxisId;
      const byPreferredAxisId = preferredId
        ? candidates.find((candidate) => candidate.id === preferredId)
        : undefined;
      const overrideDirection = gizmo.axisDirection;
      const normalizedOverride = isUsableDirection(overrideDirection)
        ? overrideDirection.clone().normalize()
        : null;
      const resolved =
        byPreferredAxisId ??
        (normalizedOverride &&
          candidates.find(
            (candidate) =>
              Math.abs(candidate.direction.dot(normalizedOverride)) >
              AXIS_DIRECTION_MATCH_MIN_DOT
          )) ??
        candidates[0];
      gizmo.activeAxisId = resolved.id;
      return resolved;
    },
    [axisTitle, getAxisCandidatesAtPosition, gizmo, labels.verticalAxis]
  );

  const getDiscPlaneNormalAtPosition = useCallback(
    (origin: Vector3): Vector3 => {
      const configuredDiscPlaneNormal = gizmo.discPlaneNormal;
      return isUsableDirection(configuredDiscPlaneNormal)
        ? configuredDiscPlaneNormal.clone().normalize()
        : getActiveAxisAtPosition(origin).direction.clone();
    },
    [getActiveAxisAtPosition, gizmo]
  );

  return {
    getAxisCandidatesAtPosition,
    getActiveAxisAtPosition,
    getDiscPlaneNormalAtPosition,
  };
};
