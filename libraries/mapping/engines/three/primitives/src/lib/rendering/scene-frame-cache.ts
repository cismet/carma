import * as THREE from "three";

const BYTES_PER_PIXEL = 20; // RGBA32F + depth32, no persistent/baked assets.

/** One volatile native-pixel linear-HDR image. The caller's key MUST describe
 * every change to the rendered scene; this is not a temporal reprojection.
 * Decision FRAME-REPLAY-20260908: SceneAccumulator(1) also retains four unused
 * working/settled targets and performs readback. Here one image suffices. A
 * hard byte ceiling falls back to direct rendering, never lower resolution.
 */
export class SceneFrameCache {
  private target: THREE.WebGLRenderTarget | null = null;
  private key: string | null = null;
  private broken = false;
  private captures = 0;
  private reuses = 0;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { color: { value: null }, depth: { value: null } },
    vertexShader: `out vec2 uvCopy;
      void main() { uvCopy = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `
      layout(location = 0) out highp vec4 outputColor;
      in vec2 uvCopy;
      uniform sampler2D color;
      uniform sampler2D depth;
      void main() {
        vec4 value = texture(color, uvCopy);
        if (value.a == 0.0) discard;
        #ifdef TONE_MAPPING
          value.rgb = toneMapping(value.rgb);
        #endif
        outputColor = linearToOutputTexel(value);
        // Offscreen capture uses [0,1]; restore the host framebuffer's actual
        // depth range, including MapLibre's reserved overlay range.
        gl_FragDepth = mix(gl_DepthRange.near, gl_DepthRange.far, texture(depth, uvCopy).r);
      }`,
    depthTest: true,
    depthFunc: THREE.LessEqualDepth,
    depthWrite: true,
    transparent: true,
    blending: THREE.NormalBlending,
  });
  private readonly quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    this.material
  );

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly maximumBytes = 256 * 1024 ** 2
  ) {
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get stats() {
    return {
      captures: this.captures,
      reuses: this.reuses,
      bytes: this.target
        ? this.target.width * this.target.height * BYTES_PER_PIXEL
        : 0,
      broken: this.broken,
    };
  }

  invalidate() {
    this.key = null;
  }

  /** Render or reuse an exact registered image. False means direct fallback. */
  render(
    key: string,
    width: number,
    height: number,
    draw: () => void
  ): boolean {
    const renderer = this.renderer;
    if (
      this.broken ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > renderer.capabilities.maxTextureSize ||
      height > renderer.capabilities.maxTextureSize ||
      width * height * BYTES_PER_PIXEL > this.maximumBytes ||
      !renderer.extensions.has("EXT_color_buffer_float")
    ) {
      this.releaseTarget();
      draw();
      return false;
    }
    const previous = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace();
    const mip = renderer.getActiveMipmapLevel();
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    const clearColor = renderer.getClearColor(new THREE.Color());
    const clearAlpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    const restore = () => {
      renderer.setRenderTarget(previous, face, mip);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      renderer.setClearColor(clearColor, clearAlpha);
      renderer.autoClear = autoClear;
    };
    try {
      if (this.target?.width !== width || this.target?.height !== height) {
        this.releaseTarget();
        this.target = new THREE.WebGLRenderTarget(width, height, {
          type: THREE.FloatType,
          format: THREE.RGBAFormat,
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          depthTexture: new THREE.DepthTexture(
            width,
            height,
            THREE.UnsignedIntType
          ),
          samples: 0,
        });
        try {
          renderer.initRenderTarget(this.target);
        } catch {
          this.broken = true;
          this.releaseTarget();
          restore();
          draw();
          return false;
        }
      }
      const registeredKey = JSON.stringify([
        key,
        width,
        height,
        renderer.outputColorSpace,
        renderer.toneMapping,
        renderer.toneMappingExposure,
        previous?.texture.colorSpace,
      ]);
      renderer.autoClear = false;
      if (this.key !== registeredKey) {
        this.key = null;
        renderer.setRenderTarget(this.target);
        renderer.setViewport(new THREE.Vector4(0, 0, width, height));
        renderer.setScissorTest(false);
        renderer.setClearColor(0, 0);
        renderer.clear(true, true, false);
        draw();
        this.key = registeredKey;
        this.captures += 1;
      } else this.reuses += 1;
      restore();
      renderer.autoClear = false;
      this.material.uniforms.color.value = this.target!.texture;
      this.material.uniforms.depth.value = this.target!.depthTexture;
      renderer.render(this.scene, this.camera);
      return true;
    } catch (error) {
      this.invalidate();
      throw error;
    } finally {
      restore();
    }
  }

  private releaseTarget() {
    this.target?.depthTexture?.dispose();
    this.target?.dispose();
    this.target = null;
    this.key = null;
  }

  dispose() {
    this.releaseTarget();
    this.broken = true;
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
