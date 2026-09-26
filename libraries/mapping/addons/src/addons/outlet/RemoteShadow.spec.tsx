import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

import { AddonProvider } from "@carma-mapping/contexts";
import type { ShadowControl } from "@carma-mapping/show-remote";
import type {
  ShadowDateState,
  ShadowSimulationState,
} from "@carma-mapping/shadow-simulation";

import { useAddonState } from "../../lib/AddonStateContext";
import { RemoteShadow } from "./RemoteShadow";

// the registry reaches every addon; the resolver alone is what is read here
vi.mock("../../lib/registry", () => ({
  resolveAddonEntries: (
    entries?: readonly { addon?: string; kind?: string; config?: unknown }[]
  ) =>
    (entries ?? []).map((entry) => ({
      kind: entry.addon ?? entry.kind,
      config: entry.config,
    })),
}));

const ASSETS = "https://wupp-3d-data.cismet.de/dz-b-prm/derived";

const LAUNCHED = [
  { addon: "shadowTexture", config: { assetBaseUrl: ASSETS, startEnabled: true } },
];

/** what the launch put the shadows on */
const LAUNCH_DATE: ShadowDateState = {
  year: 2026,
  dayOfYear: 200,
  minutes: 720,
  timeZone: "Europe/Berlin",
};

const shadowsOn = (
  extra: Partial<ShadowSimulationState> = {}
): ShadowSimulationState =>
  ({
    enabled: true,
    isAnimating: false,
    animationCycleSeconds: 60,
    ...extra,
  } as ShadowSimulationState);

const handle: {
  shadow?: ShadowSimulationState;
  date?: ShadowDateState;
  setShadow?: (value: ShadowSimulationState) => void;
  setDate?: (value: ShadowDateState) => void;
} = {};

const Probe = () => {
  const [shadow, setShadow] = useAddonState("shadowSimulation");
  const [date, setDate] = useAddonState("shadowDate");
  handle.shadow = shadow;
  handle.date = date;
  handle.setShadow = setShadow;
  handle.setDate = setDate;
  return null;
};

const view = (wanted: ShadowControl | null, addons: unknown[] = LAUNCHED) => (
  <AddonProvider addons={addons}>
    <RemoteShadow wanted={wanted} />
    <Probe />
  </AddonProvider>
);

/** the display state after the launch put the shadows on */
const launch = (shadow: ShadowSimulationState = shadowsOn()) =>
  act(() => {
    handle.setShadow?.(shadow);
    handle.setDate?.(LAUNCH_DATE);
  });

const entry = (extra: Partial<ShadowControl> = {}): ShadowControl => ({
  dayOfYear: 172,
  minutes: 1080,
  play: null,
  cycleSeconds: 60,
  ...extra,
});

describe("RemoteShadow", () => {
  afterEach(() => {
    cleanup();
    delete handle.shadow;
    delete handle.date;
  });

  it("takes over moment, play and speed on the first apply", () => {
    render(view(entry({ play: "year", cycleSeconds: 120, seekAt: 1 })));
    launch();

    expect(handle.date).toMatchObject({ dayOfYear: 172, minutes: 1080 });
    expect(handle.shadow).toMatchObject({
      isAnimating: true,
      animationMode: "year",
      animationCycleSeconds: 120,
    });
  });

  it("does not pull a running playback back when the phone repeats its entry", () => {
    const { rerender } = render(view(entry({ play: "day", seekAt: 1 })));
    launch();
    act(() => handle.setDate?.({ ...LAUNCH_DATE, dayOfYear: 172, minutes: 1200 }));

    rerender(view(entry({ play: "day", seekAt: 1, minutes: 1190 })));

    expect(handle.date).toMatchObject({ dayOfYear: 172, minutes: 1200 });
    expect(handle.shadow).toMatchObject({ isAnimating: true });
  });

  it("jumps when the presenter moved a slider", () => {
    const { rerender } = render(view(entry({ seekAt: 1 })));
    launch();

    rerender(view(entry({ dayOfYear: 355, minutes: 540, seekAt: 2 })));

    expect(handle.date).toMatchObject({ dayOfYear: 355, minutes: 540 });
  });

  it("switches play and speed without jumping when only those changed", () => {
    const { rerender } = render(view(entry({ seekAt: 1 })));
    launch();
    act(() => handle.setDate?.({ ...LAUNCH_DATE, dayOfYear: 172, minutes: 1100 }));

    rerender(view(entry({ play: "day", cycleSeconds: 300, seekAt: 1 })));

    expect(handle.date).toMatchObject({ dayOfYear: 172, minutes: 1100 });
    expect(handle.shadow).toMatchObject({
      isAnimating: true,
      animationMode: "day",
      animationCycleSeconds: 300,
    });
  });

  it("keeps what the launch set while the remote has no entry, then applies only what changed", () => {
    const { rerender } = render(view(null));
    launch(shadowsOn({ isAnimating: true, animationMode: "day" }));

    expect(handle.date).toEqual(LAUNCH_DATE);
    expect(handle.shadow).toMatchObject({ isAnimating: true, animationMode: "day" });

    // the presenter paused, without touching a slider
    rerender(view(entry({ play: null })));

    expect(handle.date).toEqual(LAUNCH_DATE);
    expect(handle.shadow).toMatchObject({ isAnimating: false });
  });

  it("takes the entry over afresh once the shadows came on again", () => {
    render(view(entry({ seekAt: 1 })));
    launch();
    act(() => handle.setShadow?.(shadowsOn({ enabled: false })));
    act(() => handle.setDate?.(LAUNCH_DATE));

    launch();

    expect(handle.date).toMatchObject({ dayOfYear: 172, minutes: 1080 });
  });

  it("leaves shadows alone that no layer launched", () => {
    render(
      view(entry({ play: "year", seekAt: 1 }), [
        { addon: "shadowTexture", config: { assetBaseUrl: ASSETS } },
      ])
    );
    launch();

    expect(handle.date).toEqual(LAUNCH_DATE);
    expect(handle.shadow).toMatchObject({ isAnimating: false });
  });
});
