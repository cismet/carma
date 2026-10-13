import { useEffect, useState } from "react";
import { subscribeMapLibreAnnotationSurfaces } from "@carma-mapping/annotations/maplibre";
import { subscribeSharedAnnotations } from "@carma-mapping/annotations/runtime";
import type { AddonComponentProps } from "../../lib/registry";
import { Measurement3dControl } from "./Measurement3dControl";
import { Measurement3dRuntime } from "./Measurement3dRuntime";
import { useMeasurement3dActions } from "./measurement3d-state";
import {
  loadMeasurement3dState,
  saveMeasurement3dState,
} from "./measurement3d-storage";

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
  // the map can host the tool when a surface runtime lives in the shared scene
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
  // The tool survives a reload (seeded from the mirror); a shared
  // configuration carrying measurements switches it on so the provider takes them.
  useEffect(() => {
    if (loadMeasurement3dState()?.isOn) setOn(true);
    return subscribeSharedAnnotations(() => setOn(true));
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
