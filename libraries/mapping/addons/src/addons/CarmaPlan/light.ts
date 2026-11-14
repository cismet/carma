import * as THREE from "three";

/**
 * The light every carma plan scenario is baked with. The scenario lives in
 * the map's shared three.js scene, whose lights also fall on the mesh tiles,
 * so it brings no lights of its own: the rig below goes into the vertex
 * colours of the models and the ground, and the sun's shadows (see
 * shadow-map.ts) into the ground texture and the models' vertices.
 *
 * The rig: a hemisphere light, cool from the sky and warm from the ground,
 * plus one warm sun low in the west-south-west, so sunlit and shaded sides
 * differ clearly and everything throws a long shadow. Values are linear RGB
 * multipliers of a colour; flat ground in the sun comes out at about 1.
 *
 * Site frame: x east, y up, z south.
 */

/** compass bearing of the sun, degrees from north */
export const SUN_AZIMUTH_DEG = 250;
export const SUN_ELEVATION_DEG = 30;

const azimuth = (SUN_AZIMUTH_DEG * Math.PI) / 180;
const elevation = (SUN_ELEVATION_DEG * Math.PI) / 180;

/** unit vector towards the sun */
export const SUN = new THREE.Vector3(
  Math.cos(elevation) * Math.sin(azimuth),
  Math.sin(elevation),
  -Math.cos(elevation) * Math.cos(azimuth)
).normalize();

type Rgb = readonly [number, number, number];

const SKY: Rgb = [0.48, 0.53, 0.6];
const BOUNCE: Rgb = [0.34, 0.3, 0.25];
const SUN_COLOR: Rgb = [1.04, 0.84, 0.6];
/** what the sky adds on glass and glossy paint, independent of their colour */
const SKY_REFLECTION: Rgb = [0.5, 0.58, 0.68];

export type Finish = "matte" | "gloss" | "glass" | "glow";

/**
 * The lit colour of a surface with base colour `base` (linear), normal
 * `n`, `sun` of the sun reaching it (0 in shadow, 1 in full sun) and `ao`
 * of the sky light reaching it (lower near the ground). Writes into `out`.
 */
export const shade = (
  out: THREE.Color,
  base: THREE.Color,
  n: THREE.Vector3,
  sun: number,
  ao: number,
  finish: Finish
): THREE.Color => {
  if (finish === "glow") return out.copy(base);
  const up = 0.5 + 0.5 * n.y;
  const direct = Math.max(0, n.dot(SUN)) * sun;
  const sky = finish === "glass" ? 0.7 : 1;
  const sunShare = finish === "glass" ? 0.45 : 1;
  const light = (k: 0 | 1 | 2) =>
    (BOUNCE[k] + (SKY[k] - BOUNCE[k]) * up) * sky * ao +
    SUN_COLOR[k] * direct * sunShare;
  out.setRGB(base.r * light(0), base.g * light(1), base.b * light(2));
  if (finish === "glass") {
    // a dark pane mirrors the sky above it and the bright horizon in front
    const mirror = (0.16 + 0.38 * Math.max(0, n.y)) * ao + 0.25 * direct;
    out.r += SKY_REFLECTION[0] * mirror;
    out.g += SKY_REFLECTION[1] * mirror;
    out.b += SKY_REFLECTION[2] * mirror;
  } else if (finish === "gloss") {
    const sheen = 0.07 * up * up * ao + 0.1 * direct * direct;
    out.r += SKY_REFLECTION[0] * sheen;
    out.g += SKY_REFLECTION[1] * sheen;
    out.b += SKY_REFLECTION[2] * sheen;
  }
  return out;
};

/** the light on bare ground with normal `n`, sun and shadow aside */
export const groundLight = (out: THREE.Color, n: THREE.Vector3): THREE.Color => {
  const up = 0.5 + 0.5 * n.y;
  const direct = Math.max(0, n.dot(SUN));
  return out.setRGB(
    BOUNCE[0] + (SKY[0] - BOUNCE[0]) * up + SUN_COLOR[0] * direct,
    BOUNCE[1] + (SKY[1] - BOUNCE[1]) * up + SUN_COLOR[1] * direct,
    BOUNCE[2] + (SKY[2] - BOUNCE[2]) * up + SUN_COLOR[2] * direct
  );
};

/**
 * What a shadow leaves of the light on level ground, per channel, as an
 * sRGB factor for multiplying a painted texture: only the sky remains, so
 * shadows come out cool.
 */
export const GROUND_SHADOW_TINT: Rgb = (() => {
  const factor = (k: 0 | 1 | 2) =>
    (SKY[k] / (SKY[k] + SUN_COLOR[k] * SUN.y)) ** (1 / 2.2);
  return [factor(0), factor(1), factor(2)];
})();
