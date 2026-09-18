import { describe, expect, it } from "vitest";

import { createMetricRecorder } from "./useMetricRecorder";

describe("metric recorder", () => {
  it("returns an immutable series snapshot", () => {
    const recorder = createMetricRecorder({ capacity: 3 });
    recorder.sample({ fps: 60 });
    const snapshot = recorder.series("fps");

    recorder.sample({ fps: 30 });

    expect(snapshot).toEqual([60]);
    expect(recorder.series("fps")).toEqual([60, 30]);
  });
});
