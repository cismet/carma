import { type Scene } from "@carma/cesium";
import {
  useCesiumCoplanarPolygonPrimitives,
  useCesiumGroundPolygonPrimitives,
  useCesiumViewProjector,
} from "@carma-mapping/annotations/cesium";
import type {
  GroundPolygonPreviewGroup,
  PlanarPolygonPreviewGroup,
  VerticalPolygonPreviewGroup,
} from "@carma-mapping/annotations/core";

import type {
  CoplanarPolygonPrimitiveRenderModel,
  GroundPolygonPrimitiveRenderModel,
} from "../annotationVisualization.types";
import {
  type PolygonAreaBadge,
  useGroundAreaLabelVisualizer,
  usePlanarAreaLabelVisualizer,
  useVerticalAreaLabelVisualizer,
} from "./labels";

export type AreaMeasurementVisualizerAdapterOptions = {
  scene: Scene | null;
  enabled?: boolean;
  focusedPolygonGroupId: string | null;
  polygonAreaBadgeByGroupId: Readonly<Record<string, PolygonAreaBadge>>;
  groundPolygonPreviewGroups: readonly GroundPolygonPreviewGroup[];
  verticalPolygonPreviewGroups: readonly VerticalPolygonPreviewGroup[];
  planarPolygonPreviewGroups: readonly PlanarPolygonPreviewGroup[];
  groundPolygonPrimitives: readonly GroundPolygonPrimitiveRenderModel[];
  verticalPolygonPrimitives: readonly CoplanarPolygonPrimitiveRenderModel[];
  planarPolygonPrimitives: readonly CoplanarPolygonPrimitiveRenderModel[];
};

export const useAreaMeasurementVisualizerAdapter = ({
  scene,
  enabled = true,
  focusedPolygonGroupId,
  polygonAreaBadgeByGroupId,
  groundPolygonPreviewGroups,
  verticalPolygonPreviewGroups,
  planarPolygonPreviewGroups,
  groundPolygonPrimitives,
  verticalPolygonPrimitives,
  planarPolygonPrimitives,
}: AreaMeasurementVisualizerAdapterOptions) => {
  const viewProjector = useCesiumViewProjector(scene);
  const visibleGroundPolygonPreviewGroups = enabled
    ? [...groundPolygonPreviewGroups]
    : [];
  const visibleVerticalPolygonPreviewGroups = enabled
    ? [...verticalPolygonPreviewGroups]
    : [];
  const visiblePlanarPolygonPreviewGroups = enabled
    ? [...planarPolygonPreviewGroups]
    : [];
  const visibleGroundPolygonPrimitives = enabled ? groundPolygonPrimitives : [];
  const visibleVerticalPolygonPrimitives = enabled
    ? verticalPolygonPrimitives
    : [];
  const visiblePlanarPolygonPrimitives = enabled ? planarPolygonPrimitives : [];

  useGroundAreaLabelVisualizer({
    viewProjector,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    groundPolygonPreviewGroups: visibleGroundPolygonPreviewGroups,
  });

  useVerticalAreaLabelVisualizer({
    viewProjector,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    verticalPolygonPreviewGroups: visibleVerticalPolygonPreviewGroups,
  });

  usePlanarAreaLabelVisualizer({
    viewProjector,
    focusedPolygonGroupId,
    polygonAreaBadgeByGroupId,
    planarPolygonPreviewGroups: visiblePlanarPolygonPreviewGroups,
  });

  useCesiumGroundPolygonPrimitives(visibleGroundPolygonPrimitives);
  useCesiumCoplanarPolygonPrimitives(visibleVerticalPolygonPrimitives);
  useCesiumCoplanarPolygonPrimitives(visiblePlanarPolygonPrimitives);
};
