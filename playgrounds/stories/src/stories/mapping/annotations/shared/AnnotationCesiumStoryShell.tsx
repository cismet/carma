import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Scene, CesiumWidget } from "@carma/cesium";
import { LabelOverlayProvider } from "@carma-providers/label-overlay";
import { useCesiumLabelOverlayHost } from "@carma-mapping/engines/cesium/react/interactions";
import { setupCesium } from "../../../map-framework-switcher/helpers/cesium-setup";

import "cesium/Build/Cesium/Widgets/widgets.css";

if (
  typeof window !== "undefined" &&
  !(window as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL
) {
  (window as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/__cesium__/";
}

const STORY_HEIGHT = "100vh";

const requestRenderWithOptions = (
  scene: Scene | null,
  opts?: {
    delay?: number;
    repeat?: number;
    repeatInterval?: number;
  }
) => {
  if (!scene || scene.isDestroyed()) return;
  const delay = Math.max(0, opts?.delay ?? 0);
  const repeat = Math.max(1, opts?.repeat ?? 1);
  const repeatInterval = Math.max(0, opts?.repeatInterval ?? 50);

  const renderOnce = () => {
    if (!scene.isDestroyed()) {
      scene.requestRender();
    }
  };

  if (delay > 0) {
    window.setTimeout(renderOnce, delay);
  } else {
    renderOnce();
  }

  for (let index = 1; index < repeat; index += 1) {
    window.setTimeout(renderOnce, delay + repeatInterval * index);
  }
};

export const AnnotationCesiumStoryShell = ({
  children,
  height = STORY_HEIGHT,
}: {
  children: ReactNode | ((context: { scene: Scene | null }) => ReactNode);
  height?: number | string;
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const cesiumContainerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<CesiumWidget | null>(null);
  const [isWidgetReady, setIsWidgetReady] = useState(false);
  const scene =
    isWidgetReady && widgetRef.current && !widgetRef.current.isDestroyed()
      ? widgetRef.current.scene
      : null;
  const overlayHost = useCesiumLabelOverlayHost({
    scene,
    containerRef: rootRef,
  });

  useEffect(() => {
    if (!cesiumContainerRef.current) return;
    let disposed = false;

    const initialize = async () => {
      const setup = await setupCesium(
        cesiumContainerRef.current as HTMLDivElement,
        { useBrowserRecommendedResolution: false }
      );
      if (disposed) {
        if (!setup.widget.isDestroyed()) {
          setup.widget.destroy();
        }
        return;
      }

      if (setup.terrainProviders.TERRAIN) {
        setup.widget.scene.terrainProvider = setup.terrainProviders.TERRAIN;
      }

      widgetRef.current = setup.widget;
      setIsWidgetReady(true);
      setup.widget.scene.requestRender();
    };

    initialize().catch((error) => {
      console.error(
        "[STORY][ANNOTATIONS] Failed to initialize Cesium shell",
        error
      );
    });

    return () => {
      disposed = true;
      setIsWidgetReady(false);
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget && !widget.isDestroyed()) {
        widget.destroy();
      }
    };
  }, []);

  useEffect(() => {
    requestRenderWithOptions(scene, { repeat: 2, repeatInterval: 40 });
  }, [scene]);

  const renderedChildren =
    typeof children === "function" ? children({ scene }) : children;

  return (
    <div
      ref={rootRef}
      style={{
        position: "relative",
        width: "100%",
        height,
        overflow: "hidden",
        backgroundColor: "transparent",
      }}
    >
      <div
        ref={cesiumContainerRef}
        style={{
          position: "absolute",
          inset: 0,
        }}
      />
      <LabelOverlayProvider host={overlayHost}>
        {renderedChildren}
      </LabelOverlayProvider>
    </div>
  );
};
