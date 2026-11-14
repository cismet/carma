import * as THREE from "three";

import { GroundPainter, mix, noise, tone } from "./ground-paint";
import { LowPolyBuilder } from "./lowpoly";
import { bench, fence, person, tree, type Sitter } from "./models";
import {
  balanceBeams,
  bankSlide,
  bin,
  carousel,
  nestSwing,
  netPyramid,
  playhouse,
  sandpit,
  seesaw,
  springRider,
  swing,
  towerCombo,
  trampolines,
  zipLine,
} from "./playground-models";
import {
  Footprints,
  candidates,
  edgeRuns,
  finishScenario,
  offsetBy,
  yawTowards,
  type CarmaPlanScenario,
} from "./scenario";
import {
  hash,
  pointsAlongEdge,
  smooth01,
  type Point,
  type SiteFrame,
} from "./site-frame";
import { createTerracing } from "./terracing";

/**
 * Scenario "Spielplatz": a children's playground. Gentle grass terraces with
 * a path along each level and paths up the ramps between them; on the levels
 * a slide tower combo, a climbing net, swings, a zip line, seesaw, carousel,
 * trampolines, playhouse, sandpit and spring riders, long slides down the
 * banks, sand or rubber surfacing under everything one can fall from,
 * benches with parents by the paths, children all over, trees along the edge
 * and among the play spots, and a low fence round it all.
 */

const LIFT = 0.15;
const EDGE_BLEND = 8;
const PATH_WIDTH = 2.4;

type Rgb = readonly [number, number, number];
const LAWN: Rgb = [106, 138, 68];
const LAWN_DRY: Rgb = [138, 150, 86];
const BANK: Rgb = [96, 128, 60];
const PATH_FILL: Rgb = [208, 190, 152];
const PATH_EDGE_RGB: Rgb = [160, 146, 116];
const PATH = "rgb(210, 193, 156)";
const PATH_EDGE = { color: "rgb(160, 146, 116)", width: 0.18 };
const SAND = "rgb(226, 204, 150)";
const SAND_EDGE = { color: "rgb(186, 166, 120)", width: 0.25 };
/** poured rubber (EPDM) under the low equipment */
const RUBBER = "rgb(176, 86, 64)";
const RUBBER_EDGE = { color: "rgb(146, 70, 54)", width: 0.12 };
/** zip line length aimed for, and the least worth building */
const ZIP_LENGTH = 28;
const ZIP_MIN = 20;
const LEAVES = ["#4f7a35", "#5a8a3c", "#46702f", "#628f3f"];
const NEEDLES = ["#2f5a35", "#356339", "#2a5230"];

const pick = (list: readonly string[], k: number) =>
  list[Math.floor(k * list.length) % list.length];

type Equipment = {
  /** clearance round the middle, metres */
  r: number;
  /** radius of the sand under it, or a square sandpit of that side */
  fall?: number;
  sandpit?: number;
  /** rubber instead of sand under it */
  rubber?: boolean;
  /**
   * For a long piece: its middle along x and half its length and width.
   * It is set parallel to the paths, on three discs instead of one circle,
   * with sand under all of it.
   */
  box?: { x: number; half: readonly [number, number] };
  draw: (b: LowPolyBuilder, seed: number) => void;
};

const EQUIPMENT: Equipment[] = [
  { r: 7, box: { x: 1.3, half: [6.6, 4.2] }, draw: towerCombo },
  { r: 4.2, fall: 3.8, draw: netPyramid },
  { r: 4.2, fall: 3.6, draw: swing },
  { r: 4.0, fall: 3.4, draw: nestSwing },
  { r: 3.4, sandpit: 4, draw: (b, seed) => sandpit(b, 4, seed) },
  { r: 3.0, fall: 2.6, rubber: true, draw: carousel },
  { r: 3.2, fall: 2.8, rubber: true, draw: trampolines },
  { r: 3.8, draw: balanceBeams },
  { r: 2.6, fall: 2.2, rubber: true, draw: seesaw },
  { r: 2.6, draw: playhouse },
  {
    r: 1.3,
    fall: 1.1,
    rubber: true,
    draw: (b, seed) => springRider(b, "#3fa34d", seed, true),
  },
  {
    r: 1.3,
    fall: 1.1,
    rubber: true,
    draw: (b, seed) => springRider(b, "#e2a72e", seed, false),
  },
];

export const buildPlayground = (frame: SiteFrame): CarmaPlanScenario => {
  const terraces = createTerracing(frame, {
    stepHeight: 1.5,
    minLevels: 1,
    maxLevels: 3,
    minLevelDepth: 30,
    minStep: 0,
    levelGrade: 0.03,
    bankGrade: 0.45,
    rampGrade: 0.08,
    rampWidth: 3,
    edgeBlend: EDGE_BLEND,
  });
  const surface = (x: number, z: number) => terraces.heightAt(x, z) + LIFT;

  const b = new LowPolyBuilder();
  const painter = new GroundPainter(frame);
  painter.field(0.25, (x, z) => {
    const { bank, ramp } = terraces.surfaceAt(x, z);
    const dry = noise(x, z, 7, 8);
    const stripe = Math.floor(terraces.v(x, z) / 1.2) % 2 === 0 ? 1.04 : 0.98;
    const lawn = mix(mix(LAWN, BANK, bank), LAWN_DRY, dry * dry * 0.7).map(
      (c) => c * stripe * (0.94 + 0.12 * noise(x, z, 1.6, 9))
    ) as [number, number, number];
    const path = smooth01((ramp - 0.4) / 0.25);
    const color = mix(lawn, PATH_FILL, path);
    return tone(mix(color, PATH_EDGE_RGB, 0.6 * 4 * path * (1 - path)), 1);
  });

  const footprints = new Footprints();
  const [vMin, vMax] = terraces.vRange;
  const [ux, uz] = terraces.uAxis;
  const [vx, vz] = terraces.vAxis;

  /** a path along `points` (u, v), split where it leaves the usable ground */
  const path = (
    points: readonly Point[],
    usable: (x: number, z: number) => boolean
  ) => {
    let run: Point[] = [];
    const flush = () => {
      if (run.length > 1) painter.line(run, PATH_WIDTH, PATH, PATH_EDGE);
      run = [];
    };
    for (const [uu, vv] of points) {
      const [x, z] = terraces.at(uu, vv);
      if (!usable(x, z)) {
        flush();
        continue;
      }
      run.push([x, z]);
      footprints.take(x, z, PATH_WIDTH / 2 + 0.5);
    }
    flush();
  };

  const along = (uu: number): Point[] => {
    const points: Point[] = [];
    for (let vv = vMin; vv <= vMax; vv += 2) points.push([uu, vv]);
    return points;
  };

  // a path along the middle of every level
  for (const terrace of terraces.levels)
    path(along(terrace.uMid), (x, z) => terraces.isLevel(x, z, 0));

  // and one up each ramp, from the middle of the level below to the next
  for (const ramp of terraces.ramps) {
    const uRamp = terraces.u(ramp.x, ramp.z);
    const vRamp = terraces.v(ramp.x, ramp.z);
    const above = terraces.levels.find(
      (terrace) => Math.abs(terrace.uFrom - uRamp) < 1e-6
    );
    const below = terraces.levels.find(
      (terrace) => Math.abs(terrace.uTo - uRamp) < 1e-6
    );
    if (!above || !below) continue;
    const points: Point[] = [];
    for (let uu = below.uMid; uu <= above.uMid; uu += 2)
      points.push([uu, vRamp]);
    path(
      points,
      (x, z) => frame.inside(x, z) && frame.edgeDistance(x, z) >= EDGE_BLEND
    );
  }

  // a zip line beside the path of the level with the longest free run
  let zipLines = 0;
  let run: { uu: number; from: number; length: number } | null = null;
  for (const terrace of terraces.levels) {
    const uu = terrace.uMid + 5;
    let start: number | null = null;
    for (let vv = vMin; vv <= vMax + 0.5; vv += 0.5) {
      const [x, z] = terraces.at(uu, vv);
      if (
        vv <= vMax &&
        terraces.isLevel(x, z, 2.5) &&
        footprints.free(x, z, 1.5)
      ) {
        start ??= vv;
        continue;
      }
      if (start !== null && (!run || vv - 0.5 - start > run.length))
        run = { uu, from: start, length: vv - 0.5 - start };
      start = null;
    }
  }
  // the steps reach 2.2 m back from the platform
  if (run && run.length - 3 >= ZIP_MIN) {
    const length = Math.min(ZIP_LENGTH, run.length - 3);
    const v0 = run.from + 2.5 + (run.length - 3 - length) / 2;
    painter.line(
      [terraces.at(run.uu, v0 + 1), terraces.at(run.uu, v0 + length)],
      3,
      SAND,
      SAND_EDGE
    );
    for (let dv = -2; dv <= length; dv += 2.5) {
      const [x, z] = terraces.at(run.uu, v0 + dv);
      footprints.take(x, z, 2);
    }
    const [x, z] = terraces.at(run.uu, v0);
    b.placed([x, surface(x, z), z], yawTowards(vx, vz), () =>
      zipLine(b, length, hash(x, z, 62))
    );
    zipLines += 1;
  }

  // a long slide down every bank, well away from its ramp
  let slides = 0;
  terraces.levels.slice(0, -1).forEach((lower, k) => {
    const boundary = lower.uTo;
    const ramp = terraces.ramps.find(
      (r) => Math.abs(terraces.u(r.x, r.z) - boundary) < 1e-3
    );
    const rampV = ramp ? terraces.v(ramp.x, ramp.z) : null;
    const zone = (uu: number, vv: number) =>
      terraces.zoneAt(...terraces.at(uu, vv));
    const preferred =
      rampV === null
        ? (vMin + vMax) / 2
        : rampV - vMin > vMax - rampV
        ? rampV - 16
        : rampV + 16;
    const order: number[] = [];
    for (let vv = vMin; vv <= vMax; vv += 1) order.push(vv);
    order.sort((a, c) => Math.abs(a - preferred) - Math.abs(c - preferred));
    for (const vv of order) {
      if (rampV !== null && Math.abs(vv - rampV) < 12) continue;
      if (zone(boundary, vv) !== "bank") continue;
      // the bank's top and foot along u
      let top = boundary;
      while (top < boundary + 15 && zone(top, vv) === "bank") top += 0.25;
      let foot = boundary;
      while (foot > boundary - 15 && zone(foot, vv) === "bank") foot -= 0.25;
      if (zone(top, vv) !== "level" || zone(foot, vv) !== "level") continue;
      const uTop = top + 2.2;
      const uFoot = foot - 2.2;
      const along: Point[] = [];
      for (let uu = uTop + 1.6; uu >= uFoot - 1; uu -= 1.5)
        along.push(terraces.at(uu, vv));
      if (
        !along.every(
          ([x, z]) =>
            frame.inside(x, z) &&
            frame.edgeDistance(x, z) >= EDGE_BLEND + 1.5 &&
            footprints.free(x, z, 1.2)
        )
      )
        continue;
      along.forEach(([x, z]) => footprints.take(x, z, 1.2));
      const [x, z] = terraces.at(uTop, vv);
      const base = surface(x, z);
      const ground: number[] = [];
      for (let d = 0; d <= uTop - uFoot + 1e-6; d += 0.5) {
        const [gx, gz] = terraces.at(uTop - d, vv);
        ground.push(surface(gx, gz) - base);
      }
      painter.polygon(
        octagon(...terraces.at(uFoot - 0.8, vv), 1.6),
        SAND,
        SAND_EDGE
      );
      b.placed([x, base, z], yawTowards(-ux, -uz), () =>
        bankSlide(b, ground, 0.5, hash(x, z, 63 + k))
      );
      slides += 1;
      return;
    }
  });

  let equipment = 0;
  /** a long piece at (x, z) along the paths, if it fits there */
  const placeBox = (
    item: Equipment,
    { x: middle, half: [length, width] }: NonNullable<Equipment["box"]>,
    x: number,
    z: number
  ) => {
    const yaw = yawTowards(vx, vz) + (hash(x, z, 60) < 0.5 ? 0 : Math.PI);
    const local = (f: number, r: number): Point => {
      const [ox, oz] = offsetBy(yaw, f, r);
      return [x + ox, z + oz];
    };
    const corners = [
      local(middle - length, -width),
      local(middle + length, -width),
      local(middle + length, width),
      local(middle - length, width),
    ];
    if (!corners.every(([cx, cz]) => terraces.isLevel(cx, cz, 0.3)))
      return false;
    const reach = length - width;
    const discs = [-1, 0, 1].map((k) => local(middle + k * reach, 0));
    if (!discs.every(([dx, dz]) => footprints.free(dx, dz, width + 0.9)))
      return false;
    discs.forEach(([dx, dz]) => footprints.take(dx, dz, width + 1.1));
    painter.line(
      [discs[0], discs[2]],
      2 * (width + 0.9),
      item.rubber ? RUBBER : SAND,
      item.rubber ? RUBBER_EDGE : SAND_EDGE
    );
    b.placed([x, surface(x, z), z], yaw, () => item.draw(b, hash(x, z, 61)));
    equipment += 1;
    return true;
  };
  EQUIPMENT.forEach((item, index) => {
    for (const [x, z] of candidates(frame, 3, 50 + index)) {
      if (item.box) {
        if (placeBox(item, item.box, x, z)) return;
        continue;
      }
      if (!terraces.isLevel(x, z, item.r * 0.7)) continue;
      if (!footprints.free(x, z, item.r + 1)) continue;
      footprints.take(x, z, item.r);
      const yaw =
        yawTowards(vx, vz) + Math.floor(hash(x, z, 60) * 4) * (Math.PI / 2);
      if (item.fall)
        painter.polygon(
          octagon(x, z, item.fall),
          item.rubber ? RUBBER : SAND,
          item.rubber ? RUBBER_EDGE : SAND_EDGE
        );
      if (item.sandpit) {
        const h = item.sandpit / 2;
        painter.polygon(
          (
            [
              [-h, -h],
              [h, -h],
              [h, h],
              [-h, h],
            ] as const
          ).map(([f, r]) => {
            const [ox, oz] = offsetBy(yaw, f, r);
            return [x + ox, z + oz] as const;
          }),
          SAND
        );
      }
      b.placed([x, surface(x, z), z], yaw, () => item.draw(b, hash(x, z, 61)));
      equipment += 1;
      return;
    }
  });

  // benches by the level paths, facing them, most with a parent or two
  // watching; a bin beside every other one
  let benches = 0;
  let parents = 0;
  for (const terrace of terraces.levels)
    for (let vv = vMin + 6, i = 0; vv <= vMax; vv += 12, i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const [x, z] = terraces.at(
        terrace.uMid + side * (PATH_WIDTH / 2 + 0.9),
        vv
      );
      // the path's own footprints end 0.4 m short of the bench
      if (!terraces.isLevel(x, z, 0.5) || !footprints.free(x, z, 0.3)) continue;
      footprints.take(x, z, 1.1);
      const k = hash(x, z, 64);
      const sitters: Sitter[] =
        k < 0.25
          ? [
              { x: -0.45, seed: hash(x, z, 65) },
              { x: 0.5, seed: hash(x, z, 66) },
            ]
          : k < 0.7
          ? [{ x: (hash(x, z, 67) - 0.5) * 0.9, seed: hash(x, z, 65) }]
          : [];
      b.placed(
        [x, surface(x, z), z],
        Math.atan2(-side * ux, -side * uz),
        () => {
          bench(b, sitters);
          if (i % 2 === 0)
            b.transformed(
              new THREE.Matrix4().makeTranslation(1.45, 0, -0.1),
              () => bin(b)
            );
        }
      );
      benches += 1;
      parents += sitters.length;
    }

  let trees = 0;
  for (const { x, z } of pointsAlongEdge(frame, 8, EDGE_BLEND * 0.45)) {
    const conifer = hash(x, z, 70) < 0.2;
    b.placed([x, surface(x, z), z], hash(x, z, 71) * Math.PI, () =>
      tree(
        b,
        conifer,
        0.8 + hash(x, z, 72) * 0.4,
        pick(conifer ? NEEDLES : LEAVES, hash(x, z, 73))
      )
    );
    trees += 1;
  }
  // shade trees among the play spots, one per 1500 m²
  const shadeTrees = Math.round(frame.areaM2 / 1500);
  let shade = 0;
  for (const [x, z] of candidates(frame, 4, 80)) {
    if (shade >= shadeTrees) break;
    if (!terraces.isLevel(x, z, 1) || !footprints.free(x, z, 3)) continue;
    footprints.take(x, z, 3);
    b.placed([x, surface(x, z), z], hash(x, z, 81) * Math.PI, () =>
      tree(b, false, 0.85 + hash(x, z, 82) * 0.35, pick(LEAVES, hash(x, z, 83)))
    );
    shade += 1;
    trees += 1;
  }

  // children running about on the lawn between the play spots, one per
  // 450 m², now and then two together
  let kids = 0;
  const kidsWanted = Math.round(frame.areaM2 / 450);
  for (const [x, z] of candidates(frame, 2.5, 90)) {
    if (kids >= kidsWanted) break;
    if (!terraces.isLevel(x, z, 0.5) || !footprints.free(x, z, 0.6)) continue;
    footprints.take(x, z, 0.5);
    const yaw = hash(x, z, 91) * Math.PI * 2;
    const pair = hash(x, z, 92) < 0.3;
    b.placed([x, surface(x, z), z], yaw, () => {
      person(b, hash(x, z, 93), {
        legs: hash(x, z, 94) < 0.75 ? "walk" : "stand",
        arms: hash(x, z, 95) < 0.3 ? "up" : "down",
        scale: 0.58 + hash(x, z, 96) * 0.12,
      });
      if (pair)
        b.transformed(new THREE.Matrix4().makeTranslation(-1.2, 0, 0.5), () =>
          person(b, hash(x, z, 97), {
            legs: "walk",
            arms: "forward",
            scale: 0.58 + hash(x, z, 98) * 0.12,
          })
        );
    });
    kids += pair ? 2 : 1;
  }

  // a parent with a child at hand along the level paths every 30 m or so
  for (const terrace of terraces.levels)
    for (
      let vv = vMin + 9 + hash(terrace.uMid, 0, 99) * 12;
      vv <= vMax;
      vv += 30
    ) {
      const [x, z] = terraces.at(terrace.uMid - 0.45, vv);
      if (!terraces.isLevel(x, z, 0.5)) continue;
      const forward = hash(x, z, 100) < 0.5 ? 1 : -1;
      b.placed(
        [x, surface(x, z), z],
        yawTowards(vx * forward, vz * forward),
        () => {
          person(b, hash(x, z, 101), { legs: "walk" });
          b.transformed(new THREE.Matrix4().makeTranslation(0.1, 0, 0.6), () =>
            person(b, hash(x, z, 102), { legs: "walk", scale: 0.62 })
          );
        }
      );
      parents += 1;
      kids += 1;
    }

  for (const run of edgeRuns(frame, 2.5, 0.3, surface))
    fence(b, run, {
      height: 1.0,
      rails: [0.45, 0.95],
      paint: "#4d6b45",
      post: 0.06,
    });

  return finishScenario(
    frame,
    b,
    { heightAt: surface, painter, skirt: 3 },
    "playground",
    {
      levels: terraces.levels.length,
      ramps: terraces.ramps.length,
      equipment,
      zipLines,
      slides,
      benches,
      kids,
      parents,
      trees,
    }
  );
};

const octagon = (x: number, z: number, r: number): Point[] =>
  Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return [x + Math.cos(angle) * r, z + Math.sin(angle) * r] as const;
  });
