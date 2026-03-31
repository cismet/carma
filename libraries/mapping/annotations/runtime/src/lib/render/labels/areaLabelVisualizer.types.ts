import {
  type AreaLabelText,
  type NodeChainAnnotation,
  type PolygonPreviewGroup,
} from "@carma-mapping/annotations/core";
import type { Cartesian3Json, Matrix4ConstructorArgs } from "@carma/cesium";
import type { CssPixelPosition } from "@carma/units/types";
export type PolygonAreaBadge = {
  text: string;
  backgroundColor?: string;
  textColor?: string;
};

type AreaLabelVisualizerCommonOptions = {
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
  AreaLabelVisualizerCommonOptions & {};

export type VerticalAreaLabelVisualizerOptions =
  AreaLabelVisualizerCommonOptions & {};

export type PlanarAreaLabelVisualizerOptions =
  AreaLabelVisualizerCommonOptions & {};

export type PolygonAreaLabelOverlayBaseOptions =
  AreaLabelVisualizerCommonOptions & {
    overlayPrefix: string;
    resolveAreaLabelText: (
      group: NodeChainAnnotation,
      vertices: Cartesian3Json[]
    ) => AreaLabelText;
  };
