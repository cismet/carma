import { PURE_LABEL_DEFAULTS } from "@carma-mapping/annotations/core";

import type {
  RuntimeAddAnnotationOptions,
  RuntimeCoordinate,
  RuntimeNodeLinkId,
  RuntimeMeasurement,
} from "../../store";

export const getDefaultLabelDisplayName = (order: number) =>
  `Beschriftung ${order}`;

export const createDefaultLabelAppearance = (): NonNullable<
  RuntimeAddAnnotationOptions["labelAppearance"]
> => ({
  fontSizePx: PURE_LABEL_DEFAULTS.fontSizePx,
  backgroundColor: PURE_LABEL_DEFAULTS.backgroundColor,
  textColor: PURE_LABEL_DEFAULTS.textColor,
});

export const createLabelMeasurement = ({
  toolType,
  coordinate,
  displayName,
  addAnnotation,
  linkedNodeGroupId,
}: {
  toolType: RuntimeMeasurement["toolType"];
  coordinate: RuntimeCoordinate;
  displayName: string;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    nextCoordinates: readonly RuntimeCoordinate[],
    options?: RuntimeAddAnnotationOptions,
    linkedNodeGroupIds?: readonly (RuntimeNodeLinkId | null | undefined)[]
  ) => RuntimeMeasurement;
  linkedNodeGroupId?: RuntimeNodeLinkId | null;
}) =>
  addAnnotation(
    toolType,
    [coordinate],
    {
      displayName,
      labelAppearance: createDefaultLabelAppearance(),
    },
    [linkedNodeGroupId ?? null]
  );
