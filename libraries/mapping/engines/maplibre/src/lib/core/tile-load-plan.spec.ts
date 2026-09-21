// @vitest-environment node
// @vitest-environment node
// @vitest-environment node
// @vitest-environment node
import { describe, expect, it } from "vitest";

import { planTileLoadStages } from "./tile-load-plan";

describe("tile load stage planning", () => {
  it("orders camera ranks before detail stages, keeps ties stable and schedules each payload once", () => {
    const parent = Object.freeze({ id: "parent", priority: 1 });
    const child = Object.freeze({ id: "child", priority: 2 });
    const sibling = Object.freeze({ id: "sibling", priority: 2 });
    const reserve = Object.freeze({ id: "reserve", priority: 0 });
    const stages = Object.freeze([
      Object.freeze([parent, child]),
      Object.freeze([child, sibling, parent]),
      Object.freeze([reserve]),
    ]);
    const plan = planTileLoadStages(stages, {
      key: (e) => e.id,
      priority: (e) => e.priority,
      eligible: () => true,
    });
    expect(plan.stages.flat()).toEqual([child, sibling, parent, reserve]);
    expect([...plan.scheduledKeys]).toEqual([
      "child",
      "sibling",
      "parent",
      "reserve",
    ]);
    expect(stages[0]).toEqual([parent, child]);
    expect(plan.stages.flat()[0]).toBe(child);
  });
  it("does not count rejected entries as scheduled and preserves empty stage boundaries", () => {
    const stages = Object.freeze([
      Object.freeze([
        { id: "cached", priority: 2 },
        { id: "needed", priority: 1 },
      ]),
      Object.freeze([{ id: "failed", priority: 0 }]),
    ]);
    const plan = planTileLoadStages(stages, {
      key: (e) => e.id,
      priority: (e) => e.priority,
      eligible: (e) => e.id === "needed",
    });
    expect(plan.stages).toHaveLength(6);
    expect(plan.stages.flat().map((e) => e.id)).toEqual(["needed"]);
    expect([...plan.scheduledKeys]).toEqual(["needed"]);
  });
});
