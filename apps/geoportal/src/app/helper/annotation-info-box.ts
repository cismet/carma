import type { BackgroundLayer, Layer } from "@carma-mapping/layers";
import { resolveAnnotationsRuntimePersistenceFromGeoJson } from "@carma-mapping/annotations/runtime";

import { CESIUM_ANNOTATION_LAYER_ID } from "../components/annotations/cesium-annotations.constants";
import { UIMode } from "../store/slices/ui";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseStyleObject = (style: unknown): Record<string, unknown> | null => {
  if (isRecord(style)) {
    return style;
  }
  if (typeof style !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(style);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const hasAnnotationsGeoJson = (value: unknown): boolean =>
  resolveAnnotationsRuntimePersistenceFromGeoJson(value) !== null;

export const layerHasRuntimeAnnotationsGeoJson = (layer: unknown): boolean => {
  if (!isRecord(layer)) {
    return false;
  }

  const metadata = layer.metadata;
  if (
    isRecord(metadata) &&
    isRecord(metadata.carmaConf) &&
    hasAnnotationsGeoJson(metadata.carmaConf.annotationsGeoJson)
  ) {
    return true;
  }

  const props = layer.props;
  const styleData = parseStyleObject(
    (isRecord(props) ? props.style : undefined) ?? layer.vectorStyle
  );
  if (!styleData) {
    return false;
  }

  const styleMetadata = styleData.metadata;
  if (
    isRecord(styleMetadata) &&
    isRecord(styleMetadata.carmaConf) &&
    hasAnnotationsGeoJson(styleMetadata.carmaConf.annotationsGeoJson)
  ) {
    return true;
  }

  const sources = styleData.sources;
  if (!isRecord(sources)) {
    return false;
  }

  return Object.values(sources).some(
    (source) => isRecord(source) && hasAnnotationsGeoJson(source.data)
  );
};

export const layerUsesRuntimeAnnotationVisibility = (
  layer: BackgroundLayer | Layer
): boolean =>
  layer.id === CESIUM_ANNOTATION_LAYER_ID ||
  layerHasRuntimeAnnotationsGeoJson(layer);

export const shouldShowAnnotationInfoBox = ({
  isCesium,
  layers,
  uiMode,
}: {
  isCesium: boolean;
  layers: readonly (BackgroundLayer | Layer)[];
  uiMode: UIMode;
}): boolean =>
  isCesium &&
  ((uiMode === UIMode.MEASUREMENT &&
    layers.some((layer) => layer.id === CESIUM_ANNOTATION_LAYER_ID)) ||
    layers.some(layerHasRuntimeAnnotationsGeoJson));
