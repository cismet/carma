import type { RuntimeScene } from "../types/runtimeScene.types";
import type {
  RuntimeEdgeRenderModel,
  RuntimePointMarkerRenderModel,
} from "./measurementRenderModels";
import { RuntimePointMarkerVisualizer } from "./RuntimePointMarkerVisualizer";
import { useMeasurementPrimitivesVisualizer } from "./useMeasurementPrimitivesVisualizer";
type MeasurementPrimitivesVisualizerProps = {
  scene: RuntimeScene | null;
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
};

export const MeasurementPrimitivesVisualizer = ({
  scene,
  points,
  edges,
}: MeasurementPrimitivesVisualizerProps) => {
  useMeasurementPrimitivesVisualizer({ scene, edges });

  return <RuntimePointMarkerVisualizer scene={scene} points={points} />;
};
