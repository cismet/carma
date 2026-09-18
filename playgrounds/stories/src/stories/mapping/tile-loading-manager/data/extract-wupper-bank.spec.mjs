import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const read = (name) =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const bank = read("./wupper-barmen-north-bank.geojson");
const water = read("./wupper-barmen-water-surface.geojson");

test("the recorded north bank reproduces exactly from the water polygon", () => {
  const reproduced = JSON.parse(
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL("./extract-wupper-bank.mjs", import.meta.url))],
      { encoding: "utf8" }
    )
  );
  assert.deepEqual(reproduced, bank);
});

test("every bank edge is an original adjacent water-boundary edge", () => {
  const ring = water.geometry.coordinates[0].slice(0, -1);
  const points = bank.geometry.coordinates;
  assert.ok(points.length > 20);
  const indices = points.map((point) =>
    ring.findIndex((p) => p[0] === point[0] && p[1] === point[1])
  );
  assert.ok(indices.every((index) => index >= 0));
  for (let i = 1; i < indices.length; i++) {
    const step = (indices[i] - indices[i - 1] + ring.length) % ring.length;
    assert.ok(step === 1 || step === ring.length - 1);
  }
  assert.equal(points[0][0], 7.1938);
  assert.equal(points.at(-1)[0], 7.202);
  for (const end of [points[0], points.at(-1)])
    assert.equal(
      end[1],
      Math.max(...ring.filter((p) => p[0] === end[0]).map((p) => p[1]))
    );
});
