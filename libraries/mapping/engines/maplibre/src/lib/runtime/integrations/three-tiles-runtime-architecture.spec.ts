// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const directory = dirname(fileURLToPath(import.meta.url));
const runtimeModules = readdirSync(directory).filter(
  (name) =>
    /^three-tiles-runtime(?:-[a-z-]+)?\.ts$/.test(name) &&
    !name.endsWith(".spec.ts")
);

describe("three tiles runtime architecture", () => {
  it("keeps independent types and configuration out of the entry module", () => {
    const source = readFileSync(
      join(directory, "three-tiles-runtime.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/^export\s+(?:type\s+)?\{/m);
    expect(source).toContain("export function buildThreeTilesRuntime(");
  });
  it.each(runtimeModules)(
    "%s stays within the 1000-line module budget",
    (name) => {
      const lines = readFileSync(join(directory, name), "utf8")
        .trimEnd()
        .split("\n");
      expect(lines.length).toBeLessThanOrEqual(1000);
    }
  );
});
