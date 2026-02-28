import { type Scene } from "@carma/cesium";

import {
  type GroundPolygonPreviewGroup,
  type PlanarPolygonPreviewGroup,
  type PolygonAreaBadge,
  type PolygonPreviewGroup,
  type VerticalPolygonPreviewGroup,
} from "@carma-mapping/annotations/core";

export type CesiumPolygonAreaPrimitivesOptions = {
  scene: Scene | null;
  polygonPreviewGroups: PolygonPreviewGroup[];
  focusedPolygonGroupId: string | null;
};

export type AreaVisualizerCommonOptions = {
  scene: Scene | null;
  focusedPolygonGroupId: string | null;
  polygonAreaBadgeByGroupId: Readonly<Record<string, PolygonAreaBadge>>;
};

export type GroundAreaVisualizerOptions = AreaVisualizerCommonOptions & {
  groundPolygonPreviewGroups: GroundPolygonPreviewGroup[];
};

export type VerticalAreaVisualizerOptions = AreaVisualizerCommonOptions & {
  verticalPolygonPreviewGroups: VerticalPolygonPreviewGroup[];
};

export type PlanarAreaVisualizerOptions = AreaVisualizerCommonOptions & {
  planarPolygonPreviewGroups: PlanarPolygonPreviewGroup[];
};
