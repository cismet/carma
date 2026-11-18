import {
  ENU_EAST_AXIS_COLOR,
  ENU_NORTH_AXIS_COLOR,
  ENU_UP_AXIS_COLOR,
} from "./point-move-gizmo-constants";
import type { PointMoveGizmoLabels } from "./point-move-gizmo.types";

const DEFAULT_AXIS_PRESENTATION = [
  { id: "vertical", color: ENU_UP_AXIS_COLOR, labelKey: "verticalAxis" },
  { id: "horizontal-east", color: ENU_EAST_AXIS_COLOR, labelKey: "eastAxis" },
  {
    id: "horizontal-north",
    color: ENU_NORTH_AXIS_COLOR,
    labelKey: "northAxis",
  },
] as const;

export type PointMoveGizmoDefaultAxisId =
  (typeof DEFAULT_AXIS_PRESENTATION)[number]["id"];

// Keep the full ENU presentation available while tools expose height only.
const DEFAULT_ENABLED_AXIS_IDS: readonly string[] = ["vertical"];

export const isDefaultAxisEnabled = (axisId: string): boolean =>
  DEFAULT_ENABLED_AXIS_IDS.includes(axisId);

/** Id, colour and title of the ENU default axes; `axisTitle` names the vertical one. */
export const getDefaultAxisPresentation = (
  labels: PointMoveGizmoLabels,
  axisTitle?: string | null
) =>
  DEFAULT_AXIS_PRESENTATION.map((axisDefinition) => ({
    id: axisDefinition.id,
    color: axisDefinition.color,
    title:
      axisDefinition.id === "vertical" && axisTitle
        ? axisTitle
        : labels[axisDefinition.labelKey],
  }));

export const getEnabledDefaultAxisPresentation = (
  labels: PointMoveGizmoLabels,
  axisTitle?: string | null
) =>
  getDefaultAxisPresentation(labels, axisTitle).filter((axisDefinition) =>
    isDefaultAxisEnabled(axisDefinition.id)
  );
