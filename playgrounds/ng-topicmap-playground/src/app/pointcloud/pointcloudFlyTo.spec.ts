import { describe, expect, it } from "vitest";

import { getCloudFlyToButtonState } from "./pointcloudFlyTo";

describe("getCloudFlyToButtonState", () => {
  it("keeps the button available for an enabled cloud before metadata is ready", () => {
    expect(getCloudFlyToButtonState(true, false, false)).toEqual({
      disabled: true,
      title: "Noch keine Ausdehnung verfügbar",
      ariaLabel: "Noch keine Ausdehnung verfügbar",
    });
  });

  it("enables the button once the cloud has bounds", () => {
    expect(getCloudFlyToButtonState(true, true, false)).toEqual({
      disabled: false,
      title: "Zur Ausdehnung fliegen",
      ariaLabel: "Zur Ausdehnung fliegen",
    });
  });

  it("keeps fly-to enabled while bounded points are still loading", () => {
    expect(getCloudFlyToButtonState(true, true, true).disabled).toBe(false);
  });
});
