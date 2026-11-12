import { LowPolyBuilder } from "./lowpoly";
import { car, lamp, tree } from "./models";
import {
  finishScenario,
  yawTowards,
  type CarmaPlanScenario,
} from "./scenario";
import { hash, pointsAlongEdge, type SiteFrame } from "./site-frame";
import { createTerracing } from "./terracing";

/**
 * Scenario "Parkplatz": the site as a surface car park. Asphalt levels with
 * a slight fall, joined by ramps, grass banks between them and a green border
 * with trees along the edge. On each level double rows of marked bays with
 * an aisle between, about two thirds of them taken, and planted strips with
 * trees and lamps between the double rows.
 */

const LIFT = 0.15;
const CELL = 2;
const EDGE_BLEND = 6;

const BAY_WIDTH = 2.5;
const BAY_DEPTH = 5;
const AISLE = 6.5;
const STRIP = 2.5;
const LINE_WIDTH = 0.12;
const OCCUPANCY = 0.68;

const ASPHALT = ["#55585c", "#505357", "#5a5d61"];
const GRASS = ["#6e9b4a", "#76a352", "#679244", "#7aa858"];
const BANK_GRASS = ["#5e8a3e", "#628f42", "#5a853b"];
const MARKING = "#e9e9e4";
const CAR_PAINTS = [
  "#f2f2f0",
  "#c0c4c8",
  "#1f2326",
  "#26364f",
  "#9b1f22",
  "#5b6168",
  "#2f4a3a",
  "#e3c04a",
];
const LEAVES = ["#4f7a35", "#5a8a3c", "#46702f"];
const NEEDLES = ["#2f5a35", "#356339", "#2a5230"];

export const buildParkingLot = (frame: SiteFrame): CarmaPlanScenario => {
  const terraces = createTerracing(frame, {
    stepHeight: 2.0,
    minLevels: 1,
    maxLevels: 3,
    minLevelDepth: 34,
    minStep: 0,
    levelGrade: 0.02,
    bankGrade: 0.5,
    rampGrade: 0.1,
    rampWidth: 6.5,
    edgeBlend: EDGE_BLEND,
  });
  const surface = (x: number, z: number) => terraces.heightAt(x, z) + LIFT;

  const b = new LowPolyBuilder();
  b.ground(
    frame,
    CELL,
    surface,
    (x, z) => {
      const zone = terraces.zoneAt(x, z);
      if (zone === "level" || zone === "ramp") return ASPHALT;
      return zone === "edge" ? GRASS : BANK_GRASS;
    },
    { depth: 3, paint: "#4d5a3a" }
  );

  const [ux, uz] = terraces.uAxis;
  const [vMin, vMax] = terraces.vRange;
  const level = (uu: number, vv: number, margin: number) => {
    const [x, z] = terraces.at(uu, vv);
    return terraces.isLevel(x, z, margin);
  };
  /** a bay from `u0` (back) to `u0 + BAY_DEPTH`, `vv` to `vv + BAY_WIDTH`,
   * usable when it and the aisle in front of it lie on one level */
  const bayFits = (u0: number, vv: number, aisleSide: 1 | -1) =>
    [
      [u0 + 0.1, vv + 0.1],
      [u0 + BAY_DEPTH - 0.1, vv + 0.1],
      [u0 + BAY_DEPTH - 0.1, vv + BAY_WIDTH - 0.1],
      [u0 + 0.1, vv + BAY_WIDTH - 0.1],
    ].every(([uu, v]) => level(uu, v, 0.3)) &&
    level(
      u0 + BAY_DEPTH / 2 + aisleSide * (BAY_DEPTH / 2 + AISLE / 2),
      vv + BAY_WIDTH / 2,
      0
    );

  const lines = new Set<string>();
  let bays = 0;
  let cars = 0;
  let trees = 0;

  const row = (u0: number, aisleSide: 1 | -1) => {
    for (let vv = vMin, i = 0; vv + BAY_WIDTH <= vMax; vv += BAY_WIDTH, i++) {
      if (!bayFits(u0, vv, aisleSide)) continue;
      bays += 1;
      for (const edge of [i, i + 1]) {
        const key = `${u0.toFixed(2)}:${edge}`;
        if (lines.has(key)) continue;
        lines.add(key);
        const ve = vMin + edge * BAY_WIDTH;
        b.strip(
          [terraces.at(u0, ve), terraces.at(u0 + BAY_DEPTH, ve)],
          LINE_WIDTH,
          surface,
          0.03,
          MARKING
        );
      }
      const [cx, cz] = terraces.at(
        u0 + BAY_DEPTH / 2 - aisleSide * 0.2,
        vv + BAY_WIDTH / 2 + (hash(u0, vv, 7) - 0.5) * 0.25
      );
      if (hash(cx, cz, 8) > OCCUPANCY) continue;
      const paint =
        CAR_PAINTS[Math.floor(hash(cx, cz, 9) * CAR_PAINTS.length)];
      b.placed(
        [cx, surface(cx, cz), cz],
        yawTowards(ux * aisleSide, uz * aisleSide) +
          (hash(cx, cz, 10) - 0.5) * 0.08,
        () => car(b, paint)
      );
      cars += 1;
    }
  };

  const strip = (uu: number) => {
    const offset = hash(uu, 0, 11) * 10;
    for (let vv = vMin + offset, i = 0; vv <= vMax; vv += 10, i++) {
      if (!level(uu, vv, 0)) continue;
      const [x, z] = terraces.at(uu, vv);
      if (i % 3 === 1)
        b.placed([x, surface(x, z), z], yawTowards(ux, uz), () => lamp(b));
      else {
        b.placed([x, surface(x, z), z], hash(x, z, 12) * Math.PI, () =>
          tree(b, false, 0.75 + hash(x, z, 13) * 0.3, LEAVES)
        );
        trees += 1;
      }
    }
  };

  const moduleDepth = 2 * BAY_DEPTH + AISLE;
  for (const terrace of terraces.levels) {
    let u0 = terrace.uFrom;
    while (u0 + moduleDepth <= terrace.uTo) {
      // the first row starts where some bays fit, past the bank or edge
      let fitting = 0;
      for (let vv = vMin; vv + BAY_WIDTH <= vMax; vv += BAY_WIDTH)
        if (bayFits(u0, vv, 1)) fitting += 1;
      if (fitting < 3) {
        u0 += 0.5;
        continue;
      }
      row(u0, 1);
      row(u0 + BAY_DEPTH + AISLE, -1);
      strip(u0 + moduleDepth + STRIP / 2);
      u0 += moduleDepth + STRIP;
    }
  }

  for (const { x, z } of pointsAlongEdge(frame, 9, EDGE_BLEND * 0.5)) {
    const conifer = hash(x, z, 14) < 0.3;
    b.placed([x, surface(x, z), z], hash(x, z, 15) * Math.PI, () =>
      tree(
        b,
        conifer,
        0.8 + hash(x, z, 16) * 0.35,
        conifer ? NEEDLES : LEAVES
      )
    );
    trees += 1;
  }

  return finishScenario(frame, b, "parking lot", {
    levels: terraces.levels.length,
    ramps: terraces.ramps.length,
    bays,
    cars,
    trees,
  });
};
