import { LowPolyBuilder } from "./lowpoly";
import {
  bench,
  carousel,
  climbingDome,
  fence,
  playhouse,
  sandpitFrame,
  seesaw,
  slideTower,
  springRider,
  swing,
  tree,
} from "./models";
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
  type Point,
  type SiteFrame,
} from "./site-frame";
import { createTerracing } from "./terracing";

/**
 * Scenario "Spielplatz": a children's playground. Gentle grass terraces with
 * a path along each level and paths up the ramps between them; on the levels
 * swings, slide towers, a climbing dome, seesaw, carousel, playhouse, sandpit
 * and spring riders, sand under everything one can fall from, benches by the
 * paths, trees along the edge and among the play spots, and a low fence
 * round it all.
 */

const LIFT = 0.15;
const CELL = 2;
const EDGE_BLEND = 8;
const PATH_WIDTH = 2.4;

const GRASS = ["#6e9b4a", "#76a352", "#679244", "#7aa858"];
const BANK_GRASS = ["#5e8a3e", "#628f42", "#5a853b"];
const PATH = ["#cdb98f", "#c6b186", "#d3bf95"];
const SAND = ["#dcc28a", "#e3c993", "#d6bb82"];
const LEAVES = ["#4f7a35", "#5a8a3c", "#46702f", "#628f3f"];
const NEEDLES = ["#2f5a35", "#356339", "#2a5230"];

type Equipment = {
  /** clearance round the middle, metres */
  r: number;
  /** radius of the sand under it, or a square sandpit of that side */
  fall?: number;
  sandpit?: number;
  draw: (b: LowPolyBuilder) => void;
};

const EQUIPMENT: Equipment[] = [
  { r: 4.6, fall: 3.4, draw: (b) => slideTower(b, "#2f7fd1") },
  { r: 4.2, fall: 3.6, draw: (b) => swing(b) },
  { r: 3.0, fall: 2.8, draw: (b) => climbingDome(b, "#d8462c") },
  { r: 3.4, sandpit: 4, draw: (b) => sandpitFrame(b, 4) },
  { r: 2.6, draw: (b) => seesaw(b) },
  { r: 2.4, fall: 2.2, draw: (b) => carousel(b) },
  { r: 2.4, draw: (b) => playhouse(b) },
  { r: 1.3, draw: (b) => springRider(b, "#3fa34d") },
  { r: 1.3, draw: (b) => springRider(b, "#e2a72e") },
  { r: 4.6, fall: 3.4, draw: (b) => slideTower(b, "#e2a72e") },
  { r: 4.2, fall: 3.6, draw: (b) => swing(b) },
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
  b.ground(
    frame,
    CELL,
    surface,
    (x, z) => {
      const zone = terraces.zoneAt(x, z);
      if (zone === "ramp") return PATH;
      return zone === "bank" ? BANK_GRASS : GRASS;
    },
    { depth: 3, paint: "#4d5a3a" }
  );

  const footprints = new Footprints();
  const [vMin, vMax] = terraces.vRange;
  const [ux, uz] = terraces.uAxis;
  const [vx, vz] = terraces.vAxis;

  /** a path along `points` (u, v), split where it leaves the usable ground */
  const path = (points: readonly Point[], usable: (x: number, z: number) => boolean) => {
    let run: Point[] = [];
    const flush = () => {
      if (run.length > 1) b.strip(run, PATH_WIDTH, surface, 0.04, PATH);
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

  let equipment = 0;
  EQUIPMENT.forEach((item, index) => {
    for (const [x, z] of candidates(frame, 3, 50 + index)) {
      if (!terraces.isLevel(x, z, item.r * 0.7)) continue;
      if (!footprints.free(x, z, item.r + 1)) continue;
      footprints.take(x, z, item.r);
      const yaw =
        yawTowards(vx, vz) + Math.floor(hash(x, z, 60) * 4) * (Math.PI / 2);
      if (item.fall) b.patch(octagon(x, z, item.fall), surface, 0.06, SAND);
      if (item.sandpit) {
        const h = item.sandpit / 2;
        b.patch(
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
          surface,
          0.06,
          SAND
        );
      }
      b.placed([x, surface(x, z), z], yaw, () => item.draw(b));
      equipment += 1;
      return;
    }
  });

  // benches by the level paths, facing them
  let benches = 0;
  for (const terrace of terraces.levels)
    for (let vv = vMin + 6, i = 0; vv <= vMax; vv += 12, i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const [x, z] = terraces.at(
        terrace.uMid + side * (PATH_WIDTH / 2 + 1.0),
        vv
      );
      if (!terraces.isLevel(x, z, 0.5) || !footprints.free(x, z, 1.1)) continue;
      footprints.take(x, z, 1.1);
      b.placed([x, surface(x, z), z], Math.atan2(-side * ux, -side * uz), () =>
        bench(b)
      );
      benches += 1;
    }

  let trees = 0;
  for (const { x, z } of pointsAlongEdge(frame, 8, EDGE_BLEND * 0.45)) {
    const conifer = hash(x, z, 70) < 0.2;
    b.placed([x, surface(x, z), z], hash(x, z, 71) * Math.PI, () =>
      tree(b, conifer, 0.8 + hash(x, z, 72) * 0.4, conifer ? NEEDLES : LEAVES)
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
      tree(b, false, 0.85 + hash(x, z, 82) * 0.35, LEAVES)
    );
    shade += 1;
    trees += 1;
  }

  for (const run of edgeRuns(frame, 2.5, 0.3, surface))
    fence(b, run, {
      height: 1.0,
      rails: [0.45, 0.95],
      paint: "#4d6b45",
      post: 0.06,
    });

  return finishScenario(frame, b, "playground", {
    levels: terraces.levels.length,
    ramps: terraces.ramps.length,
    equipment,
    benches,
    trees,
  });
};

const octagon = (x: number, z: number, r: number): Point[] =>
  Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return [x + Math.cos(angle) * r, z + Math.sin(angle) * r] as const;
  });
