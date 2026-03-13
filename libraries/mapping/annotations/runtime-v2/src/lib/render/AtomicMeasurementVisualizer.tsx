import type {
  RuntimeEdgeRenderModel,
  RuntimePointMarkerRenderModel,
} from "./measurementRenderModels";
import { RuntimePointMarkerVisualizer } from "./RuntimePointMarkerVisualizer";
import { useAtomicMeasurementVisualizer } from "./useAtomicMeasurementVisualizer";
import type { RuntimeScene } from "../types/runtimeScene.types";

type AtomicMeasurementVisualizerProps = {
  scene: RuntimeScene | null;
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
};

export const AtomicMeasurementVisualizer = ({
  scene,
  points,
  edges,
}: AtomicMeasurementVisualizerProps) => {
  useAtomicMeasurementVisualizer({ scene, edges });

  return <RuntimePointMarkerVisualizer scene={scene} points={points} />;
};
