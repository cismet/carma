import { describe, expect, it } from "vitest";
import { HASH_ZOOM_CONVENTION } from "../core/viewStateHash";
import type { ShareableViewState } from "../types";
import {
  applyToShareableViewState,
  createViewStateShareableHashCodec,
  readFromShareableViewState,
  readShareableViewState,
  type ShareableViewStateAdapterOptions,
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

  it("returns null when both zoom and range are missing", () => {
    expect(
      readShareableViewState({ lat: 51.2, lng: 7.1, altitude: 150 })
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
        range: 1,
        fov: 1,
      },
    });

    expect(encoded.lat).toBe(51.2677);
    expect(encoded.lng).toBe(7.19163);
    expect(encoded.altitude).toBe(200.1);
    expect(encoded.bearing).toBe(123.5);
    expect(encoded.pitch).toBe(44.9);
  });
});

const createShareableHashCodec = (
  options: ShareableViewStateAdapterOptions = {}
) => createViewStateShareableHashCodec(options);

describe("createViewStateShareableHashCodec", () => {
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
        range: 1,
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
});
