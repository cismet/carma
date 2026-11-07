import { DEFAULT_HIGHLIGHT_DIM } from "@carma-mapping/show-remote";

import type { MapRelayHeard } from "../MapRelay";
import {
  FRAME_OPENING_ALONE,
  FRAME_OPENING_AROUND_SPOT,
  GEOPORTAL_VIEW_TTL_MS,
  freshForMs,
  geoportalLightOf,
  projectedLightOf,
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

describe("projectedLightOf", () => {
  const frame = [...FRAME] as [number, number, number, number];
  const projection = [787000, 6662000, 796000, 6668000] as [
    number,
    number,
    number,
    number
  ];

  it("half lights the frame around a selection inside it", () => {
    expect(
      projectedLightOf({ frame, spots: [SPOT] }, projection)
    ).toMatchObject({
      frame,
      spots: [SPOT],
      frameOpening: FRAME_OPENING_AROUND_SPOT,
    });
  });

  it("fully lights a frame with nothing lit inside it", () => {
    expect(projectedLightOf({ frame, spots: null }, projection)).toMatchObject({
      frame,
      frameOpening: FRAME_OPENING_ALONE,
    });
    const outside = { ...SPOT, center: [700000, 6600000] as const };
    expect(
      projectedLightOf({ frame, spots: [outside] }, projection).frameOpening
    ).toBe(FRAME_OPENING_ALONE);
  });

  it("darkens nothing for a geoportal showing more than the projection", () => {
    const wide = [786000, 6661000, 797000, 6669000] as [
      number,
      number,
      number,
      number
    ];
    expect(
      projectedLightOf({ frame: wide, spots: [SPOT] }, projection)
    ).toMatchObject({ frame: null, spots: null });
  });

  it("keeps the frame when it is larger one way only", () => {
    const tall = [789000, 6661000, 790000, 6669000] as [
      number,
      number,
      number,
      number
    ];
    expect(
      projectedLightOf({ frame: tall, spots: null }, projection).frame
    ).toEqual(tall);
  });
});
