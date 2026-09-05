import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { CarShape } from "./track";

/**
 * A low-poly GTW 15 for the three.js renderer, built from boxes.
 *
 * What the photos show and what is modelled: a sky-blue body with rounded
 * edges, separate side windows between pillars, double doors with a groove
 * at each leaf, a red stripe beside the cab, a wrap-around windscreen with
 * the number plate and the red light strip under it, a front bottom that is
 * set back under the windscreen, light grey ribbed bellows between the
 * sections, and on top of each driving section two Laufwerke on the rail:
 * a frame with the motors on the outer side and a plate hanging the car from
 * the outside of the rail beam.
 *
 * Every section's details are merged into one vertex-coloured geometry, so a
 * car costs about a dozen draw calls rather than a hundred.
 *
 * Coordinates inside a piece: x along the car (+x is the direction of
 * travel), y up with the rail top at 0, z across with +z to the right.
 */

export type CarPiece = {
  group: THREE.Group;
  /** metres from the car's centre along the track */
  offset: number;
};

export type CarModelOptions = {
  shape: CarShape;
  bodyColor: string;
  bellowsColor: string;
  /** +1 or -1: on which side of the rail the hanger plate and motors sit */
  outerSign: number;
  /** collects geometries and materials for disposal */
  keep: <T extends THREE.BufferGeometry | THREE.Material>(resource: T) => T;
};

/** body height, and how far the roof hangs under the rail top */
export const CAR_HEIGHT = 2.7;
export const ROOF_BELOW_RAIL = 1.4;
/** the cab's front bottom is set back this far under the windscreen */
const CAB_SETBACK = 0.5;
/** height of the set-back part before the front turns vertical */
const CAB_SLANT_HEIGHT = 1.15;
/** rounding of the body edges */
const BODY_BEVEL = 0.22;
/** the two Laufwerke of a driving section sit this far apart */
const BOGIE_PIVOT_METERS = 7.645;

/** window sill and lintel, metres above the floor */
const WINDOW_BOTTOM = 0.95;
const WINDOW_TOP = 2.3;
const WINDOW_METERS = 1.45;
const PILLAR_METERS = 0.2;
const DOOR_METERS = 1.4;
/** protrusion of a pane or groove out of the body side */
const SKIN = 0.05;

const GLASS = new THREE.Color("#141c24");
const GROOVE = new THREE.Color("#2c3640");
const RED = new THREE.Color("#d0202a");
const WHITE = new THREE.Color("#f2f2f2");
const ORANGE = new THREE.Color("#ff9a2e");
const RIB = new THREE.Color("#6f787e");
const BOGIE = new THREE.Color("#3b4045");
const MOTOR = new THREE.Color("#7a8187");

/** a box with every vertex in one colour, placed by its centre and optionally turned about z */
const coloredBox = (
  size: [number, number, number],
  at: [number, number, number],
  color: THREE.Color,
  rotationZ = 0
): THREE.BufferGeometry => {
  const geometry = new THREE.BoxGeometry(...size);
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (rotationZ !== 0) geometry.rotateZ(rotationZ);
  geometry.translate(...at);
  return geometry;
};

/**
 * The body as its side profile extruded to the width. A cab end has its
 * chin cut: under the windscreen the front is set back, so the nose leans
 * forward. `cab` lists the cab ends (+1 front, -1 back). The bevel rounds
 * the edges and grows the shape, so the profile is drawn that much smaller.
 */
const bodyGeometry = (
  length: number,
  width: number,
  cab: readonly number[]
): THREE.ExtrudeGeometry => {
  const half = length / 2 - BODY_BEVEL;
  const top = CAR_HEIGHT / 2 - BODY_BEVEL;
  const bottom = -CAR_HEIGHT / 2 + BODY_BEVEL;
  const end = (sign: number): [number, number][] =>
    cab.includes(sign)
      ? [
          [sign * half, top],
          [sign * half, bottom + CAB_SLANT_HEIGHT],
          [sign * (half - CAB_SETBACK), bottom],
        ]
      : [
          [sign * half, top],
          [sign * half, bottom],
        ];
  const outline = [...end(1), ...[...end(-1)].reverse()];
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (const [x, y] of outline.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const depth = width - 2 * BODY_BEVEL;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: BODY_BEVEL,
    bevelSize: BODY_BEVEL,
    bevelSegments: 3,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
};

type SideItem =
  | { kind: "window"; from: number; to: number }
  | { kind: "door"; from: number; to: number }
  | { kind: "stripe"; at: number };

/**
 * What sits along one side of a section, as spans in metres from the
 * section's centre. A driving section, cab at +x: the cab's own side window,
 * the red stripe, a double door, windows between pillars, and a double door
 * before the bellows. The middle module carries one door pair.
 */
const sideLayout = (length: number, cab: number): SideItem[] => {
  const half = length / 2;
  if (cab === 0) {
    return [{ kind: "door", from: -DOOR_METERS / 2, to: DOOR_METERS / 2 }];
  }
  const items: SideItem[] = [
    { kind: "window", from: half - 0.8, to: half - 0.3 },
    { kind: "stripe", at: half - 0.9 },
    { kind: "door", from: half - 1.0 - DOOR_METERS, to: half - 1.0 },
    { kind: "door", from: -half + 0.4, to: -half + 0.4 + DOOR_METERS },
  ];
  // windows fill the stretch between the two doors, centred
  const start = half - 1.0 - DOOR_METERS - PILLAR_METERS;
  const stop = -half + 0.4 + DOOR_METERS + PILLAR_METERS;
  const room = start - stop;
  const count = Math.max(0, Math.floor((room + PILLAR_METERS) / (WINDOW_METERS + PILLAR_METERS)));
  const used = count * WINDOW_METERS + (count - 1) * PILLAR_METERS;
  let cursor = start - (room - used) / 2;
  for (let i = 0; i < count; i++) {
    items.push({ kind: "window", from: cursor - WINDOW_METERS, to: cursor });
    cursor -= WINDOW_METERS + PILLAR_METERS;
  }
  // the cab at -x is the same layout mirrored
  return cab > 0
    ? items
    : items.map((item) =>
        item.kind === "stripe"
          ? { kind: "stripe", at: -item.at }
          : { ...item, from: -item.to, to: -item.from }
      );
};

/** the detail boxes of one section, both sides and the cab front */
const sectionDetails = (
  length: number,
  width: number,
  cab: readonly number[],
  bodyCenterY: number
): THREE.BufferGeometry[] => {
  const floor = bodyCenterY - CAR_HEIGHT / 2;
  const roof = bodyCenterY + CAR_HEIGHT / 2;
  const windowY = floor + (WINDOW_BOTTOM + WINDOW_TOP) / 2;
  const windowHeight = WINDOW_TOP - WINDOW_BOTTOM;
  const parts: THREE.BufferGeometry[] = [];
  const cabSign = cab[0] ?? 0;

  for (const side of [-1, 1]) {
    const z = side * (width / 2 - SKIN / 2 + 0.02);
    for (const item of sideLayout(length, cabSign)) {
      if (item.kind === "stripe") {
        parts.push(
          coloredBox([0.1, CAR_HEIGHT - 0.5, SKIN], [item.at, bodyCenterY, z], RED)
        );
        continue;
      }
      const span = item.to - item.from;
      const middle = (item.from + item.to) / 2;
      if (item.kind === "window") {
        parts.push(coloredBox([span, windowHeight, SKIN], [middle, windowY, z], GLASS));
        continue;
      }
      // a door pair: a pane per leaf, a groove at the edges and between the leaves
      const leaf = (span - 0.04) / 2;
      for (const sign of [-1, 1]) {
        parts.push(
          coloredBox(
            [leaf - 0.16, windowHeight - 0.1, SKIN],
            [middle + (sign * (leaf + 0.04)) / 2, windowY, z],
            GLASS
          )
        );
      }
      for (const at of [item.from, middle, item.to]) {
        parts.push(
          coloredBox([0.03, CAR_HEIGHT - 0.4, SKIN], [at, bodyCenterY + 0.05, z], GROOVE)
        );
      }
    }
  }

  for (const sign of cab) {
    const face = sign * (length / 2);
    // the windscreen fills the vertical part of the front above the chin,
    // and wraps around the corners
    const screenBottom = floor + CAB_SLANT_HEIGHT + 0.05;
    const screenTop = roof - 0.2;
    parts.push(
      coloredBox(
        [SKIN + 0.04, screenTop - screenBottom, width - 0.3],
        [face, (screenTop + screenBottom) / 2, 0],
        GLASS
      )
    );
    parts.push(
      coloredBox(
        [0.5, 0.14, width - 0.9],
        [face - sign * 0.02, screenTop - 0.2, 0],
        ORANGE
      )
    );
    // the chin leans back; the plate and the light strip sit on it
    const slant = Math.atan2(CAB_SETBACK, CAB_SLANT_HEIGHT) * sign;
    const onChin = (y: number): number =>
      face - sign * CAB_SETBACK * ((floor + CAB_SLANT_HEIGHT - y) / CAB_SLANT_HEIGHT);
    parts.push(
      coloredBox([SKIN, 0.32, 0.95], [onChin(floor + 0.75), floor + 0.75, sign * 0.15], WHITE, slant)
    );
    parts.push(
      coloredBox([SKIN, 0.06, 0.7], [onChin(floor + 0.35), floor + 0.35, 0], RED, slant)
    );
  }
  return parts;
};

/** ribs across a bellows box */
const bellowsRibs = (
  length: number,
  width: number,
  bodyCenterY: number
): THREE.BufferGeometry[] => {
  const parts: THREE.BufferGeometry[] = [];
  const count = Math.max(2, Math.round(length / 0.18));
  for (let i = 0; i < count; i++) {
    const x = -length / 2 + ((i + 0.5) * length) / count;
    parts.push(
      coloredBox([0.04, CAR_HEIGHT - 0.5, width - 0.2 + SKIN], [x, bodyCenterY, 0], RIB)
    );
  }
  return parts;
};

/**
 * A Laufwerk at `atX`: the frame on the rail, the motors on the outer side,
 * the plate hanging the car from outside the rail beam, and the foot on the
 * roof it bolts to.
 */
const bogie = (atX: number, roofY: number, outerSign: number): THREE.BufferGeometry[] => {
  const outer = outerSign * 0.62;
  const plateHeight = 0.25 - roofY;
  return [
    // the frame on the rail, the two drive units hanging on its outer side
    coloredBox([2.0, 0.6, 1.0], [atX, 0.35, 0], BOGIE),
    coloredBox([0.75, 0.75, 0.65], [atX - 0.55, 0.9, outerSign * 0.45], MOTOR),
    coloredBox([0.75, 0.75, 0.65], [atX + 0.55, 0.9, outerSign * 0.45], MOTOR),
    coloredBox([0.7, plateHeight, 0.16], [atX, roofY + plateHeight / 2, outer], BOGIE),
    coloredBox([0.7, 0.2, 0.75], [atX, 0.15, outerSign * 0.3], BOGIE),
    coloredBox([1.0, 0.1, 0.95], [atX, roofY + 0.05, 0], BOGIE),
  ];
};

/** the pieces of one car, each centred on its own offset along the track */
export const buildCar = ({
  shape,
  bodyColor,
  bellowsColor,
  outerSign,
  keep,
}: CarModelOptions): CarPiece[] => {
  const { lengthMeters, widthMeters, jointMeters } = shape;
  const shares = shape.sectionShares.length > 0 ? shape.sectionShares : [1];
  const jointCount = shares.length - 1;
  const bodyLength = Math.max(0, lengthMeters - jointCount * jointMeters);
  const shareSum = shares.reduce((sum, share) => sum + share, 0) || 1;

  const roofY = -ROOF_BELOW_RAIL;
  const bodyCenterY = roofY - CAR_HEIGHT / 2;

  const bodyMaterial = keep(new THREE.MeshLambertMaterial({ color: bodyColor }));
  const bellowsMaterial = keep(new THREE.MeshLambertMaterial({ color: bellowsColor }));
  const detailMaterial = keep(new THREE.MeshLambertMaterial({ vertexColors: true }));

  const merged = (parts: THREE.BufferGeometry[]): THREE.Mesh => {
    const geometry = keep(mergeGeometries(parts));
    for (const part of parts) part.dispose();
    return new THREE.Mesh(geometry, detailMaterial);
  };

  const pieces: CarPiece[] = [];
  let cursor = -lengthMeters / 2;
  shares.forEach((share, index) => {
    const length = (bodyLength * share) / shareSum;
    const cab = [
      ...(index === shares.length - 1 ? [1] : []),
      ...(index === 0 ? [-1] : []),
    ];
    const group = new THREE.Group();
    const body = new THREE.Mesh(keep(bodyGeometry(length, widthMeters, cab)), bodyMaterial);
    body.position.y = bodyCenterY;
    group.add(body);

    const parts = sectionDetails(length, widthMeters, cab, bodyCenterY);
    if (cab.length > 0) {
      // two Laufwerke per driving section, the pivot distance apart
      const half = Math.min(BOGIE_PIVOT_METERS / 2, length / 2 - 1.1);
      parts.push(...bogie(-half, roofY, outerSign), ...bogie(half, roofY, outerSign));
    }
    group.add(merged(parts));
    pieces.push({ group, offset: cursor + length / 2 });
    cursor += length;

    if (index < jointCount) {
      const joint = new THREE.Group();
      const bellows = new THREE.Mesh(
        keep(new THREE.BoxGeometry(jointMeters + 0.15, CAR_HEIGHT - 0.45, widthMeters - 0.2)),
        bellowsMaterial
      );
      bellows.position.y = bodyCenterY;
      joint.add(bellows, merged(bellowsRibs(jointMeters, widthMeters, bodyCenterY)));
      pieces.push({ group: joint, offset: cursor + jointMeters / 2 });
      cursor += jointMeters;
    }
  });
  return pieces;
};
