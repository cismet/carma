import { Color } from "@carma-cesium";

import {
  RUNTIME_POLYGON_FILL_PLACEMENT,
  type RuntimeEdgeRenderModel,
  type RuntimePolygonFillPlacement,
} from "../render/annotation-render-models";

export type AreaOcclusionStyleOptions = {
  fill?: {
    overlay?: boolean;
    overlayAlphaMultiplier?: number;
  };
  line?: {
    overlayDashed?: boolean;
  };
};

export type ResolvedAreaOcclusionStyleOptions = {
  fill: {
    overlay: boolean;
    overlayAlphaMultiplier: number;
  };
  line: {
    overlayDashed: boolean;
  };
};

export type AreaOcclusionLineRenderOptions = Pick<
  RuntimeEdgeRenderModel,
  "overlayDashed"
>;

export const AREA_OCCLUSION_STYLE_DEFAULTS =
  Object.freeze<ResolvedAreaOcclusionStyleOptions>({
    fill: {
      overlay: false,
      overlayAlphaMultiplier: 0.5,
    },
    line: {
      overlayDashed: false,
    },
  });

export const resolveAreaOcclusionStyleOptions = (
  options?: AreaOcclusionStyleOptions,
  defaults: ResolvedAreaOcclusionStyleOptions = AREA_OCCLUSION_STYLE_DEFAULTS
): ResolvedAreaOcclusionStyleOptions => ({
  fill: {
    ...defaults.fill,
    ...options?.fill,
  },
  line: {
    overlayDashed: options?.line?.overlayDashed ?? defaults.line.overlayDashed,
  },
});

export const isCoplanarPolygonFillPlacement = (
  placement?: RuntimePolygonFillPlacement
) =>
  (placement ?? RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR) ===
  RUNTIME_POLYGON_FILL_PLACEMENT.COPLANAR;

export const resolveAreaOcclusionLineRenderOptions = (
  options: ResolvedAreaOcclusionStyleOptions
): AreaOcclusionLineRenderOptions | undefined => {
  const lineOptions: AreaOcclusionLineRenderOptions = {
    ...(options.line.overlayDashed ? { overlayDashed: true as const } : {}),
  };

  return lineOptions.overlayDashed ? lineOptions : undefined;
};

export const resolveAreaOverlayFillColor = (
  fill: string,
  options: ResolvedAreaOcclusionStyleOptions
) => {
  const color = Color.fromCssColorString(fill);
  if (!color) {
    return fill;
  }

  color.alpha *= options.fill.overlayAlphaMultiplier;
  return color.toCssColorString();
};
