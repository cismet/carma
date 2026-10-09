import { useEffect, useState } from "react";
import { subscribeMapLibreAnnotationSurfaces } from "@carma-mapping/annotations/maplibre";
import { subscribeSharedAnnotations } from "@carma-mapping/annotations/runtime";
import type { AddonComponentProps } from "../../lib/registry";
import { Measurement3dControl } from "./Measurement3dControl";
import {
  Measurement3dRuntime,
  MEASUREMENT3D_DEFAULTS,
  MEASUREMENT3D_STABLE_TOOL_IDS,
  type Measurement3dConfig,
} from "./Measurement3dRuntime";
import {
  loadMeasurement3dState,
  saveMeasurement3dState,
  useMeasurement3dActions,
  type Measurement3dState,
} from "./measurement3d-state";

export type { Measurement3dConfig, Measurement3dState };
export { MEASUREMENT3D_DEFAULTS, MEASUREMENT3D_STABLE_TOOL_IDS };
export { confirmSharedMeasurementsConflicts } from "./Measurement3dRuntime";
export { Measurement3dInteractionPanel } from "./Measurement3dPanel";
export {
  MEASUREMENT3D_ICON_COLOR,
  MEASUREMENT3D_LAYER,
  MEASUREMENT3D_LAYER_ID,
  MEASUREMENT3D_TEXT,
  MEASUREMENT3D_TOOLS_INTERACTION_ID,
  useMeasurement3dLayerRow,
  type UseMeasurement3dLayerRowOptions,
} from "./measurement3d-layer-row";
export {
  MEASUREMENT3D_STATE_DEFAULT,
  MEASUREMENT3D_STATE_STORAGE_KEY,
  useMeasurement3dActions,
} from "./measurement3d-state";

/**
 * 3D measurements on the MapLibre map: the annotations runtime drawn through
 * the shared Three.js scene, available while a mesh or tileset is drawn
 * there. A route addon: the control-column button, the row the host shows
 * (`useMeasurement3dLayerRow`), the ribbon toolbar and the info box.
 */
export const Measurement3d = ({
  config,
  libreMap,
}: AddonComponentProps<"measurement3d">) => {
  const { isOn, viewHidden, setOn, setAvailable } = useMeasurement3dActions();
  // Whether the map can host the tool: a surface runtime in the shared scene,
  // and the MapLibre view itself on screen.
  const [hasSurfaces, setHasSurfaces] = useState(false);
  useEffect(() => {
    if (!libreMap) {
      setHasSurfaces(false);
      return;
    }
    return subscribeMapLibreAnnotationSurfaces(libreMap, setHasSurfaces);
  }, [libreMap]);
  useEffect(() => {
    setAvailable(hasSurfaces && !viewHidden);
  }, [hasSurfaces, setAvailable, viewHidden]);
  // A launched tool survives a reload: seed from the mirror, then keep it.
  // A shared configuration that carries measurements switches it on as well,
  // so the provider mounts and takes them.
  useEffect(() => {
    const stored = loadMeasurement3dState();
    if (stored?.isOn) setOn(true);
    return subscribeSharedAnnotations(() => {
      console.info("[MEASUREMENT3D] shared measurements pending, switching the tool on");
      setOn(true);
    });
  }, [setOn]);
  useEffect(() => {
    saveMeasurement3dState({ isOn });
  }, [isOn]);
  if (!libreMap) {
    return null;
  }
  return (
    <>
      <Measurement3dControl position={config?.position} order={config?.order} />
      <Measurement3dRuntime map={libreMap} config={config} />
    </>
  );
};
