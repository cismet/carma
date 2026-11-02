import { DEFAULT_HIGHLIGHT_DIM } from "@carma-mapping/show-remote";

import type { MapRelayHeard } from "../MapRelay";
import {
  GEOPORTAL_VIEW_TTL_MS,
  freshForMs,
  geoportalLightOf,
} from "./geoportal-light";

const FRAME = [788836, 6663227, 794575, 6666423] as const;
const SPOT = {
  id: "kitas:12",
  center: [791527, 6664630] as const,
  radiusMeters: 15,
  dim: DEFAULT_HIGHLIGHT_DIM,
};
const SELECTION = {
  spot: SPOT,
  feature: { layerId: "kitas", featureId: 12, properties: {} },
};

const heard = (
  state: Record<string, unknown> | null,
  heardAt: number,
  ageMs = 0
): MapRelayHeard => ({ state, v: 3, ageMs, first: false, heardAt });

describe("freshForMs", () => {
  it("counts from the write, on the relay's clock", () => {
    expect(freshForMs(heard({}, 10_000, 4_000), 10_000)).toBe(
      GEOPORTAL_VIEW_TTL_MS - 4_000
    );
    expect(freshForMs(heard({}, 10_000), 10_000 + GEOPORTAL_VIEW_TTL_MS)).toBe(
      0
    );
  });

  it("is nothing without a word from the geoportal", () => {
    expect(freshForMs(undefined, 0)).toBe(0);
    expect(freshForMs(heard(null, 0), 0)).toBe(0);
  });
});

describe("geoportalLightOf", () => {
  it("lights the selection and half lights the frame", () => {
    expect(
      geoportalLightOf(heard({ frame: [...FRAME], selection: SELECTION }, 0), 0)
    ).toEqual({ frame: FRAME, spots: [SPOT] });
  });

  it("lights nothing the geoportal did not send", () => {
    expect(
      geoportalLightOf(heard({ frame: null, selection: null }, 0), 0)
    ).toEqual({ frame: null, spots: null });
    expect(geoportalLightOf(heard({ frame: [4, 3, 2, 1] }, 0), 0)).toEqual({
      frame: null,
      spots: null,
    });
  });

  it("forgets a geoportal that went quiet", () => {
    const view = heard({ frame: [...FRAME], selection: SELECTION }, 0);
    expect(geoportalLightOf(view, GEOPORTAL_VIEW_TTL_MS)).toEqual({
      frame: null,
      spots: null,
    });
  });
});
