import { useEffect, useState } from "react";
import type { Scene } from "@carma-cesium";
import type { AnnotationEngine } from "@carma-mapping/annotations/core";

import { createCesiumAnnotationEngine } from "./create-cesium-annotation-engine";

type OwnedEngine = { engine: AnnotationEngine; scene: Scene };

/**
 * One engine per scene instance, created once the host has mounted and
 * disposed when the scene changes or the host unmounts. Created in an effect,
 * so a remount builds a fresh engine instead of reviving a disposed one.
 */
export const useCesiumAnnotationEngine = (
  scene: Scene | null
): AnnotationEngine | null => {
  const [owned, setOwned] = useState<OwnedEngine | null>(null);
  useEffect(() => {
    if (!scene || scene.isDestroyed()) return;
    const engine = createCesiumAnnotationEngine(scene);
    setOwned({ engine, scene });
    return () => {
      engine.dispose();
      setOwned(null);
    };
  }, [scene]);
  return owned && owned.scene === scene ? owned.engine : null;
};
