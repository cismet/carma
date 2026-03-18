import type { Map as LeafletMap } from "leaflet";
import type { Map as MapLibreMap } from "maplibre-gl";
import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { WEB_MERCATOR_MAX_LATITUDE_DEG } from "@carma/geo/utils";
import { clamp, isFiniteNumber, isZeroish } from "@carma/math";
import {
  degToRadNumeric,
  radToDegNumeric,
  zeroToThreeSixty,
} from "@carma/units/helpers";
import type { Degrees, Meters, Radians } from "@carma/units/types";
import {
  projectLeafletViewToViewSyncTarget,
  projectMapLibreViewToViewSyncTarget,
  projectViewSyncTargetToLeaflet,
  projectViewSyncTargetToMapLibre,
  toCesiumPitchFromViewSyncPitch,
  toViewSyncPitchFromCesiumPitch,
} from "./targetState";
import type { SceneViewState } from "./sceneViewState";
import { coerceFiniteNumber } from "./sceneStateHelpers";

// ── types ──

export type ViewAdapterViewport = {
  widthPx: number;
  heightPx: number;
};

const readViewportFromElement = (
  element: HTMLElement | null | undefined
): ViewAdapterViewport => ({
  widthPx: Math.max(1, element?.clientWidth ?? 0),
  heightPx: Math.max(1, element?.clientHeight ?? 0),
});

export type ViewAdapterOptions = {
  defaultFovDeg?: number;
  maxPitchDeg?: number;
  minRangeM?: number;
};

export type MapLibreViewValues = {
  lng: number;
  lat: number;
  zoom: number;
  altitude: number;
  bearing?: number;
  pitch?: number;
};

export type LeafletViewValues = {
  lng: number;
  lat: number;
  zoom: number;
};

export type CesiumCameraView = {
  anchorLngRad: number;
  anchorLatRad: number;
  anchorHeightM: number;
  bearingRad?: number;
  pitchRad?: number;
  rollRad?: number;
  rangeM?: number;
  fovVerticalRad?: number;
};

// ── defaults ──

const DEFAULT_MIN_RANGE_M = 10;
export const DEFAULT_FOV_DEG = 45;
export const DEFAULT_MAX_PITCH_DEG = 85;

// ── internals ──

const resolveOptions = (
  options?: ViewAdapterOptions
): Required<ViewAdapterOptions> => ({
  defaultFovDeg: options?.defaultFovDeg ?? DEFAULT_FOV_DEG,
  maxPitchDeg: options?.maxPitchDeg ?? DEFAULT_MAX_PITCH_DEG,
  minRangeM: options?.minRangeM ?? DEFAULT_MIN_RANGE_M,
});

const clampLat = (latitudeDeg: number): number =>
  clamp(
    latitudeDeg,
    -WEB_MERCATOR_MAX_LATITUDE_DEG,
    WEB_MERCATOR_MAX_LATITUDE_DEG
  );

const toMapLibrePitchDeg = (
  scenePitchDeg: number,
  maxPitchDeg: number
): number => clamp(90 + scenePitchDeg, 0, maxPitchDeg);

const fromMapLibrePitchDeg = (pitchDeg: number, maxPitchDeg: number): number =>
  clamp(pitchDeg, 0, maxPitchDeg) - 90;

const toMapLibreBearingDeg = (
  bearingRad: number | undefined
): number | undefined => {
  if (!isFiniteNumber(bearingRad)) {
    return undefined;
  }
  return zeroToThreeSixty(radToDegNumeric(bearingRad)! as Degrees) as number;
};

const viewStateToTarget = (
  viewState: SceneViewState
): ReturnType<typeof projectMapLibreViewToViewSyncTarget> => {
  if (!isFiniteNumber(viewState.orientation.rangeM)) {
    return null;
  }

  return {
    anchor: {
      longitude: degToRadNumeric(viewState.anchor.lngDeg) as Radians,
      latitude: degToRadNumeric(viewState.anchor.latDeg) as Radians,
      altitude: viewState.anchor.heightM as never,
    },
    bearingPitchRange: {
      bearing: (viewState.orientation.bearingRad ?? 0) as Radians,
      pitch: toViewSyncPitchFromCesiumPitch(
        viewState.orientation.pitchRad ?? -Math.PI / 2
      ),
      range: viewState.orientation.rangeM as Meters,
    },
    ...(isFiniteNumber(viewState.orientation.rollRad)
      ? { roll: viewState.orientation.rollRad as Radians }
      : {}),
    ...(isFiniteNumber(viewState.orientation.fovVerticalRad)
      ? { fovVertical: viewState.orientation.fovVerticalRad as Radians }
      : {}),
    type: CAMERA_TYPE.PERSPECTIVE,
  };
};

const targetToViewState = (
  target: NonNullable<ReturnType<typeof projectMapLibreViewToViewSyncTarget>>
): SceneViewState => ({
  anchor: {
    lngDeg: radToDegNumeric(target.anchor.longitude)!,
    latDeg: radToDegNumeric(target.anchor.latitude)!,
    heightM: target.anchor.altitude,
  },
  orientation: {
    bearingRad: target.bearingPitchRange.bearing,
    pitchRad: toCesiumPitchFromViewSyncPitch(target.bearingPitchRange.pitch),
    ...(isFiniteNumber(target.roll) ? { rollRad: target.roll } : {}),
    ...(isFiniteNumber(target.fovVertical)
      ? { fovVerticalRad: target.fovVertical }
      : {}),
    ...(isFiniteNumber(target.bearingPitchRange.range)
      ? { rangeM: target.bearingPitchRange.range }
      : {}),
  },
});

// ── MapLibre adapter ──

export const maplibreAdapter = {
  carmaToView(
    viewState: SceneViewState,
    viewport: ViewAdapterViewport,
    options?: ViewAdapterOptions
  ): MapLibreViewValues | null {
    const { defaultFovDeg, maxPitchDeg } = resolveOptions(options);
    const target = viewStateToTarget(viewState);
    if (!target) {
      return null;
    }

    const projection = projectViewSyncTargetToMapLibre(
      target,
      { widthPx: viewport.widthPx, heightPx: viewport.heightPx },
      {
        fovVertical:
          viewState.orientation.fovVerticalRad ??
          degToRadNumeric(defaultFovDeg)!,
        maxPitchDeg,
      }
    );
    if (!projection) {
      return null;
    }

    const params: MapLibreViewValues = {
      lng: projection.lng,
      lat: projection.lat,
      zoom: projection.zoom,
      altitude: viewState.anchor.heightM,
    };

    const bearingDeg = toMapLibreBearingDeg(viewState.orientation.bearingRad);
    if (!isZeroish(bearingDeg)) {
      params.bearing = bearingDeg;
    }

    const scenePitchDeg = isFiniteNumber(viewState.orientation.pitchRad)
      ? radToDegNumeric(viewState.orientation.pitchRad)!
      : undefined;
    const mlPitchDeg = isFiniteNumber(scenePitchDeg)
      ? toMapLibrePitchDeg(scenePitchDeg, maxPitchDeg)
      : undefined;
    if (!isZeroish(mlPitchDeg)) {
      params.pitch = mlPitchDeg;
    }

    return params;
  },

  viewToCarma(
    values: MapLibreViewValues & { fovDeg?: number },
    viewport: ViewAdapterViewport,
    options?: ViewAdapterOptions
  ): SceneViewState | null {
    const { defaultFovDeg, maxPitchDeg, minRangeM } = resolveOptions(options);
    const { lng, lat, zoom, altitude } = values;
    if (
      !isFiniteNumber(lng) ||
      !isFiniteNumber(lat) ||
      !isFiniteNumber(zoom) ||
      !isFiniteNumber(altitude)
    ) {
      return null;
    }

    const fovDeg =
      isFiniteNumber(values.fovDeg) && values.fovDeg > 0
        ? values.fovDeg
        : defaultFovDeg;

    const target = projectMapLibreViewToViewSyncTarget(
      lng,
      clampLat(lat),
      zoom,
      altitude,
      { widthPx: viewport.widthPx, heightPx: viewport.heightPx },
      degToRadNumeric(fovDeg)!,
      {
        bearingDeg: isFiniteNumber(values.bearing) ? values.bearing : 0,
        pitchDeg: isFiniteNumber(values.pitch) ? values.pitch : 0,
      }
    );
    if (!target) {
      return null;
    }

    const viewState = targetToViewState(target);
    const rangeM = viewState.orientation.rangeM;
    const clampedRangeM =
      isFiniteNumber(rangeM) && rangeM < minRangeM ? minRangeM : rangeM;

    return {
      anchor: {
        ...viewState.anchor,
        latDeg: clampLat(viewState.anchor.latDeg),
      },
      orientation: {
        ...(isFiniteNumber(values.bearing)
          ? {
              bearingRad: degToRadNumeric(
                zeroToThreeSixty(values.bearing as Degrees) as number
              )!,
            }
          : {}),
        ...(isFiniteNumber(values.pitch)
          ? {
              pitchRad: degToRadNumeric(
                fromMapLibrePitchDeg(values.pitch, maxPitchDeg)
              )!,
            }
          : {
              pitchRad: degToRadNumeric(fromMapLibrePitchDeg(0, maxPitchDeg))!,
            }),
        ...(isFiniteNumber(clampedRangeM) ? { rangeM: clampedRangeM } : {}),
        ...(isFiniteNumber(values.fovDeg)
          ? { fovVerticalRad: degToRadNumeric(values.fovDeg)! }
          : {}),
      },
    };
  },

  carmaToHashParams(
    viewState: SceneViewState,
    viewport?: ViewAdapterViewport | null,
    options?: ViewAdapterOptions
  ): Record<string, number> {
    const { defaultFovDeg, maxPitchDeg } = resolveOptions(options);
    const effectiveFovRad = viewState.orientation.fovVerticalRad;

    const params: Record<string, number> = {
      lng: viewState.anchor.lngDeg,
      lat: viewState.anchor.latDeg,
      altitude: viewState.anchor.heightM,
    };

    if (viewport && isFiniteNumber(viewState.orientation.rangeM)) {
      const projected = maplibreAdapter.carmaToView(viewState, viewport, {
        defaultFovDeg,
        maxPitchDeg,
      });

      if (projected) {
        params.zoom = projected.zoom;
        if (isFiniteNumber(projected.bearing))
          params.bearing = projected.bearing;
        if (isFiniteNumber(projected.pitch)) params.pitch = projected.pitch;
      } else {
        const bearingDeg = toMapLibreBearingDeg(
          viewState.orientation.bearingRad
        );
        if (!isZeroish(bearingDeg)) {
          params.bearing = bearingDeg!;
        }

        const pitchDeg = isFiniteNumber(viewState.orientation.pitchRad)
          ? radToDegNumeric(viewState.orientation.pitchRad)!
          : undefined;
        if (!isZeroish(pitchDeg)) {
          params.pitch = toMapLibrePitchDeg(pitchDeg!, maxPitchDeg);
        }
      }
    }

    const effectiveFovDeg = isFiniteNumber(effectiveFovRad)
      ? radToDegNumeric(effectiveFovRad)!
      : undefined;
    if (
      isFiniteNumber(effectiveFovDeg) &&
      !isZeroish(effectiveFovDeg - defaultFovDeg)
    ) {
      params.fov = effectiveFovDeg;
    }

    return params;
  },

  hydrateToCarma(
    values: Record<string, unknown>,
    viewport: ViewAdapterViewport,
    options?: ViewAdapterOptions
  ): SceneViewState | null {
    const lng = coerceFiniteNumber(values.lng);
    const lat = coerceFiniteNumber(values.lat);
    const altitude = coerceFiniteNumber(values.altitude);
    const zoom = coerceFiniteNumber(values.zoom);
    const bearing = coerceFiniteNumber(values.bearing);
    const pitch = coerceFiniteNumber(values.pitch);
    const fovDeg = coerceFiniteNumber(values.fov);

    if (
      !isFiniteNumber(lng) ||
      !isFiniteNumber(lat) ||
      !isFiniteNumber(zoom) ||
      !isFiniteNumber(altitude)
    ) {
      return null;
    }

    return maplibreAdapter.viewToCarma(
      {
        lng,
        lat,
        zoom,
        altitude,
        ...(isFiniteNumber(bearing) ? { bearing } : {}),
        ...(isFiniteNumber(pitch) ? { pitch } : {}),
        ...(isFiniteNumber(fovDeg) ? { fovDeg } : {}),
      },
      viewport,
      options
    );
  },
};

// ── Leaflet adapter ──

export const leafletAdapter = {
  carmaToView(
    viewState: SceneViewState,
    viewport: ViewAdapterViewport,
    options?: ViewAdapterOptions
  ): LeafletViewValues | null {
    const target = viewStateToTarget(viewState);
    if (!target) {
      return null;
    }

    const projection = projectViewSyncTargetToLeaflet(
      target,
      { widthPx: viewport.widthPx, heightPx: viewport.heightPx },
      {
        fovVertical:
          viewState.orientation.fovVerticalRad ??
          degToRadNumeric(resolveOptions(options).defaultFovDeg)!,
      }
    );
    if (!projection) {
      return null;
    }

    return {
      lng: projection.center.lng,
      lat: projection.center.lat,
      zoom: projection.zoom,
    };
  },

  viewToCarma(
    values: LeafletViewValues,
    viewport: ViewAdapterViewport,
    fallbackAltitudeM: number = 200,
    options?: ViewAdapterOptions
  ): SceneViewState | null {
    const { lng, lat, zoom } = values;
    if (!isFiniteNumber(lng) || !isFiniteNumber(lat) || !isFiniteNumber(zoom)) {
      return null;
    }

    const target = projectLeafletViewToViewSyncTarget(
      lng,
      lat,
      zoom,
      fallbackAltitudeM,
      { widthPx: viewport.widthPx, heightPx: viewport.heightPx },
      degToRadNumeric(resolveOptions(options).defaultFovDeg)!
    );
    return target ? targetToViewState(target) : null;
  },
};

export const readSceneViewStateFromLeafletMap = (
  map: LeafletMap | null | undefined,
  fallbackAltitudeM: number = 200,
  options?: ViewAdapterOptions
): SceneViewState | null => {
  if (!map || !(map as LeafletMap & { _loaded?: boolean })._loaded) {
    return null;
  }

  try {
    const center = map.getCenter();
    return leafletAdapter.viewToCarma(
      {
        lng: center.lng,
        lat: center.lat,
        zoom: map.getZoom(),
      },
      readViewportFromElement(map.getContainer()),
      fallbackAltitudeM,
      options
    );
  } catch {
    return null;
  }
};

export const readSceneViewStateFromMapLibreMap = (
  map: MapLibreMap | null | undefined,
  altitudeM: number,
  options?: ViewAdapterOptions
): SceneViewState | null => {
  if (!map || !isFiniteNumber(altitudeM)) {
    return null;
  }

  const center = map.getCenter();
  return maplibreAdapter.viewToCarma(
    {
      lng: center.lng,
      lat: center.lat,
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      altitude: altitudeM,
    },
    readViewportFromElement(map.getContainer()),
    options
  );
};

// ── Cesium adapter ──

export const cesiumAdapter = {
  carmaToView(
    viewState: SceneViewState | null | undefined
  ): CesiumCameraView | null {
    if (!viewState) {
      return null;
    }

    return {
      anchorLngRad: degToRadNumeric(viewState.anchor.lngDeg)!,
      anchorLatRad: degToRadNumeric(viewState.anchor.latDeg)!,
      anchorHeightM: viewState.anchor.heightM,
      ...(isFiniteNumber(viewState.orientation.bearingRad)
        ? { bearingRad: viewState.orientation.bearingRad }
        : {}),
      ...(isFiniteNumber(viewState.orientation.pitchRad)
        ? { pitchRad: viewState.orientation.pitchRad }
        : {}),
      ...(isFiniteNumber(viewState.orientation.rollRad)
        ? { rollRad: viewState.orientation.rollRad }
        : {}),
      ...(isFiniteNumber(viewState.orientation.rangeM)
        ? { rangeM: viewState.orientation.rangeM }
        : {}),
      ...(isFiniteNumber(viewState.orientation.fovVerticalRad)
        ? { fovVerticalRad: viewState.orientation.fovVerticalRad }
        : {}),
    };
  },

  viewToCarma(
    view: CesiumCameraView | null | undefined
  ): SceneViewState | null {
    if (!view) {
      return null;
    }

    return {
      anchor: {
        lngDeg: radToDegNumeric(view.anchorLngRad)!,
        latDeg: radToDegNumeric(view.anchorLatRad)!,
        heightM: view.anchorHeightM,
      },
      orientation: {
        ...(isFiniteNumber(view.bearingRad)
          ? { bearingRad: view.bearingRad }
          : {}),
        ...(isFiniteNumber(view.pitchRad) ? { pitchRad: view.pitchRad } : {}),
        ...(isFiniteNumber(view.rollRad) ? { rollRad: view.rollRad } : {}),
        ...(isFiniteNumber(view.rangeM) ? { rangeM: view.rangeM } : {}),
        ...(isFiniteNumber(view.fovVerticalRad)
          ? { fovVerticalRad: view.fovVerticalRad }
          : {}),
      },
    };
  },
};
