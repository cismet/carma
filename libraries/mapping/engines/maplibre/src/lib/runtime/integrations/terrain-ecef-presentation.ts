import {
  BufferAttribute,
  Box3,
  BufferGeometry,
  Group,
  Matrix4,
  Mesh,
  Vector3,
} from "three";
import { MercatorCoordinate } from "maplibre-gl";
import {
  createLocalEcefFrame,
  createRasterEcefProjector,
  getCameraLocalMercatorFit,
} from "@carma-geo/proj";
import { createGeodeticTerrainTileGeometry } from "@carma-mapping/engines/three/primitives/core";
import type { TerrainTile } from "../../core/raster-dem-tile";

/** Keeps the native raster topology for seam workers, but renders its ECEF
 * surface. Neither camera gestures nor frame refits reproject these vertices.
 */
export const createTerrainEcefPresentation = (
  origin: readonly [number, number],
  heightOffsetMeters?: (longitude: number, latitude: number) => number
) => {
  const originFrame = createLocalEcefFrame(...origin);
  const mercator = MercatorCoordinate.fromLngLat([...origin], 0);
  const scale = mercator.meterInMercatorCoordinateUnits();
  const root = new Group();
  root.name = "terrain-ecef-mount";
  root.matrixAutoUpdate = false;
  let reference: readonly [number, number] | null = null;
  const tiles = new Map<
    Mesh,
    {
      mesh: Mesh;
      tile: TerrainTile;
      nativePositions: Float32Array;
      version: string;
      ecefBounds: Box3;
    }
  >();
  const version = (geometry: BufferGeometry) =>
    [
      geometry.id,
      (geometry.getAttribute("position") as BufferAttribute).version,
      geometry.index?.version,
      (geometry.getAttribute("normal") as BufferAttribute).version,
    ].join(":");
  const mount = (native: Mesh, tile: TerrainTile, cached?: BufferGeometry) => {
    if (tiles.has(native))
      throw new Error("Terrain mesh already has an ECEF presentation");
    const frame = createLocalEcefFrame(
      (tile.bounds.west + tile.bounds.east) / 2,
      (tile.bounds.south + tile.bounds.north) / 2
    );
    const geometry = cached ?? new BufferGeometry();
    const mesh = new Mesh(geometry, native.material);
    mesh.name = native.name;
    mesh.userData.isShadowTerrainSurface = true;
    mesh.matrixAutoUpdate = false;
    mesh.matrix.multiplyMatrices(
      originFrame.localFromEcef,
      frame.ecefFromLocal
    );
    native.parent?.add(mesh);
    native.removeFromParent();
    const nativePositions = new Float32Array(
      native.geometry.getAttribute("position").array
    );
    // A published tile may already have seam height corrections or appended
    // vertices. Recover their delta against the source, not the current mesh.
    for (let index = 0; index < tile.u.length; index++) {
      const lng =
        tile.bounds.west +
        tile.u[index] * (tile.bounds.east - tile.bounds.west);
      const lat =
        tile.bounds.south +
        tile.v[index] * (tile.bounds.north - tile.bounds.south);
      nativePositions[index * 3 + 1] =
        MercatorCoordinate.fromLngLat([lng, lat], tile.heightMeters[index]).z /
        scale;
    }
    tiles.set(native, {
      mesh,
      tile,
      nativePositions,
      version: cached ? version(native.geometry) : "",
      ecefBounds: cached
        ? new Box3()
            .setFromBufferAttribute(
              cached.getAttribute("position") as BufferAttribute
            )
            .applyMatrix4(frame.ecefFromLocal)
        : new Box3(),
    });
    try {
      sync(native);
    } catch (error) {
      // Restore borrowed ownership if projection fails; an empty replacement
      // must not strand the original surface outside its parent.
      mesh.parent?.add(native);
      mesh.removeFromParent();
      mesh.geometry.dispose();
      tiles.delete(native);
      throw error;
    }
    return mesh;
  };
  const sync = (native: Mesh) => {
    const state = tiles.get(native);
    if (!state) return;
    state.mesh.material = native.material;
    state.mesh.castShadow = native.castShadow;
    state.mesh.receiveShadow = native.receiveShadow;
    const current = version(native.geometry);
    if (current === state.version) return;
    // Seam updates preserve source vertex order. Apply their height adjustment
    // before the shared geodetic transform, rather than stitching in ECEF axes.
    const position = native.geometry.getAttribute("position");
    const u = new Float64Array(position.count);
    const v = new Float64Array(position.count);
    const heights = new Float64Array(position.count);
    const bounds = state.tile.bounds;
    for (let i = 0; i < position.count; i++) {
      const coordinate = new MercatorCoordinate(
        mercator.x + position.getX(i) * scale,
        mercator.y + position.getZ(i) * scale,
        position.getY(i) * scale
      );
      const lngLat = coordinate.toLngLat();
      if (i < state.tile.u.length) {
        u[i] = state.tile.u[i];
        v[i] = state.tile.v[i];
        const verticalScale =
          MercatorCoordinate.fromLngLat(lngLat, 1).z / scale;
        heights[i] =
          state.tile.heightMeters[i] +
          (position.getY(i) - state.nativePositions[i * 3 + 1]) / verticalScale;
      } else {
        // Mixed-level seam workers append vertices. Restore their geographic
        // coordinates instead of trapping the display at an obsolete topology.
        u[i] = (lngLat.lng - bounds.west) / (bounds.east - bounds.west);
        v[i] = (lngLat.lat - bounds.south) / (bounds.north - bounds.south);
        heights[i] = coordinate.toAltitude();
      }
    }
    const projected = createGeodeticTerrainTileGeometry(
      {
        bounds,
        u,
        v,
        heightMeters: heights,
        indices: native.geometry.index!.array,
      },
      heightOffsetMeters
    );
    // Preserve the normals the seam workers agreed on, expressed in the local
    // tangent basis at each vertex, rather than reintroducing shading seams.
    const normal = native.geometry.getAttribute("normal");
    const target = projected.geometry.getAttribute("normal");
    const tileFromEcef = projected.ecefFromLocal.clone().invert();
    const project = createRasterEcefProjector();
    const direction = new Vector3();
    for (let i = 0; i < normal.count; i++) {
      direction.fromBufferAttribute(normal, i);
      project
        .direction(
          bounds.west + u[i] * (bounds.east - bounds.west),
          bounds.south + v[i] * (bounds.north - bounds.south),
          direction,
          direction
        )
        .transformDirection(tileFromEcef);
      target.setXYZ(i, direction.x, direction.y, direction.z);
    }
    state.mesh.geometry.dispose();
    state.mesh.geometry = projected.geometry;
    state.ecefBounds = projected.ecefBounds;
    state.version = current;
  };
  return {
    root,
    mount,
    sync,
    mesh: (native: Mesh) => tiles.get(native)?.mesh,
    ecefBounds: (native: Mesh, target: Box3) => {
      const state = tiles.get(native);
      return state ? target.copy(state.ecefBounds) : target.makeEmpty();
    },
    refit: (lngLat: readonly [number, number]) => {
      if (reference?.[0] === lngLat[0] && reference?.[1] === lngLat[1]) return;
      root.matrix.copy(
        getCameraLocalMercatorFit(origin, lngLat, {
          correctEllipsoidMetric: true,
        })
      );
      root.updateMatrixWorld(true);
      reference = lngLat;
    },
    bounds: (native: Mesh, target: Box3, worldToReference?: Matrix4) => {
      const mesh = tiles.get(native)?.mesh;
      if (!mesh) return target.makeEmpty();
      mesh.updateWorldMatrix(true, false);
      const matrix = mesh.matrixWorld.clone();
      if (worldToReference) matrix.premultiply(worldToReference);
      return target.copy(mesh.geometry.boundingBox!).applyMatrix4(matrix);
    },
    localToWorld: () => root.matrixWorld,
    bytes: (native: Mesh) => {
      const state = tiles.get(native);
      if (!state) return 0;
      const attributes = [
        ...Object.values(state.mesh.geometry.attributes),
        ...(state.mesh.geometry.index ? [state.mesh.geometry.index] : []),
      ];
      const buffers = new Set<ArrayBufferLike>([
        state.nativePositions.buffer,
        ...attributes.map((attribute) => attribute.array.buffer),
      ]);
      // CPU views can share one backing record; Three uploads a separate GPU
      // buffer per attribute. Count each retained resource exactly once.
      return (
        [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) +
        attributes.reduce(
          (sum, attribute) => sum + attribute.array.byteLength,
          0
        )
      );
    },
    detach: (native: Mesh) => {
      const state = tiles.get(native);
      if (!state) return;
      state.mesh.parent?.add(native);
      state.mesh.removeFromParent();
      state.mesh.geometry.dispose();
      tiles.delete(native);
    },
    disposeTile: (native: Mesh) => {
      const state = tiles.get(native);
      state?.mesh.geometry.dispose();
      state?.mesh.removeFromParent();
      tiles.delete(native);
    },
    dispose: () => {
      for (const state of tiles.values()) {
        state.mesh.geometry.dispose();
        state.mesh.removeFromParent();
      }
      tiles.clear();
    },
  };
};
