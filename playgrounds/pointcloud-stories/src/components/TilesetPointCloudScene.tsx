import { useEffect, useRef, useState } from "react";
import { TilesRenderer } from "3d-tiles-renderer";
import {
  GLTFExtensionsPlugin,
  ReorientationPlugin,
} from "3d-tiles-renderer/plugins";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/**
 * Minimal viewer for a 3D Tiles 1.1 point tileset (glTF POINTS content), used
 * to review tilesets produced by scripts/copc-to-3dtiles.mjs before they are
 * published. Deliberately independent of the COPC viewer so the tileset is
 * exercised through the plain 3d-tiles-renderer path.
 */
export function TilesetPointCloudScene({
  tilesetUrl = "/pointcloud-3dtiles/oelberg-test/tileset.json",
  pointSize = 2,
  background = "#0d1117",
  errorTarget = 8,
}: {
  tilesetUrl?: string;
  pointSize?: number;
  background?: string;
  errorTarget?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Loading tileset…");
  const settingsRef = useRef({ pointSize, errorTarget });
  settingsRef.current = { pointSize, errorTarget };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 20_000);
    camera.position.set(200, 200, 200);
    const controls = new OrbitControls(camera, renderer.domElement);

    const tiles = new TilesRenderer(tilesetUrl);
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
    );
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader }));
    // Places the tileset's geographic position into a local scene frame.
    tiles.registerPlugin(new ReorientationPlugin({ recenter: true }));
    tiles.errorTarget = errorTarget;
    tiles.setCamera(camera);
    tiles.setResolutionFromRenderer(camera, renderer);
    scene.add(tiles.group);

    let framed = false;
    const onLoadModel = (event: { scene?: THREE.Object3D }) => {
      if (!event.scene) return;
      event.scene.traverse((child) => {
        const points = child as THREE.Points;
        if (!(points instanceof THREE.Points)) return;
        const material = points.material as THREE.PointsMaterial;
        material.size = settingsRef.current.pointSize;
        material.sizeAttenuation = false;
        material.vertexColors = Boolean(
          points.geometry.getAttribute("color")
        );
        material.needsUpdate = true;
      });
      if (!framed) {
        framed = true;
        const box = new THREE.Box3();
        if (tiles.getBoundingBox(box)) {
          // getBoundingBox reports the tileset frame; the reorientation
          // plugin's transform lives on the group, so lift it to world space
          // before framing (otherwise the camera lands out at ECEF).
          tiles.group.updateMatrixWorld();
          box.applyMatrix4(tiles.group.matrixWorld);
          const center = box.getCenter(new THREE.Vector3());
          const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 5);
          controls.target.copy(center);
          camera.position
            .copy(center)
            .add(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(radius * 2));
          camera.near = radius / 1000;
          camera.far = radius * 100;
          camera.updateProjectionMatrix();
          controls.update();
        }
      }
    };
    tiles.addEventListener("load-model", onLoadModel);

    const publishStatus = () => {
      const stats = (
        tiles as unknown as {
          stats: { downloading: number; parsing: number; failed: number };
        }
      ).stats;
      let points = 0;
      tiles.group.traverse((child) => {
        const geometry = (child as THREE.Points).geometry;
        if (geometry?.getAttribute?.("position")) {
          points += geometry.getAttribute("position").count;
        }
      });
      setStatus(
        `${points.toLocaleString()} points · downloading ${stats.downloading} · ` +
          `parsing ${stats.parsing}${stats.failed ? ` · failed ${stats.failed}` : ""}`
      );
    };
    const onLoadError = (event: { error?: unknown }) => {
      setStatus(
        `Tileset error: ${
          event.error instanceof Error ? event.error.message : String(event.error)
        }`
      );
    };
    tiles.addEventListener("load-error", onLoadError);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      tiles.setResolutionFromRenderer(camera, renderer);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let frame = 0;
    let statusCountdown = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      if (disposed) return;
      controls.update();
      camera.updateMatrixWorld();
      tiles.errorTarget = settingsRef.current.errorTarget;
      tiles.update();
      renderer.render(scene, camera);
      if (statusCountdown-- <= 0) {
        statusCountdown = 30;
        publishStatus();
      }
    };
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      tiles.removeEventListener("load-model", onLoadModel);
      tiles.removeEventListener("load-error", onLoadError);
      tiles.dispose();
      dracoLoader.dispose();
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [tilesetUrl, errorTarget, pointSize]);

  return (
    <div
      style={{ position: "absolute", inset: 0, background }}
      ref={containerRef}
    >
      <div
        className="pointcloud-status"
        style={{ position: "absolute", right: 8, bottom: 8, zIndex: 5 }}
      >
        {status}
      </div>
    </div>
  );
}
