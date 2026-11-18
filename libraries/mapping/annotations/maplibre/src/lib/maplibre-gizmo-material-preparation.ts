import { Matrix4, Vector3 } from "three";
import { ecefFromGeographicCoordinate } from "@carma-geo/proj";
import type { AnnotationScenePrimitiveHandle } from "@carma-mapping/annotations/core";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import { createMapLibreSceneCone } from "./maplibre-scene-cone";
import { createMapLibreSceneLineCollection } from "./maplibre-scene-lines";
import { createMapLibreSceneDisc } from "./maplibre-scene-primitives";

/** Keep invisible instances of the gizmo's shader variants alive so opening
 * it reuses prepared programs. They never render or participate in picking. */
export const prepareMapLibreGizmoMaterials = (
  scene: MapLibreAnnotationScene
): (() => void) => {
  let lines: ReturnType<typeof createMapLibreSceneLineCollection> | null = null;
  const primitives: AnnotationScenePrimitiveHandle[] = [];
  const unsubscribe = scene.subscribeFrameUpdate(() => {
    if (lines || scene.isDisposed()) return;
    const center = scene.map.getCenter();
    const anchor = ecefFromGeographicCoordinate({
      longitude: center.lng,
      latitude: center.lat,
      altitude: 0,
    });
    const modelMatrix = new Matrix4().setPosition(anchor);
    lines = createMapLibreSceneLineCollection(scene);
    for (const segmentPairs of [false, true]) {
      lines.addLine({
        id: `annotation-gizmo-preparation-${segmentPairs}`,
        positions: [anchor, anchor.clone().add(new Vector3(1, 0, 0))],
        color: "#ffffff",
        width: 1,
        occludedDashed: true,
        halo: true,
        segmentPairs,
        visible: false,
      });
    }
    const disc = createMapLibreSceneDisc(scene, {
      id: "annotation-disc-preparation",
      radius: 1,
      color: "#ffffff",
      modelMatrix,
      occludable: true,
    });
    const cone = createMapLibreSceneCone(scene, {
      id: "annotation-cone-preparation",
      color: "#ffffff",
      outlineColor: "#000000",
      modelMatrix,
    });
    for (const primitive of [disc, cone]) {
      primitive.setVisible(false);
      primitives.push(primitive);
    }
    scene.prepareMaterials();
  });
  return () => {
    unsubscribe();
    lines?.destroy();
    lines = null;
    for (const primitive of primitives) primitive.destroy();
    primitives.length = 0;
  };
};
