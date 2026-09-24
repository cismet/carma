import * as THREE from "three";

import {
  advanceNightTrafficDistance,
  getNightTrafficSignalPhase,
  NIGHT_TRAFFIC_KIND,
  NIGHT_TRAFFIC_SIGNAL_PHASE,
  type NightTrafficRoute,
} from "../../core/night-traffic";

export type SharedSceneNightTraffic = Readonly<{
  update: (elapsedSeconds: number) => void;
  dispose: () => void;
  vehicleCount: number;
  signalCount: number;
}>;

type CompiledRoute = Readonly<{
  route: NightTrafficRoute;
  segmentEnds: Float64Array;
  totalLength: number;
}>;

type Vehicle = {
  object: THREE.Group;
  route: CompiledRoute;
  distance: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  stopOffsetMeters: number;
  fadeMaterials: THREE.Material[];
  fadeLights: ReadonlyArray<
    Readonly<{ light: THREE.Light; intensity: number }>
  >;
};

type SignalVisual = Readonly<{
  route: CompiledRoute;
  red: THREE.MeshBasicMaterial;
  yellow: THREE.MeshBasicMaterial;
  green: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
}>;

const isFiniteVector = (point: THREE.Vector3): boolean =>
  [point.x, point.y, point.z].every(Number.isFinite);

const compileRoute = (route: NightTrafficRoute): CompiledRoute | null => {
  if (
    !route.id ||
    !Object.values(NIGHT_TRAFFIC_KIND).includes(route.kind) ||
    !Number.isFinite(route.speedMetersPerSecond) ||
    route.speedMetersPerSecond <= 0 ||
    route.points.length < 2 ||
    !route.points.every(isFiniteVector)
  )
    return null;
  const segmentEnds = new Float64Array(route.points.length - 1);
  let totalLength = 0;
  for (let index = 0; index < segmentEnds.length; index += 1) {
    const start = route.points[index];
    const end = route.points[index + 1];
    const segmentLength = Math.hypot(end.x - start.x, end.z - start.z);
    if (segmentLength <= 0) return null;
    totalLength += segmentLength;
    segmentEnds[index] = totalLength;
  }
  if (totalLength <= 0) return null;
  if (
    route.signal &&
    (!Number.isFinite(route.signal.distanceMeters) ||
      !Number.isFinite(route.signal.phaseOffsetSeconds) ||
      route.signal.distanceMeters < 0 ||
      route.signal.distanceMeters > totalLength)
  )
    return null;
  return { route, segmentEnds, totalLength };
};

const sampleRoute = (
  compiled: CompiledRoute,
  distance: number,
  position: THREE.Vector3,
  tangent: THREE.Vector3
): void => {
  const bounded = Math.min(compiled.totalLength, Math.max(0, distance));
  let index = 0;
  while (
    index < compiled.segmentEnds.length - 1 &&
    bounded >= compiled.segmentEnds[index]
  )
    index += 1;
  const startDistance = index === 0 ? 0 : compiled.segmentEnds[index - 1];
  const endDistance = compiled.segmentEnds[index];
  const start = compiled.route.points[index];
  const end = compiled.route.points[index + 1];
  const fraction =
    endDistance === startDistance
      ? 0
      : (bounded - startDistance) / (endDistance - startDistance);
  position.copy(start).lerp(end, fraction);
  tangent.set(end.x - start.x, 0, end.z - start.z).normalize();
};

const addBulb = (
  parent: THREE.Object3D,
  geometry: THREE.SphereGeometry,
  material: THREE.MeshBasicMaterial,
  x: number,
  y: number,
  z: number
): THREE.Mesh => {
  const bulb = new THREE.Mesh(geometry, material);
  bulb.position.set(x, y, z);
  parent.add(bulb);
  return bulb;
};

/**
 * Vehicles face local +X. World coordinates are x east, y up, z south.
 * Open routes wrap by disappearing at one dataset boundary and reappearing at
 * the other; they never turn around in view.
 */
export const createSharedSceneNightTraffic = (
  scene: THREE.Scene,
  options: Readonly<{
    routes: readonly NightTrafficRoute[];
    carCount: number;
  }>
): SharedSceneNightTraffic => {
  const root = new THREE.Group();
  root.name = "shared-scene-night-traffic";
  scene.add(root);

  const bodyGeometry = new THREE.BoxGeometry(1, 1, 1);
  const bulbGeometry = new THREE.SphereGeometry(0.1, 8, 6);
  const signalBulbGeometry = new THREE.SphereGeometry(0.16, 10, 8);
  const poleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 3, 8);
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x242830 });
  const carMaterial = new THREE.MeshStandardMaterial({ color: 0x304b70 });
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0xd7d8d5 });
  const whiteBulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const redBulbMaterial = new THREE.MeshBasicMaterial({ color: 0xff1808 });
  const windowMaterial = new THREE.MeshBasicMaterial({ color: 0xffc06a });
  const ownedMaterials: THREE.Material[] = [
    darkMaterial,
    carMaterial,
    railMaterial,
    whiteBulbMaterial,
    redBulbMaterial,
    windowMaterial,
  ];
  const ownedLights: THREE.Light[] = [];
  const compiledRoutes = options.routes
    .map(compileRoute)
    .filter((route): route is CompiledRoute => route !== null);
  const vehicles: Vehicle[] = [];

  const addVehicle = (
    route: CompiledRoute,
    distance: number,
    kind: NightTrafficRoute["kind"],
    queueIndex = 0
  ): void => {
    const object = new THREE.Group();
    object.name = `night-traffic-${kind}-${route.route.id}`;
    const isCar = kind === NIGHT_TRAFFIC_KIND.CAR;
    const isSuspended = kind === NIGHT_TRAFFIC_KIND.SCHWEBEBAHN;
    const length = isCar ? 4.2 : isSuspended ? 18 : 24;
    const width = isCar ? 1.8 : 2.5;
    const height = isCar ? 1.35 : 3;
    const bodySurface = (isCar ? carMaterial : railMaterial).clone();
    bodySurface.transparent = true;
    ownedMaterials.push(bodySurface);
    const body = new THREE.Mesh(bodyGeometry, bodySurface);
    body.scale.set(length, height, width);
    body.position.y = isSuspended ? -4.5 : height / 2;
    object.add(body);

    const frontX = length / 2 + 0.08;
    const rearX = -length / 2 - 0.08;
    const lampY = isSuspended ? -4.4 : Math.max(0.45, height * 0.45);
    const lampSpacing = width * 0.32;
    const headlightCount = isCar ? 2 : 1;
    const fadeMaterials: THREE.Material[] = [bodySurface];
    const fadeLights: { light: THREE.Light; intensity: number }[] = [];
    const vehicleWhiteBulbMaterial = whiteBulbMaterial.clone();
    vehicleWhiteBulbMaterial.transparent = true;
    const vehicleRedBulbMaterial = redBulbMaterial.clone();
    vehicleRedBulbMaterial.transparent = true;
    ownedMaterials.push(vehicleWhiteBulbMaterial, vehicleRedBulbMaterial);
    fadeMaterials.push(vehicleWhiteBulbMaterial, vehicleRedBulbMaterial);
    for (let index = 0; index < headlightCount; index += 1) {
      const z =
        headlightCount === 1 ? 0 : index === 0 ? -lampSpacing : lampSpacing;
      addBulb(object, bulbGeometry, vehicleWhiteBulbMaterial, frontX, lampY, z);
      const light = new THREE.SpotLight(
        0xfff4d8,
        isCar ? 1_200 : 2_000,
        48,
        0.36,
        0.55,
        2
      );
      light.castShadow = false;
      light.position.set(frontX, lampY, z);
      light.target.position.set(frontX + 12, lampY - 2.5, z);
      object.add(light, light.target);
      ownedLights.push(light);
      fadeLights.push({ light, intensity: light.intensity });
    }
    addBulb(
      object,
      bulbGeometry,
      vehicleRedBulbMaterial,
      rearX,
      lampY,
      -lampSpacing
    );
    addBulb(
      object,
      bulbGeometry,
      vehicleRedBulbMaterial,
      rearX,
      lampY,
      lampSpacing
    );
    const rearLight = new THREE.PointLight(0xff1408, 60, 8, 2);
    rearLight.castShadow = false;
    rearLight.position.set(rearX, lampY, 0);
    object.add(rearLight);
    ownedLights.push(rearLight);
    fadeLights.push({ light: rearLight, intensity: rearLight.intensity });

    if (!isCar) {
      const vehicleWindowMaterial = windowMaterial.clone();
      vehicleWindowMaterial.transparent = true;
      ownedMaterials.push(vehicleWindowMaterial);
      fadeMaterials.push(vehicleWindowMaterial);
      for (let x = -length * 0.32; x <= length * 0.32; x += length * 0.16)
        for (const side of [-1, 1])
          addBulb(
            object,
            bulbGeometry,
            vehicleWindowMaterial,
            x,
            lampY + 0.45,
            side * (width / 2 + 0.02)
          );
    }
    root.add(object);
    const vehicle = {
      object,
      route,
      distance,
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      stopOffsetMeters: 3 + queueIndex * 6,
      fadeMaterials,
      fadeLights,
    };
    sampleRoute(route, distance, vehicle.position, vehicle.tangent);
    object.position.copy(vehicle.position);
    object.rotation.y = -Math.atan2(vehicle.tangent.z, vehicle.tangent.x);
    const initialBoundaryDistance = Math.min(
      distance,
      route.totalLength - distance
    );
    const initialFade = THREE.MathUtils.smoothstep(
      initialBoundaryDistance,
      0,
      8
    );
    for (const material of fadeMaterials) material.opacity = initialFade;
    for (const entry of fadeLights)
      entry.light.intensity = entry.intensity * initialFade;
    vehicles.push(vehicle);
  };

  const carRoutes = compiledRoutes.filter(
    ({ route }) => route.kind === NIGHT_TRAFFIC_KIND.CAR
  );
  const requestedCars = Number.isFinite(options.carCount)
    ? Math.min(8, Math.max(0, Math.floor(options.carCount)))
    : 0;
  const plannedCars: { route: CompiledRoute; distance: number }[] = [];
  for (let routeIndex = 0; routeIndex < carRoutes.length; routeIndex += 1) {
    const route = carRoutes[routeIndex];
    const count = Math.max(
      0,
      Math.ceil((requestedCars - routeIndex) / carRoutes.length)
    );
    for (let index = 0; index < count; index += 1)
      plannedCars.push({
        route,
        distance: (index / count) * route.totalLength,
      });
  }
  for (const route of carRoutes) {
    const routeCars = plannedCars.filter((car) => car.route === route);
    if (route.route.signal)
      routeCars.sort((left, right) => {
        const toSignal = (distance: number) =>
          (route.route.signal!.distanceMeters - distance + route.totalLength) %
          route.totalLength;
        return toSignal(left.distance) - toSignal(right.distance);
      });
    routeCars.forEach((car, queueIndex) =>
      addVehicle(route, car.distance, NIGHT_TRAFFIC_KIND.CAR, queueIndex)
    );
  }
  for (const kind of [
    NIGHT_TRAFFIC_KIND.SCHWEBEBAHN,
    NIGHT_TRAFFIC_KIND.TRAIN,
  ]) {
    const route = compiledRoutes.find(
      (candidate) => candidate.route.kind === kind
    );
    if (route) addVehicle(route, 0, kind);
  }

  const signals: SignalVisual[] = [];
  const signalPosition = new THREE.Vector3();
  const signalTangent = new THREE.Vector3();
  for (const route of carRoutes) {
    if (!route.route.signal) continue;
    sampleRoute(
      route,
      route.route.signal.distanceMeters,
      signalPosition,
      signalTangent
    );
    const signal = new THREE.Group();
    signal.name = `night-traffic-signal-${route.route.id}`;
    signal.position.copy(signalPosition);
    signal.rotation.y = -Math.atan2(signalTangent.z, signalTangent.x);
    const pole = new THREE.Mesh(poleGeometry, darkMaterial);
    pole.position.set(-0.4, 1.5, -2.2);
    signal.add(pole);
    const red = new THREE.MeshBasicMaterial({ color: 0x260000 });
    const yellow = new THREE.MeshBasicMaterial({ color: 0x2b1b00 });
    const green = new THREE.MeshBasicMaterial({ color: 0x002400 });
    ownedMaterials.push(red, yellow, green);
    addBulb(signal, signalBulbGeometry, red, -0.4, 2.75, -2.2);
    addBulb(signal, signalBulbGeometry, yellow, -0.4, 2.38, -2.2);
    addBulb(signal, signalBulbGeometry, green, -0.4, 2.01, -2.2);
    const light = new THREE.PointLight(0xff0000, 80, 9, 2);
    light.castShadow = false;
    light.position.set(-0.4, 2.4, -2.2);
    signal.add(light);
    ownedLights.push(light);
    root.add(signal);
    signals.push({ route, red, yellow, green, light });
  }

  let previousElapsedSeconds = 0;
  let disposed = false;
  return {
    vehicleCount: vehicles.length,
    signalCount: signals.length,
    update(elapsedSeconds) {
      if (disposed || !Number.isFinite(elapsedSeconds)) return;
      // Backgrounded clocks must not fast-forward traffic on resume.
      const deltaSeconds = Math.min(
        0.25,
        Math.max(0, elapsedSeconds - previousElapsedSeconds)
      );
      previousElapsedSeconds = elapsedSeconds;
      for (const vehicle of vehicles) {
        vehicle.distance = advanceNightTrafficDistance({
          distanceMeters: vehicle.distance,
          speedMetersPerSecond: vehicle.route.route.speedMetersPerSecond,
          deltaSeconds,
          elapsedSeconds: elapsedSeconds - deltaSeconds,
          routeLengthMeters: vehicle.route.totalLength,
          signal: vehicle.route.route.signal,
          stopOffsetMeters: vehicle.stopOffsetMeters,
        });
        sampleRoute(
          vehicle.route,
          vehicle.distance,
          vehicle.position,
          vehicle.tangent
        );
        vehicle.object.position.copy(vehicle.position);
        vehicle.object.rotation.y = -Math.atan2(
          vehicle.tangent.z,
          vehicle.tangent.x
        );
        const boundaryDistance = Math.min(
          vehicle.distance,
          vehicle.route.totalLength - vehicle.distance
        );
        const fade = THREE.MathUtils.smoothstep(boundaryDistance, 0, 8);
        for (const material of vehicle.fadeMaterials) material.opacity = fade;
        for (const entry of vehicle.fadeLights)
          entry.light.intensity = entry.intensity * fade;
      }
      for (const signal of signals) {
        const phase = getNightTrafficSignalPhase(
          elapsedSeconds,
          signal.route.route.signal!.phaseOffsetSeconds
        );
        const redOn =
          phase === NIGHT_TRAFFIC_SIGNAL_PHASE.RED ||
          phase === NIGHT_TRAFFIC_SIGNAL_PHASE.RED_YELLOW ||
          phase === NIGHT_TRAFFIC_SIGNAL_PHASE.ALL_RED;
        const yellowOn =
          phase === NIGHT_TRAFFIC_SIGNAL_PHASE.RED_YELLOW ||
          phase === NIGHT_TRAFFIC_SIGNAL_PHASE.YELLOW;
        const greenOn = phase === NIGHT_TRAFFIC_SIGNAL_PHASE.GREEN;
        signal.red.color.setHex(redOn ? 0xff1808 : 0x260000);
        signal.yellow.color.setHex(yellowOn ? 0xffa000 : 0x2b1b00);
        signal.green.color.setHex(greenOn ? 0x22d44a : 0x002400);
        signal.light.color.setHex(
          greenOn ? 0x22d44a : yellowOn ? 0xffa000 : 0xff1808
        );
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      ownedLights.forEach((light) => light.dispose());
      ownedMaterials.forEach((material) => material.dispose());
      bodyGeometry.dispose();
      bulbGeometry.dispose();
      signalBulbGeometry.dispose();
      poleGeometry.dispose();
    },
  };
};
