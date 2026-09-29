import maplibregl from "maplibre-gl";
import {
  Raycaster,
  Vector3,
  type Object3D,
  type OrthographicCamera,
} from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { degToRadNumeric } from "@carma-units";
import {
  TILE_CAMERA_PRIORITY,
  TILE_CAMERA_ROLE,
  type SharedThreeSceneLayer,
} from "@carma-mapping/engines/maplibre";
import { MESH_MOUNT_PRESETS, MESH_MOUNT_VIEW } from "./mesh-mount-presets";
import { meshOverlapEye, meshOverlapFlight } from "./mesh-overlap-flight";
import type { MeshMountSharedViewsOptions } from "./mesh-mount-demo-types";

/** Owns the diagnostic flight clock and both camera poses. */
export const createMeshMountFlight = ({
  map,
  layer,
  camera,
  controls,
  canvas,
  cameraId,
  getOptions,
  onCameraUpdated,
}: {
  map: maplibregl.Map;
  layer: SharedThreeSceneLayer;
  camera: OrthographicCamera;
  controls: OrbitControls;
  canvas: HTMLCanvasElement;
  cameraId: string;
  getOptions: () => MeshMountSharedViewsOptions;
  onCameraUpdated: () => void;
}) => {
  const root = MESH_MOUNT_PRESETS[MESH_MOUNT_VIEW.ROOT];
  let disposed = false;
  let flightFrame = 0;
  let flightElapsed = 16;
  let flightLastTime = 0;
  let applyingFlight = false;
  let secondaryFlightZoom: number | null = null;
  const probe = new Raycaster();
  const fly = (now: number) => {
    flightFrame = 0;
    if (disposed || !getOptions().animateOverlap) {
      flightLastTime = 0;
      return;
    }
    if (flightLastTime)
      flightElapsed += Math.min(0.1, (now - flightLastTime) / 1000);
    flightLastTime = now;
    const pose = meshOverlapFlight(flightElapsed);
    const eye = meshOverlapEye(pose.pitch, pose.bearing);
    secondaryFlightZoom = pose.secondaryZoom;
    const metersPerDegree = 111320;
    const longitudeScale =
      metersPerDegree * Math.cos(degToRadNumeric(root.lngLat[1]));
    const lngLat = (offset: readonly [number, number]): [number, number] => [
      root.lngLat[0] + offset[0] / longitudeScale,
      root.lngLat[1] + offset[1] / metersPerDegree,
    ];
    let mainZoom = pose.mainZoom;
    let secondaryZoom = pose.secondaryZoom;
    let surfaceElevation = root.wgs84HeightMeters;
    const mainLngLat = lngLat(pose.mainOffset);
    const secondaryLngLat = lngLat(pose.secondaryOffset);
    const surfaceCandidates: Object3D[] = [];
    if (getOptions().meshOnlyFlight)
      layer.getScene().traverseVisible((object) => {
        if ((object as Object3D & { isMesh?: boolean }).isMesh)
          surfaceCandidates.push(object);
      });
    const surfaceAt = (location: [number, number]) => {
      const point = layer.projectLngLatToScene(
        location,
        root.wgs84HeightMeters
      );
      if (!point) return null;
      probe.set(
        point.clone().add(new Vector3(0, 10000, 0)),
        new Vector3(0, -1, 0)
      );
      probe.near = 0;
      probe.far = 20000;
      return probe.intersectObjects(surfaceCandidates, false)[0]?.point ?? null;
    };
    let secondarySurface: Vector3 | null = null;
    if (getOptions().meshOnlyFlight) {
      // Probe below the eye, not the pitched look-at point: on slopes
      // these are different elevations. Both eyes remain 20 m above mesh.
      const eyeLocation = (offset: readonly [number, number]) =>
        lngLat([offset[0] + eye.east, offset[1] + eye.north]);
      const mainSurface = surfaceAt(eyeLocation(pose.mainOffset));
      const secondaryEyeSurface = surfaceAt(eyeLocation(pose.secondaryOffset));
      secondarySurface = layer.projectLngLatToScene(
        secondaryLngLat,
        root.wgs84HeightMeters
      );
      if (secondarySurface && secondaryEyeSurface)
        secondarySurface.y = secondaryEyeSurface.y;
      // Do not fly blind below unknown geometry while initial coverage loads.
      if (!mainSurface || !secondarySurface || !secondaryEyeSurface) {
        flightLastTime = 0;
        flightFrame = requestAnimationFrame(fly);
        return;
      }
      const origin = layer.projectLngLatToScene(
        mainLngLat,
        root.wgs84HeightMeters
      )!;
      surfaceElevation += mainSurface.y - origin.y;
      const distance = eye.distance;
      const pixelsPerMeter =
        map.getCanvas().clientHeight /
        (2 *
          Math.tan(degToRadNumeric(getOptions().verticalFovDegrees) / 2) *
          distance);
      mainZoom = Math.log2(
        pixelsPerMeter /
          (512 *
            maplibregl.MercatorCoordinate.fromLngLat(
              mainLngLat
            ).meterInMercatorCoordinateUnits())
      );
      secondaryZoom = mainZoom - (pose.mainZoom - pose.secondaryZoom);
      map.setCenterClampedToGround(false);
    }
    secondaryFlightZoom = secondaryZoom;
    map.jumpTo({
      center: mainLngLat,
      zoom: mainZoom,
      elevation: surfaceElevation,
      pitch: pose.pitch,
      bearing: pose.bearing,
    });
    const target =
      secondarySurface ??
      layer.projectLngLatToScene(secondaryLngLat, root.wgs84HeightMeters);
    if (target) {
      const width = Math.max(1, Math.round(canvas.clientWidth));
      const height = Math.max(1, Math.round(canvas.clientHeight));
      const scale =
        maplibregl.MercatorCoordinate.fromLngLat(
          secondaryLngLat
        ).meterInMercatorCoordinateUnits() *
        512 *
        2 ** secondaryZoom;
      const span = width / scale;
      camera.left = -span / 2;
      camera.right = span / 2;
      camera.top = (span * height) / width / 2;
      camera.bottom = -camera.top;
      camera.zoom = 1;
      controls.target.copy(target);
      camera.position
        .copy(target)
        .add(
          new Vector3(
            0,
            getOptions().meshOnlyFlight
              ? 20 / Math.cos(degToRadNumeric(pose.pitch))
              : 5000,
            0
          )
            .applyAxisAngle(
              new Vector3(1, 0, 0),
              Math.max(0.001, degToRadNumeric(pose.pitch))
            )
            .applyAxisAngle(
              new Vector3(0, 1, 0),
              -degToRadNumeric(pose.bearing)
            )
        );
      camera.lookAt(target);
      applyingFlight = true;
      controls.update();
      applyingFlight = false;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      layer.setTileCameraView({
        id: cameraId,
        camera,
        viewport: [width, height],
        errorTargetPixels: getOptions().pixelError,
        role: TILE_CAMERA_ROLE.RECEIVER,
        priority: TILE_CAMERA_PRIORITY.SECONDARY,
      });
      Object.assign(canvas, {
        overlapFlight: {
          ...pose,
          mainZoom,
          secondaryZoom,
          eyeClearanceMeters: getOptions().meshOnlyFlight ? 20 : null,
        },
      });
      onCameraUpdated();
    }
    flightFrame = requestAnimationFrame(fly);
  };

  return {
    get applying() {
      return applyingFlight;
    },
    get secondaryZoom() {
      return secondaryFlightZoom;
    },
    resetSecondaryZoom() {
      secondaryFlightZoom = null;
    },
    update() {
      if (getOptions().animateOverlap && !flightFrame)
        flightFrame = requestAnimationFrame(fly);
      if (!getOptions().animateOverlap) {
        if (flightFrame) cancelAnimationFrame(flightFrame);
        flightFrame = 0;
        flightLastTime = 0;
      }
    },
    dispose() {
      disposed = true;
      if (flightFrame) cancelAnimationFrame(flightFrame);
      flightFrame = 0;
    },
  };
};
