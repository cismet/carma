import { interactionProfile } from "./interaction-profile";
import {
  MercatorCoordinate,
  type Map as MaplibreMap,
  type PaddingOptions,
} from "maplibre-gl";
import { Matrix3, Matrix4, Vector3, Vector4 } from "three";
import {
  degToRadNumeric,
  radToDegNumeric,
  type Degrees,
  type Radians,
} from "@carma-units";
import {
  readLongerEdgeFovFromIntrinsics,
  readLongerEdgeFovFromMetersPerCssPixel,
  readMetersPerCssPixel,
  readVerticalFovFromLongerEdge,
  readDollyCompensatedRange,
} from "@carma-commons/camera/model";

import { Easing, clamp } from "@carma-commons/math";
import type { Altitude, Coordinates } from "@carma-geo/data-structures";
import { ellipsoidalToDhhn2016Height } from "@carma-geo/proj";

import type {
  AnimationConfig,
  ObliqueDataset,
  ObliqueHeightDatum,
  ObliqueImageRecord,
  ObliquePose,
} from "../../core/types";
import {
  capObliqueAnimationDuration,
  dynamicDurationMs,
  groundDistanceM,
  tween,
} from "./cameraMath";
import { getCameraCalibration } from "../../core/utils/calibration";
import type { PreviewImageGeometry } from "../../core/utils/preview-pan-bounds";
import { computePose } from "../../core/utils/exteriorOrientation";
import { setFov, whenMoveEnds, type CameraFlight } from "./obliqueCamera";

/**
 * The flight to an image: the camera to the perspective centre, looking
 * the way the image was shot.
 *
 * MapLibre places a camera by centre, zoom, bearing and pitch, and works
 * the centre out from the camera on a plane at the centre's elevation.
 * With the centre clamped to the ground that elevation follows the terrain
 * tiles as they arrive, and the camera with it. The flight therefore takes
 * the centre off the ground for its duration and the preview's, so the
 * pose stays what was asked for; the viewer puts it back on the way out.
 */

/** the flight strips were flown in UTM zone 32 */
const UTM_ZONE = 32;

/** metres of camera error a landed flight is allowed before a corrective jump */
const CAMERA_TOLERANCE_M = 0.5;
const ANGLE_TOLERANCE_DEG = 0.05;
const MAX_CORRECTIONS = 3;

/** the pose of a record, computed on first use and kept on the record */
export const poseOf = (
  record: ObliqueImageRecord,
  dataset: ObliqueDataset
): ObliquePose => {
  if (!record.pose) {
    const calibration = getCameraCalibration(dataset, record.cameraId);
    record.pose = computePose(
      record,
      [record.centerWGS84[0], record.centerWGS84[1]],
      calibration.upMapping,
      calibration.imageUpInCamera
    );
  }
  return record.pose;
};

/**
 * The altitude the camera flies to: the served z, in the terrain's frame.
 * A dataset whose z is ellipsoidal is brought down by the geoid undulation
 * first; the offset is for fine tuning against a building edge.
 */
export const resolveCameraAltitude = async (
  record: ObliqueImageRecord,
  heightDatum: ObliqueHeightDatum,
  heightOffset: number,
  allowUnverifiedSourceHeight = false
): Promise<number> => {
  if (
    heightDatum === "unknown" &&
    allowUnverifiedSourceHeight &&
    import.meta.env.DEV
  )
    return record.z + heightOffset;
  if (heightDatum === "unknown")
    throw new Error(
      "Der Höhenbezug dieser Bildserie ist noch ungeklärt. Eine ausgerichtete Vorschau ist deshalb noch nicht verfügbar."
    );
  if (heightDatum === "ellipsoidal") {
    const coordinate = {
      east: record.x,
      north: record.y,
      zone: UTM_ZONE,
    } as unknown as Coordinates.ETRS89UTM;
    const height = await ellipsoidalToDhhn2016Height(
      coordinate,
      record.z as unknown as Altitude.EllipsoidalWGS84Meters
    );
    return Number(height) + heightOffset;
  }
  return record.z + heightOffset;
};

const angleDifferenceDeg = (a: number, b: number): number => {
  const diff = Math.abs(((a - b) % 360) + 360) % 360;
  return diff > 180 ? 360 - diff : diff;
};

/** how far the camera is from where it should stand, metres */
const cameraErrorM = (
  map: MaplibreMap,
  pose: ObliquePose,
  altitude: number
): number => {
  const camera = map.transform.getCameraLngLat();
  return Math.hypot(
    groundDistanceM(camera, { lng: pose.longitude, lat: pose.latitude }),
    map.transform.getCameraAltitude() - altitude
  );
};

/**
 * Fly the camera to a pose. `dynamicDuration` derives the duration from the
 * distance, capped at the animation's own; a sibling hop is short, a flight
 * across town is not.
 */
export const flyToPose = (
  map: MaplibreMap,
  pose: ObliquePose,
  altitude: number,
  animation: AnimationConfig | undefined,
  {
    dynamicDuration = true,
    anchor,
    screenPoint,
    maxFovDeg,
    preview,
    centerPreview = false,
  }: {
    dynamicDuration?: boolean;
    anchor?: MercatorCoordinate;
    screenPoint?: { x: number; y: number };
    maxFovDeg?: number;
    preview?: PreviewImageGeometry;
    centerPreview?: boolean;
  } = {}
): CameraFlight => {
  // The roll has to be passed even though the map stays unrolled: MapLibre
  // 5.18 hands it back as given, `undefined` included, and `jumpTo` and
  // `easeTo` turn that into a NaN roll. The camera's matrices then cannot be
  // inverted, the move throws, and the requested camera state it leaves
  // behind fails every move after it.
  const cameraOptions = () =>
    map.calculateCameraOptionsFromCameraLngLatAltRotation(
      [pose.longitude, pose.latitude],
      altitude,
      pose.bearingDeg,
      pose.pitchDeg,
      0
    );

  const maxDuration = capObliqueAnimationDuration(animation?.duration ?? 500);
  const angularDuration =
    120 +
    3 *
      Math.max(
        angleDifferenceDeg(map.getBearing(), pose.bearingDeg),
        Math.abs(map.getPitch() - pose.pitchDeg)
      );
  const duration = dynamicDuration
    ? Math.min(
        maxDuration,
        Math.max(
          angularDuration,
          dynamicDurationMs(cameraErrorM(map, pose, altitude), maxDuration)
        )
      )
    : maxDuration;
  const easing = animation?.easingFunction ?? Easing.LINEAR_NONE;

  if (anchor)
    return settleToPitch(map, pose.pitchDeg, {
      anchor,
      screenPoint,
      camera: { pose, altitude },
      maxFovDeg,
      preview,
      centerPreview,
      durationMs: duration,
      restoreGround: false,
    });

  map.setCenterClampedToGround(false);
  map.easeTo({ ...cameraOptions(), duration, easing, essential: true });

  const done = whenMoveEnds(map, duration).then(() => {
    // an ease the user interrupted, or one the terrain moved under, lands
    // off the pose; a jump from where the camera is now settles it
    for (let attempt = 0; attempt < MAX_CORRECTIONS; attempt++) {
      const positionOk = cameraErrorM(map, pose, altitude) < CAMERA_TOLERANCE_M;
      const anglesOk =
        angleDifferenceDeg(map.getBearing(), pose.bearingDeg) <
          ANGLE_TOLERANCE_DEG &&
        Math.abs(map.getPitch() - pose.pitchDeg) < ANGLE_TOLERANCE_DEG;
      if (positionOk && anglesOk) break;
      map.jumpTo(cameraOptions(), { obliqueFov: true });
    }
  });

  return { done, cancel: () => map.stop() };
};

/**
 * Put the centre back on the ground without moving the camera: the centre
 * and zoom are re-solved for the terrain under the current view first, so
 * clamping finds nothing to correct.
 */
export const restoreCenterOnGround = (map: MaplibreMap): void => {
  const terrain = map.terrain;
  if (terrain) {
    map.transform.recalculateZoomAndCenter(terrain);
  }
  map.setCenterClampedToGround(true);
  map.jumpTo(
    {
      center: map.getCenter(),
      zoom: map.getZoom(),
      elevation: map.getCenterElevation(),
    },
    { obliqueFov: true }
  );
};

/**
 * Track one rendered point while cancelling the projection offset. Dolly
 * compensation uses its optical depth, not the distance to the map centre.
 * The camera can travel in its plane without changing the target's pixel scale;
 * only a browsing zoom bound permits an unavoidable reduction in that scale.
 * Visual fixture: stories/mapping/maplibre/off-center-pan-cancellation.stories.tsx.
 */
export const settleToPitch = (
  map: MaplibreMap,
  pitchDeg: number,
  {
    fovDeg = map.getVerticalFieldOfView() as Degrees,
    padding = map.getPadding(),
    maxZoom = map.getMaxZoom(),
    durationMs = 450,
    anchor,
    screenPoint,
    restoreGround = true,
    camera,
    maxFovDeg = 110,
    preview,
    centerPreview = false,
  }: {
    fovDeg?: Degrees;
    padding?: PaddingOptions;
    maxZoom?: number;
    durationMs?: number;
    anchor?: MercatorCoordinate;
    screenPoint?: { x: number; y: number };
    restoreGround?: boolean;
    /** Fixed image-camera destination; the projection follows the anchor. */
    camera?: { pose: ObliquePose; altitude: number };
    maxFovDeg?: number;
    preview?: PreviewImageGeometry;
    centerPreview?: boolean;
  } = {}
): CameraFlight => {
  map.stop();
  const from = map.transform.clone();
  const viewportPoint = from.centerPoint.clone();
  viewportPoint.x = screenPoint?.x ?? from.width / 2;
  viewportPoint.y = screenPoint?.y ?? from.height / 2;
  const groundTarget =
    anchor?.toLngLat() ?? map.unproject([viewportPoint.x, viewportPoint.y]);
  const groundHeight =
    map.queryTerrainElevation(groundTarget) ?? from.elevation;
  const target =
    anchor ?? MercatorCoordinate.fromLngLat(groundTarget, groundHeight);
  const targetHeight = target.toAltitude();
  const startFovRad = degToRadNumeric(from.fov);
  const targetFovRad = degToRadNumeric(fovDeg);
  const viewport = {
    viewportWidthPx: from.width,
    viewportHeightPx: from.height,
  };
  const mercatorUnitsPerMeter = from.pixelsPerMeter / from.worldSize;
  const readDepth = (frame: typeof from): number =>
    new Vector4(
      target.x * frame.worldSize,
      target.y * frame.worldSize,
      targetHeight,
      1
    ).applyMatrix4(new Matrix4().fromArray(frame.modelViewProjectionMatrix)).w /
    (mercatorUnitsPerMeter * frame.worldSize);
  const startDepth = readDepth(from);
  const startResolution = Number(
    readMetersPerCssPixel({
      rangeM: startDepth,
      fovRad: readLongerEdgeFovFromIntrinsics(
        { fov: startFovRad as Radians },
        viewport
      )!,
      ...viewport,
    })
  );
  const fovForResolution = (depth: number, resolution: number): number =>
    radToDegNumeric(
      readVerticalFovFromLongerEdge(
        readLongerEdgeFovFromMetersPerCssPixel({
          metersPerCssPixel: resolution,
          rangeM: depth,
          ...viewport,
        }) ?? undefined,
        from.width / from.height
      ) ?? startFovRad
    );
  const placeCamera = (
    frame: typeof from,
    lngLat: { lng: number; lat: number },
    altitude: number
  ): void => {
    const reference = frame.calculateCenterFromCameraLngLatAlt(
      lngLat,
      altitude,
      frame.bearing,
      frame.pitch
    );
    frame.setCenter(reference.center);
    frame.setElevation(reference.elevation);
    frame.setZoom(reference.zoom);
  };
  const aim = (frame: typeof from, moveProjection = false): void => {
    for (let correction = 0; correction < 2; correction++) {
      const matrix = new Matrix4().fromArray(frame.modelViewProjectionMatrix);
      const clip = new Vector4(
        target.x * frame.worldSize,
        target.y * frame.worldSize,
        targetHeight,
        1
      ).applyMatrix4(matrix);
      const x = (2 * viewportPoint.x) / frame.width - 1;
      const y = 1 - (2 * viewportPoint.y) / frame.height;
      if (moveProjection) {
        const dx =
          (viewportPoint.x - ((clip.x / clip.w + 1) * frame.width) / 2) * 2;
        const dy =
          (viewportPoint.y - ((1 - clip.y / clip.w) * frame.height) / 2) * 2;
        frame.setPadding({
          left: (frame.padding.left ?? 0) + Math.max(0, dx),
          right: (frame.padding.right ?? 0) + Math.max(0, -dx),
          top: (frame.padding.top ?? 0) + Math.max(0, dy),
          bottom: (frame.padding.bottom ?? 0) + Math.max(0, -dy),
        });
        continue;
      }
      const m = matrix.elements;
      // Solve the projected position directly. Inverting a near/far ray at
      // a telephoto FOV loses precision through subtraction of distant points.
      const translation = new Vector3(
        clip.x - x * clip.w,
        clip.y - y * clip.w,
        0
      ).applyMatrix3(
        new Matrix3()
          .set(
            m[0] - x * m[3],
            m[4] - x * m[7],
            0,
            m[1] - y * m[3],
            m[5] - y * m[7],
            0,
            0,
            0,
            1
          )
          .invert()
      );
      const center = MercatorCoordinate.fromLngLat(frame.center);
      frame.setCenter(
        new MercatorCoordinate(
          center.x + translation.x / frame.worldSize,
          center.y + translation.y / frame.worldSize
        ).toLngLat()
      );
    }
  };
  const compensate = (frame: typeof from, depth: number): void => {
    // Centre translation changes the rendered depth. Retain the initial
    // tangent-plane metre scale and solve against the actual matrix again.
    for (let correction = 0; correction < 4; correction++) {
      aim(frame);
      const actualDepth = readDepth(frame);
      if (!(actualDepth > 0 && depth > 0)) break;
      frame.setZoom(frame.zoom + Math.log2(actualDepth / depth));
    }
    aim(frame);
  };
  let targetDepth = Number(
    readDollyCompensatedRange({
      currentRangeM: startDepth,
      currentFovRad: startFovRad,
      targetFovRad,
    })
  );
  const finalFrame = from.clone();
  const startViewportPoint = viewportPoint.clone();
  let centeredPreview = false;
  finalFrame.setFov(fovDeg);
  finalFrame.setPitch(pitchDeg);
  finalFrame.setElevation(targetHeight);
  finalFrame.setPadding(padding);
  if (camera) {
    finalFrame.setBearing(camera.pose.bearingDeg);
    finalFrame.setRoll(0);
    const eye = { lng: camera.pose.longitude, lat: camera.pose.latitude };
    placeCamera(finalFrame, eye, camera.altitude);
    targetDepth = readDepth(finalFrame);
    if (!(targetDepth > 0))
      throw new Error("Das aktuelle Blickziel liegt hinter der Bildkamera.");
    finalFrame.setFov(
      clamp(fovForResolution(targetDepth, startResolution), 0.1, maxFovDeg)
    );
    placeCamera(finalFrame, eye, camera.altitude);
    if (preview) {
      const longEdge =
        2 * finalFrame.cameraToCenterDistance * preview.halfFovTan;
      const width = longEdge * Math.min(1, preview.aspectRatio);
      const height = longEdge / Math.max(1, preview.aspectRatio);
      centeredPreview =
        centerPreview ||
        Math.min(width, height) < Math.min(from.width, from.height);
      if (centeredPreview) {
        // Cancel projection pan, including the rotated principal-point offset.
        const x = preview.principal.xOffset * width;
        const y = preview.principal.yOffset * height;
        const dx =
          -2 * (Math.cos(preview.roll) * x - Math.sin(preview.roll) * y);
        const dy =
          -2 * (Math.sin(preview.roll) * x + Math.cos(preview.roll) * y);
        finalFrame.setPadding({
          left: Math.max(0, dx),
          right: Math.max(0, -dx),
          top: Math.max(0, dy),
          bottom: Math.max(0, -dy),
        });
        placeCamera(finalFrame, eye, camera.altitude);
      }
    }
    if (!centeredPreview) aim(finalFrame, true);
  } else {
    compensate(finalFrame, targetDepth);
  }
  if (restoreGround && targetHeight !== groundHeight) {
    // Resolve the ordinary terrain reference before evaluating its zoom bound.
    // This changes centre/zoom representation while retaining the physical eye.
    for (let correction = 0; correction < 2; correction++) {
      const eye = finalFrame.getCameraLngLat();
      const altitude = finalFrame.getCameraAltitude();
      finalFrame.setElevation(
        map.queryTerrainElevation(finalFrame.center) ?? groundHeight
      );
      const reference = finalFrame.calculateCenterFromCameraLngLatAlt(
        eye,
        altitude,
        finalFrame.bearing,
        finalFrame.pitch
      );
      finalFrame.setCenter(reference.center);
      finalFrame.setElevation(reference.elevation);
      finalFrame.setZoom(reference.zoom);
      aim(finalFrame);
    }
  }
  if (!camera) {
    finalFrame.setZoom(clamp(finalFrame.zoom, map.getMinZoom(), maxZoom));
    aim(finalFrame);
  }
  const scaleReduction = camera
    ? Number(
        readMetersPerCssPixel({
          rangeM: readDepth(finalFrame),
          fovRad: readLongerEdgeFovFromIntrinsics(
            { fov: degToRadNumeric(finalFrame.fov) as Radians },
            viewport
          )!,
          ...viewport,
        })
      ) / startResolution
    : Math.max(1, readDepth(finalFrame) / targetDepth);
  const startEye = MercatorCoordinate.fromLngLat(from.getCameraLngLat());
  const endEye = camera
    ? MercatorCoordinate.fromLngLat([
        camera.pose.longitude,
        camera.pose.latitude,
      ])
    : undefined;
  const bearingDelta = camera
    ? ((camera.pose.bearingDeg - from.bearing + 540) % 360) - 180
    : 0;
  const endViewportPoint = startViewportPoint.clone();
  if (centeredPreview) {
    const clip = new Vector4(
      target.x * finalFrame.worldSize,
      target.y * finalFrame.worldSize,
      targetHeight,
      1
    ).applyMatrix4(
      new Matrix4().fromArray(finalFrame.modelViewProjectionMatrix)
    );
    endViewportPoint.x = ((clip.x / clip.w + 1) * finalFrame.width) / 2;
    endViewportPoint.y = ((1 - clip.y / clip.w) * finalFrame.height) / 2;
  }
  map.setCenterClampedToGround(false);
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const flight = tween({
    from: 0,
    to: 1,
    durationMs: capObliqueAnimationDuration(durationMs),
    easing: Easing.CUBIC_IN_OUT,
    onUpdate: (progress) => {
      const profile = interactionProfile(map);
      const frameStarted = performance.now();
      const frame = from.clone();
      viewportPoint.x =
        startViewportPoint.x +
        (endViewportPoint.x - startViewportPoint.x) * progress;
      viewportPoint.y =
        startViewportPoint.y +
        (endViewportPoint.y - startViewportPoint.y) * progress;
      // Travel and projection move on the same eased progress. Interpolate
      // optical depth, then derive FOV, rather than giving FOV a different
      // speed curve that makes the camera's path appear to reverse.
      const resolutionRatio = Math.pow(scaleReduction, progress);
      const depth =
        startDepth + (targetDepth * scaleReduction - startDepth) * progress;
      const fovRad =
        readVerticalFovFromLongerEdge(
          readLongerEdgeFovFromMetersPerCssPixel({
            metersPerCssPixel: startResolution * resolutionRatio,
            rangeM: depth,
            ...viewport,
          }) ?? undefined,
          from.width / from.height
        ) ?? startFovRad;
      frame.setFov(radToDegNumeric(fovRad));
      frame.setPitch(from.pitch + (pitchDeg - from.pitch) * progress);
      frame.setBearing(from.bearing + bearingDelta * progress);
      if (progress > 0) frame.setElevation(targetHeight);
      frame.interpolatePadding(from.padding, padding, progress);
      if (progress > 0 && camera && endEye) {
        // Reverse the return by travelling to the physical image camera.
        // Its optical depth determines FOV; projection pan keeps the target fixed.
        frame.setRoll(from.roll * (1 - progress));
        const eye = new MercatorCoordinate(
          startEye.x + (endEye.x - startEye.x) * progress,
          startEye.y + (endEye.y - startEye.y) * progress
        ).toLngLat();
        const altitude =
          from.getCameraAltitude() +
          (camera.altitude - from.getCameraAltitude()) * progress;
        placeCamera(frame, eye, altitude);
        const actualDepth = readDepth(frame);
        if (actualDepth > 0) {
          frame.setFov(
            clamp(
              fovForResolution(actualDepth, startResolution * resolutionRatio),
              0.1,
              maxFovDeg
            )
          );
          placeCamera(frame, eye, altitude);
        }
        aim(frame, true);
      } else if (progress > 0) {
        // Interpolate the offset in the camera plane, in metres. When scale
        // must change, a linear pixel pan would otherwise bend that motion.
        const projectedCenter = from.centerPoint.clone();
        projectedCenter.x =
          viewportPoint.x +
          ((from.centerPoint.x - viewportPoint.x) * (1 - progress) +
            (finalFrame.centerPoint.x - viewportPoint.x) *
              scaleReduction *
              progress) /
            resolutionRatio;
        projectedCenter.y =
          viewportPoint.y +
          ((from.centerPoint.y - viewportPoint.y) * (1 - progress) +
            (finalFrame.centerPoint.y - viewportPoint.y) *
              scaleReduction *
              progress) /
            resolutionRatio;
        const dx = (projectedCenter.x - frame.centerPoint.x) * 2;
        const dy = (projectedCenter.y - frame.centerPoint.y) * 2;
        frame.setPadding({
          left: (frame.padding.left ?? 0) + Math.max(0, dx),
          right: (frame.padding.right ?? 0) + Math.max(0, -dx),
          top: (frame.padding.top ?? 0) + Math.max(0, dy),
          bottom: (frame.padding.bottom ?? 0) + Math.max(0, -dy),
        });
        compensate(frame, depth);
      }
      if (progress === 1) {
        frame.apply(finalFrame, false);
      }
      profile?.record("solveFrame", performance.now() - frameStarted);
      const writeStarted = performance.now();
      setFov(map, frame.fov);
      profile?.record("writeFov", performance.now() - writeStarted);
      const jumpStarted = performance.now();
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
        { obliqueFov: true }
      );
      profile?.record("writeCamera", performance.now() - jumpStarted);
    },
    onComplete: () => {
      if (restoreGround) restoreCenterOnGround(map);
      resolveDone();
    },
  });
  return {
    done,
    cancel: () => {
      flight.cancel();
      resolveDone();
    },
  };
};
