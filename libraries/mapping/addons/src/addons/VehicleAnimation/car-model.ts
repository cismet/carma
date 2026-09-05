import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { CarShape } from "./track";

/**
 * A low-poly GTW 15 (Generation 15) for the three.js renderer, built from
 * boxes and a few prisms.
 *
 * What the photos show and what is modelled: a sky-blue body with rounded
 * edges whose cab front leans back over its whole height, so the windscreen
 * looks down on the track; one wrap-around cab glazing that runs from the
 * windscreen into a tall side window; under the windscreen a black band
 * with the blue number plate and the light strip; the red stripe behind the
 * cab; separate side windows between pillars; double doors on the platform
 * side only, which is the outer side of the ring (the turning loops at both
 * ends keep that side at the platforms); light grey ribbed bellows between
 * the sections;
 * and on top of each driving section two Laufwerke on the rail: a frame with
 * the rust-brown drive units on the outer side and a plate hanging the car
 * from the outside of the rail beam.
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
  /** +1 or -1: the ring's outer side, where the hanger plate, the motors and the doors are */
  outerSign: number;
  /** collects geometries and materials for disposal */
  keep: <T extends THREE.BufferGeometry | THREE.Material>(resource: T) => T;
};

/** body height, and how far the roof hangs under the rail top */
export const CAR_HEIGHT = 2.7;
export const ROOF_BELOW_RAIL = 1.4;
/** the cab front leans back: its floor edge sits this far behind its roof edge */
const CAB_SETBACK = 0.5;
/** rounding of the body edges */
const BODY_BEVEL = 0.22;
/** the two Laufwerke of a driving section sit this far apart */
const BOGIE_PIVOT_METERS = 7.645;

/** window sill and lintel, metres above the floor */
const WINDOW_BOTTOM = 0.95;
const WINDOW_TOP = 2.3;
/** the cab glazing shares the sill but reaches up to the roof edge */
const CAB_GLASS_TOP = 2.55;
/** how far the cab side glass reaches back from the nose */
const CAB_GLASS_METERS = 1.9;
/** the side glass stops this far short of the front edge, leaving the rounded corner */
const CAB_GLASS_CORNER = 0.18;
const PILLAR_METERS = 0.15;
const DOOR_METERS = 1.4;
const STRIPE_METERS = 0.18;
/** protrusion of a pane or groove out of the body side */
const SKIN = 0.05;

const GLASS = new THREE.Color("#141c24");
const GROOVE = new THREE.Color("#2c3640");
const RED = new THREE.Color("#d0202a");
const WHITE = new THREE.Color("#f2f2f2");
const ORANGE = new THREE.Color("#ff9a2e");
const RIB = new THREE.Color("#6f787e");
const BOGIE = new THREE.Color("#3b4045");
const MOTOR = new THREE.Color("#6e4f36");

/** gives every vertex of a geometry the same colour */
const paint = (geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry => {
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
};

/**
 * A box in one colour, placed by its centre and optionally turned about z.
 * Non-indexed like the prisms, so all details merge into one geometry.
 */
const coloredBox = (
  size: [number, number, number],
  at: [number, number, number],
  color: THREE.Color,
  rotationZ = 0
): THREE.BufferGeometry => {
  const geometry = paint(new THREE.BoxGeometry(...size).toNonIndexed(), color);
  if (rotationZ !== 0) geometry.rotateZ(rotationZ);
  geometry.translate(...at);
  return geometry;
};

/** a flat prism: an outline in the x/y plane, `thickness` deep, centred on `z` */
const coloredPrism = (
  outline: readonly [number, number][],
  thickness: number,
  z: number,
  color: THREE.Color
): THREE.BufferGeometry => {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (const [x, y] of outline.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, z - thickness / 2);
  return paint(geometry, color);
};

/**
 * The side profile is drawn a bevel smaller and the bevel grows it back. The
 * cab front is a straight line from the roof edge down to the set-back floor
 * edge; this is its lean from the vertical.
 */
const FRONT_LEAN = Math.atan2(CAB_SETBACK, CAR_HEIGHT - 2 * BODY_BEVEL);

/**
 * Where the leaning cab front surface is at a height, as +x distance from
 * the section's centre; `y` is measured from the body's centre. The profile
 * line is offset outward by the bevel along its normal.
 */
const frontFaceX = (length: number, y: number): number => {
  const half = length / 2 - BODY_BEVEL;
  const top = CAR_HEIGHT / 2 - BODY_BEVEL;
  const bottom = -CAR_HEIGHT / 2 + BODY_BEVEL;
  const onLine = y + BODY_BEVEL * Math.sin(FRONT_LEAN);
  return (
    half - (CAB_SETBACK * (top - onLine)) / (top - bottom) + BODY_BEVEL * Math.cos(FRONT_LEAN)
  );
};

/**
 * The body as its side profile extruded to the width. A cab end leans back
 * over its whole height, from the roof edge to the floor edge. `cab` lists
 * the cab ends (+1 front, -1 back). The bevel rounds the edges and grows the
 * shape, so the profile is drawn that much smaller.
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

/** windows with pillars between them, filling the stretch from `start` back to `stop` */
const windowBand = (start: number, stop: number): SideItem[] => {
  const room = start - stop;
  const count = Math.max(1, Math.round(room / 1.5));
  const meters = (room - (count - 1) * PILLAR_METERS) / count;
  const items: SideItem[] = [];
  for (let i = 0; i < count; i++) {
    const to = start - i * (meters + PILLAR_METERS);
    items.push({ kind: "window", from: to - meters, to });
  }
  return items;
};

/**
 * What sits along one side of a section behind the cab glass, as spans in
 * metres from the section's centre, for a cab at +x. The platform side has
 * the doors: the red stripe, a window, a double door, windows, and a double
 * door right before the bellows. The other side has no doors: a wide pillar
 * behind the cab, a window, the stripe, then a band of windows. The middle
 * module carries one window per side.
 */
const sideLayout = (length: number, cab: number, doorSide: boolean): SideItem[] => {
  const half = length / 2;
  if (cab === 0) return [{ kind: "window", from: -0.55, to: 0.55 }];
  const rear = -half + 0.35;
  const behindCab = half - CAB_GLASS_METERS;
  let items: SideItem[];
  if (doorSide) {
    const stripeAt = behindCab - PILLAR_METERS - STRIPE_METERS / 2;
    const windowTo = stripeAt - STRIPE_METERS / 2 - PILLAR_METERS;
    const doorTo = windowTo - 1.25 - PILLAR_METERS;
    items = [
      { kind: "stripe", at: stripeAt },
      { kind: "window", from: windowTo - 1.25, to: windowTo },
      { kind: "door", from: doorTo - DOOR_METERS, to: doorTo },
      { kind: "door", from: rear, to: rear + DOOR_METERS },
      ...windowBand(doorTo - DOOR_METERS - PILLAR_METERS, rear + DOOR_METERS + PILLAR_METERS),
    ];
  } else {
    const windowTo = behindCab - 0.9;
    const stripeAt = windowTo - 1.15 - PILLAR_METERS - STRIPE_METERS / 2;
    items = [
      { kind: "window", from: windowTo - 1.15, to: windowTo },
      { kind: "stripe", at: stripeAt },
      ...windowBand(stripeAt - STRIPE_METERS / 2 - PILLAR_METERS, rear),
    ];
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

/**
 * The cab's side glass: from the sill up to the roof edge, from behind the
 * cab forward to the rounded corner, its front edge following the lean of
 * the front.
 */
const cabSideGlass = (
  sign: number,
  length: number,
  z: number,
  bodyCenterY: number
): THREE.BufferGeometry => {
  const floor = bodyCenterY - CAR_HEIGHT / 2;
  const sill = floor + WINDOW_BOTTOM;
  const top = floor + CAB_GLASS_TOP;
  const rear = sign * (length / 2 - CAB_GLASS_METERS);
  const front = (y: number): number =>
    sign * (frontFaceX(length, y - bodyCenterY) - CAB_GLASS_CORNER);
  return coloredPrism(
    [
      [rear, sill],
      [front(sill), sill],
      [front(top), top],
      [rear, top],
    ],
    SKIN,
    z,
    GLASS
  );
};

/**
 * What sits on the leaning cab front: the windscreen with the destination
 * display at its top, the black band under it carrying the number plate in
 * body colour on the left and the light strip, white ahead and red astern.
 */
const cabFront = (
  sign: number,
  length: number,
  width: number,
  bodyCenterY: number,
  bodyColor: THREE.Color
): THREE.BufferGeometry[] => {
  const floor = bodyCenterY - CAR_HEIGHT / 2;
  const lean = -sign * FRONT_LEAN;
  const stretch = 1 / Math.cos(FRONT_LEAN);
  // a box lying on the front surface, centred on the surface at height `y` above the floor
  const onFront = (
    size: [number, number, number],
    y: number,
    z: number,
    color: THREE.Color
  ): THREE.BufferGeometry =>
    coloredBox(
      [size[0], size[1] * stretch, size[2]],
      [sign * frontFaceX(length, floor + y - bodyCenterY), floor + y, z],
      color,
      lean
    );
  const screenBottom = 0.85;
  const screenTop = CAB_GLASS_TOP + 0.03;
  return [
    onFront([SKIN + 0.02, screenTop - screenBottom, width - 0.3], (screenTop + screenBottom) / 2, 0, GLASS),
    onFront([SKIN + 0.05, 0.13, 0.55], screenTop - 0.16, 0, ORANGE),
    onFront([SKIN, screenBottom - 0.12, width - 0.45], (screenBottom + 0.12) / 2, 0, GLASS),
    onFront([SKIN + 0.03, 0.34, 1.1], 0.6, -sign * 0.4, bodyColor),
    onFront([SKIN + 0.04, 0.05, 0.6], 0.26, -sign * 0.2, sign > 0 ? WHITE : RED),
  ];
};

/** the detail boxes of one section, both sides and the cab front; the doors are on `doorSign` */
const sectionDetails = (
  length: number,
  width: number,
  cab: readonly number[],
  bodyCenterY: number,
  bodyColor: THREE.Color,
  doorSign: number
): THREE.BufferGeometry[] => {
  const floor = bodyCenterY - CAR_HEIGHT / 2;
  const windowY = floor + (WINDOW_BOTTOM + WINDOW_TOP) / 2;
  const windowHeight = WINDOW_TOP - WINDOW_BOTTOM;
  const stripeBottom = WINDOW_BOTTOM - 0.1;
  const parts: THREE.BufferGeometry[] = [];
  const cabSign = cab[0] ?? 0;

  for (const side of [-1, 1]) {
    const z = side * (width / 2 - SKIN / 2 + 0.02);
    for (const item of sideLayout(length, cabSign, side === doorSign)) {
      if (item.kind === "stripe") {
        parts.push(
          coloredBox(
            [STRIPE_METERS, CAB_GLASS_TOP - stripeBottom, SKIN],
            [item.at, floor + (CAB_GLASS_TOP + stripeBottom) / 2, z],
            RED
          )
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
    for (const sign of cab) parts.push(cabSideGlass(sign, length, z, bodyCenterY));
  }

  for (const sign of cab) parts.push(...cabFront(sign, length, width, bodyCenterY, bodyColor));
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
  const plateColor = new THREE.Color(bodyColor);

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

    const parts = sectionDetails(length, widthMeters, cab, bodyCenterY, plateColor, outerSign);
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
