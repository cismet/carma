import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

import { AddonProvider } from "@carma-mapping/contexts";
import type { TrafficControl } from "@carma-mapping/show-remote";

import { useAddonState } from "../../lib/AddonStateContext";
import {
  TRAFFIC_ANIMATION_STATE_DEFAULT,
  type TrafficAnimationState,
} from "../TrafficAnimation/traffic-actions";
import { RemoteTraffic } from "./RemoteTraffic";

const NETWORK = "https://example.test/verkehrsnetz_modell.json";
/** one array for every render; a new one would start the provider afresh */
const NO_ADDONS: unknown[] = [];

const handle: {
  traffic?: TrafficAnimationState;
  setTraffic?: (value: TrafficAnimationState) => void;
} = {};

const Probe = () => {
  const [traffic, setTraffic] = useAddonState("trafficAnimation");
  handle.traffic = traffic;
  handle.setTraffic = setTraffic;
  return null;
};

const view = (wanted: TrafficControl | null) => (
  <AddonProvider addons={NO_ADDONS}>
    <RemoteTraffic wanted={wanted} />
    <Probe />
  </AddonProvider>
);

/** the engine came on with `networkUrl`, at `offsetMinutes` */
const launch = (networkUrl = NETWORK, offsetMinutes = 0) =>
  act(() => {
    handle.setTraffic?.({
      ...TRAFFIC_ANIMATION_STATE_DEFAULT,
      isOn: true,
      networkUrl,
      offsetMinutes,
    });
  });

describe("RemoteTraffic", () => {
  afterEach(() => {
    cleanup();
    delete handle.traffic;
  });

  it("leaves the traffic alone while the remote has no entry", () => {
    render(view(null));
    launch(NETWORK, 30);

    expect(handle.traffic?.offsetMinutes).toBe(30);
  });

  it("takes over a waiting entry once the traffic is on", () => {
    render(view({ offsetMinutes: 600, seekAt: 1 }));
    launch();

    expect(handle.traffic?.offsetMinutes).toBe(600);
  });

  it("does not undo the desktop panel when the phone repeats its entry", () => {
    const { rerender } = render(view({ offsetMinutes: 600, seekAt: 1 }));
    launch();
    act(() =>
      handle.setTraffic?.({ ...handle.traffic!, offsetMinutes: 120 })
    );

    rerender(view({ offsetMinutes: 600, seekAt: 1 }));

    expect(handle.traffic?.offsetMinutes).toBe(120);
  });

  it("follows a new entry", () => {
    const { rerender } = render(view({ offsetMinutes: 600, seekAt: 1 }));
    launch();

    rerender(view({ offsetMinutes: 0, seekAt: 2 }));

    expect(handle.traffic?.offsetMinutes).toBe(0);
  });

  it("applies the entry again to the traffic of the next scene", () => {
    render(view({ offsetMinutes: 600, seekAt: 1 }));
    launch();
    launch("https://example.test/anderes_netz.json", 0);

    expect(handle.traffic?.offsetMinutes).toBe(600);
  });
});
