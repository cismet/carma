import type { Map as MaplibreMap } from "maplibre-gl";

import { clamp } from "@carma-commons/math";

import type { AtmosphericSunlightSample } from "./atmospheric-sunlight";

const MAPLIBRE_STYLE_ANIMATION_UPDATE_INTERVAL_MS = 1_000;

/** Owns the throttled MapLibre light and label updates for one shadow scene. */
export const createShadowMapLibreLight = (
  map: MaplibreMap,
  setLocationLabelColor: (color: string) => void,
  isAnimating: () => boolean,
  isMoving: () => boolean
) => {
  let lastMapLibreStyleUpdateMs = Number.NEGATIVE_INFINITY;
  let pendingMapLibreLightSample: AtmosphericSunlightSample | null = null;
  let mapLibreStyleUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  const applyMapLibreLightSampleImmediately = (
    sample: AtmosphericSunlightSample
  ) => {
    pendingMapLibreLightSample = null;
    lastMapLibreStyleUpdateMs = performance.now();
    const nextColor = `#${sample.color.getHexString()}`;
    // A label colour change re-runs the overlay maintenance over every symbol
    // layer of the basemap. While the sun animates, keep the colour from the
    // start of the animation; the stop flushes the final sample.
    if (!isAnimating()) setLocationLabelColor(nextColor);
    if (!map.isStyleLoaded()) return;
    const nextPosition: [number, number, number] = [
      1.5,
      sample.azimuthDegrees,
      90 - sample.elevationDegrees,
    ];
    const nextIntensity = clamp(sample.relativeIntensity, 0, 1);
    const currentLight = map.getLight();
    const currentPosition = currentLight.position;
    if (
      currentLight.anchor === "map" &&
      Array.isArray(currentPosition) &&
      currentPosition.length === nextPosition.length &&
      currentPosition.every((value, index) => value === nextPosition[index]) &&
      currentLight.color === nextColor &&
      currentLight.intensity === nextIntensity
    ) {
      return;
    }
    map.setLight({
      anchor: "map",
      position: nextPosition,
      color: nextColor,
      intensity: nextIntensity,
    });
  };
  const flushMapLibreLightSample = () => {
    if (mapLibreStyleUpdateTimer !== null) {
      globalThis.clearTimeout(mapLibreStyleUpdateTimer);
      mapLibreStyleUpdateTimer = null;
    }
    const sample = pendingMapLibreLightSample;
    if (sample) applyMapLibreLightSampleImmediately(sample);
  };
  const applyMapLibreLightSample = (sample: AtmosphericSunlightSample) => {
    pendingMapLibreLightSample = sample;
    if (!isAnimating() && !isMoving()) {
      flushMapLibreLightSample();
      return;
    }

    const elapsedMs = performance.now() - lastMapLibreStyleUpdateMs;
    if (elapsedMs >= MAPLIBRE_STYLE_ANIMATION_UPDATE_INTERVAL_MS) {
      flushMapLibreLightSample();
      return;
    }
    if (mapLibreStyleUpdateTimer !== null) return;
    mapLibreStyleUpdateTimer = globalThis.setTimeout(() => {
      mapLibreStyleUpdateTimer = null;
      const latestSample = pendingMapLibreLightSample;
      if (latestSample) applyMapLibreLightSampleImmediately(latestSample);
    }, MAPLIBRE_STYLE_ANIMATION_UPDATE_INTERVAL_MS - elapsedMs);
  };

  return {
    apply: applyMapLibreLightSample,
    flush(sample?: AtmosphericSunlightSample) {
      if (sample) pendingMapLibreLightSample = sample;
      flushMapLibreLightSample();
    },
    dispose() {
      if (mapLibreStyleUpdateTimer !== null) {
        globalThis.clearTimeout(mapLibreStyleUpdateTimer);
        mapLibreStyleUpdateTimer = null;
      }
    },
  };
};
