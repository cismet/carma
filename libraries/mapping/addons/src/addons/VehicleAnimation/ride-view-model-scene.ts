import * as THREE from "three";

import { buildCar, CAR_HEIGHT, ROOF_BELOW_RAIL } from "./car-model";
import { RIDE_VIEWS, rideViewMarker, type RideView } from "./ride-views";
import type { CarShape } from "./track";

const DEGREES = Math.PI / 180;
/** the front towards the viewer's right, seen from a little above */
const INITIAL_YAW = -35 * DEGREES;
const INITIAL_TILT = 22 * DEGREES;
/** the ring stays an ellipse, so the camera points on it never line up */
const MIN_TILT = 10 * DEGREES;
const MAX_TILT = 50 * DEGREES;

/**
 * A real car is ten times as long as it is wide, a sliver at this size. Shorter
 * and stouter it reads as a train, like a toy of one.
 */
const TOY_LENGTH_SCALE = 0.62;
const TOY_SECTION_SCALE = 1.5;

const CAMERA_FOV = 28;
/** fits the ring and its cones into the round widget however the train is turned */
const CAMERA_DISTANCE = 62;
const RING_RADIUS = 11;
const RING_THICKNESS = 0.14;
const RING_OPACITY = 0.4;
/** the ring runs around the middle of the body, which is what the train turns about */
const BODY_CENTRE_Y = (-ROOF_BELOW_RAIL - CAR_HEIGHT / 2) * TOY_SECTION_SCALE;
const TURNING_POINT_Y = BODY_CENTRE_Y + 1;

const RAIL_COLOR = "#8a949a";
const RAIL_BEYOND_CAR_METERS = 5;
const RAIL_HEIGHT = 0.7;
const RAIL_WIDTH = 0.5;
const CONE_LENGTH = 5;
const CONE_RADIUS = 2.4;
const CONE_OPACITY = 0.6;
const CONE_SEGMENTS = { around: 24, along: 6 };
/** keeps a marker's button inside the widget, where it can be clicked */
const MARKER_MARGIN_PX = 14;
const MAX_PIXEL_RATIO = 2;

export type RideViewModelMarker = {
  view: RideView;
  /** CSS pixels from the widget's top left */
  x: number;
  y: number;
  /** towards the viewer is positive; a higher value draws on top */
  depth: number;
  /** on the far side of the train */
  behind: boolean;
};

export type RideViewModelScene = {
  setSize: (width: number, height: number) => void;
  setView: (view: RideView) => void;
  /** turn the train by radians about its upright axis, and tilt it */
  rotate: (yaw: number, tilt: number) => void;
  getMarkers: () => RideViewModelMarker[];
  dispose: () => void;
};

/** A cone from its apex at the origin along -y, fading out towards its open end. */
const fadingConeGeometry = (): THREE.BufferGeometry => {
  const geometry = new THREE.ConeGeometry(
    CONE_RADIUS,
    CONE_LENGTH,
    CONE_SEGMENTS.around,
    CONE_SEGMENTS.along,
    true
  );
  geometry.translate(0, -CONE_LENGTH / 2, 0);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i++) {
    colors.set([1, 1, 1, 1 + position.getY(i) / CONE_LENGTH], i * 4);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  return geometry;
};

/**
 * The little train that a ride's view switcher shows. It is drawn only when it
 * changes. Without WebGL the markers still work, there is just no train to see.
 */
export const createRideViewModelScene = ({
  canvas,
  shape,
  bodyColor,
  bellowsColor,
}: {
  canvas: HTMLCanvasElement;
  shape: CarShape;
  bodyColor: string;
  bellowsColor: string;
}): RideViewModelScene => {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const keep = <T extends THREE.BufferGeometry | THREE.Material>(
    resource: T
  ): T => {
    if (resource instanceof THREE.Material) materials.push(resource);
    else geometries.push(resource);
    return resource;
  };

  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setClearColor(0x000000, 0);
  } catch {
    renderer = null;
  }

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const sun = new THREE.DirectionalLight(0xfff4e0, 0.9);
  sun.position.set(30, 80, 60);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdde8ff, 0.5);
  fill.position.set(-40, 20, -30);
  scene.add(fill);

  const turntable = new THREE.Group();
  turntable.rotation.set(INITIAL_TILT, INITIAL_YAW, 0, "XYZ");
  scene.add(turntable);
  const model = new THREE.Group();
  model.position.y = -TURNING_POINT_Y;
  turntable.add(model);

  const toyTrain = new THREE.Group();
  toyTrain.scale.set(TOY_LENGTH_SCALE, TOY_SECTION_SCALE, TOY_SECTION_SCALE);
  model.add(toyTrain);
  // doors and motors on the right: the model shows the train, not one trip of it
  const car = buildCar({ shape, bodyColor, bellowsColor, outerSign: 1, keep });
  for (const { group, offset } of car.pieces) {
    group.position.x = offset;
    toyTrain.add(group);
  }
  const rail = new THREE.Mesh(
    keep(
      new THREE.BoxGeometry(
        shape.lengthMeters + 2 * RAIL_BEYOND_CAR_METERS,
        RAIL_HEIGHT,
        RAIL_WIDTH
      )
    ),
    keep(new THREE.MeshLambertMaterial({ color: RAIL_COLOR }))
  );
  rail.position.y = -RAIL_HEIGHT / 2;
  toyTrain.add(rail);

  const ring = new THREE.Mesh(
    keep(
      new THREE.RingGeometry(
        RING_RADIUS - RING_THICKNESS / 2,
        RING_RADIUS + RING_THICKNESS / 2,
        96
      )
    ),
    keep(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: RING_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = BODY_CENTRE_Y;
  model.add(ring);

  const cone = new THREE.Mesh(
    keep(fadingConeGeometry()),
    keep(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: CONE_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )
  );
  model.add(cone);
  const CONE_AXIS = new THREE.Vector3(0, -1, 0);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 1, 200);
  camera.position.z = CAMERA_DISTANCE;

  let width = 1;
  let height = 1;

  const draw = (): void => {
    renderer?.render(scene, camera);
  };

  const place = new THREE.Vector3();

  return {
    setSize: (nextWidth, nextHeight) => {
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer?.setSize(width, height, false);
      draw();
    },
    setView: (view) => {
      const { at, looksOutward } = rideViewMarker(view);
      const sign = looksOutward ? 1 : -1;
      cone.position.set(at[0] * RING_RADIUS, BODY_CENTRE_Y, at[1] * RING_RADIUS);
      cone.quaternion.setFromUnitVectors(
        CONE_AXIS,
        new THREE.Vector3(at[0] * sign, 0, at[1] * sign)
      );
      draw();
    },
    rotate: (yaw, tilt) => {
      turntable.rotation.y += yaw;
      turntable.rotation.x = Math.min(
        MAX_TILT,
        Math.max(MIN_TILT, turntable.rotation.x + tilt)
      );
      draw();
    },
    getMarkers: () => {
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld();
      return RIDE_VIEWS.map((view) => {
        const { at } = rideViewMarker(view);
        place.set(at[0] * RING_RADIUS, BODY_CENTRE_Y, at[1] * RING_RADIUS);
        model.localToWorld(place);
        const depth = place.z;
        place.project(camera);
        return {
          view,
          x: Math.min(
            width - MARKER_MARGIN_PX,
            Math.max(MARKER_MARGIN_PX, ((place.x + 1) / 2) * width)
          ),
          y: Math.min(
            height - MARKER_MARGIN_PX,
            Math.max(MARKER_MARGIN_PX, ((1 - place.y) / 2) * height)
          ),
          depth,
          behind: depth < 0,
        };
      });
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      renderer?.dispose();
      // browsers allow few contexts at a time; this one should not wait for GC
      renderer?.forceContextLoss();
      renderer = null;
    },
  };
};
