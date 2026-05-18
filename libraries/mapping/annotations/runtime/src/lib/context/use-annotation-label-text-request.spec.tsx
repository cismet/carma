import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useAnnotationLabelTextRequest } from "./use-annotation-label-text-request";

describe("useAnnotationLabelTextRequest", () => {
  it("resolves label text requests through the dialog state", async () => {
    const { result } = renderHook(() => useAnnotationLabelTextRequest());

    let request: Promise<string | null> | undefined;
    act(() => {
      request = result.current.requestLabelText({
        coordinate: { latitude: 51, longitude: 7, altitude: 120 },
        defaultText: "Beschriftung 1",
        labelTextSuggestions: ["Bestand"],
      });
    });

    expect(result.current.labelTextDialogState.open).toBe(true);
    expect(result.current.labelTextDialogState.initialValue).toBe(
      "Beschriftung 1"
    );
    expect(result.current.labelTextDialogState.labelSuggestions).toEqual([
      "Bestand",
    ]);

    act(() => {
      result.current.labelTextDialogState.onFinish("Tor 9");
    });

    await expect(request).resolves.toBe("Tor 9");
    expect(result.current.labelTextDialogState.open).toBe(false);
  });

  it("cancels label text requests while disabled", async () => {
    const { result } = renderHook(() =>
      useAnnotationLabelTextRequest({ enabled: false })
    );

    let request: Promise<string | null> | undefined;
    act(() => {
      request = result.current.requestLabelText({
        coordinate: { latitude: 51, longitude: 7, altitude: 120 },
        defaultText: "Beschriftung 1",
        labelTextSuggestions: ["Bestand"],
      });
    });

    await expect(request).resolves.toBeNull();
    expect(result.current.labelTextDialogState.open).toBe(false);
  });
});
