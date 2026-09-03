import * as THREE from "three";

import type { SharedThreeSceneFrame } from "@carma-mapping/engines/maplibre";

/**
 * Shadows on the host map's own ground.
 *
 * MapLibre draws its terrain into a depth texture at the start of each frame.
 * This pass reads that depth back, rebuilds the ground position of every
 * pixel in the shared scene's coordinates and asks the sun's shadow map
 * whether the point is lit. Nothing in the scene has to model the ground, so
 * it cannot disagree with what the map shows, and it does not compete with
 * MapLibre's depth buffer: the pass draws first, writes the ground depth back
 * and lets the regular LEQUAL test sort the buildings against it.
 */

/** Drawn right after the sky backdrop and before any scene geometry. */
const GROUND_SHADOW_RENDER_ORDER = -9_999;

const DEPTH_UNPACK = "vec4( 1.0 / 16777216.0, 1.0 / 65536.0, 1.0 / 256.0, 1.0 )";

const VERTEX_SHADER = /* glsl */ `
  #include <common>
  #include <shadowmap_pars_vertex>
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4( position.xy, 0.0, 1.0 );
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  #include <common>
  #include <shadowmap_pars_fragment>
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
  #endif
  uniform sampler2D uHostDepth;
  uniform mat4 uClipToScene;
  uniform vec2 uDepthRange;
  uniform float uGroundLift;
  varying vec2 vUv;
  const highp vec4 DEPTH_UNPACK = ${DEPTH_UNPACK};
  void main() {
    vec4 packedDepth = texture2D( uHostDepth, vUv );
    // The host clears to transparent black where it draws no ground (sky).
    if ( packedDepth == vec4( 0.0 ) ) discard;
    highp float ndcDepth = dot( packedDepth, DEPTH_UNPACK );
    vec4 scenePosition = uClipToScene * vec4( vUv * 2.0 - 1.0, ndcDepth, 1.0 );
    scenePosition.xyz /= scenePosition.w;
    float lit = 1.0;
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
      vec4 shadowCoord = directionalShadowMatrix[ 0 ] *
        vec4( scenePosition.xyz + vec3( 0.0, uGroundLift, 0.0 ), 1.0 );
      lit = getShadow(
        directionalShadowMap[ 0 ],
        directionalLightShadows[ 0 ].shadowMapSize,
        directionalLightShadows[ 0 ].shadowIntensity,
        directionalLightShadows[ 0 ].shadowBias,
        directionalLightShadows[ 0 ].shadowRadius,
        shadowCoord
      );
    #endif
    // Written explicitly, so the host's depth range has to be applied here.
    gl_FragDepth = mix( uDepthRange.x, uDepthRange.y, ndcDepth * 0.5 + 0.5 );
    gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 - lit );
  }
`;

export type GroundShadowPass = {
  readonly mesh: THREE.Mesh;
  /** Take this frame's host depth and camera; hides itself without ground. */
  update: (frame: SharedThreeSceneFrame) => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

export const buildGroundShadowPass = (): GroundShadowPass => {
  let enabled = false;
  let hasHostGround = false;
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.lights,
    {
      uHostDepth: { value: null as THREE.Texture | null },
      uClipToScene: { value: new THREE.Matrix4() },
      uDepthRange: { value: new THREE.Vector2(0, 1) },
      uGroundLift: { value: 0 },
    },
  ]) as {
    uHostDepth: { value: THREE.Texture | null };
    uClipToScene: { value: THREE.Matrix4 };
    uDepthRange: { value: THREE.Vector2 };
    uGroundLift: { value: number };
  };
  const material = new THREE.ShaderMaterial({
    name: "shadow-simulation-ground-shadow",
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms,
    lights: true,
    // Opaque queue so it precedes the buildings, but blended like a normal
    // transparent material: Three drops blending for opaque NormalBlending.
    transparent: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    depthTest: true,
    depthFunc: THREE.AlwaysDepth,
    depthWrite: true,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.name = "shadow-simulation-ground-shadow";
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = GROUND_SHADOW_RENDER_ORDER;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.visible = false;
  mesh.onBeforeRender = (renderer) => {
    // MapLibre narrows the main framebuffer's depth range for 3D layers;
    // offscreen targets use the full range. gl_FragDepth bypasses both.
    const gl = renderer.getContext();
    const range = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
    uniforms.uDepthRange.value.set(range[0], range[1]);
  };
  const syncVisibility = () => {
    mesh.visible = enabled && hasHostGround;
  };
  return {
    mesh,
    update(frame) {
      hasHostGround = frame.hostGroundDepth !== null;
      uniforms.uHostDepth.value = frame.hostGroundDepth;
      uniforms.uClipToScene.value.copy(frame.sceneToClipMatrix).invert();
      syncVisibility();
    },
    setEnabled(next) {
      enabled = next;
      syncVisibility();
    },
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
};
