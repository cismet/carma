import { describe, expect, it } from "vitest";
import { degToRadNumeric } from "@carma/units/helpers";
import { HASH_ZOOM_CONVENTION } from "../core/viewStateHash";
import type { ShareableViewState } from "../types";
import { createViewStateShareableHashCodec } from "../runtime/providers/navigation/viewStateShareableHashCodec";
import {
  applyToShareableHashValues,
  readFromShareableHashValues,
  type ShareableViewStateAdapterOptions,
} from "./shareable";

const createShareableViewStateHashCodec = (
  options: ShareableViewStateAdapterOptions = {}
) => ({
  encode: (viewState: ShareableViewState | null | undefined) =>
    viewState ? applyToShareableHashValues(viewState, options) : null,
  decode: (hashValues: Record<string, unknown>) =>
    readFromShareableHashValues(hashValues, options),
});

const asRadians = (value: number) =>
  degToRadNumeric(value)! as ShareableViewState["bearing"];
const asMeters = (value: number) => value as ShareableViewState["range"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const make2dShareableViewState = (
  overrides: Partial<ShareableViewState> = {}
): ShareableViewState => ({
  longitude: asRadians(7.2018253),
  latitude: asRadians(51.2720217),
  altitude: asMeters(165.14),
  zoom: 15.001,
  bearing: asRadians(0),
  pitch: asRadians(0),
  range: asMeters(750),
  ...overrides,
});

const make3dShareableViewState = (
  overrides: Partial<ShareableViewState> = {}
): ShareableViewState => ({
  longitude: asRadians(7.140041),
  latitude: asRadians(51.2643569),
  altitude: asMeters(188.57),
  zoom: 15.991,
  bearing: asRadians(311.1),
  pitch: asRadians(52.78),
  range: asMeters(500),
  fovVertical: asRadians(40),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Zoom convention
// ---------------------------------------------------------------------------

describe("shareable hash codec zoom convention", () => {
  it("applies +1 offset when using LEAFLET_256", () => {
    const codec = createShareableViewStateHashCodec({
      zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
    });
    const params = codec.encode(make2dShareableViewState());
    expect(params?.zoom).toBeCloseTo(16.001, 6);
  });

  it("decodes leaflet zoom back with -1 offset", () => {
    const codec = createShareableViewStateHashCodec({
      zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
    });
    const viewState = codec.decode({
      lng: 7.2018253,
      lat: 51.2720217,
      zoom: 16.001,
      altitude: 165.14,
    });
    expect(viewState).not.toBeNull();
    expect(viewState?.zoom).toBeCloseTo(15.001, 6);
  });

  it("passes through zoom unchanged with MAPLIBRE_512", () => {
    const codec = createShareableViewStateHashCodec({
      zoomConvention: HASH_ZOOM_CONVENTION.MAPLIBRE_512,
    });
    const params = codec.encode(make2dShareableViewState());
    expect(params?.zoom).toBeCloseTo(15.001, 6);
  });

  it("round-trips zoom through +1/-1 offset", () => {
    const codec = createShareableViewStateHashCodec({
      zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
    });
    const original = make2dShareableViewState({ zoom: 14.5 });
    const encoded = codec.encode(original);
    expect(encoded!.zoom).toBeCloseTo(15.5, 6);

    const decoded = codec.decode(encoded!);
    expect(decoded!.zoom).toBeCloseTo(14.5, 2);
  });
});

// ---------------------------------------------------------------------------
// Longer-edge FOV encode
// ---------------------------------------------------------------------------

describe("shareable hash codec FOV encode", () => {
  it("encodes longer-edge fov from fovLongerEdge", () => {
    const codec = createShareableViewStateHashCodec({ defaultFovDeg: 60 });
    const params = codec.encode(
      make3dShareableViewState({
        fovVertical: asRadians(40),
        fovLongerEdge: asRadians(72),
      })
    );
    expect(params?.fov).toBeCloseTo(72, 1);
  });

  it("falls back to max(fovVertical, fovHorizontal) when fovLongerEdge absent", () => {
    const codec = createShareableViewStateHashCodec();
    const params = codec.encode(
      make3dShareableViewState({
        fovVertical: asRadians(72),
        fovHorizontal: asRadians(45),
        fovLongerEdge: undefined,
      })
    );
    expect(params?.fov).toBeCloseTo(72, 1);
  });

  it("omits fov when longer-edge equals defaultFovDeg", () => {
    const codec = createShareableViewStateHashCodec({ defaultFovDeg: 60 });
    const params = codec.encode(
      make3dShareableViewState({
        fovVertical: asRadians(40),
        fovLongerEdge: asRadians(60),
      })
    );
    expect(params).not.toBeNull();
    expect(params?.fov).toBeUndefined();
  });

  it("strips vertical fov leak when longer-edge is default", () => {
    const codec = createShareableViewStateHashCodec({ defaultFovDeg: 60 });
    const params = codec.encode(
      make3dShareableViewState({
        fovVertical: asRadians(40),
        fovLongerEdge: asRadians(60),
      })
    );
    expect(params).not.toBeNull();
    expect(params?.fov).toBeUndefined();
    expect(params?.lat).toBeDefined();
    expect(params?.lng).toBeDefined();
  });

  it("writes non-default longer-edge fov", () => {
    const codec = createShareableViewStateHashCodec({ defaultFovDeg: 60 });
    const params = codec.encode(
      make3dShareableViewState({
        fovVertical: asRadians(50),
        fovLongerEdge: asRadians(72),
      })
    );
    expect(params?.fov).toBeCloseTo(72, 1);
  });

  it("omits fov entirely when all FOV fields are undefined", () => {
    const codec = createShareableViewStateHashCodec({ defaultFovDeg: 60 });
    const params = codec.encode(
      make3dShareableViewState({
        fovVertical: undefined,
        fovHorizontal: undefined,
        fovLongerEdge: undefined,
      })
    );
    expect(params).not.toBeNull();
    expect(params?.fov).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Longer-edge FOV decode
// ---------------------------------------------------------------------------

describe("shareable hash codec FOV decode", () => {
  it("decodes hash fov into fovLongerEdge (radians)", () => {
    const codec = createShareableViewStateHashCodec({
      zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
    });
    const viewState = codec.decode({
      lng: 7.2018253,
      lat: 51.2720217,
      zoom: 16.001,
      fov: 72,
      altitude: 165.14,
    });
    expect(viewState).not.toBeNull();
    expect(viewState?.fovVertical).toBeUndefined();
    expect(viewState?.fovLongerEdge).toBeCloseTo(asRadians(72), 8);
  });

  it("does not set fovLongerEdge when hash has no fov", () => {
    const codec = createShareableViewStateHashCodec();
    const viewState = codec.decode({
      lng: 7.2018253,
      lat: 51.2720217,
      zoom: 15.001,
      altitude: 165.14,
    });
    expect(viewState).not.toBeNull();
    expect(viewState?.fovLongerEdge).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Full round-trip tests
// ---------------------------------------------------------------------------

describe("shareable hash codec round-trips", () => {
  const codec = createShareableViewStateHashCodec({
    zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
    defaultFovDeg: 60,
  });

  it("round-trips a 2D view state", () => {
    const original = make2dShareableViewState();
    const encoded = codec.encode(original);
    expect(encoded).not.toBeNull();

    const decoded = codec.decode(encoded!);
    expect(decoded).not.toBeNull();
    expect(decoded!.longitude).toBeCloseTo(original.longitude, 5);
    expect(decoded!.latitude).toBeCloseTo(original.latitude, 5);
    expect(decoded!.zoom).toBeCloseTo(original.zoom!, 2);
  });

  it("round-trips bearing and pitch", () => {
    const original = make2dShareableViewState({
      bearing: asRadians(135),
      pitch: asRadians(45),
    });
    const encoded = codec.encode(original);
    const decoded = codec.decode(encoded!);

    expect(decoded).not.toBeNull();
    expect(decoded!.bearing).toBeCloseTo(original.bearing, 3);
    expect(decoded!.pitch).toBeCloseTo(original.pitch, 3);
  });

  it("omits wrapped north bearing and zero pitch from the encoded hash", () => {
    const encoded = codec.encode(
      make2dShareableViewState({
        bearing: asRadians(360),
        pitch: asRadians(0),
      })
    );

    expect(encoded).not.toBeNull();
    expect(encoded?.bearing).toBeUndefined();
    expect(encoded?.pitch).toBeUndefined();
  });

  it("omits pitch when it is below hash precision and would round to zero", () => {
    const encoded = codec.encode(
      make2dShareableViewState({
        bearing: asRadians(15),
        pitch: asRadians(0.009),
      })
    );

    expect(encoded).not.toBeNull();
    expect(encoded?.pitch).toBeUndefined();
  });

  it("omits wrapped north bearing when it is numerically just below 360 degrees", () => {
    const encoded = codec.encode(
      make2dShareableViewState({
        bearing: asRadians(359.999999),
        pitch: asRadians(45),
      })
    );

    expect(encoded).not.toBeNull();
    expect(encoded?.bearing).toBeUndefined();
    expect(encoded?.pitch).toBeCloseTo(45, 1);
  });

  it("round-trips 3D view state with non-default fov", () => {
    const original = make3dShareableViewState({
      fovVertical: asRadians(40),
      fovLongerEdge: asRadians(72),
    });

    const encoded = codec.encode(original);
    expect(encoded).not.toBeNull();
    expect(encoded!.fov).toBeCloseTo(72, 1);

    const decoded = codec.decode(encoded!);
    expect(decoded).not.toBeNull();
    expect(decoded!.fovLongerEdge).toBeCloseTo(asRadians(72), 3);
    expect(decoded!.fovVertical).toBeUndefined();
  });

  it("round-trips without fov when longer-edge equals default", () => {
    const original = make3dShareableViewState({
      fovVertical: asRadians(40),
      fovLongerEdge: asRadians(60),
    });

    const encoded = codec.encode(original);
    expect(encoded).not.toBeNull();
    expect(encoded!.fov).toBeUndefined();

    const decoded = codec.decode(encoded!);
    expect(decoded).not.toBeNull();
    expect(decoded!.fovLongerEdge).toBeUndefined();
  });

  it("round-trips a view state with non-zero roll", () => {
    const original = make3dShareableViewState({ roll: asRadians(15) });
    const encoded = codec.encode(original);
    expect(encoded!.roll).toBeCloseTo(15, 1);

    const decoded = codec.decode(encoded!);
    expect(decoded).not.toBeNull();
    expect(decoded!.roll).toBeCloseTo(asRadians(15), 3);
  });

  it("preserves longitude/latitude precision through round-trip", () => {
    const original = make2dShareableViewState({
      longitude: asRadians(7.1400413),
      latitude: asRadians(51.2643569),
    });

    const encoded = codec.encode(original);
    const decoded = codec.decode(encoded!);

    expect(decoded).not.toBeNull();
    const lngDegDecoded = (decoded!.longitude * 180) / Math.PI;
    const latDegDecoded = (decoded!.latitude * 180) / Math.PI;
    expect(lngDegDecoded).toBeCloseTo(7.1400413, 5);
    expect(latDegDecoded).toBeCloseTo(51.2643569, 5);
  });

  it("encode returns null for null input", () => {
    expect(codec.encode(null)).toBeNull();
  });

  it("decode returns null for incomplete hash values", () => {
    expect(codec.decode({ lng: 7.2 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Geoportal-realistic round-trips (matches actual URL patterns)
// ---------------------------------------------------------------------------

describe("geoportal-realistic round-trips", () => {
  const geoportalCodec = createShareableViewStateHashCodec({
    zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
    defaultFovDeg: 60,
  });

  it("round-trips a typical 3D geoportal URL hash", () => {
    const hashValues = {
      lat: 51.2643569,
      lng: 7.140041,
      zoom: 16.991,
      bearing: 311.1,
      pitch: 52.78,
      altitude: 188.57,
    };

    const decoded = geoportalCodec.decode(hashValues);
    expect(decoded).not.toBeNull();

    const reEncoded = geoportalCodec.encode(decoded!);
    expect(reEncoded).not.toBeNull();

    expect(reEncoded!.lat).toBeCloseTo(hashValues.lat, 5);
    expect(reEncoded!.lng).toBeCloseTo(hashValues.lng, 5);
    expect(reEncoded!.zoom).toBeCloseTo(hashValues.zoom, 2);
    expect(reEncoded!.bearing).toBeCloseTo(hashValues.bearing, 1);
    expect(reEncoded!.pitch).toBeCloseTo(hashValues.pitch, 1);
    expect(reEncoded!.altitude).toBeCloseTo(hashValues.altitude, 1);
    expect(reEncoded!.fov).toBeUndefined();
  });

  it("round-trips a 2D geoportal URL hash (no bearing/pitch)", () => {
    const hashValues = {
      lat: 51.2720217,
      lng: 7.2018253,
      zoom: 14.0,
      altitude: 165.14,
    };

    const decoded = geoportalCodec.decode(hashValues);
    expect(decoded).not.toBeNull();

    const reEncoded = geoportalCodec.encode(decoded!);
    expect(reEncoded).not.toBeNull();
    expect(reEncoded!.lat).toBeCloseTo(hashValues.lat, 5);
    expect(reEncoded!.lng).toBeCloseTo(hashValues.lng, 5);
    expect(reEncoded!.zoom).toBeCloseTo(hashValues.zoom, 2);
    expect(reEncoded!.bearing).toBeUndefined();
    expect(reEncoded!.pitch).toBeUndefined();
    expect(reEncoded!.fov).toBeUndefined();
  });

  it("round-trips a 3D URL with non-default fov", () => {
    const hashValues = {
      lat: 51.2643569,
      lng: 7.140041,
      zoom: 16.991,
      bearing: 311.1,
      pitch: 52.78,
      altitude: 188.57,
      fov: 72,
    };

    const decoded = geoportalCodec.decode(hashValues);
    expect(decoded).not.toBeNull();
    expect(decoded!.fovLongerEdge).toBeCloseTo(asRadians(72), 3);

    const reEncoded = geoportalCodec.encode(decoded!);
    expect(reEncoded).not.toBeNull();
    expect(reEncoded!.fov).toBeCloseTo(72, 1);
  });
});

describe("navigation codec hash payload", () => {
  it("hands HashStateProvider already rounded numeric hash values", () => {
    const codec = createViewStateShareableHashCodec({
      zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
    });

    const restoredState = codec.decode({
      lng: 7.2018253,
      lat: 51.2720217,
      altitude: 165.14,
      range: 750,
    });
    expect(restoredState).not.toBeNull();

    const encoded = codec.encode(restoredState!);
    expect(encoded).not.toBeNull();
    expect(encoded?.lng).toBe(7.2018253);
    expect(encoded?.lat).toBe(51.2720217);
    expect(encoded?.altitude).toBe(165.14);
    expect(
      Object.values(encoded ?? {}).every((value) => typeof value === "number")
    ).toBe(true);
  });
});
