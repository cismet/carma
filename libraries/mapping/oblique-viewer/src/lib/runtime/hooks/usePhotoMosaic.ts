import { useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Frustum,
  Group,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Ray,
  Sphere,
  Vector4,
  DoubleSide,
  Matrix4,
  Raycaster,
  Texture,
  Vector3,
} from "three";
import {
  acquireSharedThreeScene,
  notifySharedThreeSceneContentChanged,
  acquireForegroundNetwork,
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeTerrain,
  type SharedThreeSceneFrame,
  type MapStylePhotoMosaicEntry,
  type SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";
import {
  imageTileRect,
  levelToNative,
  targetLevel,
  tileRangeFor,
  type ImageRect,
  type ImageLevelStack,
  type ImageLevelPlan,
  type ImageLevelStackPoolDemand,
} from "@carma-commons/image-pyramid";
import type { DevicePixels, Ratio, Degrees } from "@carma-units";
import type {
  ObliqueImageRecord,
  ObliqueSelectionData,
} from "../../core/types";
import { getMeanPhotoReference } from "../../core/utils/imageRecord";
import { scoreBestImageGeometry } from "../../core/utils/best-image";
import { objectCoveragePixelRay } from "../../core/utils/object-coverage";
import type { BestImageGeometry } from "../../core/utils/best-image";
import {
  imageProjectionMatrix,
  sceneToPhotoEnu,
} from "../../core/utils/image-projection";
import type { ScenePreviewPhoto } from "./useScenePreviewImage";
import {
  nativePixelPool,
  nativePreviewSource,
} from "../utils/native-preview-pool";
import {
  originalOf,
  pyramidOf,
  pyramidOptionsOf,
  type ObliqueViewportPhoto,
} from "../utils/oblique-viewport-source";
import {
  planPhotoMosaic,
  planPhotoMosaicCooperatively,
  type PhotoMosaicPlan,
} from "../../core/utils/photo-mosaic-plan";
import {
  photoCenterRayUv,
  photoCenterRays,
  photoReferenceRays,
} from "../../core/utils/photo-center-rays";
import { viewportFoveatedTarget } from "../../core/utils/viewport-foveation";
import {
  sampleVisibleSurface,
  type VisibleSurfaceSamples,
} from "../utils/sample-visible-surface";
import {
  readMosaicRegionQuality,
  type MosaicRegionQuality,
} from "../utils/mosaic-region-quality";

import {
  MosaicGpuSnapshot,
  mosaicTextureBounds,
} from "../utils/mosaic-gpu-snapshot";

import {
  createPhotoAxisPicker,
  type PhotoAxisPicker,
  type PreparedBestImageField,
} from "../utils/photo-axis-picker";

type Photo = ScenePreviewPhoto & ObliqueViewportPhoto;
type Hit = { point: Vector3; surface: "mesh" | "terrain" };
type Options = {
  map: MaplibreMap | null;
  enabled: boolean;
  groupKey: string;
  readRecords: () => readonly ObliqueImageRecord[];
  centerY: number;
  preferredPitchDeg?: Degrees | null;
  seriesDirection?: boolean;
  selectionData?: ObliqueSelectionData | null;
  bestImagePicker?: PhotoAxisPicker;
  presentation?: "surface" | "image-tiles";
  tileOrder?: "scanline" | "center-out";
  resolvePhoto: (record: ObliqueImageRecord) => Promise<Photo>;
  intersectSurface: (ray: Raycaster, eye: [number, number]) => Hit | null;
};
type ActiveDemand = {
  query: ImageLevelStackPoolDemand;
  stack?: ImageLevelStack;
  release: () => void;
};
type Snapshot = {
  key: string;
  photo: Photo;
  crop: ImageRect;
  texture: Texture;
  gpu?: MosaicGpuSnapshot;
  textureRect?: ImageRect;
  revision?: number;
  priority: number;
  density: number;
  quality?: MosaicRegionQuality;
  plan?: ImageLevelPlan;
  complete?: boolean;
};
const SNAPSHOT_BYTES = 128 * 1024 * 1024;
const DETAIL_BYTES = SNAPSHOT_BYTES;
const TILE_PIXELS = 1024;
const TILE_PLANE_LIMIT = 512;
let nextId = 0;

/** Visible-surface sampling and serial tile preparation share the normal native image pool. */
export const usePhotoMosaic = (options: Options) => {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    if (options.enabled) options.map?.triggerRepaint();
  }, [
    options.enabled,
    options.map,
    options.centerY,
    options.preferredPitchDeg,
    options.seriesDirection,
    options.selectionData,
    options.bestImagePicker,
    options.presentation,
    options.tileOrder,
    options.groupKey,
    options.readRecords,
  ]);
  const [status, setStatus] = useState({ message: "", loading: false });
  useEffect(() => {
    const { map } = current.current;
    if (!options.enabled || !map) {
      setStatus({ message: "", loading: false });
      return;
    }
    const scene = acquireSharedThreeScene(map);
    const id = `oblique-photo-mosaic-${++nextId}`;
    const imageTiles = options.presentation === "image-tiles";
    let ownedPicker: PhotoAxisPicker | undefined;
    const readPicker = () => {
      if (current.current.bestImagePicker)
        return current.current.bestImagePicker;
      const data = current.current.selectionData;
      if (!data) return undefined;
      if (!ownedPicker) {
        ownedPicker = createPhotoAxisPicker(map, data, 0, {
          readPreferredPitchDeg: () => current.current.preferredPitchDeg,
          readPreferredPitchOverrideDeg: () =>
            current.current.preferredPitchDeg ?? null,
          readSeriesDirection: () => current.current.seriesDirection ?? false,
          readBestRecords: () => current.current.readRecords(),
        });
        ownedPicker.start();
      }
      ownedPicker.updateData(data);
      return ownedPicker;
    };
    // Fixed metric projections remain reusable after the scene rebases.
    const surfaceGeometry = new Map<
      string,
      {
        geometry: BestImageGeometry;
        referenceToMetric: Matrix4;
      }
    >();
    const tileRoot = imageTiles ? new Group() : undefined;
    const imagePlanes = new Map<
      string,
      {
        photo: Photo;
        plane: Plane;
        quad: Vector3[];
        projection: Matrix4;
        projectionReference: Matrix4;
        frameKey: string;
        preferenceKey: string;
        geometry: BestImageGeometry;
      }
    >();
    const tileMeshes = new Map<
      string,
      {
        mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
        item: Snapshot;
        plane: object;
        bounds: Box3;
        centroid: Vector3;
        projectionReference: Matrix4;
        uniforms: {
          carmaTilePhotoProjection: { value: Matrix4 };
          carmaTileTextureWindow: { value: Vector4 };
          carmaTileCropBounds: { value: Vector4 };
        };
        revision?: number;
      }
    >();
    let tileVersion = 0,
      tileViewKey = "",
      tileGeometryTimer: ReturnType<typeof setTimeout> | undefined;
    const tileFrustum = new Frustum();
    let lastTileFrame: SharedThreeSceneFrame | undefined;
    let centrePhotoId: string | undefined;
    let scanlineRight: Vector3 | undefined, scanlineUp: Vector3 | undefined;

    const snapshots = new Map<string, Snapshot>();
    const preferredAxes = new Map<
      string,
      {
        capturePosition: Vector3;
        preferredDirection: Vector3;
        sceneToMetric: Matrix4;
      }
    >();
    const geometries = new Map<
      string,
      {
        photo: Photo;
        frameKey: string;
        preferenceKey: string;
        geometry: BestImageGeometry;
        axisDirection: Vector3;
        groundPoint: Vector3;
        sceneToMetric: Matrix4;
      }
    >();
    const retention = nativePixelPool.retainWorkingSet({
      maxImages: 8,
      maxParkedBytes: 64 * 1024 * 1024,
    });
    let groupKey = current.current.groupKey;
    const photos = new Map<string, Promise<Photo>>();
    const failedPhotos = new Set<string>();
    let disposed = false,
      generation = 0,
      frameKey = "",
      recordsKey = "",
      surfaceDirty = true;
    let signatureRecords: readonly ObliqueImageRecord[] | undefined;
    let signatureLength = -1;
    let signature = "";
    const readRecordSignature = (records: readonly ObliqueImageRecord[]) => {
      if (records !== signatureRecords || records.length !== signatureLength) {
        signatureRecords = records;
        signatureLength = records.length;
        signature = records.map((record) => record.id).join(",");
      }
      return signature;
    };
    let clip: Matrix4 | undefined;
    let pixels = { width: 0, height: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: ActiveDemand | undefined;
    let releaseGeometryPriority: (() => void) | undefined;
    let abortWait: (() => void) | undefined;
    let work: Promise<void> | undefined;
    let lastSeriesDirection = current.current.seriesDirection ?? false;
    let lastSelectionData = current.current.selectionData;
    const referenceSummaryKey = () =>
      current.current.seriesDirection
        ? [
            ...(current.current.selectionData
              ?.obliqueReferenceByDirectionBySeries ?? []),
          ]
            .map(([series, directions]) =>
              [
                series,
                ...[...directions].flatMap(([direction, totals]) => [
                  direction,
                  totals.opticalPitchSumRad,
                  totals.headingSinSum,
                  totals.headingCosSum,
                  totals.imageCount,
                ]),
              ].join(":")
            )
            .join("|")
        : "";
    let lastReferenceSummary = referenceSummaryKey();
    let referenceDataEpoch = 0;
    let lastPreferredPitch = current.current.seriesDirection
      ? current.current.preferredPitchDeg ?? null
      : current.current.preferredPitchDeg ?? map.getPitch?.() ?? null;
    let sampledCache: { key: string; value: VisibleSurfaceSamples } | undefined;
    let contentTimer: ReturnType<typeof setTimeout> | undefined;
    const dirtyPhotos = new Set<string>();
    let refreshingContent = false;
    const contentSubscriptions = new Map<
      string,
      { stack: ImageLevelStack; unsubscribe: () => void }
    >();
    let activeProgress: (() => void) | undefined;
    let latestReport = { message: "", loading: false };
    const report = (message: string, loading = false) => {
      latestReport = { message, loading };
      if (!disposed)
        setStatus((previous) =>
          previous.message === message && previous.loading === loading
            ? previous
            : { message, loading }
        );
    };
    const snapshotBytes = (item: Snapshot) => item.gpu?.bytes ?? 0;
    const bytes = () =>
      [...snapshots.values()].reduce(
        (sum, item) => sum + snapshotBytes(item),
        0
      );
    const detailBytes = () =>
      [...snapshots.values()].reduce(
        (sum, item) => sum + snapshotBytes(item),
        0
      );
    const drop = (item: Snapshot) => {
      if (item.gpu) item.gpu.dispose();
      else item.texture.dispose();
      const tile = tileMeshes.get(item.key);
      if (tile) {
        tileRoot?.remove(tile.mesh);
        tile.mesh.geometry.dispose();
        tile.mesh.material.dispose();
        tileMeshes.delete(item.key);
        tileVersion++;
      }
    };
    const freezeStack = (stack: ImageLevelStack) => {
      for (const item of snapshots.values())
        if (item.gpu?.uses(stack)) item.gpu.freeze();
    };
    const updatePixels = (item: Snapshot, stack: ImageLevelStack) => {
      const renderer = scene.layer.getRenderer?.();
      if (!item.gpu || !renderer) return false;
      const available = DETAIL_BYTES - detailBytes() + snapshotBytes(item);
      if (
        !item.gpu.update(
          renderer,
          stack,
          item.crop,
          {
            width: Math.ceil(item.crop.width * item.density),
            height: Math.ceil(item.crop.height * item.density),
          },
          available,
          item.plan
        )
      )
        return false;
      const result = item.gpu.result!;
      item.texture = result.texture;
      item.textureRect = result.rect;
      item.revision = result.revision;
      item.quality = item.gpu.quality;
      // Content can also arrive through another owner after this snapshot's
      // lease ended. Capture it, then immediately release those source pixels.
      if (active?.stack !== stack) item.gpu.freeze();
      return true;
    };
    const projector = (photo: Photo) => {
      const local = scene.layer.getLocalFrame();
      if (!imageTiles) {
        const prepared = surfaceGeometry.get(photo.record.id);
        if (!local || !prepared) return undefined;
        const sceneToMetric = prepared.referenceToMetric
          .clone()
          .multiply(local.currentToReference ?? new Matrix4());
        const metricToScene = sceneToMetric.clone().invert();
        preferredAxes.set(photo.record.id, {
          capturePosition: prepared.geometry.eye
            .clone()
            .applyMatrix4(metricToScene),
          preferredDirection: prepared.geometry.preferredDirection
            .clone()
            .transformDirection(metricToScene),
          sceneToMetric,
        });
        return prepared.geometry.projection.clone().multiply(sceneToMetric);
      }
      const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
      if (!local || !origin) return undefined;
      return imageProjectionMatrix(
        photo.record,
        photo.calibration,
        photo.pose,
        sceneToPhotoEnu(
          origin,
          local.sceneFromLocal,
          photo.pose,
          photo.altitude
        )
      );
    };
    const queueContent = (photoId: string) => {
      if (disposed) return;
      dirtyPhotos.add(photoId);
      if (contentTimer !== undefined || refreshingContent) return;
      contentTimer = setTimeout(() => {
        contentTimer = undefined;
        if (disposed) return;
        refreshingContent = true;
        const ids = new Set(dirtyPhotos);
        dirtyPhotos.clear();
        activeProgress?.();
        const pending = [...snapshots.values()].filter((item) =>
          ids.has(item.photo.record.id)
        );
        let index = 0,
          changed = false;
        const paint = () => {
          const started = performance.now();
          while (!disposed && index < pending.length) {
            const item = pending[index++];
            if (snapshots.get(item.key) !== item) continue;
            const stack = nativePixelPool.peek(sourceFor(item.photo));
            if (stack && updatePixels(item, stack)) changed = true;
            if (performance.now() - started >= 4 && index < pending.length) {
              contentTimer = setTimeout(() => {
                contentTimer = undefined;
                paint();
              }, 0);
              return;
            }
          }
          if (!disposed && changed) publish();
          refreshingContent = false;
          if (!disposed && dirtyPhotos.size)
            queueContent(dirtyPhotos.values().next().value!);
        };
        paint();
      }, 1000 / 30);
    };
    const syncContentSubscriptions = () => {
      const available = new Map(
        [...snapshots.values()].map((item) => [
          item.photo.record.id,
          item.photo,
        ])
      );
      for (const [photoId, subscription] of contentSubscriptions) {
        const photo = available.get(photoId);
        if (
          !photo ||
          nativePixelPool.peek(sourceFor(photo)) !== subscription.stack
        ) {
          subscription.unsubscribe();
          contentSubscriptions.delete(photoId);
        }
      }
      for (const [photoId, photo] of available) {
        const stack = nativePixelPool.peek(sourceFor(photo));
        if (
          !stack ||
          contentSubscriptions.get(photoId)?.stack === stack ||
          !stack.onContentChange
        )
          continue;
        contentSubscriptions.set(photoId, {
          stack,
          unsubscribe: stack.onContentChange(() => queueContent(photoId)),
        });
        queueContent(photoId);
      }
    };
    const projectNative = (projection: Matrix4, point: Vector3) => {
      const p = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(
        projection
      );
      return p.w > 0 && p.toArray().every(Number.isFinite)
        ? { x: p.x / p.w, y: p.y / p.w }
        : null;
    };
    const tileQuad = (
      photo: Photo,
      projection: Matrix4,
      plane: Plane,
      crop: ImageRect,
      originEye?: Vector3
    ) => {
      const points: Vector3[] = [];
      const eye =
        originEye ??
        imagePlanes.get(photo.record.id)?.geometry.eye ??
        geometries.get(photo.record.id)?.geometry.eye;
      if (!eye) return null;
      for (const [x, y] of [
        [crop.x, crop.y],
        [crop.x + crop.width, crop.y],
        [crop.x + crop.width, crop.y + crop.height],
        [crop.x, crop.y + crop.height],
      ]) {
        const ray = objectCoveragePixelRay(
          projection,
          eye,
          { x, y } as Parameters<typeof objectCoveragePixelRay>[2],
          photo.calibration
        );
        const point = ray?.intersectPlane(plane, new Vector3());
        if (!point || !point.toArray().every(Number.isFinite)) return null;
        points.push(point);
      }
      return points;
    };
    const updateTileView = (frame: SharedThreeSceneFrame) => {
      if (!tileRoot) return;
      lastTileFrame = frame;
      const clip = new Matrix4().multiplyMatrices(
        frame.renderCamera.projectionMatrix,
        frame.renderCamera.matrixWorldInverse
      );
      const local = scene.layer.getLocalFrame();
      const referenceToCurrent = local?.referenceToCurrent ?? new Matrix4();
      const currentToReference = local?.currentToReference ?? new Matrix4();
      const key =
        clip.elements.join(",") +
        `:${local?.revision}:${current.current.tileOrder}:${tileVersion}`;
      if (key === tileViewKey) return;
      tileViewKey = key;
      tileFrustum.setFromProjectionMatrix(clip);
      const referenceClip = clip.clone().multiply(referenceToCurrent);
      if (!scanlineRight) {
        const m = frame.renderCamera.matrixWorld.elements;
        scanlineRight = new Vector3(m[0], m[1], m[2]).transformDirection(
          currentToReference
        );
        scanlineUp = new Vector3(m[4], m[5], m[6]).transformDirection(
          currentToReference
        );
      }
      const centreRayNear = new Vector3(0, 0, -1).applyMatrix4(
        referenceClip.clone().invert()
      );
      const centreRayFar = new Vector3(0, 0, 1).applyMatrix4(
        referenceClip.clone().invert()
      );
      const centreRay = new Ray(
        centreRayNear,
        centreRayFar.sub(centreRayNear).normalize()
      );
      let centrePoint: Vector3 | undefined;
      let best = Infinity;
      centrePhotoId = undefined;
      for (const [photoId, plane] of imagePlanes) {
        const point = centreRay.intersectPlane(plane.plane, new Vector3());
        const score = point && scoreBestImageGeometry(plane.geometry, point);
        if (score && score.deviation < best) {
          best = score.deviation;
          centrePhotoId = photoId;
          centrePoint = point!.clone();
        }
      }
      const tiles = [...tileMeshes.values()];
      const centreTile = centrePoint;
      tiles.sort((a, b) =>
        current.current.tileOrder === "center-out"
          ? (a.item.photo.record.id === centrePhotoId ? 1 : 0) -
              (b.item.photo.record.id === centrePhotoId ? 1 : 0) ||
            (centreTile
              ? b.centroid.distanceToSquared(centreTile) -
                a.centroid.distanceToSquared(centreTile)
              : 0) ||
            a.item.key.localeCompare(b.item.key)
          : b.centroid.dot(scanlineUp!) - a.centroid.dot(scanlineUp!) ||
            a.centroid.dot(scanlineRight!) - b.centroid.dot(scanlineRight!) ||
            a.item.photo.record.id.localeCompare(b.item.photo.record.id) ||
            a.item.crop.y - b.item.crop.y ||
            a.item.crop.x - b.item.crop.x
      );
      tiles.forEach((tile, index) => {
        tile.mesh.renderOrder = 500 + index;
        tile.mesh.visible = tileFrustum.intersectsBox(
          tile.bounds.clone().applyMatrix4(referenceToCurrent)
        );
        tile.uniforms.carmaTilePhotoProjection.value
          .copy(tile.projectionReference)
          .multiply(currentToReference);
      });
    };
    const publishTilePlanes = () => {
      if (!tileRoot || tileGeometryTimer) return;
      const pending = [...snapshots.values()].filter((item) =>
        imagePlanes.has(item.photo.record.id)
      );
      let index = 0;
      const paint = () => {
        tileGeometryTimer = undefined;
        const started = performance.now();
        while (!disposed && index < pending.length) {
          const item = pending[index++],
            plane = imagePlanes.get(item.photo.record.id);
          if (!plane || snapshots.get(item.key) !== item) continue;
          let tile = tileMeshes.get(item.key);
          if (tile && tile.plane !== plane) {
            tileRoot.remove(tile.mesh);
            tile.mesh.geometry.dispose();
            tile.mesh.material.dispose();
            tileMeshes.delete(item.key);
            tile = undefined;
          }
          if (!tile) {
            const points = tileQuad(
              item.photo,
              plane.projection,
              plane.plane,
              item.crop
            );
            if (!points) continue;
            const quad = points;
            if (tileMeshes.size >= TILE_PLANE_LIMIT) {
              const retired =
                [...tileMeshes.values()].find((entry) => !entry.mesh.visible) ??
                [...tileMeshes.values()].sort(
                  (a, b) => a.item.priority - b.item.priority
                )[0];
              if (
                !retired ||
                (retired.mesh.visible && retired.item.priority >= item.priority)
              )
                continue;
              tileRoot.remove(retired.mesh);
              retired.mesh.geometry.dispose();
              retired.mesh.material.dispose();
              tileMeshes.delete(retired.item.key);
            }
            const geometry = new BufferGeometry();
            geometry.setAttribute(
              "position",
              new Float32BufferAttribute(
                quad.flatMap((point) => point.toArray()),
                3
              )
            );
            geometry.setIndex([0, 1, 2, 0, 2, 3]);
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            const uniforms = {
              carmaTilePhotoProjection: { value: plane.projection.clone() },
              carmaTileTextureWindow: { value: new Vector4() },
              carmaTileCropBounds: { value: new Vector4() },
            };
            const material = new MeshBasicMaterial({
              map: item.texture,
              side: DoubleSide,
              transparent: true,
              depthTest: false,
              depthWrite: false,
              toneMapped: false,
            });
            material.customProgramCacheKey = () =>
              "carma-native-photo-tile-plane-v1";
            material.onBeforeCompile = (shader) => {
              Object.assign(shader.uniforms, uniforms);
              shader.vertexShader = shader.vertexShader
                .replace(
                  "#include <common>",
                  "#include <common>\nvarying vec3 carmaTilePosition;"
                )
                .replace(
                  "#include <project_vertex>",
                  "#include <project_vertex>\ncarmaTilePosition=(modelMatrix*vec4(transformed,1.0)).xyz;"
                );
              shader.fragmentShader = shader.fragmentShader
                .replace(
                  "#include <common>",
                  "#include <common>\nvarying vec3 carmaTilePosition; uniform mat4 carmaTilePhotoProjection; uniform vec4 carmaTileTextureWindow; uniform vec4 carmaTileCropBounds;"
                )
                .replace(
                  "#include <map_fragment>",
                  `#ifdef USE_MAP
                vec4 carmaTileP=carmaTilePhotoProjection*vec4(carmaTilePosition,1.0);
                if(carmaTileP.w<=0.0)discard;
                vec2 carmaTileUv=carmaTileP.xy/carmaTileP.w;
                if(any(lessThan(carmaTileUv,carmaTileCropBounds.xy))||any(greaterThan(carmaTileUv,carmaTileCropBounds.zw)))discard;
                vec2 carmaTileTexUv=(carmaTileUv-carmaTileTextureWindow.xy)/carmaTileTextureWindow.zw;
                diffuseColor*=texture2D(map,carmaTileTexUv);
              #endif`
                );
            };
            const mesh = new Mesh(geometry, material);
            mesh.name = `native-photo-tile:${item.key}`;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            tileRoot.add(mesh);
            tile = {
              mesh,
              item,
              plane,
              bounds: geometry.boundingBox!.clone(),
              centroid: geometry.boundingBox!.getCenter(new Vector3()),
              projectionReference: plane.projectionReference.clone(),
              uniforms,
            };
            tileMeshes.set(item.key, tile);
            tileVersion++;
          }
          tile.projectionReference.copy(plane.projectionReference);
          const textureRect = item.textureRect ?? item.crop,
            native = item.photo.calibration;
          tile.uniforms.carmaTileTextureWindow.value.set(
            textureRect.x / native.widthPx,
            1 - (textureRect.y + textureRect.height) / native.heightPx,
            textureRect.width / native.widthPx,
            textureRect.height / native.heightPx
          );
          tile.uniforms.carmaTileCropBounds.value.set(
            item.crop.x / native.widthPx,
            1 - (item.crop.y + item.crop.height) / native.heightPx,
            (item.crop.x + item.crop.width) / native.widthPx,
            1 - item.crop.y / native.heightPx
          );
          if (
            tile.mesh.material.map !== item.texture ||
            tile.revision !== item.revision
          ) {
            const textureChanged = tile.mesh.material.map !== item.texture;
            tile.mesh.material.map = item.texture;
            if (textureChanged) tile.mesh.material.needsUpdate = true;
            tile.revision = item.revision;
            tileVersion++;
          }
          if (performance.now() - started >= 4 && index < pending.length) {
            tileGeometryTimer = setTimeout(paint, 0);
            return;
          }
        }
        if (lastTileFrame) updateTileView(lastTileFrame);
        syncContentSubscriptions();
        notifySharedThreeSceneContentChanged(map);
        map.triggerRepaint();
      };
      paint();
    };
    if (tileRoot) {
      tileRoot.name = "oblique-native-image-tile-planes";
      const origin = scene.layer.getLocalFrame()?.referenceLngLat ??
        scene.layer.projectSceneToLngLat([0, 0, 0]) ?? [0, 0];
      const runtime: SharedThreeSceneRuntime = {
        id: `${id}-tiles`,
        originLngLat: [origin[0], origin[1]],
        root: tileRoot,
        mountsOnLocalFrame: true,
        providesTerrain: false,
        receivesScreenImages: false,
        receivesMapStyleTexture: false,
        mapStyleProjectionVersion: () => tileVersion,
        update: updateTileView,
        dispose: () => {
          for (const tile of tileMeshes.values()) {
            tile.mesh.geometry.dispose();
            tile.mesh.material.dispose();
          }
          tileMeshes.clear();
          tileRoot.clear();
        },
      };
      scene.layer.addRuntime(runtime);
    }
    const planImageTiles = async (
      photos: Parameters<typeof planPhotoMosaic>[0]["photos"],
      camera: Matrix4,
      size: { width: number; height: number },
      valid: () => boolean
    ): Promise<PhotoMosaicPlan[]> => {
      const local = scene.layer.getLocalFrame();
      const referenceToCurrent = local?.referenceToCurrent ?? new Matrix4();
      const currentToReference = local?.currentToReference ?? new Matrix4();
      const referenceCamera = camera.clone().multiply(referenceToCurrent);
      const frustum = new Frustum().setFromProjectionMatrix(referenceCamera);
      const centreNear = new Vector3(0, 0, -1).applyMatrix4(
        referenceCamera.clone().invert()
      );
      const centreFar = new Vector3(0, 0, 1).applyMatrix4(
        referenceCamera.clone().invert()
      );
      const centreRay = new Ray(
        centreNear,
        centreFar.sub(centreNear).normalize()
      );
      const visible: {
        photo: Photo;
        visible: ImageRect;
        density: number;
        priority: number;
      }[] = [];
      const clipQuad = (quad: Vector3[]) => {
        let polygon = quad;
        for (const boundary of frustum.planes) {
          const output: Vector3[] = [];
          for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i],
              b = polygon[(i + 1) % polygon.length],
              da = boundary.distanceToPoint(a),
              db = boundary.distanceToPoint(b);
            if (da >= 0) output.push(a);
            if (da >= 0 !== db >= 0)
              output.push(a.clone().lerp(b, da / (da - db)));
          }
          polygon = output;
          if (!polygon.length) break;
        }
        return polygon;
      };
      let started = performance.now();
      for (const entry of photos) {
        if (performance.now() - started >= 4) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          started = performance.now();
        }
        if (!valid()) return [];
        const cached = geometries.get(entry.id);
        if (!cached) continue;
        const photo = cached.photo;
        const referenceGeometry: BestImageGeometry = {
          ...cached.geometry,
          projection: entry.projection.clone().multiply(referenceToCurrent),
          eye: cached.geometry.eye.clone().applyMatrix4(currentToReference),
          preferredDirection: cached.geometry.preferredDirection
            .clone()
            .transformDirection(currentToReference),
        };
        const direction = (
          current.current.seriesDirection
            ? cached.geometry.preferredDirection
            : cached.axisDirection
        )
          .clone()
          .transformDirection(currentToReference);
        const ground = cached.groundPoint
          .clone()
          .applyMatrix4(currentToReference);
        const down = ground.clone().sub(referenceGeometry.eye).normalize();
        const groundPlane = new Plane().setFromNormalAndCoplanarPoint(
          down,
          ground
        );
        const anchor = new Ray(referenceGeometry.eye, direction).intersectPlane(
          groundPlane,
          new Vector3()
        );
        if (!anchor) continue;
        let plane = imagePlanes.get(entry.id);
        const planePreferenceKey = current.current.seriesDirection
          ? cached.preferenceKey
          : "optical-axis";
        const changedReference =
          !plane ||
          plane.preferenceKey !== planePreferenceKey ||
          plane.photo.record !== photo.record ||
          plane.photo.calibration !== photo.calibration ||
          plane.photo.pose !== photo.pose ||
          plane.photo.altitude !== photo.altitude;
        if (changedReference || plane?.frameKey !== cached.frameKey) {
          const normalPlane = new Plane().setFromNormalAndCoplanarPoint(
            direction,
            anchor
          );
          const quad = tileQuad(
            photo,
            referenceGeometry.projection,
            normalPlane,
            {
              x: 0,
              y: 0,
              width: photo.calibration.widthPx,
              height: photo.calibration.heightPx,
            } as ImageRect,
            referenceGeometry.eye
          );
          if (!quad) continue;
          const nextPlane = {
            photo,
            plane: normalPlane,
            quad,
            projection: referenceGeometry.projection,
            projectionReference: referenceGeometry.projection,
            frameKey: cached.frameKey,
            preferenceKey: planePreferenceKey,
            geometry: referenceGeometry,
          };
          if (plane && !changedReference) Object.assign(plane, nextPlane);
          else plane = nextPlane;
          imagePlanes.set(entry.id, plane);
        }
        if (!plane) continue;
        plane.geometry = referenceGeometry;
        const polygon = clipQuad(plane.quad);
        if (!polygon.length) continue;
        const uvs = polygon.map((point) =>
          projectNative(plane.projection, point)
        );
        if (uvs.some((point) => !point)) continue;
        const left = Math.max(
            0,
            Math.min(...uvs.map((point) => point!.x)) *
              photo.calibration.widthPx
          ),
          right = Math.min(
            photo.calibration.widthPx,
            Math.max(...uvs.map((point) => point!.x)) *
              photo.calibration.widthPx
          ),
          top = Math.max(
            0,
            (1 - Math.max(...uvs.map((point) => point!.y))) *
              photo.calibration.heightPx
          ),
          bottom = Math.min(
            photo.calibration.heightPx,
            (1 - Math.min(...uvs.map((point) => point!.y))) *
              photo.calibration.heightPx
          );
        if (!(right > left && bottom > top)) continue;
        let density = 0;
        const screen = (point: Vector3) => {
          const p = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(
            referenceCamera
          );
          return p.w > 0
            ? new Vector3(
                ((p.x / p.w) * size.width) / 2,
                ((p.y / p.w) * size.height) / 2,
                0
              )
            : null;
        };
        for (const point of polygon) {
          const uv = projectNative(plane.projection, point)!,
            base = screen(point);
          if (!base) continue;
          const pixel = (u: number, v: number) =>
            objectCoveragePixelRay(
              plane.projection,
              plane.geometry.eye,
              {
                x: u * photo.calibration.widthPx,
                y: (1 - v) * photo.calibration.heightPx,
              } as Parameters<typeof objectCoveragePixelRay>[2],
              photo.calibration
            )?.intersectPlane(plane!.plane, new Vector3());
          const dx = pixel(uv.x + 1 / photo.calibration.widthPx, uv.y),
            dy = pixel(uv.x, uv.y - 1 / photo.calibration.heightPx);
          const sx = dx && screen(dx),
            sy = dy && screen(dy);
          if (!sx || !sy) continue;
          sx.sub(base);
          sy.sub(base);
          const sum = sx.lengthSq() + sy.lengthSq(),
            det = sx.x * sy.y - sy.x * sx.y;
          density = Math.max(
            density,
            Math.sqrt(
              (sum + Math.sqrt(Math.max(0, sum * sum - 4 * det * det))) / 2
            )
          );
        }
        if (!(density > 0 && Number.isFinite(density))) continue;
        const centre = centreRay.intersectPlane(plane.plane, new Vector3());
        const rank = centre && scoreBestImageGeometry(plane.geometry, centre);
        visible.push({
          photo,
          visible: {
            x: left,
            y: top,
            width: right - left,
            height: bottom - top,
          } as ImageRect,
          density,
          priority: rank ? 1 - rank.deviation : 0,
        });
      }
      // Each source remains eligible; only a proven stronger fully-admitting
      // camera may exclude a whole tile. This is conservative zone admission.
      const cosineBounds = (geometry: BestImageGeometry, box: Box3) => {
        const sphere = box.getBoundingSphere(new Sphere()),
          d = sphere.center.clone().sub(geometry.eye),
          distance = d.length();
        if (!(distance > sphere.radius)) return { min: -1, max: 1 };
        const cosine = Math.max(
            -1,
            Math.min(1, d.dot(geometry.preferredDirection) / distance)
          ),
          theta = Math.acos(cosine),
          delta = Math.asin(Math.min(1, sphere.radius / distance));
        return {
          min: Math.cos(Math.min(Math.PI, theta + delta)),
          max: Math.cos(Math.max(0, theta - delta)),
        };
      };
      const coversBox = (geometry: BestImageGeometry, box: Box3) => {
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              const uv = projectNative(
                geometry.projection,
                new Vector3(x, y, z)
              );
              if (
                !uv ||
                uv.x < 1e-8 ||
                uv.y < 1e-8 ||
                uv.x > 1 - 1e-8 ||
                uv.y > 1 - 1e-8
              )
                return false;
            }
        return true;
      };
      const plans: PhotoMosaicPlan[] = [];
      for (const entry of visible) {
        if (!valid()) return [];
        const source = sourceFor(entry.photo);
        let stack = nativePixelPool.peek(source),
          lease: ActiveDemand | undefined;
        try {
          if (!stack?.pyramid?.levels?.length) {
            lease = acquireDemand(source);
            stack = await metadata(lease, valid);
          }
          if (!valid()) return [];
          const pyramid = stack.pyramid;
          if (!pyramid?.levels.length) continue;
          const native = pyramid.native;
          const level = targetLevel(
            pyramid.levels,
            native,
            Math.min(1, entry.density),
            1
          );
          if (!level) continue;
          const scale = levelToNative(level, native);
          const rasterDensity = Math.min(1, Math.max(1 / scale.x, 1 / scale.y));
          const range = tileRangeFor(level, native, entry.visible);
          const patches: PhotoMosaicPlan["patches"][number][] = [];
          const own = geometries.get(entry.photo.record.id)!,
            plane = imagePlanes.get(entry.photo.record.id)!;
          for (let row = range.row0; row < range.row1; row++) {
            for (let col = range.col0; col < range.col1; col++) {
              if (performance.now() - started >= 4) {
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                started = performance.now();
              }
              if (!valid()) return [];
              const crop = imageTileRect(level, native, col, row);
              if (!(crop.width > 0 && crop.height > 0)) continue;
              const points = tileQuad(
                entry.photo,
                plane.projection,
                plane.plane,
                crop,
                plane.geometry.eye
              );
              if (!points) continue;
              const visiblePoints = clipQuad(points);
              if (!visiblePoints.length) continue;
              const box = new Box3().setFromPoints(visiblePoints);
              const ownMax = cosineBounds(plane.geometry, box).max;
              let excluded = false;
              for (const other of visible) {
                if (other.photo.record.id === entry.photo.record.id) continue;
                if (failedPhotos.has(other.photo.record.id)) continue;
                const competitor = imagePlanes.get(
                  other.photo.record.id
                )!.geometry;
                if (
                  coversBox(competitor, box) &&
                  cosineBounds(competitor, box).min > ownMax + 1e-6
                ) {
                  excluded = true;
                  break;
                }
              }
              if (!excluded)
                patches.push({
                  ...crop,
                  density: rasterDensity as Ratio,
                  requiredDensity: entry.density,
                });
            }
          }
          if (patches.length)
            plans.push({
              id: entry.photo.record.id,
              view: {
                visible: entry.visible,
                density: rasterDensity as Ratio,
              },
              patches,
              priority: entry.priority,
              coverage: [],
              requiredDensity: entry.density,
              nativeLimited: entry.density > 1,
            });
        } catch (error) {
          if (!valid()) throw error;
          failedPhotos.add(entry.photo.record.id);
          surfaceDirty = true;
          map.triggerRepaint();
        } finally {
          lease?.release();
          if (active === lease) active = undefined;
        }
      }
      const ids = new Set(visible.map((entry) => entry.photo.record.id));
      for (const id of imagePlanes.keys())
        if (!ids.has(id)) imagePlanes.delete(id);
      return plans;
    };
    const publish = () => {
      if (imageTiles) {
        publishTilePlanes();
        return;
      }
      const projections = new Map<string, Matrix4 | undefined>();
      const projectOnce = (photo: Photo) => {
        if (!projections.has(photo.record.id))
          projections.set(photo.record.id, projector(photo));
        return projections.get(photo.record.id)?.clone();
      };
      const entries: MapStylePhotoMosaicEntry[] = [
        ...snapshots.values(),
      ].flatMap((item) => {
        const projection = projectOnce(item.photo);
        if (!projection) return [];
        const sourceProjection = projection.clone();
        const crop = item.textureRect ?? item.crop,
          native = item.photo.calibration;
        projection.premultiply(
          new Matrix4().set(
            native.widthPx / crop.width,
            0,
            0,
            -crop.x / crop.width,
            0,
            native.heightPx / crop.height,
            0,
            1 - (native.heightPx - crop.y) / crop.height,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            1
          )
        );
        const axis = preferredAxes.get(item.photo.record.id);
        const entry: MapStylePhotoMosaicEntry & {
          preferredDirection?: Vector3;
        } = {
          texture: item.texture,
          textureRevision: item.revision,
          textureBounds:
            item.gpu && item.textureRect
              ? mosaicTextureBounds(item.crop, item.textureRect)
              : undefined,
          sceneToTexture: projection,
          sourceProjection,
          capturePosition: axis?.capturePosition,
          preferredDirection: axis?.preferredDirection,
          sceneToMetric: axis?.sceneToMetric,
          opacity: 1,
          priority: item.priority * 2 + (1 + Math.min(1, item.density) * 0.5),
        };
        return [entry];
      });
      scene.layer.setMapStylePhotoMosaic?.(id, entries.length ? entries : null);
      syncContentSubscriptions();
      map.triggerRepaint();
    };
    const sourceFor = (photo: Photo) =>
      nativePreviewSource({
        imageId: photo.record.sourceId,
        path: photo.dataset.previewPath,
        sourceUrl: originalOf(photo) ?? pyramidOf(photo) ?? "",
        ...pyramidOptionsOf(photo),
        avifOnly: photo.dataset.avifOnly,
        nativeSize: {
          width: photo.calibration.widthPx as DevicePixels,
          height: photo.calibration.heightPx as DevicePixels,
        },
        minimumQualityLevel: photo.dataset.minimumPreviewQualityLevel,
      });
    const makeRoom = (incomingBytes: number, wanted: ReadonlySet<string>) => {
      // Frozen stale ROIs may be released under pressure. Refinement of a
      // wanted ROI reuses its existing GPU snapshot, without a whole-photo base.
      const stale = [...snapshots.values()]
        .filter((item) => !wanted.has(item.key))
        .sort((a, b) => a.priority - b.priority);
      for (const item of stale) {
        if (detailBytes() + incomingBytes <= DETAIL_BYTES) break;
        snapshots.delete(item.key);
        drop(item);
      }
      publish();
      return detailBytes() + incomingBytes <= DETAIL_BYTES;
    };
    const cancel = () => {
      generation++;
      abortWait?.();
      abortWait = undefined;
      activeProgress = undefined;
      releaseGeometryPriority?.();
      releaseGeometryPriority = undefined;
      if (active?.stack) freezeStack(active.stack);
      active?.release();
      active = undefined;
    };
    const acquireDemand = (
      source: ReturnType<typeof sourceFor>
    ): ActiveDemand => {
      const query = nativePixelPool.acquireDemand(source, {
        priority: "high",
        strictROI: !imageTiles,
      });
      const demand: ActiveDemand = { query, release: query.release };
      active = demand;
      return demand;
    };
    const metadata = (demand: ActiveDemand, valid: () => boolean) =>
      new Promise<ImageLevelStack>((resolve, reject) => {
        let done = false;
        const finish = (error?: unknown, stack?: ImageLevelStack) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          if (abortWait === abort) abortWait = undefined;
          if (error) reject(error);
          else {
            demand.stack = stack!;
            resolve(stack!);
          }
        };
        const abort = () => finish(new Error("Mosaic metadata superseded"));
        const timeout = setTimeout(
          () => finish(new Error("Mosaic metadata timeout")),
          15000
        );
        abortWait = abort;
        demand.query.ready.then((stack) => finish(undefined, stack), finish);
        if (!valid()) abort();
      });
    const waitReady = (lease: ActiveDemand, epoch: number) =>
      new Promise<void>((resolve, reject) => {
        let done = false;
        let unsubscribe = () => {};
        const finish = (error?: Error) => {
          if (done) return;
          done = true;
          clearTimeout(timeout);
          unsubscribe();
          if (abortWait === abort) abortWait = undefined;
          error ? reject(error) : resolve();
        };
        const abort = () => finish(new Error("Mosaic preparation superseded"));
        const timeout = setTimeout(
          () => finish(new Error("Mosaic region timeout")),
          15000
        );
        const check = () => {
          if (disposed || epoch !== generation) abort();
          else if (lease.stack?.error)
            finish(new Error(String(lease.stack.error)));
          else if (lease.query.visibleReady) finish();
        };
        abortWait = abort;
        unsubscribe = lease.stack!.subscribe(check);
        if (done) unsubscribe();
        check();
      });
    const run = async () => {
      const epoch = generation,
        camera = clip?.clone(),
        size = { ...pixels };
      if (!camera || !size.width || !size.height) return;
      const seriesDirection = current.current.seriesDirection ?? false;
      const selectionData = current.current.selectionData;
      const explicitPitch = current.current.preferredPitchDeg;
      const referenceEpoch = referenceDataEpoch;
      const localFrame = scene.layer.getLocalFrame();
      if (!localFrame) return;
      const localRevision = localFrame.revision;
      const identity = new Matrix4();
      const sceneFromLocal = localFrame.sceneFromLocal.clone();
      const referenceToCurrent =
        localFrame.referenceToCurrent?.clone() ?? new Matrix4();
      const sameFrame = () => {
        const next = scene.layer.getLocalFrame();
        return (
          !!next &&
          next.revision === localRevision &&
          next.sceneFromLocal.equals(sceneFromLocal) &&
          (next.referenceToCurrent ?? identity).equals(referenceToCurrent)
        );
      };
      const valid = () =>
        !disposed &&
        generation === epoch &&
        sameFrame() &&
        referenceDataEpoch === referenceEpoch &&
        current.current.selectionData === selectionData &&
        (current.current.seriesDirection ?? false) === seriesDirection &&
        (!seriesDirection ||
          (current.current.selectionData === selectionData &&
            current.current.preferredPitchDeg === explicitPitch));
      const samplingKey = [
        ...camera.elements,
        size.width,
        size.height,
        scene.layer.getLocalFrame()?.revision ?? 0,
        surfaceRevision,
      ].join(",");
      const sampled = imageTiles
        ? ({
            samples: [],
            sampleScreen: [],
            centerSampleIndex: -1,
            cols: 0,
            rows: 0,
            sampleRadiusPixels: 0,
          } as VisibleSurfaceSamples)
        : sampledCache?.key === samplingKey
        ? sampledCache.value
        : await sampleVisibleSurface({
            clip: camera,
            displayCamera: scene.layer.getDisplayCamera?.(),
            pixels: size,
            projectEye: (point) => scene.layer.projectSceneToLngLat(point),
            intersectSurface: (ray, eye) =>
              current.current.intersectSurface(ray, eye),
            isCurrent: valid,
          });
      if (!sampled || !valid()) return;
      sampledCache = { key: samplingKey, value: sampled };
      const { samples, sampleScreen, centerSampleIndex, cols, rows } = sampled;
      const records = current.current.readRecords();
      let field: PreparedBestImageField | undefined;
      let sampleOwners: readonly (string | null)[] | undefined;
      let selectedRecords = records;
      if (!imageTiles) {
        field = await readPicker()?.prepareBestField(records, {
          preferredPitchDeg: current.current.preferredPitchDeg ?? undefined,
          isCurrent: valid,
        });
        if (!field || !valid()) return;
        const winners = await field.cache.resolveSamples(
          samples.map(({ point }) =>
            point.clone().applyMatrix4(field!.sceneToMetric)
          ),
          {
            eligibleIds: new Set(
              [...field.eligibleIds].filter((id) => !failedPhotos.has(id))
            ),
          }
        );
        if (!winners || !valid()) return;
        sampleOwners = winners.map((winner) => winner?.id ?? null);
        const winnerIds = new Set(sampleOwners);
        selectedRecords = records.filter((record) => winnerIds.has(record.id));
        const referenceToMetric = field.sceneToMetric
          .clone()
          .multiply(referenceToCurrent);
        for (const { record, geometry } of field.entries)
          if (winnerIds.has(record.id))
            surfaceGeometry.set(record.id, { geometry, referenceToMetric });
      }
      const prepared: Photo[] = [];
      let photoSliceStarted = performance.now();
      for (const record of selectedRecords) {
        if (performance.now() - photoSliceStarted >= 4) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          photoSliceStarted = performance.now();
        }
        if (!valid()) return;
        if (
          current.current.selectionData?.datasets?.get(record.seriesId)
            ?.cameras?.[record.cameraId]?.view === "nadir"
        )
          continue;
        let promise = photos.get(record.id);
        if (!promise) {
          promise = current.current.resolvePhoto(record);
          photos.set(record.id, promise);
        }
        try {
          const photo = await promise;
          if (photo.calibration.view !== "nadir") prepared.push(photo);
        } catch {
          /* An unavailable pose cannot be projected. */
        }
      }
      if (!valid()) return;
      const byId = new Map(prepared.map((photo) => [photo.record.id, photo]));
      const preferredPitch =
        current.current.preferredPitchDeg ?? map.getPitch?.() ?? null;
      preferredAxes.clear();
      const mosaicPhotos: Parameters<
        typeof planPhotoMosaic
      >[0]["photos"][number][] = [];
      const frame = scene.layer.getLocalFrame();
      const origin = scene.layer.projectSceneToLngLat([0, 0, 0]);
      if (!frame || !origin) return;
      const geometryFrameKey = [
        frame.revision ?? "",
        ...frame.sceneFromLocal.elements,
        ...origin,
      ].join(",");
      let geometrySliceStarted = performance.now();
      for (const photo of prepared) {
        if (performance.now() - geometrySliceStarted >= 4) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          geometrySliceStarted = performance.now();
        }
        if (!valid()) return;
        if (failedPhotos.has(photo.record.id)) continue;
        if (field) {
          const metric = surfaceGeometry.get(photo.record.id)?.geometry;
          if (!metric) continue;
          const metricToScene = field.sceneToMetric.clone().invert();
          const geometry: BestImageGeometry = {
            ...metric,
            projection: metric.projection.clone().multiply(field.sceneToMetric),
            eye: metric.eye.clone().applyMatrix4(metricToScene),
            preferredDirection: metric.preferredDirection
              .clone()
              .transformDirection(metricToScene),
          };
          preferredAxes.set(photo.record.id, {
            capturePosition: geometry.eye,
            preferredDirection: geometry.preferredDirection,
            sceneToMetric: field.sceneToMetric,
          });
          mosaicPhotos.push({
            id: photo.record.id,
            projection: geometry.projection,
            width: photo.calibration.widthPx,
            height: photo.calibration.heightPx,
            geometry,
          });
          continue;
        }
        const reference = seriesDirection
          ? selectionData &&
            getMeanPhotoReference(selectionData, photo.record, explicitPitch)
          : {
              pitchDeg: preferredPitch as Degrees | null,
              headingDeg: undefined,
            };
        const preferenceKey = `${seriesDirection}:${
          reference?.pitchDeg ?? "optical-axis"
        }:${reference?.headingDeg}:${
          seriesDirection ? "mean" : current.current.centerY
        }`;
        let cached = geometries.get(photo.record.id);
        if (
          !cached ||
          cached.photo.record !== photo.record ||
          cached.photo.calibration !== photo.calibration ||
          cached.photo.pose !== photo.pose ||
          cached.photo.altitude !== photo.altitude ||
          cached.frameKey !== geometryFrameKey ||
          cached.preferenceKey !== preferenceKey
        ) {
          const sceneToPhoto = sceneToPhotoEnu(
            origin,
            frame.sceneFromLocal,
            photo.pose,
            photo.altitude
          );
          const projection = imageProjectionMatrix(
            photo.record,
            photo.calibration,
            photo.pose,
            sceneToPhoto
          );
          const rayOptions = {
            projection,
            sceneToPhoto,
            calibration: photo.calibration,
          };
          const rays = !reference
            ? photoCenterRays({ ...rayOptions, centerY: 0.5 })
            : reference.pitchDeg === null
            ? photoCenterRays({
                ...rayOptions,
                centerY: current.current.centerY,
              })
            : photoReferenceRays(rayOptions, {
                pitchDeg: reference.pitchDeg,
                headingDeg: reference.headingDeg,
              });
          if (!rays.preferred) continue;
          cached = {
            photo,
            frameKey: geometryFrameKey,
            preferenceKey,
            geometry: {
              projection,
              eye: rays.eye,
              preferredDirection: rays.preferred.direction,
              centerY: photoCenterRayUv(projection, rays.preferred)?.y,
            },
            axisDirection:
              rays.axis?.direction.clone() ?? rays.preferred.direction.clone(),
            groundPoint: new Vector3(
              0,
              0,
              (photo.record.catalogCenter?.heightMeters ??
                photo.dataset.referenceGroundHeightMeters ??
                0) - photo.altitude
            ).applyMatrix4(sceneToPhoto.clone().invert()),
            sceneToMetric: frame.sceneFromLocal.clone().invert(),
          };
          geometries.set(photo.record.id, cached);
        }
        const { geometry } = cached;
        const projection = geometry.projection;
        preferredAxes.set(photo.record.id, {
          capturePosition: geometry.eye,
          preferredDirection: geometry.preferredDirection,
          sceneToMetric: cached.sceneToMetric,
        });
        mosaicPhotos.push({
          id: photo.record.id,
          projection,
          width: photo.calibration.widthPx,
          height: photo.calibration.heightPx,
          geometry,
        });
      }
      let plan = imageTiles
        ? await planImageTiles(mosaicPhotos, camera, size, valid)
        : await planPhotoMosaicCooperatively(
            {
              photos: mosaicPhotos,
              samples,
              centerSampleIndex,
              centerY: current.current.centerY,
              sampleRadiusPixels: sampled.sampleRadiusPixels,
              sampleOwners,
            },
            valid
          );
      if (!valid()) return;
      retention?.update({
        maxImages: plan.length,
        maxParkedBytes: Math.min(
          256 * 1024 * 1024,
          Math.max(64 * 1024 * 1024, size.width * size.height * 32)
        ),
      });
      const wanted = new Set<string>();
      const jobs: {
        key: string;
        photo: Photo;
        crop: ImageRect;
        density: number;
        priority: number;
        distance: number;
        pixelError: number;
        focusDistance: number;
      }[] = [];
      let nativeLimited = false;
      const tileFocusInverse = imageTiles
        ? camera
            .clone()
            .multiply(
              scene.layer.getLocalFrame()?.referenceToCurrent ?? new Matrix4()
            )
            .invert()
        : null;
      const tileFocusNear = tileFocusInverse
        ? new Vector3(0, 0, -1).applyMatrix4(tileFocusInverse)
        : null;
      const tileFocusRay =
        tileFocusNear && tileFocusInverse
          ? new Ray(
              tileFocusNear,
              new Vector3(0, 0, 1)
                .applyMatrix4(tileFocusInverse)
                .sub(tileFocusNear)
                .normalize()
            )
          : null;
      for (const entry of plan) {
        const photo = byId.get(entry.id)!;
        if (imageTiles) {
          const plane = imagePlanes.get(photo.record.id);
          const centreHit =
            plane && tileFocusRay?.intersectPlane(plane.plane, new Vector3());
          const centreUv =
            centreHit && plane && projectNative(plane.projection, centreHit);
          for (const roi of entry.patches) {
            const crop = {
              x: roi.x,
              y: roi.y,
              width: roi.width,
              height: roi.height,
            } as ImageRect;
            const density = roi.density;
            const key = `${entry.id}:tile:${crop.x}:${crop.y}:${crop.width}:${crop.height}:${density}`;
            if (wanted.has(key)) continue;
            wanted.add(key);
            const cached = snapshots.get(key);
            if (cached) cached.priority = entry.priority;
            if (!cached || cached.complete === false)
              jobs.push({
                key,
                photo,
                crop,
                density,
                priority: entry.priority,
                distance: centreUv
                  ? Math.hypot(
                      (crop.x + crop.width / 2) / photo.calibration.widthPx -
                        centreUv.x,
                      (crop.y + crop.height / 2) / photo.calibration.heightPx -
                        (1 - centreUv.y)
                    )
                  : Infinity,
                pixelError: 1,
                focusDistance: 0,
              });
          }
          continue;
        }
        for (const [patchIndex, roi] of entry.patches.entries()) {
          const screen = sampleScreen[entry.coverage[patchIndex]];
          // Preserve one-pixel detail around the screen centre; the nearest
          // possible point of the sampled cell sets its peripheral error.
          const foveated = viewportFoveatedTarget({
            density: roi.requiredDensity ?? roi.density,
            point: screen,
            viewport: size,
            cellRadiusPixels: sampled.sampleRadiusPixels,
          });
          nativeLimited ||=
            (roi.requiredDensity ?? roi.density) / foveated.pixelError > 1;
          const density = Math.min(
            1,
            2 ** Math.ceil(Math.log2(foveated.density))
          );
          if (!(density > 0)) continue;
          const step = TILE_PIXELS / density;
          const distance = screen
            ? Math.hypot(screen.x - size.width / 2, screen.y - size.height / 2)
            : Infinity;
          for (
            let y = Math.floor(roi.y / step) * step;
            y < roi.y + roi.height;
            y += step
          ) {
            for (
              let x = Math.floor(roi.x / step) * step;
              x < roi.x + roi.width;
              x += step
            ) {
              // Fetch only this sampled ROI's intersection with the tile, plus
              // one output texel for filtering, rather than its full grid box.
              const left = Math.max(
                0,
                Math.floor(Math.max(x, roi.x) * density - 1) / density
              );
              const top = Math.max(
                0,
                Math.floor(Math.max(y, roi.y) * density - 1) / density
              );
              const right = Math.min(
                photo.calibration.widthPx,
                Math.ceil(Math.min(x + step, roi.x + roi.width) * density + 1) /
                  density
              );
              const bottom = Math.min(
                photo.calibration.heightPx,
                Math.ceil(
                  Math.min(y + step, roi.y + roi.height) * density + 1
                ) / density
              );
              const crop = {
                x: left,
                y: top,
                width: right - left,
                height: bottom - top,
              } as ImageRect;
              const key = `${entry.id}:${density}:${left}:${top}:${right}:${bottom}`;
              if (wanted.has(key)) continue;
              wanted.add(key);
              const cached = snapshots.get(key);
              if (cached) cached.priority = entry.priority;
              if (!cached || cached.complete === false)
                jobs.push({
                  key,
                  photo,
                  crop,
                  density,
                  priority: entry.priority,
                  distance,
                  pixelError: foveated.pixelError,
                  focusDistance: foveated.focusDistance,
                });
            }
          }
        }
      }
      // Fetch central pixels first across all contributing photos. Layering
      // remains independently ordered by the photo-centre rank.
      jobs.sort(
        imageTiles
          ? (a, b) =>
              current.current.tileOrder === "center-out"
                ? b.priority - a.priority ||
                  a.photo.record.id.localeCompare(b.photo.record.id) ||
                  a.crop.y - b.crop.y ||
                  a.crop.x - b.crop.x
                : a.photo.pose.latitude - b.photo.pose.latitude ||
                  a.photo.pose.longitude - b.photo.pose.longitude ||
                  a.photo.record.id.localeCompare(b.photo.record.id) ||
                  a.crop.y - b.crop.y ||
                  a.crop.x - b.crop.x
          : (a, b) =>
              a.pixelError - b.pixelError ||
              a.distance - b.distance ||
              b.priority - a.priority
      );
      // Drop out-of-neighbourhood photos, but retain old regions of still-visible photos until replacements are complete.
      const relevant = new Set(records.map((record) => record.id));
      const planned = new Map(plan.map((entry) => [entry.id, entry]));
      for (const [key, item] of snapshots) {
        const entry = planned.get(item.photo.record.id);
        item.priority = entry?.priority ?? 0;
        const area = entry?.view.visible;
        const outside =
          area &&
          (item.crop.x >= area.x + area.width ||
            item.crop.y >= area.y + area.height ||
            item.crop.x + item.crop.width <= area.x ||
            item.crop.y + item.crop.height <= area.y);
        if (
          !relevant.has(item.photo.record.id) ||
          !entry ||
          outside ||
          (imageTiles && (!entry || !wanted.has(key)))
        ) {
          snapshots.delete(key);
          drop(item);
        }
      }
      publish();
      let limited = nativeLimited,
        failed = false;
      if (jobs.some((job) => !failedPhotos.has(job.photo.record.id)))
        report(
          imageTiles
            ? `Bildkacheln: ${plan.length} Fotos · konservative Bildzonen · lädt`
            : `Flächig: ${plan.length} Fotos · ${samples.length}/${
                cols * rows
              } Oberflächenpunkte · lädt`,
          true
        );
      for (const job of jobs) {
        if (!valid()) return;
        if (failedPhotos.has(job.photo.record.id)) continue;
        const width = Math.ceil(job.crop.width * job.density),
          height = Math.ceil(job.crop.height * job.density);
        const incomingBytes = snapshots.has(job.key) ? 0 : width * height * 8;
        if (
          detailBytes() + incomingBytes > DETAIL_BYTES &&
          !makeRoom(incomingBytes, wanted)
        ) {
          limited = true;
          continue;
        }
        const source = sourceFor(job.photo);
        const releaseNetwork = acquireForegroundNetwork(
          map,
          "oblique-mosaic-pixels",
          { refinementOnly: true }
        );
        releaseGeometryPriority = releaseNetwork;
        let lease: ActiveDemand;
        try {
          lease = acquireDemand(source);
        } catch {
          releaseNetwork();
          releaseGeometryPriority = undefined;
          failed = true;
          failedPhotos.add(job.photo.record.id);
          continue;
        }
        let unsubscribeProgress = () => {};
        try {
          const stack = await metadata(lease, valid);
          if (!valid()) return;
          lease.query.setView(
            { visible: job.crop, density: job.density as Ratio },
            width * height
          );
          const progress = () => {
            if (
              !valid() ||
              !current.current
                .readRecords()
                .some((record) => record.id === job.photo.record.id)
            )
              return;
            const previous = snapshots.get(job.key);
            if (previous) {
              if (!updatePixels(previous, stack)) return;
            } else {
              const renderer = scene.layer.getRenderer?.();
              if (!renderer) return;
              const gpu = new MosaicGpuSnapshot();
              try {
                if (
                  !gpu.update(
                    renderer,
                    stack,
                    job.crop,
                    { width, height },
                    DETAIL_BYTES - detailBytes(),
                    lease.query.plan
                  )
                ) {
                  gpu.dispose();
                  return;
                }
              } catch (error) {
                gpu.dispose();
                throw error;
              }
              const result = gpu.result!;
              snapshots.set(job.key, {
                ...job,
                gpu,
                texture: result.texture,
                textureRect: result.rect,
                revision: result.revision,
                quality: gpu.quality,
                plan: lease.query.plan ?? undefined,
                complete: false,
              });
            }
            publish();
          };
          activeProgress = progress;
          unsubscribeProgress =
            stack.onContentChange?.(() => queueContent(job.photo.record.id)) ??
            (() => {});
          progress();
          await waitReady(lease, epoch);
          progress();
          if (
            !valid() ||
            !current.current
              .readRecords()
              .some((record) => record.id === job.photo.record.id)
          )
            return;
          const progressing = snapshots.get(job.key);
          if (
            progressing &&
            readMosaicRegionQuality(
              stack,
              job.crop,
              undefined,
              lease.query.plan
            )?.signature === progressing.quality?.signature
          ) {
            progressing.complete = true;
            publish();
            continue;
          }
          // The source can be ready while the bounded GPU snapshot budget is
          // full. Keep existing coverage and retry on a later viewport plan.
          limited = true;
        } catch {
          if (valid()) {
            failed = true;
            failedPhotos.add(job.photo.record.id);
            // A failed top photo cannot permanently reserve coverage. Replan
            // behind this serial batch with the next covering photo instead.
            schedule();
          }
        } finally {
          releaseNetwork();
          if (releaseGeometryPriority === releaseNetwork)
            releaseGeometryPriority = undefined;
          unsubscribeProgress();
          activeProgress = undefined;
          if (lease.stack) freezeStack(lease.stack);
          lease.release();
          if (active === lease) active = undefined;
        }
      }
      if (!valid()) return;
      if (
        !failed &&
        wanted.size > 0 &&
        [...wanted].every(
          (key) => snapshots.has(key) && snapshots.get(key)?.complete !== false
        )
      )
        for (const [key, item] of snapshots)
          if (!wanted.has(key)) {
            snapshots.delete(key);
            drop(item);
          }
      publish();
      const coverage = new Set(plan.flatMap((entry) => [...entry.coverage]))
        .size;
      const reportSnapshots = () => {
        if (imageTiles) {
          report(
            `Bildkacheln: ${tileMeshes.size}/${
              wanted.size
            } Ebenen · konservative Bildzonen${
              tileMeshes.size < wanted.size ? " · Qualitätsbudget" : ""
            }`
          );
          return;
        }
        const count = new Set(
          [...snapshots.values()].map((item) => item.photo.record.id)
        ).size;
        report(
          `${imageTiles ? "Bildkacheln" : "Flächig"}: ${count}/${Math.max(
            count,
            plan.length
          )} Fotos · Buffer ${size.width}×${
            size.height
          } · Snapshots ${Math.ceil(
            bytes() / 1048576
          )} MiB · Rasterabdeckung ${coverage}/${cols * rows}${
            limited
              ? " · Quellauflösung oder Snapshotbudget begrenzt"
              : failed
              ? " · einzelne Bildregionen nicht verfügbar"
              : ""
          }`
        );
      };
      reportSnapshots();
      for (const key of photos.keys())
        if (!relevant.has(key)) photos.delete(key);
      const recordIds = new Set(records.map((record) => record.id));
      for (const key of geometries.keys())
        if (!recordIds.has(key)) geometries.delete(key);
      for (const key of surfaceGeometry.keys())
        if (!recordIds.has(key)) surfaceGeometry.delete(key);
    };
    const schedule = () => {
      if (disposed || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (work) {
          schedule();
          return;
        }
        work = run()
          .catch(() => report("Flächig: Projektion derzeit nicht verfügbar"))
          .finally(() => {
            work = undefined;
          });
      }, 250);
    };
    const removeFrame = scene.layer.addBeforeRenderCallback?.(
      (frame: SharedThreeSceneFrame) => {
        if (imageTiles) updateTileView(frame);
        const groupChanged = groupKey !== current.current.groupKey;
        if (groupChanged) {
          groupKey = current.current.groupKey;
          cancel();
          photos.clear();
          failedPhotos.clear();
          for (const item of snapshots.values()) drop(item);
          snapshots.clear();
          preferredAxes.clear();
          geometries.clear();
          surfaceGeometry.clear();
        }
        const displayCamera =
          scene.layer.getDisplayCamera?.() ?? frame.renderCamera;
        const next = new Matrix4().multiplyMatrices(
          displayCamera.projectionMatrix,
          displayCamera.matrixWorldInverse
        );
        const actual = scene.layer.getMapStyleProjectionState?.().photoMosaic;
        const buffer =
          actual &&
          actual.width > 0 &&
          actual.requestedWidth === Math.floor(frame.viewport.x) &&
          actual.requestedHeight === Math.floor(frame.viewport.y)
            ? { width: actual.width, height: actual.height }
            : { width: frame.viewport.x, height: frame.viewport.y };
        const nextFrame = [
          ...next.elements,
          buffer.width,
          buffer.height,
          scene.layer.getLocalFrame()?.revision ?? 0,
        ].join(",");
        const records = current.current.readRecords();
        const seriesDirection = current.current.seriesDirection ?? false;
        const preferredPitch = seriesDirection
          ? current.current.preferredPitchDeg ?? null
          : current.current.preferredPitchDeg ?? map.getPitch?.() ?? null;
        const nextReferenceSummary = referenceSummaryKey();
        const dataChanged =
          lastSelectionData !== current.current.selectionData ||
          lastReferenceSummary !== nextReferenceSummary;
        lastReferenceSummary = nextReferenceSummary;
        if (dataChanged) referenceDataEpoch++;
        const preferenceChanged =
          lastPreferredPitch !== preferredPitch ||
          lastSeriesDirection !== seriesDirection ||
          dataChanged;
        lastPreferredPitch = preferredPitch;
        lastSeriesDirection = seriesDirection;
        lastSelectionData = current.current.selectionData;
        const nextRecords =
          readRecordSignature(records) +
          `:${
            seriesDirection ? "mean" : current.current.centerY
          }:${preferredPitch}:${seriesDirection}:${referenceDataEpoch}`;
        if (
          nextFrame !== frameKey ||
          nextRecords !== recordsKey ||
          surfaceDirty ||
          groupChanged
        ) {
          const candidatesChanged = recordsKey !== nextRecords;
          if (candidatesChanged) {
            const visibleIds = new Set(records.map((record) => record.id));
            for (const [key, item] of snapshots)
              if (!visibleIds.has(item.photo.record.id)) {
                snapshots.delete(key);
                drop(item);
              }
          }
          const cameraChanged = frameKey !== nextFrame;
          if (cameraChanged || surfaceDirty) sampledCache = undefined;
          frameKey = nextFrame;
          recordsKey = nextRecords;
          surfaceDirty = false;
          clip = next;
          pixels = buffer;
          // New LOD/nearby-query results coalesce behind the in-flight tile. Only
          // a different camera invalidates its sampled screen-space demand.
          if (cameraChanged || preferenceChanged || candidatesChanged) {
            failedPhotos.clear();
            cancel();
          }
          if (cameraChanged || preferenceChanged || candidatesChanged) {
            preferredAxes.clear();
          }
          publish();
          schedule();
        }
      }
    );
    const unsubscribePool = nativePixelPool.subscribe?.(
      syncContentSubscriptions
    );
    let surfaceRevision = "";
    const refreshSurfaces = () => {
      const key = getSharedThreeSceneRuntimes(map)
        .filter(
          (runtime) =>
            runtime.providesTerrain ||
            runtime.receivesMapStyleTexture ||
            runtime.receivesScreenImages
        )
        .map(
          (runtime) =>
            `${runtime.id}:${runtime.root.visible}:${
              runtime.mapStyleProjectionVersion?.() ?? 0
            }:${runtime.hasRenderableContent?.() ?? false}`
        )
        .join("|");
      if (key !== surfaceRevision) {
        surfaceRevision = key;
        surfaceDirty = true;
        map.triggerRepaint();
      }
    };
    map.on("idle", refreshSurfaces);
    const unsubscribeTerrain = imageTiles
      ? () => {}
      : subscribeSharedThreeTerrain(map, () => {
          surfaceDirty = true;
          sampledCache = undefined;
          map.triggerRepaint();
        });
    map.triggerRepaint();
    return () => {
      disposed = true;
      cancel();
      retention?.release();
      clearTimeout(timer);
      clearTimeout(contentTimer);
      unsubscribePool?.();
      for (const subscription of contentSubscriptions.values())
        subscription.unsubscribe();
      contentSubscriptions.clear();
      dirtyPhotos.clear();
      removeFrame?.();
      unsubscribeTerrain();
      map.off("idle", refreshSurfaces);
      if (!imageTiles) scene.layer.setMapStylePhotoMosaic?.(id, null);
      else scene.layer.removeRuntime(`${id}-tiles`);
      clearTimeout(tileGeometryTimer);
      imagePlanes.clear();
      sampledCache = undefined;
      preferredAxes.clear();
      geometries.clear();
      surfaceGeometry.clear();
      ownedPicker?.dispose();
      for (const item of snapshots.values()) drop(item);
      snapshots.clear();
      scene.release();
    };
  }, [
    options.enabled,
    options.map,
    options.presentation,
    options.bestImagePicker,
  ]);
  return status;
};
