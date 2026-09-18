import * as THREE from "three";

import {
  NIGHT_LIGHT_ATLAS_MAX_RESOLUTION,
  type NightLightAtlasInput,
} from "../../core/night-light-atlas";

/**
 * Decision NIGHT-BARMEN-20260913 (engine README): a worker bakes fixed lamps
 * into a bounded projected irradiance field. This is NOT an occlusion bake.
 * Moving lights remain ordinary Three lights in the same renderer and scene.
 */
export function createSharedSceneNightLightAtlas(
  scene: THREE.Scene,
  onStatus: (message: string) => void,
  onError: (error: unknown) => void
) {
  const worker = new Worker(
    new URL("./night-light-atlas.worker.ts", import.meta.url),
    {
      type: "module",
    }
  );
  let texture = new THREE.DataTexture(new Uint8Array(4), 1, 1);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const uniforms = {
    nightAtlas: { value: texture },
    nightBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
    nightHeights: { value: new THREE.Vector2(0, 1) },
    nightStrength: { value: 1.8 },
  };
  const materials = new Map<
    THREE.Material,
    {
      compile: THREE.Material["onBeforeCompile"];
      key: THREE.Material["customProgramCacheKey"];
      onDispose: () => void;
    }
  >();
  const markerGeometry = new THREE.SphereGeometry(0.65, 6, 4);
  const markerMaterial = new THREE.MeshBasicMaterial({
    color: "#fff3c4",
    toneMapped: false,
  });
  let markers: THREE.InstancedMesh | null = null;
  let pending: NightLightAtlasInput | null = null;
  let active: { id: number; input: NightLightAtlasInput } | null = null;
  let generation = 0;
  let disposed = false;

  const dispatch = () => {
    if (!pending || active || disposed) return;
    active = { id: generation, input: pending };
    pending = null;
    onStatus(`Worker backt ${active.input.lights.length} feste Leuchten`);
    worker.postMessage({ id: active.id, input: active.input });
  };
  worker.onmessage = ({
    data,
  }: MessageEvent<{ id: number; pixels?: Uint8Array; error?: string }>) => {
    if (disposed || !active || data.id !== active.id) return;
    const completed = active;
    active = null;
    // Keep the previous atlas visible until its replacement is complete.
    if (completed.id === generation) {
      if (data.error || !data.pixels) {
        onError(
          new Error(data.error ?? "Night atlas worker returned no pixels")
        );
      } else {
        const input = completed.input;
        // Three uses immutable GPU storage once uploaded. Do not resize the
        // initial 1x1 placeholder (or an already resident atlas) in place.
        const nextTexture = new THREE.DataTexture(
          data.pixels,
          input.resolution,
          input.resolution
        );
        nextTexture.minFilter = THREE.LinearFilter;
        nextTexture.magFilter = THREE.LinearFilter;
        nextTexture.generateMipmaps = false;
        nextTexture.needsUpdate = true;
        uniforms.nightAtlas.value = nextTexture;
        texture.dispose();
        texture = nextTexture;
        uniforms.nightBounds.value.set(...input.bounds);
        uniforms.nightHeights.value.set(...input.heightRange);
        if (markers) {
          markers.removeFromParent();
          markers.dispose();
        }
        markers = new THREE.InstancedMesh(
          markerGeometry,
          markerMaterial,
          input.lights.length
        );
        markers.name = "night-baked-streetlight-markers";
        const matrix = new THREE.Matrix4();
        input.lights.forEach((light, index) => {
          matrix.makeTranslation(...light.position);
          markers!.setMatrixAt(index, matrix);
        });
        markers.instanceMatrix.needsUpdate = true;
        scene.add(markers);
        onStatus(
          `${input.lights.length} Leuchten gebacken · ${input.resolution}² · ${(
            data.pixels.byteLength /
            1024 ** 2
          ).toFixed(1)} MiB`
        );
      }
    }
    dispatch();
  };
  worker.onerror = (event) => {
    active = null;
    if (!disposed) onError(new Error(event.message));
  };

  return {
    setLights(input: NightLightAtlasInput) {
      if (disposed) return;
      generation++;
      pending = {
        ...input,
        resolution: Math.min(
          input.resolution,
          NIGHT_LIGHT_ATLAS_MAX_RESOLUTION
        ),
      };
      dispatch();
    },
    /** Call on content/material revision, never traverse the tile tree per frame. */
    reconcile(root: THREE.Object3D) {
      if (disposed) return;
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          if (materials.has(material)) continue;
          const original = material.onBeforeCompile;
          const key = material.customProgramCacheKey;
          const onDispose = () => {
            material.removeEventListener("dispose", onDispose);
            materials.delete(material);
          };
          materials.set(material, { compile: original, key, onDispose });
          material.addEventListener("dispose", onDispose);
          material.onBeforeCompile = function (shader, renderer) {
            original.call(this, shader, renderer);
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader =
              `varying vec3 nightWorldPosition;\n${shader.vertexShader}`.replace(
                "#include <project_vertex>",
                `#include <project_vertex>
              vec4 nightVertex = vec4(transformed, 1.0);
              #ifdef USE_BATCHING
                nightVertex = batchingMatrix * nightVertex;
              #endif
              #ifdef USE_INSTANCING
                nightVertex = instanceMatrix * nightVertex;
              #endif
              nightWorldPosition = (modelMatrix * nightVertex).xyz;`
              );
            shader.fragmentShader = `
              varying vec3 nightWorldPosition;
              uniform sampler2D nightAtlas;
              uniform vec4 nightBounds;
              uniform vec2 nightHeights;
              uniform float nightStrength;
              ${shader.fragmentShader}`.replace(
              "#include <opaque_fragment>",
              `vec2 nightUv = (nightWorldPosition.xz - nightBounds.xy) / (nightBounds.zw - nightBounds.xy);
              if (all(greaterThanEqual(nightUv, vec2(0.0))) && all(lessThanEqual(nightUv, vec2(1.0)))) {
                vec4 field = texture2D(nightAtlas, nightUv);
                float ground = mix(nightHeights.x, nightHeights.y, field.a);
                // Projected field: reduce upper-roof spill, but do not claim wall occlusion.
                float verticalFalloff = exp(-abs(nightWorldPosition.y - ground) / 14.0);
                outgoingLight += diffuseColor.rgb * field.rgb * nightStrength * verticalFalloff;
              }
              #include <opaque_fragment>`
            );
          };
          material.customProgramCacheKey = () =>
            `${key.call(material)}|night-field-v1`;
          material.needsUpdate = true;
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      worker.terminate();
      pending = null;
      active = null;
      for (const [material, state] of materials) {
        material.onBeforeCompile = state.compile;
        material.customProgramCacheKey = state.key;
        material.removeEventListener("dispose", state.onDispose);
        material.needsUpdate = true;
      }
      materials.clear();
      if (markers) {
        markers.removeFromParent();
        markers.dispose();
      }
      markerGeometry.dispose();
      markerMaterial.dispose();
      texture.dispose();
    },
  };
}
