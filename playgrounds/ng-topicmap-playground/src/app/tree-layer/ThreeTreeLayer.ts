import * as THREE from "three";
import type {
  Map as MaplibreMap,
  CustomLayerInterface,
  CustomRenderMethodInput,
  GeoJSONFeature,
} from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import {
  TREE_TYPES,
  TYPE_COLORS,
  TRUNK_COLORS,
  TYPE_MAP,
  BASE_DIMS,
  buildPrototype,
  type TreeTypeName,
  type TreePrototype,
} from "./TreeFactory";
import { EINZELBAUMX_SOURCE, EINZELBAUMX_LAYER } from "./LoftTreeLayer";

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

export interface TreeData {
  type: TreeTypeName;
  lng: number;
  lat: number;
  heightVar: number;
  diameterVar: number;
  rotation: number;
  farbe: string | null;
}

export interface TreeLayerConfig {
  heightScale?: number;
  diameterScale?: number;
  mapCenter?: [number, number];
}

// ─────────────────────────────────────────────────────────────
//  Feature to tree data conversion
// ─────────────────────────────────────────────────────────────

function polygonCentroid(coords: number[][][]): [number, number] | null {
  const ring = coords[0];
  if (!ring || ring.length === 0) return null;
  let sumLng = 0;
  let sumLat = 0;
  for (const pt of ring) {
    sumLng += pt[0];
    sumLat += pt[1];
  }
  return [sumLng / ring.length, sumLat / ring.length];
}

export function treesFromFeatures(
  features: GeoJSONFeature[],
  radiusMix = 0
): TreeData[] {
  const result: TreeData[] = [];
  const t = Math.max(0, Math.min(1, radiusMix));

  for (const f of features) {
    const geom = f.geometry;
    if (!geom) continue;
    const props = f.properties ?? {};

    let lng: number;
    let lat: number;

    if (geom.type === "Point") {
      [lng, lat] = geom.coordinates as [number, number];
    } else if (geom.type === "Polygon") {
      const c = polygonCentroid(geom.coordinates as unknown as number[][][]);
      if (!c) continue;
      [lng, lat] = c;
    } else if (geom.type === "MultiPolygon") {
      const c = polygonCentroid(
        (geom.coordinates as unknown as number[][][][])[0]
      );
      if (!c) continue;
      [lng, lat] = c;
    } else {
      continue;
    }

    const rawType = String(props["templ_typ"] ?? "")
      .toUpperCase()
      .trim();
    const type: TreeTypeName = TYPE_MAP[rawType] ?? "spherical";
    const base = BASE_DIMS[type];

    const hMax = parseFloat(props["height_max"] as string);
    const heightVar = hMax > 0 ? hMax / base.h : 1.0;

    const rInner = parseFloat(props["radius_max"] as string) || 0;
    const rOuter = parseFloat(props["out_radius_max"] as string) || rInner;
    const rMax = rInner + (rOuter - rInner) * t;
    const diameterVar = rMax > 0 ? rMax / base.r : 1.0;

    const farbe = (props["farbe"] as string) || null;

    result.push({
      type,
      lng,
      lat,
      heightVar,
      diameterVar,
      rotation: Math.random() * Math.PI * 2,
      farbe,
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
//  Custom layer builder
// ─────────────────────────────────────────────────────────────

// Wuppertal center as default
const DEFAULT_CENTER: [number, number] = [7.130127, 51.227527];

interface TreeCustomLayer extends CustomLayerInterface {
  camera: THREE.Camera;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  map: MaplibreMap;
  prototypes: Record<TreeTypeName, TreePrototype>;
  _originMerc: MercatorCoordinate | null;
  _mScale: number;
  _treeData: TreeData[];
  _heightScale: number;
  _diameterScale: number;
  _buildInstances(): void;
}

export function buildCustomLayer(
  config: TreeLayerConfig = {}
): TreeCustomLayer {
  const heightScale = config.heightScale ?? 1.0;
  const diameterScale = config.diameterScale ?? 1.0;
  const mapCenter = config.mapCenter ?? DEFAULT_CENTER;

  const prototypes: Record<string, TreePrototype> = {};
  for (const typeName of TREE_TYPES) {
    prototypes[typeName] = buildPrototype(typeName);
  }

  const layer: TreeCustomLayer = {
    id: "3d-trees",
    type: "custom",
    renderingMode: "3d",

    camera: null!,
    scene: null!,
    renderer: null!,
    map: null!,
    prototypes: prototypes as Record<TreeTypeName, TreePrototype>,
    _originMerc: null,
    _mScale: 0,
    _treeData: [],
    _heightScale: heightScale,
    _diameterScale: diameterScale,

    onAdd(
      map: MaplibreMap,
      gl: WebGLRenderingContext | WebGL2RenderingContext
    ) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.map = map;

      // Lighting
      const ambient = new THREE.AmbientLight(0xffffff, 0.55);
      this.scene.add(ambient);

      const sun = new THREE.DirectionalLight(0xfff8e8, 1.1);
      sun.position.set(100, 300, 150);
      this.scene.add(sun);

      const fill = new THREE.DirectionalLight(0xc8d8ff, 0.35);
      fill.position.set(-80, 100, -60);
      this.scene.add(fill);

      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;
    },

    _buildInstances() {
      // Remove old instanced meshes
      const toRemove = this.scene.children.filter(
        (c): c is THREE.InstancedMesh =>
          (c as THREE.InstancedMesh).isInstancedMesh === true
      );
      for (const m of toRemove) {
        m.geometry.dispose();
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        } else {
          m.material.dispose();
        }
        this.scene.remove(m);
      }

      const originMerc = MercatorCoordinate.fromLngLat(mapCenter, 0);
      const mScale = originMerc.meterInMercatorCoordinateUnits();
      this._originMerc = originMerc;
      this._mScale = mScale;

      // Group trees by type
      const groups: Record<TreeTypeName, TreeData[]> = {
        conical: [],
        parabolic: [],
        spherical: [],
        gaussian: [],
        hyperbolic: [],
      };
      for (const tree of this._treeData) {
        groups[tree.type].push(tree);
      }

      const dummy = new THREE.Object3D();

      for (const typeName of TREE_TYPES) {
        const trees = groups[typeName];
        if (trees.length === 0) continue;

        const proto = this.prototypes[typeName];
        const count = trees.length;

        const crownMat = new THREE.MeshLambertMaterial({
          color: 0xffffff,
          flatShading: true,
          transparent: true,
          opacity: 1,
        });
        const crownMesh = new THREE.InstancedMesh(proto.crown, crownMat, count);

        const trunkMat = new THREE.MeshLambertMaterial({
          color: "#5c3a1e",
          flatShading: true,
        });
        const trunkMesh = new THREE.InstancedMesh(proto.trunk, trunkMat, count);

        const crownColors = new Float32Array(count * 3);
        const trunkColorData = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
          const tree = trees[i];

          const treeMerc = MercatorCoordinate.fromLngLat(
            [tree.lng, tree.lat],
            0
          );
          const dxMeters = (treeMerc.x - originMerc.x) / mScale;
          const dyMeters = (treeMerc.y - originMerc.y) / mScale;

          const sx = this._diameterScale * tree.diameterVar;
          const sy = this._heightScale * tree.heightVar;
          const sz = this._diameterScale * tree.diameterVar;

          dummy.position.set(dxMeters, 0, dyMeters);
          dummy.scale.set(sx, sy, sz);
          dummy.rotation.set(0, tree.rotation, 0);
          dummy.updateMatrix();

          crownMesh.setMatrixAt(i, dummy.matrix);
          trunkMesh.setMatrixAt(i, dummy.matrix);

          // Crown color: use farbe from data if available, else type default
          const baseColor =
            tree.farbe && tree.farbe !== "#000000"
              ? tree.farbe
              : TYPE_COLORS[tree.type];
          const cc = new THREE.Color(baseColor);
          cc.offsetHSL(0, 0, Math.random() * 0.06 - 0.03);
          crownColors.set([cc.r, cc.g, cc.b], i * 3);

          const tc = new THREE.Color(
            TRUNK_COLORS[Math.floor(Math.random() * TRUNK_COLORS.length)]
          );
          trunkColorData.set([tc.r, tc.g, tc.b], i * 3);
        }

        crownMesh.instanceColor = new THREE.InstancedBufferAttribute(
          crownColors,
          3
        );
        trunkMesh.instanceColor = new THREE.InstancedBufferAttribute(
          trunkColorData,
          3
        );
        crownMesh.instanceMatrix.needsUpdate = true;
        trunkMesh.instanceMatrix.needsUpdate = true;

        this.scene.add(crownMesh);
        this.scene.add(trunkMesh);
      }
    },

    render(
      _gl: WebGLRenderingContext | WebGL2RenderingContext,
      options: CustomRenderMethodInput
    ) {
      if (!this._originMerc) return;

      const originMerc = this._originMerc;
      const mScale = this._mScale;

      // Rotation PI/2 around X: Three.js Y-up to Mercator Z-up
      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        Math.PI / 2
      );

      const m = new THREE.Matrix4().fromArray(
        options.defaultProjectionData.mainMatrix as unknown as number[]
      );
      const l = new THREE.Matrix4()
        .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
        .scale(new THREE.Vector3(mScale, -mScale, mScale))
        .multiply(rotationX);

      this.camera.projectionMatrix = m.multiply(l);

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    },

    onRemove() {
      // Dispose all meshes
      this.scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) {
          (obj as THREE.Mesh).geometry.dispose();
        }
        const material = (obj as THREE.Mesh).material;
        if (material) {
          if (Array.isArray(material)) {
            material.forEach((mat) => mat.dispose());
          } else {
            material.dispose();
          }
        }
      });
      this.renderer.dispose();
    },
  };

  return layer;
}

// ─────────────────────────────────────────────────────────────
//  Source sync helper
// ─────────────────────────────────────────────────────────────

export function syncTreesFromSource(
  map: MaplibreMap,
  layer: TreeCustomLayer,
  radiusMix = 0
): void {
  const features = map.querySourceFeatures(EINZELBAUMX_SOURCE, {
    sourceLayer: EINZELBAUMX_LAYER,
  });

  // Deduplicate (vector tiles return dupes at tile boundaries)
  const seen = new Set<string>();
  const unique = features.filter((f) => {
    const geom = f.geometry;
    if (!geom) return false;
    let key: string;
    if (geom.type === "Point") {
      const coords = geom.coordinates as [number, number];
      key = `${coords[0].toFixed(7)},${coords[1].toFixed(7)}`;
    } else if (geom.type === "Polygon") {
      const ring = (geom.coordinates as number[][][])[0];
      if (!ring?.[0]) return true;
      key = `${ring[0][0].toFixed(7)},${ring[0][1].toFixed(7)}`;
    } else {
      return true;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const newData = treesFromFeatures(unique, radiusMix);

  // Skip rebuild if feature count hasn't changed (avoids churn from sourcedata events)
  if (newData.length === layer._treeData.length && newData.length > 0) return;

  layer._treeData = newData;
  layer._buildInstances();
  map.triggerRepaint();
}
