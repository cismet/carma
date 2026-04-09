import {
  PURE_LABEL_DEFAULT_BACKGROUND_COLOR,
  PURE_LABEL_DEFAULT_FONT_SIZE_PX,
  PURE_LABEL_DEFAULT_TEXT_COLOR,
} from "@carma-mapping/annotations/core";

import type {
  RuntimeAddAnnotationOptions,
  RuntimeCoordinate,
  RuntimeMeasurement,
} from "../../store";

export const getDefaultLabelDisplayName = (order: number) =>
  `Beschriftung ${order}`;

export const createDefaultLabelAppearance = (): NonNullable<
  RuntimeAddAnnotationOptions["labelAppearance"]
> => ({
  fontSizePx: PURE_LABEL_DEFAULT_FONT_SIZE_PX,
  backgroundColor: PURE_LABEL_DEFAULT_BACKGROUND_COLOR,
  textColor: PURE_LABEL_DEFAULT_TEXT_COLOR,
});

export const createLabelMeasurement = ({
  toolType,
  coordinate,
  displayName,
  addAnnotation,
}: {
  toolType: RuntimeMeasurement["toolType"];
  coordinate: RuntimeCoordinate;
  displayName: string;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    nextCoordinates: readonly RuntimeCoordinate[],
    options?: RuntimeAddAnnotationOptions
  ) => RuntimeMeasurement;
}) =>
  addAnnotation(toolType, [coordinate], {
    displayName,
    labelAppearance: createDefaultLabelAppearance(),
  });
