import { tween, type TweenHandle } from "./cameraMath";
import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import { Matrix4, Vector3, Vector4 } from "three";
import { acquireSharedThreeScene } from "@carma-mapping/engines/maplibre";
import {
  viewportCenterPlaneAnchor,
  viewportUprightRollCorrectionDeg,
} from "../../core/utils/image-projection";

/** Rotate the shared scene camera, keeping its physical eye and centre anchor when applied live. */
const rotatePreviewCamera = (
  map: MaplibreMap,
  frame: MaplibreMap["transform"],
  anchor: MercatorCoordinate,
  preserveView: boolean,
  rollDeg?: number
): boolean => {
  const scene = acquireSharedThreeScene(map);
  try {
    const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
    if (!origin) return false;
    const originMercator = MercatorCoordinate.fromLngLat(origin),
      scale = originMercator.meterInMercatorCoordinateUnits();
    const sceneToMercator = new Matrix4().set(
      scale,
      0,
      0,
      originMercator.x,
      0,
      0,
      scale,
      originMercator.y,
      0,
      scale,
      0,
      originMercator.z,
      0,
      0,
      0,
      1
    );
    const projection = () =>
      new Matrix4()
        .fromArray(
          frame.getProjectionDataForCustomLayer(true)
            .mainMatrix as unknown as number[]
        )
        .multiply(sceneToMercator);
    const position = anchor.toLngLat();
    const base = scene.layer.projectLngLatToScene(
      [position.lng, position.lat],
      anchor.toAltitude(),
      new Vector3()
    );
    const above = scene.layer.projectLngLatToScene(
      [position.lng, position.lat],
      anchor.toAltitude() + 1,
      new Vector3()
    );
    if (!base || !above) return false;
    const up = above.sub(base),
      matrix = projection();
    const center = viewportCenterPlaneAnchor(matrix, base, up);
    const delta =
      rollDeg === undefined
        ? viewportUprightRollCorrectionDeg(matrix, center, frame, up)
        : rollDeg - frame.roll;
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.00001) return false;
    const eyeLngLat = frame.getCameraLngLat();
    const eyeZ = MercatorCoordinate.fromLngLat(
      frame.center,
      frame.getCameraAltitude()
    ).z;
    frame.setRoll(frame.roll + delta);
    if (preserveView) {
      for (let i = 0; i < 3; i++) {
        const reference = frame.calculateCenterFromCameraLngLatAlt(
          eyeLngLat,
          eyeZ /
            MercatorCoordinate.fromLngLat(
              frame.center
            ).meterInMercatorCoordinateUnits(),
          frame.bearing,
          frame.pitch
        );
        frame.setCenter(reference.center);
        frame.setElevation(reference.elevation);
        frame.setZoom(reference.zoom);
      }
      for (let i = 0; i < 2; i++) {
        const p = new Vector4(center.x, center.y, center.z, 1).applyMatrix4(
          projection()
        );
        if (!p.w) break;
        const dx = (-p.x / p.w) * frame.width,
          dy = (p.y / p.w) * frame.height;
        const horizontal = frame.padding.left - frame.padding.right + dx;
        const vertical = frame.padding.top - frame.padding.bottom + dy;
        frame.setPadding({
          left: Math.max(0, horizontal),
          right: Math.max(0, -horizontal),
          top: Math.max(0, vertical),
          bottom: Math.max(0, -vertical),
        });
      }
    }
    return true;
  } finally {
    scene.release();
  }
};

export const uprightPreviewCamera = (
  map: MaplibreMap,
  frame: MaplibreMap["transform"],
  anchor: MercatorCoordinate,
  preserveView = false,
  coversViewport?: (frame: MaplibreMap["transform"]) => boolean
): boolean => {
  if (!coversViewport)
    return rotatePreviewCamera(map, frame, anchor, preserveView);
  // Always make the decision from the same neutral camera, including after a
  // previous correction. Checking only the current roll would oscillate at edges.
  const neutral = frame.clone();
  setPreviewCameraRoll(map, neutral, anchor, 0);
  const corrected = neutral.clone();
  rotatePreviewCamera(map, corrected, anchor, true);
  const allowed = coversViewport(neutral) && coversViewport(corrected);
  return rotatePreviewCamera(
    map,
    frame,
    anchor,
    preserveView,
    allowed ? corrected.roll : 0
  );
};

export const setPreviewCameraRoll = (
  map: MaplibreMap,
  frame: MaplibreMap["transform"],
  anchor: MercatorCoordinate,
  rollDeg: number
): boolean => rotatePreviewCamera(map, frame, anchor, true, rollDeg);

/** Only a paradigm toggle animates; candidate navigation retains its atomic endpoint. */
export const tweenPreviewCameraUpright = (
  map: MaplibreMap,
  anchor: MercatorCoordinate,
  enabled: boolean,
  onComplete?: () => void,
  coversViewport?: (frame: MaplibreMap["transform"]) => boolean
): TweenHandle | undefined => {
  const from = map.transform.clone();
  const target = from.clone();
  const changed = enabled
    ? uprightPreviewCamera(map, target, anchor, true, coversViewport)
    : setPreviewCameraRoll(map, target, anchor, 0);
  if (!changed) {
    onComplete?.();
    return;
  }
  const delta = ((target.roll - from.roll + 540) % 360) - 180;
  return tween({
    from: 0,
    to: 1,
    durationMs: 250,
    easing: (progress) => progress * progress * (3 - 2 * progress),
    onUpdate: (progress) => {
      const frame = from.clone();
      setPreviewCameraRoll(map, frame, anchor, from.roll + delta * progress);
      map.jumpTo(
        {
          center: frame.center,
          zoom: frame.zoom,
          pitch: frame.pitch,
          bearing: frame.bearing,
          roll: frame.roll,
          elevation: frame.elevation,
          padding: frame.padding,
        },
        { obliqueFov: true, obliqueUpright: true }
      );
    },
    onComplete,
  });
};
