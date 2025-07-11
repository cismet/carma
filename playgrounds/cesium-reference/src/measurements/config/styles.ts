import {
  Color,
  PolylineArrowMaterialProperty,
  PolylineDashMaterialProperty,
  PolylineGlowMaterialProperty,
} from "cesium";

type PolylineMaterial =
  | Color
  | PolylineDashMaterialProperty
  | PolylineArrowMaterialProperty
  | PolylineGlowMaterialProperty;

type TraverseStyleConfig = {
  lineWidth?: number;
  lineMaterial?: PolylineMaterial;
  stemLineWidth?: number;
  stemLineMaterial?: PolylineMaterial;
  previewLineMaterial?: PolylineMaterial;
};

const traverseStyleConfig: TraverseStyleConfig = {
  lineWidth: 2,
  lineMaterial: Color.WHITE,
  stemLineWidth: 0.25,
  stemLineMaterial: Color.WHITE,
  previewLineMaterial: Color.YELLOW.withAlpha(0.8),
};
