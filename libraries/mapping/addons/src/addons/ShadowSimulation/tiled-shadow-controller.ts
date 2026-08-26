/** Fixed-pool, receiver-fitted light-space shadow tiling. */
import * as THREE from "three";
import { CSM } from "three/addons/csm/CSM.js";

import type { ShadowMode, ShadowQualityMultiplier } from "./shadow-scene";
import {
  buildShadowTileLayout,
  type LightSpaceBounds,
  type ShadowTileLayoutStatistics,
} from "./shadow-tile-layout";

export const SHADOW_TILE_COUNT = 4;
const BASE_SHADOW_TILE_MAP_SIZE = 1_024;
const BASE_SINGLE_SHADOW_MAP_SIZE = 2_048;
const SHADOW_TILE_PROGRAM_CACHE_KEY = "carma-light-space-tiles-v1";
const SHADOW_FILTER_GUARD_TEXELS = 3;
const MIN_SHADOW_TILE_AREA_METERS = 2;
const MIN_CASTER_REACH_METERS = 50;
const MAX_CASTER_REACH_METERS = 10_000;
const CASTER_REACH_ELEVATION_EPSILON = 0.04;
const LIGHT_CAMERA_SAFETY_METERS = 25;
const SHADOW_NORMAL_BIAS_TEXELS = 0.5;
const SHADOW_DEPTH_BIAS_TEXELS = 0.5;
const MIN_SHADOW_DEPTH_BIAS_METERS = 0.01;
const MAX_SHADOW_DEPTH_BIAS_METERS = 0.35;
const MIN_SHADOW_NORMAL_BIAS_METERS = 0.02;
const MAX_SHADOW_NORMAL_BIAS_METERS = 0.5;

export type TiledShadowTileSnapshot = Readonly<{
  id: string;
  row: number;
  column: number;
  receiverPointCount: number;
  receiverLeftMeters: number;
  receiverRightMeters: number;
  receiverBottomMeters: number;
  receiverTopMeters: number;
  leftMeters: number;
  rightMeters: number;
  bottomMeters: number;
  topMeters: number;
  nearMeters: number;
  farMeters: number;
  shadowMapWidth: number;
  shadowMapHeight: number;
  viewMatrixElements: readonly number[];
  projectionMatrixElements: readonly number[];
  statistics: Pick<
    ShadowTileLayoutStatistics,
    "casterGuardMeters" | "effectiveMetersPerTexel"
  >;
}>;

export type TiledShadowSnapshot = Readonly<{
  strategy: "single-viewport" | "tiled-light-space";
  tileCount: number;
  totalShadowTexels: number;
  casterReachMeters: number;
  tiles: readonly TiledShadowTileSnapshot[];
}>;

export type TiledShadowUpdate = Readonly<{
  camera: THREE.PerspectiveCamera;
  receiverWorldPoints: readonly THREE.Vector3[];
  minimumElevationMeters: number;
  maximumElevationMeters: number;
  directionToSun: THREE.Vector3;
  color: THREE.ColorRepresentation;
  intensity: number;
  shadowIntensity: number;
  quality: ShadowQualityMultiplier;
  /**
   * True while a camera gesture is in flight. The shadow buffer then drops to
   * half resolution, which quarters the texels the depth pass writes per
   * frame; the moveend update restores the full-quality buffer.
   */
  interactive?: boolean;
}>;

type MaterialState = Readonly<{
  onBeforeCompile: THREE.Material["onBeforeCompile"];
  customProgramCacheKey: THREE.Material["customProgramCacheKey"];
  defines: Record<string, unknown> | undefined;
  disposeListener: () => void;
}>;

const CSM_DIRECTIONAL_BLOCK_START =
  "#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && defined( USE_CSM ) && defined( CSM_CASCADES )";
const STANDARD_DIRECTIONAL_BLOCK_START =
  "#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && !defined( USE_CSM ) && !defined( CSM_CASCADES )";
const LIGHTS_PARS_INCLUDE = "#include <lights_pars_begin>";
const LIGHTS_FRAGMENT_INCLUDE = "#include <lights_fragment_begin>";
const TILE_RECEIVER_UNIFORM_DECLARATION =
  "#if defined( USE_CSM ) && defined( CSM_CASCADES )\nuniform vec4 CSM_tileReceiverUv[ CSM_CASCADES ];\n#endif";

const TILED_DIRECTIONAL_LIGHT_BLOCK = /* glsl */ `${CSM_DIRECTIONAL_BLOCK_START}

	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif

	bool CSM_tileSelected = false;
	directionalLight = directionalLights[ 0 ];
	getDirectionalLightInfo( directionalLight, directLight );

	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0

		// CARMA light-space tile selection begin
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

			#if ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS ) && ( UNROLLED_LOOP_INDEX < CSM_CASCADES )
			{
				vec4 tileReceiverUv = CSM_tileReceiverUv[ i ];
				vec4 tileShadowCoord = vDirectionalShadowCoord[ i ];
				bool tileActive = tileReceiverUv.x <= tileReceiverUv.z && tileReceiverUv.y <= tileReceiverUv.w;
				bool tileValidW = tileShadowCoord.w > 0.0;
				vec2 tileUv = tileValidW ? tileShadowCoord.xy / tileShadowCoord.w : vec2( -2.0 );
				bool tileContainsReceiver = tileActive && tileValidW && all( greaterThanEqual( tileUv, tileReceiverUv.xy ) ) && all( lessThanEqual( tileUv, tileReceiverUv.zw ) );
				if ( ! CSM_tileSelected && tileActive && tileContainsReceiver ) {

					directionalLight = directionalLights[ i ];
					getDirectionalLightInfo( directionalLight, directLight );
					directionalLightShadow = directionalLightShadows[ i ];
					directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
					CSM_tileSelected = true;

				}
			}
			#endif

		}
		#pragma unroll_loop_end

	#endif

	RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	// CARMA light-space tile selection end

	#if ( NUM_DIR_LIGHTS > NUM_DIR_LIGHT_SHADOWS )

		#pragma unroll_loop_start
		for ( int i = NUM_DIR_LIGHT_SHADOWS; i < NUM_DIR_LIGHTS; i ++ ) {

			directionalLight = directionalLights[ i ];
			getDirectionalLightInfo( directionalLight, directLight );
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

		}
		#pragma unroll_loop_end

	#endif

#endif


`;

export const buildTiledLightSpaceLightsFragment = (source: string): string => {
  const blockStart = source.indexOf(CSM_DIRECTIONAL_BLOCK_START);
  const nextBlockStart = source.indexOf(
    STANDARD_DIRECTIONAL_BLOCK_START,
    blockStart
  );
  const repeatedBlockStart = source.indexOf(
    CSM_DIRECTIONAL_BLOCK_START,
    blockStart + CSM_DIRECTIONAL_BLOCK_START.length
  );
  const repeatedNextBlockStart = source.indexOf(
    STANDARD_DIRECTIONAL_BLOCK_START,
    nextBlockStart + STANDARD_DIRECTIONAL_BLOCK_START.length
  );
  if (
    blockStart < 0 ||
    nextBlockStart < 0 ||
    repeatedBlockStart >= 0 ||
    repeatedNextBlockStart >= 0
  ) {
    throw new Error(
      "Unable to locate the Three.js CSM directional-light block"
    );
  }
  return `${source.slice(
    0,
    blockStart
  )}${TILED_DIRECTIONAL_LIGHT_BLOCK}${source.slice(nextBlockStart)}`;
};

const patchMaterialFragmentShader = (source: string) => {
  if (
    !source.includes(LIGHTS_PARS_INCLUDE) ||
    !source.includes(LIGHTS_FRAGMENT_INCLUDE)
  ) {
    throw new Error(
      "Tiled shadow materials must retain the Three.js light shader includes"
    );
  }
  const tiledLightsFragment = buildTiledLightSpaceLightsFragment(
    THREE.ShaderChunk.lights_fragment_begin
  );
  return source
    .replace(
      LIGHTS_PARS_INCLUDE,
      `${LIGHTS_PARS_INCLUDE}\n${TILE_RECEIVER_UNIFORM_DECLARATION}`
    )
    .replace(LIGHTS_FRAGMENT_INCLUDE, tiledLightsFragment);
};

const asMaterials = (
  material: THREE.Material | THREE.Material[]
): readonly THREE.Material[] =>
  Array.isArray(material) ? material : [material];

type BuiltInLitMaterial = THREE.Material &
  Partial<
    Record<
      | "isMeshLambertMaterial"
      | "isMeshPhongMaterial"
      | "isMeshToonMaterial"
      | "isMeshStandardMaterial"
      | "isMeshPhysicalMaterial",
      boolean
    >
  >;

const isBuiltInLitMaterial = (
  material: THREE.Material
): material is BuiltInLitMaterial => {
  const candidate = material as BuiltInLitMaterial;
  return Boolean(
    candidate.isMeshLambertMaterial ||
      candidate.isMeshPhongMaterial ||
      candidate.isMeshToonMaterial ||
      candidate.isMeshStandardMaterial ||
      candidate.isMeshPhysicalMaterial
  );
};

const getShadowTileMapSize = (quality: ShadowQualityMultiplier) =>
  BASE_SHADOW_TILE_MAP_SIZE * Math.sqrt(quality);

const getReceiverBoundsInLightCamera = (
  points: readonly THREE.Vector3[],
  camera: THREE.OrthographicCamera
): LightSpaceBounds | null => {
  if (points.length === 0) return null;
  camera.updateMatrixWorld(true);
  const projected = points.map((point) =>
    point.clone().applyMatrix4(camera.matrixWorldInverse)
  );
  const left = Math.min(...projected.map(({ x }) => x));
  const right = Math.max(...projected.map(({ x }) => x));
  const bottom = Math.min(...projected.map(({ y }) => y));
  const top = Math.max(...projected.map(({ y }) => y));
  const depths = projected.map(({ z }) => -z);
  const near = Math.max(0, Math.min(...depths));
  const far = Math.max(near + 0.01, Math.max(...depths));
  const centerX = (left + right) / 2;
  const centerY = (bottom + top) / 2;
  const halfWidth = Math.max(
    (right - left) / 2,
    MIN_SHADOW_TILE_AREA_METERS / 2
  );
  const halfHeight = Math.max(
    (top - bottom) / 2,
    MIN_SHADOW_TILE_AREA_METERS / 2
  );
  return {
    left: centerX - halfWidth,
    right: centerX + halfWidth,
    bottom: centerY - halfHeight,
    top: centerY + halfHeight,
    near,
    far,
  };
};

const copyDefines = (defines: Record<string, unknown> | undefined) =>
  defines ? { ...defines } : undefined;

export class TiledShadowController {
  readonly csm: CSM;
  readonly lights: readonly THREE.DirectionalLight[];

  private readonly materialStates = new Map<THREE.Material, MaterialState>();
  private readonly tileReceiverUvs = Array.from(
    { length: SHADOW_TILE_COUNT },
    () => new THREE.Vector4(2, 2, -1, -1)
  );
  private activeTileCount = 0;
  private mode: ShadowMode = "advanced";
  private disposed = false;

  constructor(scene: THREE.Scene, camera = new THREE.PerspectiveCamera()) {
    this.csm = new CSM({
      camera,
      parent: scene,
      cascades: SHADOW_TILE_COUNT,
      mode: "practical",
      maxFar: 5_000,
      shadowMapSize: BASE_SHADOW_TILE_MAP_SIZE,
      lightNear: 0.1,
      lightFar: 10_000,
      lightMargin: 1_000,
      lightIntensity: 1,
    });
    // CSM remains the material/light lifecycle shell. Tile selection is handled
    // by the receiver-core shader patch, so depth blending must stay disabled.
    this.csm.fade = false;
    this.lights = this.csm.lights;
    for (let index = 0; index < this.lights.length; index += 1) {
      const light = this.lights[index];
      light.name =
        index === 0
          ? "shadow-simulation-sun"
          : `shadow-simulation-sun-tile-${index}`;
      light.shadow.autoUpdate = false;
      // Every entry in the fixed sampler array must have a depth texture, even
      // while its logical tile is inactive. WebGL validates all sampler-array
      // bindings before executing the receiver-core branch, so one null map
      // would invalidate every shaded draw. The first shadow pass allocates the
      // pool; inactive entries stay at zero intensity afterwards.
      light.shadow.needsUpdate = true;
      light.shadow.radius = 0;
    }
  }

  setupMaterial(material: THREE.Material): void {
    if (
      this.disposed ||
      this.mode === "single" ||
      this.materialStates.has(material) ||
      !isBuiltInLitMaterial(material)
    ) {
      return;
    }
    const state: MaterialState = {
      onBeforeCompile: material.onBeforeCompile,
      customProgramCacheKey: material.customProgramCacheKey,
      defines: copyDefines(material.defines),
      disposeListener: () => this.releaseMaterial(material),
    };
    this.csm.setupMaterial(material);
    const csmOnBeforeCompile = material.onBeforeCompile;
    const tileReceiverUvs = this.tileReceiverUvs;
    material.onBeforeCompile = function (shader, renderer) {
      state.onBeforeCompile.call(this, shader, renderer);
      csmOnBeforeCompile.call(this, shader, renderer);
      shader.uniforms.CSM_tileReceiverUv = { value: tileReceiverUvs };
      shader.fragmentShader = patchMaterialFragmentShader(
        shader.fragmentShader
      );
    };
    material.customProgramCacheKey = function () {
      return `${state.customProgramCacheKey.call(
        this
      )}|${SHADOW_TILE_PROGRAM_CACHE_KEY}`;
    };
    this.materialStates.set(material, state);
    material.addEventListener("dispose", state.disposeListener);
    material.needsUpdate = true;
  }

  releaseMaterial(material: THREE.Material): void {
    const state = this.materialStates.get(material);
    if (!state) return;
    material.removeEventListener("dispose", state.disposeListener);
    this.csm.shaders.delete(material);
    material.onBeforeCompile = state.onBeforeCompile;
    material.customProgramCacheKey = state.customProgramCacheKey;
    material.defines = copyDefines(state.defines);
    material.needsUpdate = true;
    this.materialStates.delete(material);
  }

  syncSceneMaterials(scene: THREE.Scene): void {
    if (this.disposed) return;
    if (this.mode === "single") {
      for (const material of [...this.materialStates.keys()]) {
        this.releaseMaterial(material);
      }
      return;
    }
    const retainedMaterials = new Set<THREE.Material>();
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (
        object.userData.isShadowSimulationOverlay ||
        (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh)
      ) {
        return;
      }
      for (const material of asMaterials(mesh.material)) {
        retainedMaterials.add(material);
        this.setupMaterial(material);
      }
    });
    for (const material of [...this.materialStates.keys()]) {
      if (!retainedMaterials.has(material)) this.releaseMaterial(material);
    }
  }

  invalidate(): void {
    for (let index = 0; index < this.activeTileCount; index += 1) {
      this.lights[index].shadow.needsUpdate = true;
    }
  }

  setMode(mode: ShadowMode): void {
    if (this.disposed || this.mode === mode) return;
    this.mode = mode;
    if (mode === "single") {
      for (const material of [...this.materialStates.keys()]) {
        this.releaseMaterial(material);
      }
    }
    this.lights.forEach((light, index) => {
      const active = mode === "advanced" || index === 0;
      light.visible = active;
      light.castShadow = active;
      light.shadow.needsUpdate = active;
      if (!active) {
        light.intensity = 0;
        light.shadow.map?.dispose();
        light.shadow.map = null;
      }
    });
    this.activeTileCount = mode === "single" ? 1 : 0;
  }

  update({
    camera,
    receiverWorldPoints,
    minimumElevationMeters,
    maximumElevationMeters,
    directionToSun,
    color,
    intensity,
    shadowIntensity,
    quality,
    interactive = false,
  }: TiledShadowUpdate): TiledShadowSnapshot | null {
    if (this.disposed) return null;
    if (receiverWorldPoints.length === 0) {
      this.activeTileCount = 0;
      for (let index = 0; index < this.lights.length; index += 1) {
        const active = this.mode === "advanced" || index === 0;
        this.tileReceiverUvs[index].set(2, 2, -1, -1);
        this.lights[index].intensity = 0;
        this.lights[index].shadow.intensity = THREE.MathUtils.clamp(
          shadowIntensity,
          0,
          1
        );
        this.lights[index].shadow.needsUpdate =
          active && this.lights[index].shadow.map === null;
      }
      return null;
    }
    camera.updateMatrixWorld(true);
    const normalizedDirectionToSun = directionToSun.clone().normalize();
    const reliefMeters = Math.max(
      0,
      maximumElevationMeters - minimumElevationMeters
    );
    const elevationSine = Math.max(
      CASTER_REACH_ELEVATION_EPSILON,
      normalizedDirectionToSun.y
    );
    const casterReachMeters = THREE.MathUtils.clamp(
      reliefMeters / elevationSine + MIN_CASTER_REACH_METERS,
      MIN_CASTER_REACH_METERS,
      MAX_CASTER_REACH_METERS
    );
    const lightMargin =
      casterReachMeters + reliefMeters + LIGHT_CAMERA_SAFETY_METERS;
    const motionScale = interactive ? 0.5 : 1;
    const mapSize =
      (this.mode === "single"
        ? BASE_SINGLE_SHADOW_MAP_SIZE * Math.sqrt(quality)
        : getShadowTileMapSize(quality)) * motionScale;

    this.csm.camera = camera;
    this.csm.lightMargin = lightMargin;
    this.csm.lightNear = 0.1;
    this.csm.lightFar = lightMargin * 2;
    this.csm.shadowMapSize = mapSize;
    this.csm.lightDirection.copy(directionToSun).multiplyScalar(-1).normalize();

    const resolvedColor = new THREE.Color(color);
    const receiverBox = new THREE.Box3().setFromPoints([
      ...receiverWorldPoints,
    ]);
    const receiverSphere = receiverBox.getBoundingSphere(new THREE.Sphere());
    const lightTargetPosition = receiverSphere.center;
    const lightPosition = normalizedDirectionToSun
      .clone()
      .multiplyScalar(receiverSphere.radius + lightMargin)
      .add(lightTargetPosition);
    for (let index = 0; index < this.lights.length; index += 1) {
      const light = this.lights[index];
      const active = this.mode === "advanced" || index === 0;
      light.visible = active;
      light.castShadow = active;
      light.color.copy(resolvedColor);
      light.intensity = active ? intensity : 0;
      light.shadow.intensity = THREE.MathUtils.clamp(shadowIntensity, 0, 1);
      if (
        light.shadow.mapSize.x !== mapSize ||
        light.shadow.mapSize.y !== mapSize
      ) {
        light.shadow.map?.dispose();
        light.shadow.map = null;
        light.shadow.mapSize.set(mapSize, mapSize);
      }
      light.position.copy(lightPosition);
      light.target.position.copy(lightTargetPosition);
      light.updateMatrixWorld(true);
      light.target.updateMatrixWorld(true);
      light.shadow.updateMatrices(light);
    }

    const referenceShadowCamera = this.lights[0].shadow.camera;
    const receiverBounds = getReceiverBoundsInLightCamera(
      receiverWorldPoints,
      referenceShadowCamera
    );
    if (!receiverBounds) return null;
    if (this.mode === "single") {
      const light = this.lights[0];
      const shadowCamera = light.shadow.camera;
      const usableMapWidth = Math.max(
        1,
        light.shadow.mapSize.x - SHADOW_FILTER_GUARD_TEXELS * 2
      );
      const usableMapHeight = Math.max(
        1,
        light.shadow.mapSize.y - SHADOW_FILTER_GUARD_TEXELS * 2
      );
      const receiverWidth = receiverBounds.right - receiverBounds.left;
      const receiverHeight = receiverBounds.top - receiverBounds.bottom;
      const texelMeters = Math.max(
        receiverWidth / usableMapWidth,
        receiverHeight / usableMapHeight,
        Number.EPSILON
      );
      const guardMeters = texelMeters * SHADOW_FILTER_GUARD_TEXELS;
      // Preserve square world-space texels. The orthographic camera therefore
      // has exactly the same aspect ratio as its actual shadow-map buffer.
      const fittedWidth = texelMeters * light.shadow.mapSize.x;
      const fittedHeight = texelMeters * light.shadow.mapSize.y;
      const centerX =
        Math.round(
          (receiverBounds.left + receiverBounds.right) / 2 / texelMeters
        ) * texelMeters;
      const centerY =
        Math.round(
          (receiverBounds.bottom + receiverBounds.top) / 2 / texelMeters
        ) * texelMeters;
      shadowCamera.left = centerX - fittedWidth / 2;
      shadowCamera.right = centerX + fittedWidth / 2;
      shadowCamera.bottom = centerY - fittedHeight / 2;
      shadowCamera.top = centerY + fittedHeight / 2;
      shadowCamera.near = Math.max(
        0.01,
        receiverBounds.near - LIGHT_CAMERA_SAFETY_METERS
      );
      shadowCamera.far = Math.max(
        shadowCamera.near + 1,
        receiverBounds.far + casterReachMeters + reliefMeters
      );
      light.shadow.normalBias = THREE.MathUtils.clamp(
        texelMeters * SHADOW_NORMAL_BIAS_TEXELS,
        MIN_SHADOW_NORMAL_BIAS_METERS,
        MAX_SHADOW_NORMAL_BIAS_METERS
      );
      const depthBiasMeters = THREE.MathUtils.clamp(
        texelMeters * SHADOW_DEPTH_BIAS_TEXELS,
        MIN_SHADOW_DEPTH_BIAS_METERS,
        MAX_SHADOW_DEPTH_BIAS_METERS
      );
      light.shadow.bias =
        -depthBiasMeters / (shadowCamera.far - shadowCamera.near);
      shadowCamera.updateProjectionMatrix();
      light.shadow.updateMatrices(light);
      light.shadow.needsUpdate = true;
      this.activeTileCount = 1;
      this.tileReceiverUvs[0].set(0, 0, 1, 1);
      for (let index = 1; index < this.lights.length; index += 1) {
        this.tileReceiverUvs[index].set(2, 2, -1, -1);
        this.lights[index].intensity = 0;
        this.lights[index].shadow.needsUpdate = false;
      }
      return {
        strategy: "single-viewport",
        tileCount: 1,
        totalShadowTexels: mapSize * mapSize,
        casterReachMeters,
        tiles: [
          {
            id: "single",
            row: 0,
            column: 0,
            receiverPointCount: receiverWorldPoints.length,
            receiverLeftMeters: receiverBounds.left,
            receiverRightMeters: receiverBounds.right,
            receiverBottomMeters: receiverBounds.bottom,
            receiverTopMeters: receiverBounds.top,
            leftMeters: shadowCamera.left,
            rightMeters: shadowCamera.right,
            bottomMeters: shadowCamera.bottom,
            topMeters: shadowCamera.top,
            nearMeters: shadowCamera.near,
            farMeters: shadowCamera.far,
            shadowMapWidth: light.shadow.mapSize.x,
            shadowMapHeight: light.shadow.mapSize.y,
            viewMatrixElements: [...shadowCamera.matrixWorldInverse.elements],
            projectionMatrixElements: [
              ...shadowCamera.projectionMatrix.elements,
            ],
            statistics: {
              casterGuardMeters: guardMeters,
              effectiveMetersPerTexel: texelMeters,
            },
          },
        ],
      };
    }
    const usableMapDimension = Math.max(
      1,
      mapSize - SHADOW_FILTER_GUARD_TEXELS * 2
    );
    const oneMapFitMetersPerTexel = Math.max(
      (receiverBounds.right - receiverBounds.left) / usableMapDimension,
      (receiverBounds.top - receiverBounds.bottom) / usableMapDimension
    );
    const requestedMetersPerTexel = Math.max(
      oneMapFitMetersPerTexel / SHADOW_TILE_COUNT,
      Number.EPSILON
    );
    const layout = buildShadowTileLayout({
      receiverBounds,
      casterPaddingMeters: requestedMetersPerTexel * SHADOW_FILTER_GUARD_TEXELS,
      casterReliefMeters: reliefMeters,
      casterReachMeters,
      targetMetersPerTexel: requestedMetersPerTexel,
      maxShadowMapDimension: mapSize,
      maxTileCount: SHADOW_TILE_COUNT,
    });
    this.activeTileCount = layout.tiles.length;

    const tiles: TiledShadowTileSnapshot[] = [];
    for (let index = 0; index < this.lights.length; index += 1) {
      const light = this.lights[index];
      const shadowCamera = light.shadow.camera;
      const tile = layout.tiles[index];
      const tileReceiverUv = this.tileReceiverUvs[index];
      if (!tile) {
        tileReceiverUv.set(2, 2, -1, -1);
        light.intensity = 0;
        light.shadow.needsUpdate = light.shadow.map === null;
        continue;
      }
      light.intensity = intensity;
      shadowCamera.left = tile.left;
      shadowCamera.right = tile.right;
      shadowCamera.bottom = tile.bottom;
      shadowCamera.top = tile.top;
      shadowCamera.near = Math.max(0.01, tile.near);
      shadowCamera.far = Math.max(shadowCamera.near + 1, tile.far);
      const texelMeters = layout.statistics.effectiveMetersPerTexel;
      light.shadow.normalBias = THREE.MathUtils.clamp(
        texelMeters * SHADOW_NORMAL_BIAS_TEXELS,
        MIN_SHADOW_NORMAL_BIAS_METERS,
        MAX_SHADOW_NORMAL_BIAS_METERS
      );
      const depthBiasMeters = THREE.MathUtils.clamp(
        texelMeters * SHADOW_DEPTH_BIAS_TEXELS,
        MIN_SHADOW_DEPTH_BIAS_METERS,
        MAX_SHADOW_DEPTH_BIAS_METERS
      );
      light.shadow.bias =
        -depthBiasMeters / (shadowCamera.far - shadowCamera.near);
      shadowCamera.updateProjectionMatrix();
      light.shadow.updateMatrices(light);
      light.shadow.needsUpdate = true;
      const tileWidthMeters = tile.right - tile.left;
      const tileHeightMeters = tile.top - tile.bottom;
      tileReceiverUv.set(
        (tile.receiverBounds.left - tile.left) / tileWidthMeters,
        (tile.receiverBounds.bottom - tile.bottom) / tileHeightMeters,
        (tile.receiverBounds.right - tile.left) / tileWidthMeters,
        (tile.receiverBounds.top - tile.bottom) / tileHeightMeters
      );
      tiles.push({
        id: tile.id,
        row: tile.row,
        column: tile.column,
        receiverPointCount: receiverWorldPoints.length,
        receiverLeftMeters: tile.receiverBounds.left,
        receiverRightMeters: tile.receiverBounds.right,
        receiverBottomMeters: tile.receiverBounds.bottom,
        receiverTopMeters: tile.receiverBounds.top,
        leftMeters: shadowCamera.left,
        rightMeters: shadowCamera.right,
        bottomMeters: shadowCamera.bottom,
        topMeters: shadowCamera.top,
        nearMeters: shadowCamera.near,
        farMeters: shadowCamera.far,
        shadowMapWidth: light.shadow.mapSize.x,
        shadowMapHeight: light.shadow.mapSize.y,
        viewMatrixElements: [...shadowCamera.matrixWorldInverse.elements],
        projectionMatrixElements: [...shadowCamera.projectionMatrix.elements],
        statistics: layout.statistics,
      });
    }
    return {
      strategy: "tiled-light-space",
      tileCount: tiles.length,
      // The four-map GPU pool is fixed. Inactive logical tiles skip shadow-map
      // updates but remain part of the stable compile/allocation budget.
      totalShadowTexels: this.lights.length * mapSize * mapSize,
      casterReachMeters,
      tiles,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const material of [...this.materialStates.keys()]) {
      this.releaseMaterial(material);
    }
    this.csm.dispose();
    for (const light of this.lights) light.shadow.map?.dispose();
    this.csm.remove();
  }
}
