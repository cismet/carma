import type { Cartesian3Json, Matrix4ConstructorArgs } from "@carma/cesium";
import {
  type AreaLabelText,
  type GroundPolygonPreviewGroup,
  type PlanarPolygonGroup,
  type PlanarPolygonPreviewGroup,
  type PolygonPreviewGroup,
  type VerticalPolygonPreviewGroup,
} from "@carma-mapping/annotations/core";

import type { CssPixelPosition } from "@carma/units/types";

export type PolygonAreaBadge = {
  text: string;
  backgroundColor?: string;
  textColor?: string;
};

type AreaLabelVisualizerCommonOptions = {
  viewProjector: AreaLabelViewProjector;
  focusedPolygonGroupId: string | null;
  polygonAreaBadgeByGroupId: Readonly<Record<string, PolygonAreaBadge>>;
};

export type AreaLabelViewState = {
  width: number;
  height: number;
  cameraPitch: number;
  frameNumber: number | null;
};

export type AreaLabelViewProjector = {
  getViewState: () => AreaLabelViewState | null;
  getViewProjectionMatrix: () => Readonly<Matrix4ConstructorArgs> | null;
  projectWorldToScreen: (point: Cartesian3Json) => CssPixelPosition | null;
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
      vertices: Cartesian3Json[]
    ) => AreaLabelText;
  };
