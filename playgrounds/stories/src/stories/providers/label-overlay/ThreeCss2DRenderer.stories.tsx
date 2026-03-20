import { ResponsiveStatusBar } from "@carma-commons/ui/components";
import {
  PI_OVER_FOUR,
  PI_OVER_SIX,
  PI_OVER_TWO,
} from "@carma/math";
import {
  CSS2DObject,
  CSS2DRenderer,
  OrbitControls,
} from "@carma/three/core";
import type { Meta, StoryObj } from "@storybook/react";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import * as THREE from "@carma/three/core";

type ThreeCss2DRendererStoryArgs = {
  depthSort: boolean;
  selectedPriority: boolean;
};

type StoryRuntime = {
  renderer: THREE.WebGLRenderer;
  labelRenderer: CSS2DRenderer;
  controls: OrbitControls;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  selectedLabel: CSS2DObject;
  frameId: number;
  resizeObserver: ResizeObserver | null;
  handleWindowResize: (() => void) | null;
};

type AnchorDefinition = {
  key: string;
  title: string;
  subtitle: string;
  color: string;
  position: [number, number, number];
  selected?: boolean;
};

const shellStyle: CSSProperties = {
  width: "100%",
  height: "100vh",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  background:
    "linear-gradient(180deg, rgba(226,232,240,1) 0%, rgba(203,213,225,1) 100%)",
};

const viewportOuterStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  padding: 24,
  boxSizing: "border-box",
};

const viewportStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  minHeight: 520,
  overflow: "hidden",
  borderRadius: 20,
  border: "1px solid rgba(15, 23, 42, 0.14)",
  boxShadow: "0 24px 48px rgba(15, 23, 42, 0.16)",
  background:
    "radial-gradient(circle at top, rgba(255,255,255,0.96) 0%, rgba(226,232,240,0.98) 52%, rgba(203,213,225,1) 100%)",
};

const hudStyle: CSSProperties = {
  position: "absolute",
  left: 16,
  bottom: 16,
  zIndex: 5,
  pointerEvents: "none",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.38)",
  background: "rgba(15, 23, 42, 0.76)",
  color: "#e2e8f0",
  fontSize: 12,
  lineHeight: 1.45,
  fontFamily:
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  boxShadow: "0 12px 24px rgba(15, 23, 42, 0.18)",
};

const anchorDefinitions: AnchorDefinition[] = [
  {
    key: "near",
    title: "Near",
    subtitle: "closest label",
    color: "#0f766e",
    position: [0.18, 1.05, 1.7],
  },
  {
    key: "selected",
    title: "Selected",
    subtitle: "renderOrder boost",
    color: "#1d4ed8",
    position: [0, 1.35, 0],
    selected: true,
  },
  {
    key: "far",
    title: "Far",
    subtitle: "furthest label",
    color: "#b45309",
    position: [-0.18, 1.65, -1.7],
  },
];

const createLabelElement = ({
  title,
  subtitle,
  color,
  selected = false,
}: {
  title: string;
  subtitle: string;
  color: string;
  selected?: boolean;
}) => {
  const element = document.createElement("div");
  element.style.display = "flex";
  element.style.flexDirection = "column";
  element.style.alignItems = "flex-start";
  element.style.gap = "2px";
  element.style.padding = selected ? "8px 10px 9px" : "7px 9px 8px";
  element.style.borderRadius = "12px";
  element.style.border = `1px solid ${selected ? "rgba(29, 78, 216, 0.52)" : "rgba(15, 23, 42, 0.16)"}`;
  element.style.background = selected
    ? "rgba(239, 246, 255, 0.96)"
    : "rgba(255, 255, 255, 0.95)";
  element.style.boxShadow = selected
    ? "0 10px 22px rgba(29, 78, 216, 0.18)"
    : "0 8px 18px rgba(15, 23, 42, 0.16)";
  element.style.whiteSpace = "nowrap";
  element.style.backdropFilter = "blur(8px)";
  element.style.pointerEvents = "none";
  element.style.transformOrigin = "50% 100%";

  const titleRow = document.createElement("div");
  titleRow.style.display = "flex";
  titleRow.style.alignItems = "center";
  titleRow.style.gap = "7px";

  const swatch = document.createElement("span");
  swatch.style.width = "9px";
  swatch.style.height = "9px";
  swatch.style.borderRadius = "999px";
  swatch.style.background = color;
  swatch.style.boxShadow = `0 0 0 2px ${selected ? "rgba(191, 219, 254, 0.95)" : "rgba(255, 255, 255, 0.95)"}`;

  const titleText = document.createElement("span");
  titleText.textContent = title;
  titleText.style.fontFamily =
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  titleText.style.fontSize = "13px";
  titleText.style.fontWeight = selected ? "700" : "600";
  titleText.style.letterSpacing = "-0.01em";
  titleText.style.color = "#0f172a";

  const subtitleText = document.createElement("span");
  subtitleText.textContent = subtitle;
  subtitleText.style.fontFamily =
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  subtitleText.style.fontSize = "11px";
  subtitleText.style.lineHeight = "1.35";
  subtitleText.style.color = selected ? "#1d4ed8" : "#475569";

  titleRow.appendChild(swatch);
  titleRow.appendChild(titleText);
  element.appendChild(titleRow);
  element.appendChild(subtitleText);

  return element;
};

const ThreeCss2DRendererStory = ({
  depthSort,
  selectedPriority,
}: ThreeCss2DRendererStoryArgs) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<StoryRuntime | null>(null);

  useEffect(() => {
    const container = viewportRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#dbe4ef");
    scene.fog = new THREE.Fog("#dbe4ef", 7, 17);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(2.2, 2.5, 6.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.inset = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    labelRenderer.domElement.style.overflow = "hidden";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 10;
    controls.minPolarAngle = PI_OVER_SIX;
    controls.maxPolarAngle = PI_OVER_TWO;
    controls.target.set(0, 1.25, 0);
    controls.update();

    const ambientLight = new THREE.HemisphereLight("#f8fafc", "#64748b", 1.5);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight("#ffffff", 1.25);
    sunLight.position.set(5, 8, 4);
    scene.add(sunLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({
        color: "#cbd5e1",
        roughness: 0.95,
        metalness: 0.02,
      })
    );
    ground.rotation.x = -PI_OVER_TWO;
    scene.add(ground);

    const grid = new THREE.GridHelper(24, 24, "#94a3b8", "#cbd5e1");
    grid.position.y = 0.002;
    scene.add(grid);

    const stalkGeometry = new THREE.CylinderGeometry(0.02, 0.02, 1, 12);
    const sphereGeometry = new THREE.SphereGeometry(0.12, 32, 20);
    const selectedRingGeometry = new THREE.TorusGeometry(0.19, 0.016, 10, 40);

    let selectedLabel: CSS2DObject | null = null;

    anchorDefinitions.forEach((anchor) => {
      const anchorGroup = new THREE.Group();
      anchorGroup.position.set(...anchor.position);

      const stalk = new THREE.Mesh(
        stalkGeometry,
        new THREE.MeshStandardMaterial({
          color: anchor.color,
          transparent: true,
          opacity: 0.36,
          roughness: 0.88,
          metalness: 0.04,
        })
      );
      stalk.position.y = -anchor.position[1] * 0.5;
      stalk.scale.y = anchor.position[1];
      anchorGroup.add(stalk);

      const sphere = new THREE.Mesh(
        sphereGeometry,
        new THREE.MeshStandardMaterial({
          color: anchor.color,
          roughness: 0.3,
          metalness: 0.06,
        })
      );
      anchorGroup.add(sphere);

      if (anchor.selected) {
        const selectedRing = new THREE.Mesh(
          selectedRingGeometry,
          new THREE.MeshBasicMaterial({
            color: "#bfdbfe",
            transparent: true,
            opacity: 0.92,
          })
        );
        selectedRing.rotation.x = PI_OVER_FOUR;
        anchorGroup.add(selectedRing);
      }

      const label = new CSS2DObject(
        createLabelElement({
          title: anchor.title,
          subtitle: anchor.subtitle,
          color: anchor.color,
          selected: anchor.selected,
        })
      );
      label.center.set(0.5, 1);
      label.position.set(0, 0, 0);
      anchorGroup.add(label);

      if (anchor.selected) {
        selectedLabel = label;
      }

      scene.add(anchorGroup);
    });

    if (!selectedLabel) {
      return undefined;
    }

    container.appendChild(renderer.domElement);
    container.appendChild(labelRenderer.domElement);

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      labelRenderer.setSize(width, height);
    };

    resize();

    let resizeObserver: ResizeObserver | null = null;
    let handleWindowResize: (() => void) | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        resize();
      });
      resizeObserver.observe(container);
    } else {
      handleWindowResize = () => {
        resize();
      };
      window.addEventListener("resize", handleWindowResize);
    }

    const runtime: StoryRuntime = {
      renderer,
      labelRenderer,
      controls,
      scene,
      camera,
      selectedLabel,
      frameId: 0,
      resizeObserver,
      handleWindowResize,
    };
    runtimeRef.current = runtime;

    const renderFrame = () => {
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      runtime.frameId = window.requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      if (runtime.frameId) {
        window.cancelAnimationFrame(runtime.frameId);
      }
      runtime.resizeObserver?.disconnect();
      if (runtime.handleWindowResize) {
        window.removeEventListener("resize", runtime.handleWindowResize);
      }
      controls.dispose();
      renderer.dispose();
      labelRenderer.domElement.remove();
      renderer.domElement.remove();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;

    runtime.labelRenderer.sortObjects = depthSort;
    runtime.selectedLabel.renderOrder = selectedPriority ? 10 : 0;
    runtime.renderer.render(runtime.scene, runtime.camera);
    runtime.labelRenderer.render(runtime.scene, runtime.camera);
  }, [depthSort, selectedPriority]);

  const statusText = [
    `CSS2D depth sort ${depthSort ? "on" : "off"}`,
    selectedPriority
      ? "selected label renderOrder boosted"
      : "selected label uses default renderOrder",
    "drag to orbit",
    "labels are bottom-centered via CSS2DObject.center",
  ].join(" • ");

  return (
    <div style={shellStyle}>
      <div style={{ position: "sticky", top: 0, zIndex: 10 }}>
        <ResponsiveStatusBar text={statusText} tone="dark" />
      </div>
      <div style={viewportOuterStyle}>
        <div ref={viewportRef} style={viewportStyle}>
          <div style={hudStyle}>
            <div>Useful CSS2D bits for labels here:</div>
            <div>`sortObjects` for z-order</div>
            <div>`renderOrder` for selected priority</div>
            <div>`center` for anchor alignment</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const meta: Meta<ThreeCss2DRendererStoryArgs> = {
  title: "Providers/LabelOverlay/Benchmarks/Three CSS2D",
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: false,
      sort: "requiredFirst",
    },
    docs: {
      description: {
        component:
          "Focused Three CSS2DRenderer evaluation for label and annotation use cases. This story only exercises the pieces that look practically useful for CARMA overlays: CSS2DObject anchor centering, renderer z-index sorting, and renderOrder priority for a selected label. It intentionally does not explore CSS3D transforms or generic scene UI.",
      },
    },
  },
  args: {
    depthSort: true,
    selectedPriority: true,
  },
  argTypes: {
    depthSort: {
      name: "depth sort",
      control: "boolean",
      description:
        "Maps to CSS2DRenderer.sortObjects and assigns z-index by renderOrder and then camera distance.",
      table: {
        category: "CSS2D",
      },
    },
    selectedPriority: {
      name: "selected priority",
      control: "boolean",
      description:
        "Boost the selected label via CSS2DObject.renderOrder so it stays above peers when depth sorting is enabled.",
      table: {
        category: "CSS2D",
      },
    },
  },
  render: (args) => <ThreeCss2DRendererStory {...args} />,
};

export default meta;

export const ThreeCss2DSort: StoryObj<ThreeCss2DRendererStoryArgs> = {
  name: "Depth Sort",
};
