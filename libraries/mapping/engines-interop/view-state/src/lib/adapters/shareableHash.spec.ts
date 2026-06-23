import { describe, expect, it } from "vitest";

import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";
import type { CssPixels } from "@carma-units";

import { buildViewState } from "../core/construct";
import { deriveOrbitAngles } from "../core/derivations";
import { HASH_ZOOM_CONVENTION } from "../core/viewStateHash";
import type { ShareableViewState } from "../types";
import {
  applyToShareableViewState,
  createShareableViewStateHashCodec,
  readFromShareableViewState,
  readShareableViewState,
  resolveViewStateForViewport,
  type ShareableViewStateHashCodecOptions,
} from "./shareable";
const makeShareableViewState = (
  overrides: Partial<ShareableViewState> = {}
): ShareableViewState => ({
  lat: 51.2677,
  lng: 7.19163,
  altitude: 200,
  zoom: 17,
  bearing: 0,
  pitch: 45,
  ...overrides,
});

const px = (value: number): CssPixels => value as CssPixels;

const withViewport = <T extends ReturnType<typeof readFromShareableViewState>>(
  state: T,
  width: number,
  height: number
): T =>
  ({
    ...state,
    metadata: {
      ...state.metadata,
      viewport: {
        widthPx: px(width),
        heightPx: px(height),
      },
    },
  } as T);

describe("readShareableViewState", () => {
  it("parses hash payload values and rounds by configured precision", () => {
    const parsed = readShareableViewState(
      {
        lat: "51.26771234",
        lng: "7.19163222",
        altitude: "200.128",
        zoom: "17.2345",
        bearing: "-10",
        pitch: "44.949",
      },
      {
        precision: {
          lat: 4,
          lng: 5,
          altitude: 1,
          zoom: 2,
          bearing: 1,
          pitch: 1,
        },
      }
    );

    expect(parsed).toEqual({
      lat: 51.2677,
      lng: 7.19163,
      altitude: 200.1,
      zoom: 17.23,
      bearing: -10,
      pitch: 44.9,
    });
  });

  it("returns null when required coordinates are missing", () => {
    expect(readShareableViewState({ lat: 51, lng: 7, zoom: 12 })).toBeNull();
  });

  it("returns null when zoom is missing", () => {
    expect(
      readShareableViewState({ lat: 51.2, lng: 7.1, altitude: 150 })
    ).toBeNull();
  });

  it("ignores range-only payloads and requires zoom", () => {
    expect(
      readShareableViewState({
        lat: 51.2,
        lng: 7.1,
        altitude: 150,
        range: 620,
      })
    ).toBeNull();
  });

  it("keeps raw parsed orientation values and defers normalization to ViewState mapping", () => {
    const parsed = readShareableViewState({
      lat: 51.2677,
      lng: 7.19163,
      altitude: 200,
      zoom: 17,
      pitch: 500,
      roll: 190,
    });

    expect(parsed?.pitch).toBe(500);
    expect(parsed?.roll).toBe(190);
  });
});

describe("applyToShareableViewState", () => {
  it("omits wrapped north bearing and zero pitch from encoded payload", () => {
    const source = readFromShareableViewState(
      makeShareableViewState({
        bearing: 360,
        pitch: 0,
      })
    );

    const encoded = applyToShareableViewState(source);

    expect(encoded.bearing).toBeUndefined();
    expect(encoded.pitch).toBeUndefined();
  });

  it("supports app-defined per-field precision", () => {
    const source = readFromShareableViewState(
      makeShareableViewState({
        lat: 51.26771234,
        lng: 7.19163222,
        altitude: 200.128,
        bearing: 123.456,
        pitch: 44.949,
      })
    );

    const encoded = applyToShareableViewState(source, {
      precision: {
        lat: 4,
        lng: 5,
        altitude: 1,
        zoom: 2,
        bearing: 1,
        pitch: 1,
        roll: 1,
        fov: 1,
      },
    });

    expect(encoded.lat).toBe(51.2677);
    expect(encoded.lng).toBe(7.19163);
    expect(encoded.altitude).toBe(200.1);
    expect(encoded.bearing).toBe(123.5);
    expect(encoded.pitch).toBe(44.9);
  });

  it("encodes orthographic states via zoom without writing a fallback fov", () => {
    const source = readFromShareableViewState(makeShareableViewState(), {
      zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
    });
    const orthographicSource = {
      ...source,
      intrinsics: {
        type: CAMERA_TYPE.ORTHOGRAPHIC,
        orthographicScale: {
          metersPerCssPixel: 1.5,
        },
      },
    };

    const encoded = applyToShareableViewState(orthographicSource, {
      zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
    });

    expect(encoded.zoom).toBeDefined();
    expect(encoded.fov).toBeUndefined();
  });

  it.each([89, 90, -90, 91, -91])(
    "throws instead of encoding non-Web-Mercator latitude %s",
    (latitudeDeg) => {
      const source = buildViewState({
        longitude: degToRadNumeric(7.19163)!,
        latitude: degToRadNumeric(latitudeDeg)!,
        altitude: 200,
        bearing: degToRadNumeric(180)!,
        pitch: degToRadNumeric(45)!,
        range: 620,
        intrinsics: {
          type: CAMERA_TYPE.PERSPECTIVE,
          fov: degToRadNumeric(60)!,
        },
        metadata: {
          frameId: 1,
          timestampMs: 1_700_000_000_000,
          sourceId: "test",
          source: "hash",
        },
      });

      expect(() => applyToShareableViewState(source)).toThrow(
        "Cannot encode ShareableViewState without a valid Web Mercator zoom."
      );
    }
  );
});

describe("readFromShareableViewState", () => {
  it.each([
    { pitch: -10, expectedPitch: 0 },
    { pitch: 200, expectedPitch: 180 },
  ])(
    "clamps canonical pitch %s to the default 0..PI restore range",
    ({ pitch, expectedPitch }) => {
      const restored = readFromShareableViewState(
        makeShareableViewState({
          pitch,
        })
      );

      const orbit = deriveOrbitAngles(restored);

      expect(radToDegNumeric(orbit.pitch)).toBeCloseTo(expectedPitch, 8);
    }
  );

  it("preserves over-horizon pitch when no restore limiter is configured", () => {
    const restored = readFromShareableViewState(
      makeShareableViewState({
        pitch: 120,
      })
    );

    const orbit = deriveOrbitAngles(restored);

    expect(radToDegNumeric(orbit.pitch)).toBeCloseTo(120, 8);
  });

  it("clamps hash pitch only when restore pitch limits are configured", () => {
    const restored = readFromShareableViewState(
      makeShareableViewState({
        pitch: 120,
      }),
      {
        restorePitchLimitsRad: {
          minPitchRad: degToRadNumeric(15)!,
          maxPitchRad: degToRadNumeric(85)!,
        },
      }
    );

    const orbit = deriveOrbitAngles(restored);

    expect(radToDegNumeric(orbit.pitch)).toBeCloseTo(85, 8);
  });

  it("applies a configured restore min pitch without adding a product max pitch", () => {
    const restored = readFromShareableViewState(
      makeShareableViewState({
        pitch: 5,
      }),
      {
        restorePitchLimitsRad: {
          minPitchRad: degToRadNumeric(15)!,
        },
      }
    );

    const orbit = deriveOrbitAngles(restored);

    expect(radToDegNumeric(orbit.pitch)).toBeCloseTo(15, 8);
  });
});

const createShareableHashCodec = (
  options: ShareableViewStateHashCodecOptions = {}
) => createShareableViewStateHashCodec(options);

describe("createShareableViewStateHashCodec", () => {
  it("encodes directly into hash-equivalent ShareableViewState", () => {
    const codec = createShareableHashCodec({
      zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
      precision: {
        lat: 4,
        lng: 5,
        altitude: 1,
        zoom: 2,
      },
    });

    const state = readFromShareableViewState(makeShareableViewState(), {
      zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
    });

    const encoded = codec.encode(state);

    expect(encoded).toEqual({
      lat: 51.2677,
      lng: 7.19163,
      altitude: 200,
      zoom: 17,
      pitch: 45,
    });
  });

  it("decodes string hash values and round-trips with leaflet zoom convention", () => {
    const codec = createShareableHashCodec({
      zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
      defaultFovDeg: 60,
      precision: {
        lat: 4,
        lng: 5,
        altitude: 1,
        zoom: 2,
        bearing: 1,
        pitch: 1,
        roll: 1,
        fov: 1,
      },
    });

    const decoded = codec.decode({
      lat: "51.2677",
      lng: "7.19163",
      altitude: "200",
      zoom: "17",
      pitch: "45",
      bearing: "180",
      fov: "60",
    });

    expect(decoded).not.toBeNull();

    const reEncoded = codec.encode(decoded);
    expect(reEncoded).toEqual({
      lat: 51.2677,
      lng: 7.19163,
      altitude: 200,
      zoom: 17,
      bearing: 180,
      pitch: 45,
    });
  });

  it("applies legacy Cesium restore max-pitch semantics inside codec creation", () => {
    const codec = createShareableHashCodec({
      cameraLimiterOptions: {
        limiter: {
          pitch: {
            enabled: true,
            max: 15,
          },
        },
      },
    });

    const decoded = codec.decode({
      lat: "51.2677",
      lng: "7.19163",
      altitude: "200",
      zoom: "17",
      pitch: "120",
    });

    expect(decoded).not.toBeNull();
    expect(radToDegNumeric(deriveOrbitAngles(decoded!).pitch)).toBeCloseTo(
      15,
      8
    );
  });

  it("returns null instead of throwing when shareable encoding rejects the state", () => {
    const codec = createShareableHashCodec();
    const invalidState = buildViewState({
      longitude: degToRadNumeric(7.19163)!,
      latitude: degToRadNumeric(90)!,
      altitude: 200,
      bearing: degToRadNumeric(180)!,
      pitch: degToRadNumeric(45)!,
      range: 620,
      intrinsics: {
        type: CAMERA_TYPE.PERSPECTIVE,
        fov: degToRadNumeric(60)!,
      },
      metadata: {
        frameId: 1,
        timestampMs: 1_700_000_000_000,
        sourceId: "test",
        source: "hash",
      },
    });

    expect(codec.encode(invalidState)).toBeNull();
  });

  it.each([
    [976, 732],
    [732, 976],
    [1440, 900],
    [900, 1440],
  ])(
    "keeps the shareable zoom stable across viewport round-trips for %ix%i canvases",
    (viewportWidthPx, viewportHeightPx) => {
      const codec = createShareableHashCodec({
        zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
        defaultFovDeg: 45,
      });
      const hashState: ShareableViewState = {
        lat: 51.2699953,
        lng: 7.2001875,
        altitude: 157,
        zoom: 19.105,
        pitch: 44.92,
        bearing: 154.69,
      };

      const restoredState = codec.decode(hashState);

      expect(restoredState).not.toBeNull();

      const viewportResolvedState = resolveViewStateForViewport(
        restoredState!,
        {
          viewportWidthPx,
          viewportHeightPx,
        }
      );
      const liveState = withViewport(
        viewportResolvedState,
        viewportWidthPx,
        viewportHeightPx
      );
      const reEncoded = codec.encode(liveState) as ShareableViewState;

      expect(reEncoded.zoom).toBeCloseTo(hashState.zoom!, 3);
      expect(reEncoded.lat).toBeCloseTo(hashState.lat, 7);
      expect(reEncoded.lng).toBeCloseTo(hashState.lng, 7);
      expect(reEncoded.altitude).toBeCloseTo(hashState.altitude, 2);
      expect(reEncoded.pitch).toBeCloseTo(hashState.pitch!, 2);
      expect(reEncoded.bearing).toBeCloseTo(hashState.bearing!, 2);
    }
  );
});
