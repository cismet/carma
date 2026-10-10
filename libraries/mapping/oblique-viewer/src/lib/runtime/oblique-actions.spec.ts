import { describe, expect, it } from "vitest";
import {
  OBLIQUE_STATE_DEFAULT,
  formatObliqueLoadingStatus,
  requestObliqueCommand,
  acknowledgeObliqueRequest,
} from "./oblique-actions";

describe("oblique viewer commands", () => {
  it("defaults both center marker subtypes on behind an inactive master", () => {
    expect(OBLIQUE_STATE_DEFAULT).toMatchObject({
      mapStyle3dEnabled: false,
      previewCenterDebug: false,
      previewOpticalCenterDebug: true,
      previewScreenCenterDebug: true,
    });
  });
  it("keeps successive commands distinct after the previous request is acknowledged", () => {
    const first = requestObliqueCommand(OBLIQUE_STATE_DEFAULT, {
      type: "rotate",
      clockwise: true,
    });
    const cleared = acknowledgeObliqueRequest(first, first.request!.seq);
    const second = requestObliqueCommand(cleared, {
      type: "rotate",
      clockwise: true,
    });
    expect(cleared.request).toBeNull();
    expect(second.request!.seq).toBeGreaterThan(first.request!.seq);
    expect(second.request!.seq).toBe(2);
  });

  it("does not clear a newer command when an older flight acknowledges late", () => {
    const first = requestObliqueCommand(OBLIQUE_STATE_DEFAULT, {
      type: "flyToImage",
    });
    const second = requestObliqueCommand(first, { type: "closePreview" });
    expect(acknowledgeObliqueRequest(second, first.request!.seq)).toBe(second);
  });
});

describe("host statusbar loading text", () => {
  const series = {
    id: "2026",
    label: "Wuppertal 2026",
    shortLabel: "2026",
    enabled: true,
    isLoading: true,
    imageCount: 1234,
    error: null,
  };
  it("uses only observed loaded-record counts and active catalog series", () => {
    const text = formatObliqueLoadingStatus({
      ...OBLIQUE_STATE_DEFAULT,
      isOn: true,
      isLoading: true,
      series: [
        series,
        { ...series, id: "off", shortLabel: "Aus", enabled: false },
        { ...series, id: "done", shortLabel: "Fertig", isLoading: false },
        { ...series, id: "failed", shortLabel: "Fehler", error: "404" },
      ],
    });
    expect(text).toBe(
      "Bildkataloge werden geladen … (2026: 1.234 Bilder verfügbar)"
    );
    expect(text).not.toContain("%");
  });
  it("reports configuration loading before catalog counts exist", () => {
    expect(
      formatObliqueLoadingStatus({
        ...OBLIQUE_STATE_DEFAULT,
        isOn: true,
        isLoading: true,
      })
    ).toBe("Schrägluftbild-Daten werden geladen …");
    expect(
      formatObliqueLoadingStatus({
        ...OBLIQUE_STATE_DEFAULT,
        isOn: true,
        series: [{ ...series, imageCount: 0 }],
      })
    ).toBe("Bildkataloge werden geladen … (2026)");
  });
  it("prioritizes target pixels over background catalogs and returns to the catalog status on cancellation", () => {
    const state = {
      ...OBLIQUE_STATE_DEFAULT,
      isOn: true,
      isLoading: true,
      isTargetImageLoading: true,
      series: [series],
    };
    expect(formatObliqueLoadingStatus(state)).toBe("Zielbild wird geladen …");
    expect(
      formatObliqueLoadingStatus({ ...state, isTargetImageLoading: false })
    ).toContain("Bildkataloge werden geladen");
  });
  it("clears the status when idle or switched off, including a late target-load flag", () => {
    expect(
      formatObliqueLoadingStatus({ ...OBLIQUE_STATE_DEFAULT, isOn: true })
    ).toBeNull();
    expect(
      formatObliqueLoadingStatus({
        ...OBLIQUE_STATE_DEFAULT,
        isLoading: true,
        isTargetImageLoading: true,
        series: [series],
      })
    ).toBeNull();
    expect(
      formatObliqueLoadingStatus({
        ...OBLIQUE_STATE_DEFAULT,
        isOn: true,
        series: [{ ...series, isLoading: false, error: "failed" }],
      })
    ).toBeNull();
  });
});
