import { interactionProfile } from "./interaction-profile";
import {
  MercatorCoordinate,
  type Map as MaplibreMap,
  type PaddingOptions,
} from "maplibre-gl";
import { Matrix3, Matrix4, Spherical, Vector3, Vector4 } from "three";
import {
  TWO_PI,
  degToRadNumeric,
  radToDegNumeric,
  type CssPixels,
  type Degrees,
  type Ratio,
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
import { jumpMapLibreCameraWithFov } from "@carma-mapping/engines/maplibre";
import type { Altitude, Coordinates } from "@carma-geo/data-structures";
import { ellipsoidalToDhhn2016Height } from "@carma-geo/proj";

import type {
  AnimationConfig,
  ObliqueDataset,
  ObliquePreviewState,
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
import type { PreviewImageGeometry } from "../../core/utils/preview-pan-bounds";
import { getOrComputeObliquePose } from "../../core/utils/oblique-pose";
import { whenMoveEnds, type CameraFlight } from "./obliqueCamera";

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

/** Keep the runtime API while sharing the core's idempotent pose calculation. */
export const poseOf = getOrComputeObliquePose;

/**
 * The altitude the camera flies to: the served z, in the terrain's frame.
 * A dataset whose z is ellipsoidal is brought down by the geoid undulation
 * first; the offset is for fine tuning against a building edge.
 */
const cameraAltitudeCache = new WeakMap<
  ObliqueImageRecord,
  Map<string, Promise<number>>
>();

export const resolveCameraAltitude = (
  record: ObliqueImageRecord,
  heightDatum: ObliqueHeightDatum,
  heightOffset: number,
  allowUnverifiedSourceHeight = false
): Promise<number> => {
  const key = [heightDatum, heightOffset, allowUnverifiedSourceHeight].join(
    "|"
  );
  let entries = cameraAltitudeCache.get(record);
  if (!entries) {
    entries = new Map();
    cameraAltitudeCache.set(record, entries);
  }
  const existing = entries.get(key);
  if (existing) return existing;
  const result = computeCameraAltitude(
    record,
    heightDatum,
    heightOffset,
    allowUnverifiedSourceHeight
  ).catch((error) => {
    entries!.delete(key);
    throw error;
  });
  if (entries.size >= 4) entries.clear();
  entries.set(key, result);
  return result;
};

const computeCameraAltitude = async (
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
    fitWholeImage = false,
    orbitAroundAnchor = false,
    previewState,
    previewReferenceFrame,
    beforeStart,
    adjustFinalFrame,
    acceptAdjustedFrame,
    onProgress,
  }: {
    dynamicDuration?: boolean;
    anchor?: MercatorCoordinate;
    screenPoint?: { x: number; y: number };
    maxFovDeg?: number;
    preview?: PreviewImageGeometry;
    centerPreview?: boolean;
    /** Fit both rotated image extents; NG keeps the short-axis fit. */
    fitWholeImage?: boolean;
    /** Orbit smoothly to a physical photo eye; free orbits retain distance and FOV. */
    orbitAroundAnchor?: boolean;
    previewState?: ObliquePreviewState;
    previewReferenceFrame?: MaplibreMap["transform"];
    /** Adjust the final projection; animated flights interpolate its roll continuously. */
    adjustFinalFrame?: (frame: MaplibreMap["transform"]) => void;
    /** Accept the fully solved correction, or retain the exact neutral endpoint. */
    acceptAdjustedFrame?: (
      neutralFrame: MaplibreMap["transform"],
      adjustedFrame: MaplibreMap["transform"]
    ) => boolean;
    /** Prepare the decoded target viewport before starting an anchored flight. */
    beforeStart?: (
      frame: MaplibreMap["transform"],
      signal: AbortSignal,
      trajectoryFrames?: readonly MaplibreMap["transform"][]
    ) => Promise<boolean | void>;
    /** Notify photo projection after the camera frame is applied. */
    onProgress?: (progress: number) => void;
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

  const maxDuration = capObliqueAnimationDuration(animation?.duration ?? 800);
  const duration =
    maxDuration === 0
      ? 0
      : dynamicDuration
      ? dynamicDurationMs(cameraErrorM(map, pose, altitude), maxDuration)
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
      fitWholeImage,
      orbitAroundAnchor,
      previewState,
      previewReferenceFrame,
      beforeStart,
      adjustFinalFrame,
      acceptAdjustedFrame,
      onProgress,
      durationMs: duration,
      easing,
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
    durationMs = 1100,
    easing = Easing.CUBIC_IN_OUT,
    bearingDeg,
    anchor,
    screenPoint,
    restoreGround = true,
    camera,
    maxFovDeg = 110,
    preview,
    centerPreview = false,
    fitWholeImage = false,
    orbitAroundAnchor = false,
    previewState,
    previewReferenceFrame,
    beforeStart,
    adjustFinalFrame,
    acceptAdjustedFrame,
    onProgress,
  }: {
    fovDeg?: Degrees;
    padding?: PaddingOptions;
    maxZoom?: number;
    durationMs?: number;
    easing?: AnimationConfig["easingFunction"];
    bearingDeg?: number;
    anchor?: MercatorCoordinate;
    screenPoint?: { x: number; y: number };
    restoreGround?: boolean;
    /** Fixed image-camera destination; the projection follows the anchor. */
    camera?: { pose: ObliquePose; altitude: number };
    maxFovDeg?: number;
    preview?: PreviewImageGeometry;
    centerPreview?: boolean;
    /** Fit both rotated image extents; NG keeps the short-axis fit. */
    fitWholeImage?: boolean;
    /** Orbit smoothly to a physical photo eye; free orbits retain distance and FOV. */
    orbitAroundAnchor?: boolean;
    previewState?: ObliquePreviewState;
    previewReferenceFrame?: MaplibreMap["transform"];
    /** Adjust the final projection; animated flights interpolate its roll continuously. */
    adjustFinalFrame?: (frame: MaplibreMap["transform"]) => void;
    /** Accept the fully solved correction, or retain the exact neutral endpoint. */
    acceptAdjustedFrame?: (
      neutralFrame: MaplibreMap["transform"],
      adjustedFrame: MaplibreMap["transform"]
    ) => boolean;
    /** Prepare the decoded target viewport before starting an anchored flight. */
    beforeStart?: (
      frame: MaplibreMap["transform"],
      signal: AbortSignal,
      trajectoryFrames?: readonly MaplibreMap["transform"][]
    ) => Promise<boolean | void>;
    /** Notify photo projection after the camera frame is applied. */
    onProgress?: (progress: number) => void;
  } = {}
): CameraFlight => {
  if (!beforeStart) map.stop();
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
  const targetBearing = camera?.pose.bearingDeg ?? bearingDeg ?? from.bearing;
  const bearingDelta = ((targetBearing - from.bearing + 540) % 360) - 180;
  const initialEye = MercatorCoordinate.fromLngLat(from.getCameraLngLat());
  // Transform altitude is expressed at the map centre's latitude, not the eye's.
  initialEye.z = MercatorCoordinate.fromLngLat(
    from.center,
    from.getCameraAltitude()
  ).z;
  const initialOrbit =
    orbitAroundAnchor && anchor
      ? new Spherical().setFromVector3(
          new Vector3(
            initialEye.x - target.x,
            initialEye.z - target.z,
            initialEye.y - target.y
          )
        )
      : undefined;
  const destinationEye = camera
    ? MercatorCoordinate.fromLngLat(
        [camera.pose.longitude, camera.pose.latitude],
        camera.altitude
      )
    : undefined;
  const destinationOrbit = destinationEye
    ? new Spherical().setFromVector3(
        new Vector3(
          destinationEye.x - target.x,
          destinationEye.z - target.z,
          destinationEye.y - target.y
        )
      )
    : undefined;
  const orbitEye =
    initialOrbit &&
    Number.isFinite(initialOrbit.radius) &&
    initialOrbit.radius > 0
      ? (progress: number) => {
          // Photo flights interpolate the two actual eye offsets in spherical
          // coordinates. Free orbits keep their radius and camera-angle deltas.
          // This avoids a chord dip without replacing the calibrated endpoint.
          if (progress === 1 && destinationEye)
            return {
              lngLat: destinationEye.toLngLat(),
              altitude: destinationEye.toAltitude(),
            };
          const polarDelta = destinationOrbit
            ? destinationOrbit.phi - initialOrbit.phi
            : degToRadNumeric(pitchDeg - from.pitch);
          let azimuthDelta = destinationOrbit
            ? Math.atan2(
                Math.sin(destinationOrbit.theta - initialOrbit.theta),
                Math.cos(destinationOrbit.theta - initialOrbit.theta)
              )
            : -degToRadNumeric(bearingDelta);
          // Preserve the selected turn even when a panned target eye lies on
          // the other side of the angular wrap; never reverse the orbit midway.
          if (destinationOrbit && Math.abs(bearingDelta) > 1e-8) {
            if (bearingDelta > 0 && azimuthDelta > 0) azimuthDelta -= TWO_PI;
            if (bearingDelta < 0 && azimuthDelta < 0) azimuthDelta += TWO_PI;
          }
          const offset = new Vector3().setFromSpherical(
            new Spherical(
              initialOrbit.radius +
                ((destinationOrbit?.radius ?? initialOrbit.radius) -
                  initialOrbit.radius) *
                  progress,
              initialOrbit.phi + polarDelta * progress,
              initialOrbit.theta + azimuthDelta * progress
            )
          );
          const mercator = new MercatorCoordinate(
            target.x + offset.x,
            target.y + offset.z,
            target.z + offset.y
          );
          return {
            lngLat: mercator.toLngLat(),
            altitude: mercator.toAltitude(),
          };
        }
      : undefined;
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
    const eye = MercatorCoordinate.fromLngLat(lngLat, altitude);
    // MapLibre's camera altitude is measured at the map centre's latitude.
    // Preserve the photo eye's Mercator Z while solving that moving centre.
    for (let correction = 0; correction < 3; correction++) {
      const reference = frame.calculateCenterFromCameraLngLatAlt(
        lngLat,
        camera || orbitEye || adjustFinalFrame
          ? eye.z /
              MercatorCoordinate.fromLngLat(
                frame.center
              ).meterInMercatorCoordinateUnits()
          : altitude,
        frame.bearing,
        frame.pitch
      );
      frame.setCenter(reference.center);
      frame.setElevation(reference.elevation);
      frame.setZoom(reference.zoom);
    }
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
  if (previewReferenceFrame && anchor && !screenPoint) {
    const clip = new Vector4(
      target.x * from.worldSize,
      target.y * from.worldSize,
      targetHeight,
      1
    ).applyMatrix4(new Matrix4().fromArray(from.modelViewProjectionMatrix));
    if (clip.w > 0) {
      startViewportPoint.x = ((clip.x / clip.w + 1) * from.width) / 2;
      startViewportPoint.y = ((1 - clip.y / clip.w) * from.height) / 2;
    }
  }
  let centeredPreview = false;
  finalFrame.setFov(fovDeg);
  finalFrame.setPitch(pitchDeg);
  finalFrame.setBearing(targetBearing);
  finalFrame.setElevation(targetHeight);
  finalFrame.setPadding(padding);
  if (camera) {
    finalFrame.setRoll(0);
    const eye = { lng: camera.pose.longitude, lat: camera.pose.latitude };
    placeCamera(finalFrame, eye, camera.altitude);
    targetDepth = readDepth(finalFrame);
    if (!(targetDepth > 0))
      throw new Error("Das aktuelle Blickziel liegt hinter der Bildkamera.");
    const referenceResolution = previewReferenceFrame
      ? Number(
          readMetersPerCssPixel({
            rangeM: readDepth(previewReferenceFrame),
            fovRad: readLongerEdgeFovFromIntrinsics(
              { fov: degToRadNumeric(previewReferenceFrame.fov) as Radians },
              viewport
            )!,
            ...viewport,
          })
        )
      : startResolution;
    finalFrame.setFov(
      clamp(fovForResolution(targetDepth, referenceResolution), 0.1, maxFovDeg)
    );
    placeCamera(finalFrame, eye, camera.altitude);
    if (preview) {
      if (centerPreview || previewState) {
        const shortFactor = Math.min(
          preview.aspectRatio,
          1 / preview.aspectRatio
        );
        const currentShortEdge =
          2 *
          finalFrame.cameraToCenterDistance *
          preview.halfFovTan *
          shortFactor;
        const fitScale = (previewState?.zoom ?? 0.9) as Ratio;
        let targetShortEdge = (Math.min(from.width, from.height) *
          fitScale) as CssPixels;
        if (fitWholeImage) {
          const widthFactor = Math.min(1, preview.aspectRatio) as Ratio;
          const heightFactor = (1 / Math.max(1, preview.aspectRatio)) as Ratio;
          const cosine = Math.abs(Math.cos(preview.roll)) as Ratio;
          const sine = Math.abs(Math.sin(preview.roll)) as Ratio;
          const rotatedWidth = (cosine * widthFactor +
            sine * heightFactor) as Ratio;
          const rotatedHeight = (sine * widthFactor +
            cosine * heightFactor) as Ratio;
          targetShortEdge = (Math.min(
            (from.width as CssPixels) / rotatedWidth,
            (from.height as CssPixels) / rotatedHeight
          ) *
            fitScale *
            shortFactor) as CssPixels;
        }
        finalFrame.setFov(
          clamp(
            radToDegNumeric(
              2 *
                Math.atan(
                  (Math.tan(degToRadNumeric(finalFrame.fov) / 2) *
                    currentShortEdge) /
                    targetShortEdge
                )
            ),
            0.1,
            maxFovDeg
          )
        );
        placeCamera(finalFrame, eye, camera.altitude);
      }
      const longEdge =
        2 * finalFrame.cameraToCenterDistance * preview.halfFovTan;
      const width = longEdge * Math.min(1, preview.aspectRatio);
      const height = longEdge / Math.max(1, preview.aspectRatio);
      centeredPreview = centerPreview || !!previewState;
      if (centeredPreview) {
        // Cancel projection pan, including the rotated principal-point offset.
        const x = preview.principal.xOffset * width;
        const y = preview.principal.yOffset * height;
        const dx =
          -2 * (Math.cos(preview.roll) * x - Math.sin(preview.roll) * y) +
          2 * (previewState?.panX ?? 0) * longEdge;
        const dy =
          -2 * (Math.sin(preview.roll) * x + Math.cos(preview.roll) * y) +
          2 * (previewState?.panY ?? 0) * longEdge;
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
  if (orbitEye && !camera) {
    const endpoint = orbitEye(1);
    finalFrame.setFov(from.fov);
    placeCamera(finalFrame, endpoint.lngLat, endpoint.altitude);
    aim(finalFrame, true);
    targetDepth = readDepth(finalFrame);
  } else if (!camera) {
    finalFrame.setZoom(clamp(finalFrame.zoom, map.getMinZoom(), maxZoom));
    aim(finalFrame);
  }
  const scaleReduction =
    camera || orbitEye
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
  const startPhotoAltitude =
    MercatorCoordinate.fromLngLat(from.center, from.getCameraAltitude()).z /
    startEye.meterInMercatorCoordinateUnits();
  const endEye = camera
    ? MercatorCoordinate.fromLngLat([
        camera.pose.longitude,
        camera.pose.latitude,
      ])
    : undefined;
  const endViewportPoint = (
    previewReferenceFrame && anchor && !screenPoint
      ? viewportPoint
      : startViewportPoint
  ).clone();
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
  // Holding the eye, a fit is a pure zoom: one screen point stays fixed and
  // every other point moves on a straight line through it. Interpolating the
  // anchor linearly while the scale changes geometrically makes the image drift.
  const eyeTravel = endEye
    ? Math.hypot(endEye.x - startEye.x, endEye.y - startEye.y) /
      startEye.meterInMercatorCoordinateUnits()
    : Infinity;
  const endScale = 1 / scaleReduction;
  const fixedPoint =
    camera && eyeTravel < startDepth * 0.02 && Math.abs(endScale - 1) > 1e-3
      ? {
          x:
            (endViewportPoint.x - endScale * startViewportPoint.x) /
            (1 - endScale),
          y:
            (endViewportPoint.y - endScale * startViewportPoint.y) /
            (1 - endScale),
        }
      : null;
  const solveFrame = (progress: number): typeof from => {
    const frame = from.clone();
    // Travel and projection move on the same eased progress. Interpolate
    // optical depth, then derive FOV, rather than giving FOV a different
    // speed curve that makes the camera's path appear to reverse.
    const resolutionRatio = Math.pow(scaleReduction, progress);
    if (fixedPoint) {
      const scale = 1 / resolutionRatio;
      viewportPoint.x =
        fixedPoint.x + (startViewportPoint.x - fixedPoint.x) * scale;
      viewportPoint.y =
        fixedPoint.y + (startViewportPoint.y - fixedPoint.y) * scale;
    } else {
      viewportPoint.x =
        startViewportPoint.x +
        (endViewportPoint.x - startViewportPoint.x) * progress;
      viewportPoint.y =
        startViewportPoint.y +
        (endViewportPoint.y - startViewportPoint.y) * progress;
    }
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
    if (progress > 0 && orbitEye) {
      const eye = orbitEye(progress);
      frame.setRoll(from.roll * (1 - progress));
      if (!camera) frame.setFov(from.fov);
      placeCamera(frame, eye.lngLat, eye.altitude);
      if (camera) {
        const actualDepth = readDepth(frame);
        if (actualDepth > 0) {
          frame.setFov(
            clamp(
              fovForResolution(actualDepth, startResolution * resolutionRatio),
              0.1,
              maxFovDeg
            )
          );
          placeCamera(frame, eye.lngLat, eye.altitude);
        }
      }
      aim(frame, true);
    } else if (progress > 0 && camera && endEye) {
      // Reverse the return by travelling to the physical image camera.
      // Its optical depth determines FOV; projection pan keeps the target fixed.
      frame.setRoll(from.roll * (1 - progress));
      const eye = new MercatorCoordinate(
        startEye.x + (endEye.x - startEye.x) * progress,
        startEye.y + (endEye.y - startEye.y) * progress
      ).toLngLat();
      const altitude =
        startPhotoAltitude + (camera.altitude - startPhotoAltitude) * progress;
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
    // The orbit already evaluates its exact endpoint. The photo-fit frame can
    // encode the same anchor with different opposing padding, which would
    // jump when preview pan reads those individual edges after completion.
    if (progress === 1 && (!orbitEye || camera)) {
      frame.apply(finalFrame, false);
    }
    if (orbitEye && camera && progress > 0) {
      const horizontal = frame.padding.left - frame.padding.right;
      const vertical = frame.padding.top - frame.padding.bottom;
      frame.setPadding({
        left: Math.max(0, horizontal),
        right: Math.max(0, -horizontal),
        top: Math.max(0, vertical),
        bottom: Math.max(0, -vertical),
      });
    }
    return frame;
  };
  const neutralEndpoint = adjustFinalFrame ? solveFrame(1) : undefined;
  let adjustedEndpoint = neutralEndpoint?.clone();
  if (adjustedEndpoint && adjustFinalFrame) {
    const eye = MercatorCoordinate.fromLngLat(
      adjustedEndpoint.getCameraLngLat()
    );
    eye.z = MercatorCoordinate.fromLngLat(
      adjustedEndpoint.center,
      adjustedEndpoint.getCameraAltitude()
    ).z;
    adjustFinalFrame(adjustedEndpoint);
    // Roll changes the screen basis, not the physical candidate camera. Retain
    // that eye and the selected screen anchor with projection padding only.
    placeCamera(adjustedEndpoint, eye.toLngLat(), eye.toAltitude());
    aim(adjustedEndpoint, true);
  }
  const normalizePadding = (frame: typeof from) => {
    const horizontal = frame.padding.left - frame.padding.right;
    const vertical = frame.padding.top - frame.padding.bottom;
    frame.setPadding({
      left: Math.max(0, horizontal),
      right: Math.max(0, -horizontal),
      top: Math.max(0, vertical),
      bottom: Math.max(0, -vertical),
    });
  };
  if (adjustedEndpoint) {
    normalizePadding(adjustedEndpoint);
    if (
      neutralEndpoint &&
      acceptAdjustedFrame &&
      !acceptAdjustedFrame(neutralEndpoint.clone(), adjustedEndpoint.clone())
    ) {
      adjustedEndpoint = undefined;
    }
  }
  const solvePreparedFrame = (progress: number): typeof from => {
    if (progress === 1 && adjustedEndpoint) return adjustedEndpoint.clone();
    const frame = solveFrame(progress);
    if (adjustedEndpoint && progress > 0) {
      const eye = MercatorCoordinate.fromLngLat(frame.getCameraLngLat());
      eye.z = MercatorCoordinate.fromLngLat(
        frame.center,
        frame.getCameraAltitude()
      ).z;
      const delta = ((adjustedEndpoint.roll - from.roll + 540) % 360) - 180;
      frame.setRoll(from.roll + delta * progress);
      placeCamera(frame, eye.toLngLat(), eye.toAltitude());
      aim(frame, true);
      normalizePadding(frame);
    }
    return frame;
  };
  const preparation = new AbortController();
  let settled = false;
  let flight: ReturnType<typeof tween> | undefined;
  let resolveDone!: () => void;
  let rejectDone!: (error: unknown) => void;
  let intermediatePose = false;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const complete = () => {
    settled = true;
    // An interrupted flight still publishes its actual final camera once.
    if (intermediatePose) {
      intermediatePose = false;
      map.fire("moveend", { obliqueFov: true, carmaCameraIntermediate: false });
    }
    resolveDone();
  };
  const applyFrame = (progress: number) => {
    const profile = interactionProfile(map);
    const frameStarted = performance.now();
    const frame = solvePreparedFrame(progress);
    profile?.record("solveFrame", performance.now() - frameStarted);
    const jumpStarted = performance.now();
    intermediatePose = progress < 1;
    jumpMapLibreCameraWithFov(
      map,
      {
        center: frame.center,
        zoom: frame.zoom,
        pitch: frame.pitch,
        bearing: frame.bearing,
        roll: frame.roll,
        elevation: frame.elevation,
        padding: frame.padding,
      },
      frame.fov,
      { obliqueFov: true, carmaCameraIntermediate: intermediatePose }
    );
    profile?.record("writeCamera", performance.now() - jumpStarted);
    onProgress?.(progress);
  };
  const finish = () => {
    if (restoreGround) restoreCenterOnGround(map);
    complete();
  };
  const start = () => {
    if (settled) return;
    if (beforeStart) map.stop();
    map.setCenterClampedToGround(false);
    const duration = capObliqueAnimationDuration(durationMs);
    if (duration === 0) {
      applyFrame(1);
      finish();
      return;
    }
    flight = tween({
      from: 0,
      to: 1,
      durationMs: duration,
      easing,
      onUpdate: applyFrame,
      onComplete: finish,
    });
  };
  if (beforeStart) {
    // Solve without writing to the map. The readiness consumer receives exactly
    // the same endpoint as the tween, including the orbit's preserved padding.
    Promise.resolve()
      .then(() => {
        if (settled) return false;
        return beforeStart(
          solvePreparedFrame(1),
          preparation.signal,
          [0, 0.25, 0.5, 0.75, 1].map(solvePreparedFrame)
        );
      })
      .then((ready) => {
        if (settled) return;
        if (ready === false) complete();
        else start();
      })
      .catch((error: unknown) => {
        if (settled) return;
        settled = true;
        rejectDone(error);
      });
  } else start();
  return {
    done,
    cancel: () => {
      if (settled) return;
      preparation.abort();
      flight?.cancel();
      complete();
    },
  };
};
