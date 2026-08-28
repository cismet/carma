import {
  AlwaysDepth,
  DepthTexture,
  GLSL3,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NormalBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  WebGLRenderTarget,
  type WebGLRenderer,
} from "three";

// Accumulates sun-disc samples and preserves the final scene depth.

/** Halton(2,3) low-discrepancy points, centred, for sub-pixel camera jitter. */
const halton = (index: number, base: number): number => {
  let fraction = 1;
  let result = 0;
  let i = index + 1;
  while (i > 0) {
    fraction /= base;
    result += fraction * (i % base);
    i = Math.floor(i / base);
  }
  return result - 0.5;
};

const COMPOSITE_VERTEX = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Three injects a pc_fragColor output only for shaders it upgrades itself;
// an explicitly GLSL3 ShaderMaterial declares its own fragment output.
const BLEND_FRAGMENT = /* glsl */ `
  layout(location = 0) out highp vec4 outColor;
  in vec2 vUv;
  uniform sampler2D tPrevious;
  uniform sampler2D tRound;
  uniform float uRoundWeight;
  void main() {
    outColor = mix(
      texture(tPrevious, vUv),
      texture(tRound, vUv),
      uRoundWeight
    );
  }
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
  layout(location = 0) out highp vec4 outColor;
  in vec2 vUv;
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  void main() {
    vec4 color = texture(tColor, vUv);
    if (color.a < 0.004) discard;
    outColor = color;
    gl_FragDepth = texture(tDepth, vUv).r;
  }
`;

export type SharedSceneAccumulator = {
  /** Set when the self-check failed; callers must render directly instead. */
  readonly broken: boolean;
  /** Whether every configured round has been blended in. */
  readonly converged: boolean;
  /** The round the next renderRound call will produce, 0-based. */
  readonly nextRound: number;
  /**
   * Restart when the state the rounds sample from has changed. Cheap to call
   * with the same key every frame.
   */
  ensureState: (stateKey: string) => void;
  /** Sub-pixel NDC jitter for the round about to render, x/y in [-0.5,0.5]. */
  jitterFor: (round: number) => Vector2;
  /** Render one round of `renderScene` into the accumulation buffers. */
  renderRound: (
    renderer: WebGLRenderer,
    width: number,
    height: number,
    renderScene: () => void
  ) => void;
  /** Draw the accumulated average plus scene depth into the current target. */
  composite: (renderer: WebGLRenderer) => void;
  dispose: () => void;
};

export const buildSharedSceneAccumulator = (
  rounds: number
): SharedSceneAccumulator => {
  let sceneTarget: WebGLRenderTarget | null = null;
  let accumRead: WebGLRenderTarget | null = null;
  let accumWrite: WebGLRenderTarget | null = null;
  let width = 0;
  let height = 0;
  let round = 0;
  let stateKey = "";
  let selfChecked = false;
  let broken = false;

  const fullscreenScene = new Scene();
  const fullscreenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blendMaterial = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: COMPOSITE_VERTEX,
    fragmentShader: BLEND_FRAGMENT,
    uniforms: {
      tPrevious: { value: null as Texture | null },
      tRound: { value: null as Texture | null },
      uRoundWeight: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const compositeMaterial = new ShaderMaterial({
    glslVersion: GLSL3,
    vertexShader: COMPOSITE_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    uniforms: {
      tColor: { value: null as Texture | null },
      tDepth: { value: null as Texture | null },
    },
    transparent: true,
    blending: NormalBlending,
    // Depth is written from the stored scene depth; the test must always
    // pass for the write to happen at all.
    depthTest: true,
    depthFunc: AlwaysDepth,
    depthWrite: true,
  });
  const fullscreenMesh = new Mesh(new PlaneGeometry(2, 2), blendMaterial);
  fullscreenMesh.frustumCulled = false;
  fullscreenScene.add(fullscreenMesh);

  const disposeTargets = () => {
    sceneTarget?.depthTexture?.dispose();
    sceneTarget?.dispose();
    accumRead?.dispose();
    accumWrite?.dispose();
    sceneTarget = null;
    accumRead = null;
    accumWrite = null;
  };

  const ensureTargets = (nextWidth: number, nextHeight: number) => {
    if (sceneTarget && width === nextWidth && height === nextHeight) return;
    disposeTargets();
    width = nextWidth;
    height = nextHeight;
    const depthTexture = new DepthTexture(width, height);
    sceneTarget = new WebGLRenderTarget(width, height, {
      depthBuffer: true,
      depthTexture,
      samples: 0,
    });
    const accumOptions = {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
    } as const;
    accumRead = new WebGLRenderTarget(width, height, accumOptions);
    accumWrite = new WebGLRenderTarget(width, height, accumOptions);
    round = 0;
  };

  return {
    get broken() {
      return broken;
    },
    get converged() {
      return round >= rounds;
    },
    get nextRound() {
      return round;
    },
    ensureState(nextKey) {
      if (stateKey === nextKey) return;
      stateKey = nextKey;
      round = 0;
    },
    jitterFor(index) {
      return new Vector2(halton(index, 2), halton(index, 3));
    },
    renderRound(renderer, nextWidth, nextHeight, renderScene) {
      ensureTargets(nextWidth, nextHeight);
      if (!sceneTarget || !accumRead || !accumWrite) return;
      const previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(sceneTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);
      renderScene();
      renderer.setRenderTarget(accumWrite);
      fullscreenMesh.material = blendMaterial;
      blendMaterial.uniforms.tPrevious.value = accumRead.texture;
      blendMaterial.uniforms.tRound.value = sceneTarget.texture;
      blendMaterial.uniforms.uRoundWeight.value = 1 / (round + 1);
      renderer.render(fullscreenScene, fullscreenCamera);
      renderer.setRenderTarget(previousTarget);
      // Fall back to direct rendering if the first blend pass produces no data.
      if (!selfChecked && round === 0) {
        selfChecked = true;
        const scenePixel = new Uint8Array(4);
        renderer.readRenderTargetPixels(
          sceneTarget,
          Math.floor(width / 2),
          Math.floor(height / 2),
          1,
          1,
          scenePixel
        );
        const accumPixel = new Float32Array(4);
        renderer.readRenderTargetPixels(
          accumWrite,
          Math.floor(width / 2),
          Math.floor(height / 2),
          1,
          1,
          accumPixel
        );
        if (
          scenePixel[3] > 0 &&
          accumPixel[0] === 0 &&
          accumPixel[1] === 0 &&
          accumPixel[2] === 0 &&
          accumPixel[3] === 0
        ) {
          broken = true;
          console.error(
            "[shadow-simulation] accumulation self-check failed; falling back to direct rendering"
          );
        }
      }
      const swap = accumRead;
      accumRead = accumWrite;
      accumWrite = swap;
      round += 1;
    },
    composite(renderer) {
      if (!sceneTarget || !accumRead || round === 0) return;
      fullscreenMesh.material = compositeMaterial;
      compositeMaterial.uniforms.tColor.value = accumRead.texture;
      compositeMaterial.uniforms.tDepth.value = sceneTarget.depthTexture;
      renderer.render(fullscreenScene, fullscreenCamera);
    },
    dispose() {
      disposeTargets();
      blendMaterial.dispose();
      compositeMaterial.dispose();
      fullscreenMesh.geometry.dispose();
    },
  };
};
