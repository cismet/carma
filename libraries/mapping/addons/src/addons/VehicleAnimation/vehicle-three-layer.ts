import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from "maplibre-gl";
import * as THREE from "three";

import { add3dPresence, remove3dPresence } from "@carma-mapping/engines/maplibre";

import { createFleet, type VehicleMode, type VehicleSchedule } from "./fleet";
import {
  structureSegments,
  type Segment3,
  type StructureAsset,
} from "./geruest";
import { poseAt, type CarShape, type Track } from "./track";
import type { VehicleLayerHandle } from "./vehicle-layer";

/**
 * The fleet in three dimensions: the structure as instanced box members, the
 * vehicles as low-poly bodies hanging under the rail, all in one MapLibre
 * custom layer.
 *
 * The scene lives in a local metre frame around the structure's origin, three
 * X east, Y up, Z south, and is projected with MapLibre's own matrix every
 * frame, the same way the engine's tree and building layers do it. Heights
 * are the model's: with terrain on they are absolute, without it the ground
 * under the track (read off the supports' feet) is subtracted so the girder
 * stands its real height over a flat map.
 *
 * The layer registers itself as a 3D layer on the map, which is what lets
 * the host unlock the camera tilt and offer terrain while it is on.
 */

export type VehicleThreeLayerOptions = {
  map: MapLibreMap;
  track: Track;
  shape: CarShape;
  speedKmh: number;
  mode: VehicleMode;
  schedule: VehicleSchedule | null;
  bodyColor: string;
  jointColor: string;
  opacity: number;
  /** the girders, bracing and supports; without one only the vehicles show */
  structure: StructureAsset | null;
  beforeId?: string;
  id?: string;
  onFleetSize?: (count: number) => void;
};

const DEFAULT_ID = "vehicle-animation-3d";
const METERS_PER_LAT = 111320;
/** a tab that was in the background hands back a huge delta; ignore it */
const MAX_FRAME_SECONDS = 0.25;

/** the painted steel of the Gerüst, and the rust of the bare rail on top */
const STEEL_COLOR = new THREE.Color("#7fa48b");
const RAIL_COLOR = new THREE.Color("#8a5a3c");
const WINDOW_COLOR = new THREE.Color("#1f2a33");
const BOGIE_COLOR = new THREE.Color("#4a4f55");

/** member thickness in metres: the girder chords, the bracing, the support bars */
const GIRDER_THICKNESS = 0.25;
const RAIL_THICKNESS = 0.35;
const BRACING_THICKNESS = 0.15;
const SUPPORT_THICKNESS = 0.3;

/**
 * The GTW 15 body: 2.7 m tall, roof 0.8 m under the rail (rail top to floor
 * is 3.5 m). The rail is the girder's bottom chord, the rust beam the bogies
 * run on; the lattice stands above it.
 */
const CAR_HEIGHT = 2.7;
const ROOF_BELOW_RAIL = 0.8;
/** the cab's front bottom is set back this far: the nose leans forward */
const CAB_SETBACK = 0.55;
/** how high the set-back part reaches before the front turns vertical */
const CAB_SLANT_HEIGHT = 1.2;
/** rounding of the body edges */
const BODY_BEVEL = 0.12;
/** the two bogies of an end section sit this far apart along the car */
const BOGIE_PIVOT_METERS = 7.645;
/** how far a member may be from the track and still take its ground from it */
const GROUND_SEARCH_METERS = 120;
/** without supports, the rail is assumed this high over the flat map */
const FALLBACK_RAIL_HEIGHT = 12;

type LocalFrame = {
  origin: [number, number];
  metersPerLon: number;
};

/** lon/lat to metres east and north of the frame's origin */
const toLocal = (frame: LocalFrame, lon: number, lat: number): [number, number] => [
  (lon - frame.origin[0]) * frame.metersPerLon,
  (lat - frame.origin[1]) * METERS_PER_LAT,
];

/** a coarse grid over points in the local frame, for nearest lookups */
class PointGrid<T> {
  private readonly cells = new Map<string, { x: number; y: number; value: T }[]>();

  constructor(private readonly cellSize: number) {}

  add(x: number, y: number, value: T): void {
    const key = this.keyOf(x, y);
    const cell = this.cells.get(key);
    if (cell) cell.push({ x, y, value });
    else this.cells.set(key, [{ x, y, value }]);
  }

  /** the nearest entry within `radius`, or null */
  nearest(x: number, y: number, radius: number): T | null {
    const reach = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    let best: T | null = null;
    let bestDistance = radius;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dy = -reach; dy <= reach; dy++) {
        for (const entry of this.cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          const d = Math.hypot(entry.x - x, entry.y - y);
          if (d < bestDistance) {
            bestDistance = d;
            best = entry.value;
          }
        }
      }
    }
    return best;
  }

  private keyOf(x: number, y: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }
}

/**
 * The ground under the track, one value per track vertex.
 *
 * The model's heights are absolute, and a flat map has no ground to be
 * absolute against, so something has to say how high the rail is over it.
 * The supports do: their feet stand on the ground. Every vertex takes the
 * base of the nearest support, and stretches between supports interpolate
 * along the track.
 */
const groundProfile = (
  track: Track,
  frame: LocalFrame,
  structure: StructureAsset | null
): number[] => {
  const known: (number | null)[] = track.points.map(() => null);
  if (structure) {
    const supports = new PointGrid<number>(50);
    for (const [x, y, zBase] of structure.supports) supports.add(x, y, zBase);
    track.points.forEach((point, index) => {
      const [x, y] = toLocal(frame, point[0], point[1]);
      known[index] = supports.nearest(x, y, 60);
    });
  }
  if (known.every((value) => value === null)) {
    return track.points.map((point) => (point[2] ?? 0) - FALLBACK_RAIL_HEIGHT);
  }
  // fill the gaps: interpolate between neighbours that know their ground,
  // and hold the nearest one at either end
  const ground = known.map((value) => value ?? Number.NaN);
  let previous = -1;
  for (let index = 0; index < ground.length; index++) {
    if (Number.isNaN(ground[index])) continue;
    if (previous === -1) {
      for (let fill = 0; fill < index; fill++) ground[fill] = ground[index];
    } else {
      for (let fill = previous + 1; fill < index; fill++) {
        const t = (fill - previous) / (index - previous);
        ground[fill] = ground[previous] + (ground[index] - ground[previous]) * t;
      }
    }
    previous = index;
  }
  for (let fill = previous + 1; fill < ground.length; fill++) {
    ground[fill] = ground[previous];
  }
  return ground;
};

/** index of the segment containing `distance`, by binary search */
const segmentAt = (cumulative: number[], distance: number): number => {
  let low = 0;
  let high = cumulative.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] <= distance) low = middle;
    else high = middle;
  }
  return low;
};

/** whether the ring runs counter-clockwise, by its signed area */
const isCounterClockwise = (track: Track, frame: LocalFrame): boolean => {
  let area = 0;
  for (let index = 1; index < track.points.length; index++) {
    const [ax, ay] = toLocal(frame, track.points[index - 1][0], track.points[index - 1][1]);
    const [bx, by] = toLocal(frame, track.points[index][0], track.points[index][1]);
    area += ax * by - bx * ay;
  }
  return area > 0;
};

const UNIT_X = new THREE.Vector3(1, 0, 0);

/**
 * Straight members as one instanced box: every segment becomes a unit cube
 * stretched to its length, turned to its direction and set on its midpoint.
 * `heightOf` turns the model's absolute z into a scene height.
 */
const buildMembers = (
  segments: Segment3[],
  thickness: number,
  material: THREE.Material,
  heightOf: (x: number, y: number, z: number) => number,
  colorOf?: (segment: Segment3) => THREE.Color
): THREE.InstancedMesh => {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material,
    segments.length
  );
  const position = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  segments.forEach((segment, index) => {
    const [x1, y1, z1, x2, y2, z2] = segment;
    const h1 = heightOf(x1, y1, z1);
    const h2 = heightOf(x2, y2, z2);
    // local (east, north, up) to three (east, up, south)
    direction.set(x2 - x1, h2 - h1, -(y2 - y1));
    const length = direction.length();
    if (length > 0) direction.divideScalar(length);
    quaternion.setFromUnitVectors(UNIT_X, direction);
    position.set((x1 + x2) / 2, (h1 + h2) / 2, -(y1 + y2) / 2);
    scale.set(Math.max(length, thickness), thickness, thickness);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    if (colorOf) mesh.setColorAt(index, colorOf(segment));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
};

/** one movable piece of a vehicle and where it sits along the car */
type CarPiece = { group: THREE.Group; offset: number };

export const createVehicleThreeLayer = (
  options: VehicleThreeLayerOptions
): VehicleLayerHandle => {
  const {
    map,
    track,
    shape,
    mode,
    schedule,
    structure,
    beforeId,
    id = DEFAULT_ID,
    onFleetSize,
  } = options;

  let opacity = options.opacity;
  let paused = false;
  let destroyed = false;
  let lastTimestamp: number | null = null;

  const fleet = createFleet({
    track,
    mode,
    schedule,
    speedKmh: options.speedKmh,
  });

  const frame: LocalFrame = structure
    ? { origin: structure.origin, metersPerLon: structure.metersPerLon }
    : {
        origin: [track.points[0][0], track.points[0][1]],
        metersPerLon: track.metersPerLon,
      };
  const originMercator = MercatorCoordinate.fromLngLat(
    { lng: frame.origin[0], lat: frame.origin[1] },
    0
  );
  const meterScale = originMercator.meterInMercatorCoordinateUnits();

  /** the vehicles hang on the outer rail; the inner side has the bracing */
  const outerSign = isCounterClockwise(track, frame) ? 1 : -1;

  const ground = groundProfile(track, frame, structure);
  const trackVertices = new PointGrid<number>(100);
  track.points.forEach((point, index) => {
    const [x, y] = toLocal(frame, point[0], point[1]);
    trackVertices.add(x, y, index);
  });

  const members = structure ? structureSegments(structure) : null;

  let hasTerrain = map.getTerrain() !== null && map.getTerrain() !== undefined;

  /** ground under a point in the local frame, from the nearest track vertex */
  const groundNear = (x: number, y: number): number => {
    const index = trackVertices.nearest(x, y, GROUND_SEARCH_METERS);
    return ground[index ?? 0] ?? 0;
  };
  /** the model's absolute z as a scene height */
  const heightOf = (x: number, y: number, z: number): number =>
    hasTerrain ? z : z - groundNear(x, y);
  /** ground under the track at `distance`, interpolated */
  const groundAt = (distance: number): number => {
    const index = segmentAt(track.cumulative, distance);
    const span = track.cumulative[index + 1] - track.cumulative[index];
    const t = span > 0 ? (distance - track.cumulative[index]) / span : 0;
    const from = ground[index];
    const to = ground[index + 1] ?? from;
    return from + (to - from) * t;
  };

  /* ---------------------------------------------------------------- *
   *  Scene
   * ---------------------------------------------------------------- */

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.1);
  sun.position.set(100, 300, 150);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.35);
  fill.position.set(-80, 100, -60);
  scene.add(fill);

  const materials: THREE.Material[] = [];
  const material = (color: THREE.Color | string): THREE.MeshLambertMaterial => {
    const created = new THREE.MeshLambertMaterial({ color });
    materials.push(created);
    return created;
  };

  const structureGroup = new THREE.Group();
  scene.add(structureGroup);

  const buildStructure = (): void => {
    structureGroup.clear();
    if (!members) return;
    const steel = material(STEEL_COLOR);
    // the rail is the bottom chord: the ring runs along it
    const isRail = ([x1, y1, z1, x2, y2, z2]: Segment3): boolean => {
      if (Math.abs(z2 - z1) > 0.05) return false;
      const index = trackVertices.nearest((x1 + x2) / 2, (y1 + y2) / 2, 30);
      if (index === null) return false;
      const bottom = track.points[index][2] ?? 0;
      return Math.abs((z1 + z2) / 2 - bottom) < 0.3;
    };
    structureGroup.add(
      buildMembers(
        members.girder,
        GIRDER_THICKNESS,
        steel,
        heightOf,
        (segment) => (isRail(segment) ? RAIL_COLOR : STEEL_COLOR)
      ),
      buildMembers(members.bracing, BRACING_THICKNESS, steel, heightOf),
      buildMembers(members.supports, SUPPORT_THICKNESS, steel, heightOf)
    );
    // the rail once more, thicker, so it reads as the bar the vehicles run on
    const rails = members.girder.filter(isRail);
    structureGroup.add(
      buildMembers(rails, RAIL_THICKNESS, material(RAIL_COLOR), heightOf)
    );
  };
  buildStructure();

  /* ---------------------------------------------------------------- *
   *  Vehicles
   * ---------------------------------------------------------------- */

  const bodyMaterial = material(options.bodyColor);
  const jointMaterial = material(options.jointColor);
  const windowMaterial = material(WINDOW_COLOR);
  const bogieMaterial = material(BOGIE_COLOR);
  const geometries: THREE.BufferGeometry[] = [];
  const keep = <G extends THREE.BufferGeometry>(geometry: G): G => {
    geometries.push(geometry);
    return geometry;
  };

  const { lengthMeters, widthMeters, jointMeters } = shape;
  const shares = shape.sectionShares.length > 0 ? shape.sectionShares : [1];
  const jointCount = shares.length - 1;
  const bodyLength = Math.max(0, lengthMeters - jointCount * jointMeters);
  const shareSum = shares.reduce((sum, share) => sum + share, 0) || 1;

  /** the rail is the ring's own height; the roof hangs under it */
  const railTopY = 0;
  const roofY = -ROOF_BELOW_RAIL;
  const bodyCenterY = roofY - CAR_HEIGHT / 2;

  const bogieGeometry = keep(new THREE.BoxGeometry(1.4, 0.7, 0.8));
  const armHeight = railTopY + 0.3 - roofY;
  const armGeometry = keep(new THREE.BoxGeometry(0.3, armHeight, 0.3));
  const linkGeometry = keep(new THREE.BoxGeometry(0.3, 0.25, 0.9));

  /** a hanger: the arm up the outside of the rail beam, the link over it, the bogie on the rail */
  const hanger = (atX: number): THREE.Group => {
    const group = new THREE.Group();
    const arm = new THREE.Mesh(armGeometry, bogieMaterial);
    arm.position.set(atX, roofY + armHeight / 2, outerSign * 0.65);
    const link = new THREE.Mesh(linkGeometry, bogieMaterial);
    link.position.set(atX, railTopY + 0.3, outerSign * 0.33);
    const bogie = new THREE.Mesh(bogieGeometry, bogieMaterial);
    bogie.position.set(atX, railTopY + 0.5, 0);
    group.add(arm, link, bogie);
    return group;
  };

  /**
   * A body section as its side profile, extruded to the car's width. A cab
   * end is not a plain box: under the windscreen the front is set back, so
   * the nose leans forward. `cab` says which ends are cabs (+1 front, -1
   * back, 0 none). The bevel rounds the edges and grows the shape, so the
   * profile is drawn that much smaller.
   */
  const bodyGeometry = (length: number, cab: readonly number[]): THREE.ExtrudeGeometry => {
    const half = length / 2 - BODY_BEVEL;
    const top = CAR_HEIGHT / 2 - BODY_BEVEL;
    const bottom = -CAR_HEIGHT / 2 + BODY_BEVEL;
    const shape = new THREE.Shape();
    // clockwise from the top-left corner; a cab end gets its chin cut
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
    const outline: [number, number][] = [
      ...end(1),
      ...[...end(-1)].reverse(),
    ];
    shape.moveTo(outline[0][0], outline[0][1]);
    for (const [x, y] of outline.slice(1)) shape.lineTo(x, y);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: widthMeters - 2 * BODY_BEVEL,
      bevelEnabled: true,
      bevelThickness: BODY_BEVEL,
      bevelSize: BODY_BEVEL,
      bevelSegments: 2,
    });
    geometry.translate(0, 0, -(widthMeters - 2 * BODY_BEVEL) / 2);
    return geometry;
  };

  const buildSection = (length: number, cabAtFront: boolean, cabAtBack: boolean): THREE.Group => {
    const group = new THREE.Group();
    const cab = [...(cabAtFront ? [1] : []), ...(cabAtBack ? [-1] : [])];
    const body = new THREE.Mesh(keep(bodyGeometry(length, cab)), bodyMaterial);
    body.position.y = bodyCenterY;
    group.add(body);

    const band = new THREE.Mesh(
      keep(new THREE.BoxGeometry(Math.max(0.5, length - 0.6), 1.0, widthMeters + 0.04)),
      windowMaterial
    );
    band.position.y = bodyCenterY + 0.5;
    group.add(band);

    for (const [isCab, sign] of [
      [cabAtFront, 1],
      [cabAtBack, -1],
    ] as const) {
      if (!isCab) continue;
      // the windscreen sits on the vertical part above the chin
      const glass = new THREE.Mesh(
        keep(new THREE.BoxGeometry(0.08, 1.1, widthMeters - 0.4)),
        windowMaterial
      );
      glass.position.set(sign * (length / 2 - 0.02), bodyCenterY + 0.55, 0);
      group.add(glass);
    }
    return group;
  };

  const buildCar = (): CarPiece[] => {
    const pieces: CarPiece[] = [];
    let cursor = -lengthMeters / 2;
    shares.forEach((share, index) => {
      const length = (bodyLength * share) / shareSum;
      const isEnd = index === 0 || index === shares.length - 1;
      const group = buildSection(length, index === shares.length - 1, index === 0);
      if (isEnd) {
        // two bogies per driving section, the pivot distance apart
        const half = Math.min(BOGIE_PIVOT_METERS / 2, length / 2 - 0.9);
        group.add(hanger(-half), hanger(half));
      }
      pieces.push({ group, offset: cursor + length / 2 });
      cursor += length;
      if (index < jointCount) {
        const joint = new THREE.Group();
        const bellows = new THREE.Mesh(
          keep(new THREE.BoxGeometry(jointMeters + 0.2, CAR_HEIGHT - 0.3, widthMeters - 0.2)),
          jointMaterial
        );
        bellows.position.y = bodyCenterY;
        joint.add(bellows);
        pieces.push({ group: joint, offset: cursor + jointMeters / 2 });
        cursor += jointMeters;
      }
    });
    return pieces;
  };

  const cars: CarPiece[][] = fleet.cars.map(() => {
    const pieces = buildCar();
    for (const piece of pieces) scene.add(piece.group);
    return pieces;
  });

  const placeCars = (): void => {
    fleet.cars.forEach((car, carIndex) => {
      for (const { group, offset } of cars[carIndex]) {
        let distance = car.distance + offset * car.direction;
        if (track.closed) {
          distance = ((distance % track.length) + track.length) % track.length;
        }
        const pose = poseAt(track, distance);
        const [x, y] = toLocal(frame, pose.lon, pose.lat);
        const bottomChord = pose.height ?? 0;
        const height = hasTerrain ? bottomChord : bottomChord - groundAt(distance);
        group.position.set(x, height, -y);
        group.rotation.y = pose.heading;
        // a pingpong vehicle runs backwards on the way home; its cab does not
        group.scale.x = car.direction;
      }
    });
  };
  placeCars();

  scene.traverse((object) => {
    object.frustumCulled = false;
  });

  /* ---------------------------------------------------------------- *
   *  The MapLibre layer
   * ---------------------------------------------------------------- */

  const camera = new THREE.Camera();
  let renderer: THREE.WebGLRenderer | null = null;
  const rotationX = new THREE.Matrix4().makeRotationAxis(
    new THREE.Vector3(1, 0, 0),
    Math.PI / 2
  );

  const layer: CustomLayerInterface = {
    id,
    type: "custom",
    renderingMode: "3d",
    onAdd(_map, gl) {
      renderer?.dispose();
      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },
    render(gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
      if (destroyed || !renderer) return;

      const now = performance.now();
      const seconds =
        lastTimestamp === null
          ? 0
          : Math.min((now - lastTimestamp) / 1000, MAX_FRAME_SECONDS);
      lastTimestamp = now;
      if (!paused) {
        fleet.advance(seconds);
        placeCars();
      }

      const projection = new THREE.Matrix4().fromArray(
        args.defaultProjectionData.mainMatrix as unknown as number[]
      );
      const model = new THREE.Matrix4()
        .makeTranslation(originMercator.x, originMercator.y, originMercator.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX);
      camera.projectionMatrix = projection.multiply(model);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      // MapLibre's depth range must survive three's state reset, or the
      // symbol layers after this one test against the wrong depth space
      const savedDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      renderer.resetState();
      renderer.render(scene, camera);
      gl.depthRange(savedDepthRange[0], savedDepthRange[1]);

      if (!paused) map.triggerRepaint();
    },
  };

  const attach = (): void => {
    if (destroyed || !map.getStyle() || map.getLayer(id)) return;
    // before the layer goes on: the host reads the presence on the style
    // event that addLayer fires
    add3dPresence(map, id);
    const insertBefore = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
    map.addLayer(layer, insertBefore);
    map.triggerRepaint();
  };

  const detach = (): void => {
    remove3dPresence(map, id);
    if (map.getStyle() && map.getLayer(id)) map.removeLayer(id);
  };

  const applyOpacity = (): void => {
    for (const entry of materials) {
      entry.opacity = opacity;
      entry.transparent = opacity < 1;
      entry.needsUpdate = true;
    }
  };
  applyOpacity();

  // a basemap swap throws every layer away, so it has to go back on afterwards
  const onStyleData = (): void => attach();
  map.on("styledata", onStyleData);
  // terrain on or off changes what a height means; the members are rebuilt
  const onTerrain = (): void => {
    const next = map.getTerrain() !== null && map.getTerrain() !== undefined;
    if (next === hasTerrain) return;
    hasTerrain = next;
    buildStructure();
    placeCars();
    map.triggerRepaint();
  };
  map.on("terrain", onTerrain);

  attach();
  onFleetSize?.(fleet.size);

  return {
    setSpeed: fleet.setSpeed,
    setPaused: (next) => {
      if (paused === next) return;
      paused = next;
      lastTimestamp = null;
      if (!paused) map.triggerRepaint();
    },
    setOpacity: (next) => {
      opacity = Math.max(0, Math.min(1, next));
      applyOpacity();
      map.triggerRepaint();
    },
    getFleetSize: () => fleet.size,
    pickRandomCar: () => {
      const pose = fleet.pickRandom();
      return pose ? { lon: pose.lon, lat: pose.lat } : null;
    },
    destroy: () => {
      destroyed = true;
      map.off("styledata", onStyleData);
      map.off("terrain", onTerrain);
      detach();
      for (const geometry of geometries) geometry.dispose();
      for (const entry of materials) entry.dispose();
      structureGroup.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.geometry.dispose();
      });
      renderer?.dispose();
      renderer = null;
    },
  };
};
