import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
import { jumpMapLibreCameraWithFov } from "@carma-mapping/engines/maplibre";
import { Easing } from "@carma-commons/math";
import type { AnimationConfig } from "../../core/types";
import type { CameraFlight } from "./obliqueCamera";
import { capObliqueAnimationDuration, tween } from "./cameraMath";
import { restoreCenterOnGround } from "./flyToImage";

type Center = { longitude: number; latitude: number };

/** Translate the browsing view by the selected footprint-centre displacement. */
export const panBrowsingCamera = (
  map: MaplibreMap,
  from: Center,
  to: Center,
  animation: AnimationConfig
): CameraFlight => {
  const source = MercatorCoordinate.fromLngLat([from.longitude, from.latitude]);
  const target = MercatorCoordinate.fromLngLat([to.longitude, to.latitude]);
  const center = MercatorCoordinate.fromLngLat(map.getCenter());
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const camera = {
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    roll: map.transform.roll,
    elevation: map.getCenterElevation(),
    padding: map.getPadding(),
  };
  const fov = map.getVerticalFieldOfView();
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    restoreCenterOnGround(map);
    resolveDone();
  };
  map.stop();
  map.setCenterClampedToGround(false);
  const flight = tween({
    from: 0,
    to: 1,
    durationMs: capObliqueAnimationDuration(animation.duration ?? 100),
    delayMs: animation.delay,
    easing: animation.easingFunction ?? Easing.LINEAR_NONE,
    onUpdate: (progress) =>
      jumpMapLibreCameraWithFov(
        map,
        {
          ...camera,
          center: new MercatorCoordinate(
            center.x + dx * progress,
            center.y + dy * progress
          ).toLngLat(),
        },
        fov,
        { obliqueFov: true, carmaCameraIntermediate: true }
      ),
    onComplete: finish,
  });
  return {
    done,
    cancel: () => {
      if (finished) return;
      finished = true;
      flight.cancel();
      map.setCenterClampedToGround(true);
      resolveDone();
    },
  };
};
