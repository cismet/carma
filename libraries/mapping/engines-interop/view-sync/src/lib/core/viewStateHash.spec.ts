import { describe, expect, it } from "vitest";
import { degToRadNumeric } from "@carma/units/helpers";
import type { ViewState } from "./types";
import {
  HASH_FOV_CONVENTION,
  HASH_ZOOM_CONVENTION,
  readHashParamsFromViewState,
  readViewStateFromHashValues,
} from "./viewStateHash";

const asRadians = (value: number) =>
  degToRadNumeric(value)! as ViewState["bearing"];
const asMeters = (value: number) => value as ViewState["range"];

describe("viewStateHash zoom conventions", () => {
  it("encodes canonical shared zoom as leaflet hash zoom when requested", () => {
    const params = readHashParamsFromViewState(
      {
        longitude: asRadians(7.2018253),
        latitude: asRadians(51.2720217),
        altitude: asMeters(165.14),
        zoom: 15.001,
        bearing: asRadians(360),
        pitch: asRadians(0),
        range: asMeters(750),
        fovVertical: asRadians(45),
      },
      {
        zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
      }
    );

    expect(params?.zoom).toBeCloseTo(16.001, 6);
  });

  it("decodes leaflet hash zoom back to canonical shared zoom when requested", () => {
    const viewState = readViewStateFromHashValues(
      {
        lng: 7.2018253,
        lat: 51.2720217,
        zoom: 16.001,
        altitude: 165.14,
      },
      {
        zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
      }
    );

    expect(viewState).not.toBeNull();
    expect(viewState?.zoom).toBeCloseTo(15.001, 6);
  });

  it("encodes longer-edge fov when requested for cesium hash consumers", () => {
    const params = readHashParamsFromViewState(
      {
        longitude: asRadians(7.2018253),
        latitude: asRadians(51.2720217),
        altitude: asMeters(165.14),
        zoom: 15.001,
        bearing: asRadians(360),
        pitch: asRadians(0),
        range: asMeters(750),
        fovVertical: asRadians(72),
        fovHorizontal: asRadians(45),
      },
      {
        fovConvention: HASH_FOV_CONVENTION.CESIUM_LONGER_EDGE,
      }
    );

    expect(params?.fov).toBeCloseTo(72, 6);
  });

  it("decodes longer-edge hash fov into shared fovLongerEdge when requested", () => {
    const viewState = readViewStateFromHashValues(
      {
        lng: 7.2018253,
        lat: 51.2720217,
        zoom: 16.001,
        fov: 72,
        altitude: 165.14,
      },
      {
        zoomConvention: HASH_ZOOM_CONVENTION.LEAFLET_256,
        fovConvention: HASH_FOV_CONVENTION.CESIUM_LONGER_EDGE,
      }
    );

    expect(viewState).not.toBeNull();
    expect(viewState?.fovVertical).toBeUndefined();
    expect(viewState?.fovLongerEdge).toBeCloseTo(asRadians(72), 8);
  });
});
