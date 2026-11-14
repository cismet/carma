import { GroundPainter, mix, noise, tone } from "./ground-paint";
import * as THREE from "three";

import { createAccessRoad, type AccessRoad } from "./access-road";
import { LowPolyBuilder } from "./lowpoly";
import {
  boomBarrier,
  car,
  hedge,
  lamp,
  parkingSign,
  person,
  tree,
  type CarKind,
} from "./models";
import { finishScenario, yawTowards, type CarmaPlanScenario } from "./scenario";
import {
  hash,
  pointsAlongEdge,
  smooth01,
  type Point,
  type SiteFrame,
} from "./site-frame";
import { createTerracing, type Terracing } from "./terracing";

/**
 * Scenario "Parkplatz": the site as a surface car park. Asphalt levels with
 * a slight fall, joined by ramps, grass banks between them and a green border
 * with trees along the edge. On each level double rows of marked bays with
 * an aisle between, about two thirds of them taken, and planted strips with
 * trees and lamps between the double rows. Where the site has an entrance
 * from the street, an access road leads from it to the nearest aisle,
 * through a gate with barriers.
 */

const LIFT = 0.15;
const EDGE_BLEND = 6;

const BAY_WIDTH = 2.5;
const BAY_DEPTH = 5;
const AISLE = 6.5;
const STRIP = 2.5;
const LINE_WIDTH = 0.12;
const OCCUPANCY = 0.68;
/** default width of the access road, and where its gate stands past the edge */
const ROAD_WIDTH = 6.5;
const GATE_IN = 4;

type Rgb = readonly [number, number, number];
/** ground, sRGB */
const ASPHALT: Rgb = [92, 94, 98];
const ASPHALT_WORN: Rgb = [112, 112, 112];
const KERB: Rgb = [176, 174, 166];
const LAWN: Rgb = [108, 136, 70];
const LAWN_DRY: Rgb = [134, 146, 84];
const BANK: Rgb = [98, 128, 62];
const MARKING = "rgba(236, 236, 230, 0.92)";

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
const HEDGES = ["#3f6b2e", "#4a7734"];
const NEEDLES = ["#2f5a35", "#356339", "#2a5230"];

const pick = (list: readonly string[], k: number) =>
  list[Math.floor(k * list.length) % list.length];

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
  const painter = new GroundPainter(frame);
  const [ux, uz] = terraces.uAxis;
  const [vx, vz] = terraces.vAxis;
  const [vMin, vMax] = terraces.vRange;
  const level = (uu: number, vv: number, margin: number) => {
    const [x, z] = terraces.at(uu, vv);
    return terraces.isLevel(x, z, margin);
  };
  /** a bay from `u0` (back) to `u0 + BAY_DEPTH`, `vv` to `vv + BAY_WIDTH`,
   * on one level with the aisle in front of it */
  const bayOnLevel = (u0: number, vv: number, aisleSide: 1 | -1) =>
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

  // the double rows first, so the access road knows the aisles it joins
  const moduleDepth = 2 * BAY_DEPTH + AISLE;
  const modules: number[] = [];
  for (const terrace of terraces.levels) {
    let u0 = terrace.uFrom;
    while (u0 + moduleDepth <= terrace.uTo) {
      // the first row starts where some bays fit, past the bank or edge
      let fitting = 0;
      for (let vv = vMin; vv + BAY_WIDTH <= vMax; vv += BAY_WIDTH)
        if (bayOnLevel(u0, vv, 1)) fitting += 1;
      if (fitting < 3) {
        u0 += 0.5;
        continue;
      }
      modules.push(u0);
      u0 += moduleDepth + STRIP;
    }
  }
  /** u of every aisle's middle */
  const aisles = modules.map((u0) => u0 + BAY_DEPTH + AISLE / 2);
  /** the stretch of each aisle that lies on its level */
  const aisleRuns = aisles.flatMap((uu) => {
    let first: number | null = null;
    let last: number | null = null;
    for (let vv = vMin; vv <= vMax; vv += 1)
      if (level(uu, vv, 0.5)) {
        first ??= vv;
        last = vv;
      }
    return first !== null && last !== null && last - first >= 6
      ? [{ uu, first, last }]
      : [];
  });

  const roads = frame.entrances
    .map((entrance) =>
      createAccessRoad(entrance, ROAD_WIDTH, (path) =>
        joinAisle(terraces, aisleRuns, path)
      )
    )
    .filter((road): road is AccessRoad => road !== null);
  const nearRoad = (x: number, z: number, margin: number) =>
    roads.some((road) => road.near(x, z, margin));

  painter.field(0.2, (x, z) => {
    const { bank } = terraces.surfaceAt(x, z);
    const edge = frame.inside(x, z) ? frame.edgeDistance(x, z) : 0;
    // asphalt on the levels, ramps and access roads, a kerb where it meets
    // the grass
    const asphalt = Math.max(
      (1 - smooth01((bank - 0.35) / 0.3)) *
        smooth01((edge - EDGE_BLEND + 0.15) / 0.3),
      ...roads.map((road) => road.weight(x, z))
    );
    const wear = noise(x, z, 6, 6);
    const paved = scale(
      mix(ASPHALT, ASPHALT_WORN, wear * wear * 0.6),
      0.94 + 0.12 * noise(x, z, 1.2, 7)
    );
    const grass = lawn(mix(LAWN, BANK, bank), x, z, terraces.v(x, z));
    const kerb = 4 * asphalt * (1 - asphalt);
    return tone(
      mix(mix(grass, paved, asphalt), KERB, Math.min(1, kerb * 1.3)),
      1
    );
  });

  /** a bay on its level and clear of the access roads */
  const bayFits = (u0: number, vv: number, aisleSide: 1 | -1) =>
    bayOnLevel(u0, vv, aisleSide) &&
    [0.1, BAY_DEPTH / 2, BAY_DEPTH - 0.1].every((du) =>
      [0.1, BAY_WIDTH / 2, BAY_WIDTH - 0.1].every((dv) => {
        const [x, z] = terraces.at(u0 + du, vv + dv);
        return !nearRoad(x, z, 0.3);
      })
    );

  const lines = new Set<string>();
  let bays = 0;
  let cars = 0;
  let trees = 0;
  let people = 0;

  const row = (u0: number, aisleSide: 1 | -1) => {
    for (let vv = vMin, i = 0; vv + BAY_WIDTH <= vMax; vv += BAY_WIDTH, i++) {
      if (!bayFits(u0, vv, aisleSide)) continue;
      bays += 1;
      for (const edge of [i, i + 1]) {
        const key = `${u0.toFixed(2)}:${edge}`;
        if (lines.has(key)) continue;
        lines.add(key);
        const ve = vMin + edge * BAY_WIDTH;
        painter.line(
          [terraces.at(u0, ve), terraces.at(u0 + BAY_DEPTH, ve)],
          LINE_WIDTH,
          MARKING
        );
      }
      const [cx, cz] = terraces.at(
        u0 + BAY_DEPTH / 2 - aisleSide * 0.2,
        vv + BAY_WIDTH / 2 + (hash(u0, vv, 7) - 0.5) * 0.25
      );
      // drips where cars stand every day
      if (hash(cx, cz, 17) < 0.7) stain(painter, cx, cz);
      if (hash(cx, cz, 8) > OCCUPANCY) continue;
      const paint = pick(CAR_PAINTS, hash(cx, cz, 9));
      const roll = hash(cx, cz, 21);
      const kind: CarKind =
        roll < 0.55 ? "hatch" : roll < 0.8 ? "estate" : "suv";
      // now and then the driver just got out and walks to the aisle
      const driver = hash(cx, cz, 22) < 0.1;
      b.placed(
        [cx, surface(cx, cz), cz],
        yawTowards(ux * aisleSide, uz * aisleSide) +
          (hash(cx, cz, 10) - 0.5) * 0.08,
        () => {
          car(b, paint, kind);
          if (driver)
            b.transformed(
              new THREE.Matrix4().makeTranslation(0.7, 0, -1.25),
              () => person(b, hash(cx, cz, 23), { legs: "walk" })
            );
        }
      );
      cars += 1;
      if (driver) people += 1;
    }
  };

  const strip = (uu: number) => {
    // the planted strip itself: lawn behind a kerb, where the level allows
    const across = STRIP / 2 - 0.1;
    let from: number | null = null;
    const flush = (to: number) => {
      if (from !== null && to - from > 1)
        painter.polygon(
          [
            terraces.at(uu - across, from),
            terraces.at(uu - across, to),
            terraces.at(uu + across, to),
            terraces.at(uu + across, from),
          ],
          "rgb(104, 132, 66)",
          { color: "rgb(176, 174, 166)", width: 0.15 }
        );
      from = null;
    };
    /** on the level and clear of the access roads by `margin` */
    const open = (vv: number, levelMargin: number, margin: number) => {
      const [x, z] = terraces.at(uu, vv);
      return level(uu, vv, levelMargin) && !nearRoad(x, z, margin);
    };
    for (let vv = vMin; vv <= vMax; vv += 0.5) {
      if (open(vv, 0.2, STRIP / 2 + 0.3)) from ??= vv;
      else flush(vv - 0.5);
    }
    flush(vMax);
    const offset = hash(uu, 0, 11) * 10;
    for (let vv = vMin + offset, i = 0; vv <= vMax; vv += 10, i++) {
      if (!open(vv, 0, 2.5)) continue;
      const [x, z] = terraces.at(uu, vv);
      // a clipped hedge between this tree or lamp and the next
      if ([2, 5, 8].every((dv) => open(vv + dv, 0, 1.5))) {
        const [hx, hz] = terraces.at(uu, vv + 2);
        b.placed([hx, surface(hx, hz), hz], yawTowards(vx, vz), () =>
          hedge(b, 6, pick(HEDGES, hash(hx, hz, 24)), i)
        );
      }
      if (i % 3 === 1)
        b.placed([x, surface(x, z), z], yawTowards(ux, uz), () => lamp(b));
      else {
        b.placed([x, surface(x, z), z], hash(x, z, 12) * Math.PI, () =>
          tree(
            b,
            false,
            0.75 + hash(x, z, 13) * 0.3,
            pick(LEAVES, hash(x, z, 18))
          )
        );
        trees += 1;
      }
    }
  };

  for (const u0 of modules) {
    row(u0, 1);
    row(u0 + BAY_DEPTH + AISLE, -1);
    arrows(painter, terraces, u0 + BAY_DEPTH + AISLE / 2, level);
    strip(u0 + moduleDepth + STRIP / 2);
  }

  // the way in: a dashed centre line, the gate with its barriers and sign,
  // and a car just through it
  roads.forEach((road, index) => {
    const gate = road.sEdge + GATE_IN;
    if (road.length < gate + 4) return;
    // the centre line stops where the road opens into the aisle
    const dashTo = road.length - AISLE / 2 - 1;
    if (dashTo > road.sEdge + 3)
      painter.line(
        road.slice(road.sEdge + 1, dashTo),
        LINE_WIDTH,
        MARKING,
        undefined,
        [3, 3]
      );
    const at = (s: number, right: number) => {
      const p = road.pointAt(s);
      const x = p.x - p.dz * right;
      const z = p.z + p.dx * right;
      return { x, z, y: surface(x, z), dx: p.dx, dz: p.dz };
    };
    const half = road.halfAt(gate);
    // in on the right lane, boom up; out on the left, boom down
    const entry = at(gate, half + 0.45);
    b.placed([entry.x, entry.y, entry.z], yawTowards(entry.dx, entry.dz), () =>
      boomBarrier(b, half - 0.3, 1.35)
    );
    const exit = at(gate, -half - 0.45);
    b.placed([exit.x, exit.y, exit.z], yawTowards(-exit.dx, -exit.dz), () =>
      boomBarrier(b, half - 0.3, 0)
    );
    const sign = at(road.sEdge + 1.5, road.halfAt(road.sEdge + 1.5) + 0.8);
    b.placed([sign.x, sign.y, sign.z], yawTowards(-sign.dx, -sign.dz), () =>
      parkingSign(b)
    );
    if (index > 0) return;
    const arriving = at(gate + 3.5, half / 2);
    const front = at(gate + 5.1, half / 2);
    const back = at(gate + 1.9, half / 2);
    b.placed(
      [arriving.x, arriving.y, arriving.z],
      yawTowards(arriving.dx, arriving.dz),
      () =>
        car(b, pick(CAR_PAINTS, hash(arriving.x, arriving.z, 25)), "estate"),
      Math.atan2(front.y - back.y, 3.2)
    );
    cars += 1;
  });

  // without an entrance one car arrives along the first aisle; people walk
  // along the others
  aisles.forEach((uu, index) => {
    const open: number[] = [];
    for (let vv = vMin; vv <= vMax; vv += 1)
      if (level(uu, vv, 0.5)) open.push(vv);
    if (open.length < 12) return;
    if (index === 0 && roads.length === 0) {
      const vv = open[Math.floor(open.length * 0.4)];
      const [x, z] = terraces.at(uu + 1.2, vv);
      b.placed([x, surface(x, z), z], yawTowards(vx, vz), () =>
        car(b, pick(CAR_PAINTS, hash(x, z, 25)), "estate")
      );
      cars += 1;
    }
    for (let k = 5 + index * 7; k < open.length; k += 22) {
      const vv = open[k];
      const side = hash(uu, vv, 26) < 0.5 ? 1 : -1;
      const forward = hash(uu, vv, 27) < 0.5 ? 1 : -1;
      const [x, z] = terraces.at(uu + side * (AISLE / 2 - 0.9), vv);
      const yaw = yawTowards(vx * forward, vz * forward);
      b.placed([x, surface(x, z), z], yaw, () => {
        person(b, hash(x, z, 28), { legs: "walk" });
        // every other one with a child at hand
        if (k % 2 === 1)
          b.transformed(
            new THREE.Matrix4().makeTranslation(0.1, 0, side * 0.55),
            () => person(b, hash(x, z, 29), { legs: "walk", scale: 0.62 })
          );
      });
      people += k % 2 === 1 ? 2 : 1;
    }
  });

  for (const { x, z } of pointsAlongEdge(frame, 9, EDGE_BLEND * 0.5)) {
    if (nearRoad(x, z, 3)) continue;
    const conifer = hash(x, z, 14) < 0.3;
    b.placed([x, surface(x, z), z], hash(x, z, 15) * Math.PI, () =>
      tree(
        b,
        conifer,
        0.8 + hash(x, z, 16) * 0.35,
        pick(conifer ? NEEDLES : LEAVES, hash(x, z, 19))
      )
    );
    trees += 1;
  }

  return finishScenario(
    frame,
    b,
    { heightAt: surface, painter, skirt: 3 },
    "parking lot",
    {
      levels: terraces.levels.length,
      ramps: terraces.ramps.length,
      roads: roads.length,
      roadLength: Math.round(roads[0]?.length ?? 0),
      // height from the street end to where the road meets the aisle
      roadRise: roads[0] ? Math.round(rise(roads[0], surface) * 10) / 10 : 0,
      bays,
      cars,
      trees,
      people,
    }
  );
};

const scale = ([r, g, b]: Rgb, k: number): Rgb => [r * k, g * k, b * k];

/** lawn with soft blotches and mowing stripes along the levels */
const lawn = (base: Rgb, x: number, z: number, v: number): Rgb => {
  const dry = noise(x, z, 7, 8);
  const stripe = Math.floor(v / 1.2) % 2 === 0 ? 1.04 : 0.98;
  return scale(
    mix(base, LAWN_DRY, dry * dry * 0.7),
    stripe * (0.94 + 0.12 * noise(x, z, 1.6, 9))
  );
};

const stain = (painter: GroundPainter, x: number, z: number) => {
  const { ctx } = painter;
  ctx.save();
  ctx.translate(x, z);
  ctx.scale(1, 0.6 + hash(x, z, 20) * 0.4);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.9);
  gradient.addColorStop(0, "rgba(40, 40, 42, 0.32)");
  gradient.addColorStop(1, "rgba(40, 40, 42, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
};

/** direction arrows painted at both ends of an aisle, where it is level */
const arrows = (
  painter: GroundPainter,
  terraces: Terracing,
  uu: number,
  level: (u: number, v: number, margin: number) => boolean
) => {
  const [vMin, vMax] = terraces.vRange;
  let first: number | null = null;
  let last: number | null = null;
  for (let vv = vMin; vv <= vMax; vv += 1)
    if (level(uu, vv, 0.5)) {
      first ??= vv;
      last = vv;
    }
  if (first === null || last === null || last - first < 16) return;
  for (const [vv, dir] of [
    [first + 5, 1],
    [last - 5, -1],
  ] as const) {
    const point = (along: number, across: number) =>
      terraces.at(uu + across, vv + along * dir);
    painter.polygon(
      [
        point(-1.6, -0.15),
        point(0.4, -0.15),
        point(0.4, -0.45),
        point(1.6, 0),
        point(0.4, 0.45),
        point(0.4, 0.15),
        point(-1.6, 0.15),
      ],
      "rgba(236, 236, 230, 0.85)"
    );
  }
};

const rise = (
  road: AccessRoad,
  heightAt: (x: number, z: number) => number
): number => {
  const from = road.pointAt(road.sEdge);
  const to = road.pointAt(road.length);
  return heightAt(to.x, to.z) - heightAt(from.x, from.z);
};

/**
 * The way from the street to the nearest aisle: the entrance's path up to
 * where it comes closest to an aisle, then along the aisle into it when that
 * point is an aisle's end, else square onto the aisle's side.
 */
const joinAisle = (
  terraces: Terracing,
  aisleRuns: readonly { uu: number; first: number; last: number }[],
  path: readonly Point[]
): Point[] => {
  type Target = { d: number; uu: number; vv: number; out: -1 | 0 | 1 };
  const nearestAisle = ([x, z]: Point): Target | null => {
    let best: Target | null = null;
    for (const { uu, first, last } of aisleRuns) {
      const vv = Math.min(last, Math.max(first, terraces.v(x, z)));
      const [ax, az] = terraces.at(uu, vv);
      const d = Math.hypot(ax - x, az - z);
      if (!best || d < best.d)
        best = { d, uu, vv, out: vv === first ? -1 : vv === last ? 1 : 0 };
    }
    return best;
  };
  // walk the path and keep it up to its closest approach to an aisle
  let kept: Point[] = [path[0]];
  let closest = nearestAisle(path[0]);
  let walked: Point[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let k = 1; k <= steps; k++) {
      const p: Point = [
        ax + ((bx - ax) * k) / steps,
        az + ((bz - az) * k) / steps,
      ];
      const target = nearestAisle(p);
      const point = k === steps ? path[i] : p;
      if (target && (!closest || target.d < closest.d)) {
        closest = target;
        kept = [...walked, point];
      }
      if (k === steps) walked = [...walked, path[i]];
    }
  }
  if (!closest) return [...path];
  const end = kept[kept.length - 1];
  const { uu, vv, out, d } = closest;
  const target = terraces.at(uu, vv);
  const toTarget = (p: Point) => Math.hypot(p[0] - target[0], p[1] - target[1]);
  /** a waypoint is used when it lies between the end and the target */
  const via = (p: Point): Point[] =>
    Math.hypot(p[0] - end[0], p[1] - end[1]) > 2 && toTarget(p) < d ? [p] : [];
  const onward = (points: Point[]) =>
    points.filter((p) => Math.hypot(p[0] - end[0], p[1] - end[1]) > 0.5);
  if (out !== 0)
    return [
      ...kept,
      ...onward([
        ...via(terraces.at(uu, vv + out * 6)),
        target,
        terraces.at(uu, vv - out * 4),
      ]),
    ];
  const side = terraces.u(end[0], end[1]) >= uu ? 1 : -1;
  return [
    ...kept,
    ...onward([...via(terraces.at(uu + side * (AISLE / 2 + 3), vv)), target]),
  ];
};
