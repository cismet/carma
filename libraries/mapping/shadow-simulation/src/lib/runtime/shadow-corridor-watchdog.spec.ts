import { afterEach, describe, expect, it, vi } from "vitest";
import { ShadowCorridorWatchdog } from "./shadow-corridor-watchdog";

const page = {
  id: "receiver-a", samples: 1, totalSamples: 64,
  published: false, ready: true, width: 128, height: 256,
};

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("corridor stall reporting", () => {
  it.each(["geoportal.wuppertal.de", "localhost.example.com", "192.168.1.2", undefined])(
    "does not collect or schedule performance reports on %s",
    (hostname) => {
      vi.useFakeTimers();
      vi.stubGlobal("location", hostname ? { hostname } : undefined);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const watchdog = new ShadowCorridorWatchdog();
      watchdog.observe([page], { activeId: page.id });
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(warn).not.toHaveBeenCalled();
    }
  );

  it.each(["localhost", "127.0.0.1", "[::1]"])("reports on loopback host %s", (hostname) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    vi.stubGlobal("location", { hostname });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const watchdog = new ShadowCorridorWatchdog();
    watchdog.observe([page], {});
    vi.advanceTimersByTime(20_000);
    expect(warn).toHaveBeenCalledOnce();
    watchdog.pause();
  });
  it("reports without another repaint, once per stalled progress stage", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const watchdog = new ShadowCorridorWatchdog();
    watchdog.observe([page], { activeId: page.id });
    vi.advanceTimersByTime(19_999);
    expect(warn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(JSON.parse(warn.mock.calls[0][1])).toEqual(expect.objectContaining({
      corridors: [expect.objectContaining({ id: expect.stringMatching(/^C\d+\.\d+$/), stalledMilliseconds: 20_000 })],
    }));
    vi.advanceTimersByTime(40_000);
    expect(warn).toHaveBeenCalledOnce();
    watchdog.pause();
  });

  it("never repeats URLs or content keys in compute-stall reports", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const watchdog = new ShadowCorridorWatchdog();
    const id = '["https://example.test/mesh2024/mesh_424760.b3dm","east"]';
    watchdog.observe([{ ...page, id }], {
      activeId: id,
      publicationRetries: [[id, { attempts: 1, retryAt: 250 }]],
    });
    vi.advanceTimersByTime(20_000);
    const report = JSON.parse(warn.mock.calls[0][1]);
    expect(report.corridors[0].file).toBe("mesh_424760.b3dm");
    expect(report.scheduler.activeId).toBe(report.corridors[0].id);
    expect(report.scheduler.publicationRetries[0].id).toBe(report.corridors[0].id);
    expect(warn.mock.calls[0][1]).not.toContain("https:");
    watchdog.pause();
  });

  it("resets on progress and excludes completed, removed and paused corridors", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const watchdog = new ShadowCorridorWatchdog();
    watchdog.observe([page], {});
    vi.advanceTimersByTime(19_000);
    watchdog.observe([{ ...page, samples: 2 }], {});
    vi.advanceTimersByTime(19_000);
    expect(warn).not.toHaveBeenCalled();
    watchdog.observe([{ ...page, published: true }], {});
    vi.advanceTimersByTime(25_000);
    watchdog.observe([page], {});
    watchdog.observe([], {});
    vi.advanceTimersByTime(25_000);
    watchdog.observe([page], {});
    watchdog.pause();
    vi.advanceTimersByTime(25_000);
    expect(warn).not.toHaveBeenCalled();
  });
});
