import { describe, expect, it } from "vitest";
import {
  CAMERA_TYPE,
  readMetersPerCssPixel,
} from "@carma-commons/camera/model";
import {
  cartographicToEcef,
  enuOffsetToEcef,
  getZoomFromPixelResolutionAtLatitudeRad,
} from "@carma/geo/utils";
import { degToRadNumeric } from "@carma/units/helpers";
import type { CssPixels, Meters, Radians } from "@carma/units/types";
import { buildViewState, buildViewStateFromEcef } from "./construct";
import { buildAnchoredOrientationQuaternion } from "./anchoredOrbit";
import {
  deriveOrbitAngles,
  deriveRange,
  deriveRoll,
  deriveZoom,
} from "./derivations";

const meters = (value: number): Meters => value as Meters;
const radians = (valueDeg: number): Radians =>
  degToRadNumeric(valueDeg)! as Radians;

const buildViewportState = (widthPx: number, heightPx: number) =>
  buildViewState({
    longitude: radians(7.2),
    latitude: radians(51.27),
    altitude: meters(180),
    bearing: radians(195),
    pitch: radians(58),
    range: meters(620),
    intrinsics: {
      type: CAMERA_TYPE.PERSPECTIVE,
      fov: radians(60),
      viewOffset: {
        fullWidth: widthPx as CssPixels,
        fullHeight: heightPx as CssPixels,
        offsetX: 0 as CssPixels,
        offsetY: 0 as CssPixels,
        width: widthPx as CssPixels,
        height: heightPx as CssPixels,
      },
    },
    metadata: {
      frameId: 1,
      timestampMs: 1_700_000_000_000,
      sourceId: "spec",
      source: "sync",
    },
  });

describe("deriveZoom", () => {
  it("uses stored viewport dimensions when available", () => {
    const state = buildViewportState(480, 900);
    const explicitState = buildViewState({
      longitude: state.anchorCartographic.longitude as number,
      latitude: state.anchorCartographic.latitude as number,
      altitude: state.anchorCartographic.altitude as number,
      bearing: radians(195),
      pitch: radians(58),
      range: meters(620),
      intrinsics: {
        type: CAMERA_TYPE.PERSPECTIVE,
        fov: radians(60),
      },
      metadata: state.metadata,
    });

    expect(deriveZoom(state)).toBeCloseTo(
      deriveZoom(explicitState, 480, 900),
      8
    );
    expect(deriveZoom(explicitState) - deriveZoom(state)).toBeGreaterThan(0.9);
  });

  it("uses the longer-edge fov when only vertical fov is stored", () => {
    const widthPx = 1600;
    const heightPx = 900;
    const state = buildViewportState(widthPx, heightPx);
    const range = deriveRange(state);
    const longerEdgeFov =
      Math.atan(
        Math.tan((state.intrinsics.fov as number) * 0.5) * (widthPx / heightPx)
      ) * 2;
    const metersPerCssPixel = readMetersPerCssPixel({
      rangeM: range,
      fovRad: longerEdgeFov,
      viewportWidthPx: widthPx,
      viewportHeightPx: heightPx,
    });
    const expectedZoom = getZoomFromPixelResolutionAtLatitudeRad(
      metersPerCssPixel as Meters,
      state.anchorCartographic.latitude,
      { tileSize: 512 }
    );

    expect(deriveZoom(state)).toBeCloseTo(expectedZoom, 8);
  });
});

describe("anchored-orbit round-trip", () => {
  it("recovers bearing, pitch, and roll from a state built from angle inputs", () => {
    const state = buildViewState({
      longitude: radians(7.2),
      latitude: radians(51.27),
      altitude: meters(180),
      bearing: radians(54),
      pitch: radians(42),
      roll: radians(17),
      range: meters(620),
      intrinsics: {
        type: CAMERA_TYPE.PERSPECTIVE,
        fov: radians(60),
      },
      metadata: {
        frameId: 1,
        timestampMs: 1_700_000_000_000,
        sourceId: "spec",
        source: "sync",
      },
    });

    const orbit = deriveOrbitAngles(state);

    expect(orbit.bearing).toBeCloseTo(radians(54), 8);
    expect(orbit.pitch).toBeCloseTo(radians(42), 8);
    expect(orbit.range).toBeCloseTo(meters(620), 8);
    expect(deriveRoll(state)).toBeCloseTo(radians(17), 8);
  });

  it("keeps nadir-topdown north stable even when camera position has tiny horizontal noise", () => {
    const longitude = radians(7.2);
    const latitude = radians(51.27);
    const altitude = meters(180);
    const anchor = cartographicToEcef(longitude, latitude, altitude);
    const cameraPosition = enuOffsetToEcef(0.001, -0.001, 620, anchor);
    const state = buildViewStateFromEcef({
      anchor,
      cameraPosition,
      orientation: buildAnchoredOrientationQuaternion({
        bearing: radians(0),
        pitch: radians(0),
      }),
      intrinsics: {
        type: CAMERA_TYPE.PERSPECTIVE,
        fov: radians(60),
      },
      metadata: {
        frameId: 1,
        timestampMs: 1_700_000_000_000,
        sourceId: "spec",
        source: "sync",
      },
    });

    const orbit = deriveOrbitAngles(state);

    expect(orbit.bearing).toBeCloseTo(radians(0), 8);
    expect(orbit.pitch).toBeCloseTo(radians(0), 8);
    expect(orbit.range).toBeCloseTo(deriveRange(state), 8);
  });
});
