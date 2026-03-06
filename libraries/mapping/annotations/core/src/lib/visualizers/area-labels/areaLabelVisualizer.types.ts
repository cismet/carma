import { type Cartesian3, type Scene } from "@carma/cesium";

import {
  type GroundPolygonPreviewGroup,
  type PlanarPolygonPreviewGroup,
  type PolygonPreviewGroup,
  type VerticalPolygonPreviewGroup,
} from "../../preview/annotationPreviewVisuals";
import { type PlanarPolygonGroup } from "../../types/annotationTypes";

export type PolygonAreaBadge = {
  text: string;
  backgroundColor?: string;
  textColor?: string;
};

export type AreaLabelText = {
  primaryText: string;
  secondaryText?: string | null;
};

type AreaLabelVisualizerCommonOptions = {
  scene: Scene | null;
  focusedPolygonGroupId: string | null;
  polygonAreaBadgeByGroupId: Readonly<Record<string, PolygonAreaBadge>>;
};

export type GroundAreaLabelVisualizerOptions =
  AreaLabelVisualizerCommonOptions & {
    groundPolygonPreviewGroups: GroundPolygonPreviewGroup[];
  };

export type VerticalAreaLabelVisualizerOptions =
  AreaLabelVisualizerCommonOptions & {
    verticalPolygonPreviewGroups: VerticalPolygonPreviewGroup[];
  };

export type PlanarAreaLabelVisualizerOptions =
  AreaLabelVisualizerCommonOptions & {
    planarPolygonPreviewGroups: PlanarPolygonPreviewGroup[];
  };

export type PolygonAreaLabelOverlayBaseOptions =
  AreaLabelVisualizerCommonOptions & {
    overlayPrefix: string;
    polygonPreviewGroups: PolygonPreviewGroup[];
    resolveAreaLabelText: (
      group: PlanarPolygonGroup,
      vertices: Cartesian3[]
    ) => AreaLabelText;
  };
