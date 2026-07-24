import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector2,
  Vector3,
} from "three";

export type UtmGridReference = Readonly<{
  zone: number;
  hemisphere: "north" | "south";
  ellipsoidName: string;
}>;

export type UtmGridSurfaceOptions = Readonly<{
  center: readonly [number, number];
  sizeMeters: number | readonly [number, number];
  utm: UtmGridReference;
  ellipsoidalHeight: number;
  projectToWorld: (easting: number, northing: number, height: number, target: Vector3) => Vector3;
  maximumScreenErrorPx?: number;
  minorStepMeters?: number;
  majorStepMeters?: number;
  minorLineWidthPx?: number;
  majorLineWidthPx?: number;
  minorMinimumSpacingPx?: number;
}>;

export type UtmGridSurface = Readonly<{
  group: Group;
  update: (camera: unknown, viewport: Vector2) => void;
  setEllipsoidalHeight: (height: number) => void;
  dispose: () => void;
}>;

export const createUtmGridSurface = (options: UtmGridSurfaceOptions): UtmGridSurface => {
  const [width, height] = typeof options.sizeMeters === "number" ? [options.sizeMeters, options.sizeMeters] : options.sizeMeters;
  if (!(width > 0 && height > 0)) throw new RangeError("UTM grid extent must be positive");
  const minorStep = options.minorStepMeters ?? 1;
  let ellipsoidalHeight = options.ellipsoidalHeight;
  const group = new Group();
  group.name = `UTM zone ${options.utm.zone}${options.utm.hemisphere === "north" ? "N" : "S"} ellipsoid grid`;
  const minimumEasting = options.center[0] - width / 2;
  const maximumEasting = options.center[0] + width / 2;
  const minimumNorthing = options.center[1] - height / 2;
  const maximumNorthing = options.center[1] + height / 2;
  const project = (easting: number, northing: number) => options.projectToWorld(easting, northing, ellipsoidalHeight, new Vector3());
  const geometry = new BufferGeometry();
  const positions: number[] = [];
  const addLine = (a: Vector3, b: Vector3) => positions.push(...a.toArray(), ...b.toArray());
  for (let easting = Math.ceil(minimumEasting / minorStep) * minorStep; easting <= maximumEasting; easting += minorStep) {
    addLine(project(easting, minimumNorthing), project(easting, maximumNorthing));
  }
  for (let northing = Math.ceil(minimumNorthing / minorStep) * minorStep; northing <= maximumNorthing; northing += minorStep) {
    addLine(project(minimumEasting, northing), project(maximumEasting, northing));
  }
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({ color: new Color(0x526d78), transparent: true, opacity: 0.7 });
  const lines = new LineSegments(geometry, material);
  lines.renderOrder = 3;
  group.add(lines);
  const surface = new Mesh(
    new BufferGeometry().setFromPoints([
      project(minimumEasting, minimumNorthing), project(maximumEasting, minimumNorthing),
      project(maximumEasting, maximumNorthing), project(minimumEasting, maximumNorthing),
    ]),
    new MeshBasicMaterial({ color: 0xdce5e8, transparent: true, opacity: 0.08, side: DoubleSide, depthWrite: false })
  );
  surface.visible = false;
  group.add(surface);
  return {
    group,
    update: () => undefined,
    setEllipsoidalHeight: (heightValue) => {
      if (!Number.isFinite(heightValue)) throw new RangeError("UTM grid ellipsoidal height must be finite");
      ellipsoidalHeight = heightValue;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      (surface.material as MeshBasicMaterial).dispose();
      surface.geometry.dispose();
      group.clear();
    },
  };
};
