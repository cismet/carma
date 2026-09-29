import { useEffect, type RefObject } from "react";
import { radToDegNumeric } from "@carma-units";
import type { Map as MapLibreMap } from "maplibre-gl";

import type { ReferencePhysicalCameraPose } from "./reference-camera-presets";
import {
  sampleGcg2016Field,
  type Gcg2016ShaderField,
} from "./reference-gcg2016-field";
import {
  mutableLngLat,
  projectGeodeticToScene,
  type ReferenceFrame,
} from "./reference-surface-frame";
import { TERRAIN_GEOMETRY_MODE } from "./reference-surface-types";

type ReferenceCameraOptions = Readonly<{
  bearing: number;
  fovDegrees: number;
  latitude: number;
  longitude: number;
  pitch: number;
  showShadowSimulation: boolean;
  zoom: number;
}>;

export const useReferencePhysicalCamera = (
  map: MapLibreMap | null,
  mapRef: RefObject<MapLibreMap | null>,
  frame: ReferenceFrame,
  gcgField: Gcg2016ShaderField | null,
  physicalCameraPose: ReferencePhysicalCameraPose | null,
  terrainRuntimeMounted: boolean,
  options: ReferenceCameraOptions
) => {
  useEffect(() => {
    if (!map || map !== mapRef.current) return;
    map.setVerticalFieldOfView(options.fovDegrees);
    if (
      physicalCameraPose &&
      options.showShadowSimulation &&
      !terrainRuntimeMounted
    ) {
      return;
    }
    const applyCamera = () => {
      if (physicalCameraPose) {
        if (!gcgField) return;
        const undulationMeters = sampleGcg2016Field(
          gcgField,
          frame,
          physicalCameraPose.eyeLngLat[0],
          physicalCameraPose.eyeLngLat[1]
        );
        const eyeHeight =
          physicalCameraPose.eyeNormalHeightMeters + undulationMeters;
        const targetHeight =
          physicalCameraPose.targetNormalHeightMeters +
          sampleGcg2016Field(
            gcgField,
            frame,
            ...physicalCameraPose.targetLngLat
          );
        const eye = projectGeodeticToScene(
          frame,
          ...physicalCameraPose.eyeLngLat,
          eyeHeight,
          TERRAIN_GEOMETRY_MODE.WGS84_ECEF
        );
        const direction = projectGeodeticToScene(
          frame,
          ...physicalCameraPose.targetLngLat,
          targetHeight,
          TERRAIN_GEOMETRY_MODE.WGS84_ECEF
        ).sub(eye);
        const bearing = radToDegNumeric(Math.atan2(direction.x, -direction.z));
        const pitch = Math.min(
          89.9,
          90 +
            radToDegNumeric(
              Math.atan2(direction.y, Math.hypot(direction.x, direction.z))
            )
        );
        map.jumpTo(
          map.calculateCameraOptionsFromCameraLngLatAltRotation(
            mutableLngLat(physicalCameraPose.eyeLngLat),
            eyeHeight,
            bearing,
            pitch,
            0
          )
        );
        return;
      }
      map.jumpTo({
        center: [options.longitude, options.latitude],
        zoom: options.zoom,
        pitch: options.pitch,
        bearing: options.bearing,
        elevation: 200,
      });
    };

    // ShadowSimulationView configures MapLibre terrain in its own mount effect.
    // Apply the physical camera on the following frame so that terrain setup
    // cannot reset the explicitly calculated target elevation to sea level.
    let cameraFrame = 0;
    const scheduleCamera = () => {
      window.cancelAnimationFrame(cameraFrame);
      cameraFrame = window.requestAnimationFrame(applyCamera);
    };
    scheduleCamera();
    if (physicalCameraPose && options.showShadowSimulation) {
      map.on("terrain", scheduleCamera);
    }
    return () => {
      window.cancelAnimationFrame(cameraFrame);
      map.off("terrain", scheduleCamera);
    };
  }, [
    frame,
    gcgField,
    map,
    options.bearing,
    options.fovDegrees,
    options.latitude,
    options.longitude,
    options.pitch,
    options.showShadowSimulation,
    options.zoom,
    physicalCameraPose,
    terrainRuntimeMounted,
  ]);
};
