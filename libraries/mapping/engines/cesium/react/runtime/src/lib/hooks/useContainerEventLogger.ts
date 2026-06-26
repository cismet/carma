import { useEffect, type RefObject } from "react";

/**
 * Hook to monitor and log all events happening to the Cesium container.
 * Helps diagnose WebGL context loss issues during transitions.
 */
export function useContainerEventLogger(
  containerRef: RefObject<HTMLDivElement>,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    const logPrefix = "[CONTAINER-EVENTS]";

    // ResizeObserver to track size changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        console.warn(
          `${logPrefix} 📐 RESIZE detected:`,
          { width, height },
          {
            offsetWidth: container.offsetWidth,
            offsetHeight: container.offsetHeight,
            clientWidth: container.clientWidth,
            clientHeight: container.clientHeight,
            scrollWidth: container.scrollWidth,
            scrollHeight: container.scrollHeight,
          }
        );
      }
    });

    // MutationObserver to track style/attribute changes
    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes") {
          const target = mutation.target as HTMLElement;
          console.warn(
            `${logPrefix} 🔧 ATTRIBUTE changed:`,
            mutation.attributeName,
            {
              oldValue: mutation.oldValue,
              newValue: target.getAttribute(mutation.attributeName || ""),
              style: target.style.cssText,
              className: target.className,
            }
          );
        } else if (mutation.type === "childList") {
          console.warn(`${logPrefix} 👶 CHILDREN changed:`, {
            addedNodes: mutation.addedNodes.length,
            removedNodes: mutation.removedNodes.length,
          });
        }
      });
    });

    // Track display/visibility changes
    const checkVisibility = () => {
      const computed = window.getComputedStyle(container);
      return {
        display: computed.display,
        visibility: computed.visibility,
        opacity: computed.opacity,
        position: computed.position,
        zIndex: computed.zIndex,
        pointerEvents: computed.pointerEvents,
      };
    };

    let lastVisibility = checkVisibility();
    console.warn(`${logPrefix} 👁️ Initial visibility state:`, lastVisibility);

    // Monitor canvas element if it exists
    const monitorCanvas = () => {
      const canvas = container.querySelector("canvas");
      if (canvas) {
        console.warn(`${logPrefix} 🎨 Canvas found:`, {
          width: canvas.width,
          height: canvas.height,
          clientWidth: canvas.clientWidth,
          clientHeight: canvas.clientHeight,
          webglContext: canvas.getContext("webgl2")
            ? "webgl2"
            : canvas.getContext("webgl")
            ? "webgl"
            : "none",
        });

        // Monitor WebGL context loss
        canvas.addEventListener("webglcontextlost", (event) => {
          console.error(`${logPrefix} ❌ WebGL context LOST:`, event);
          console.error(`${logPrefix} Container state:`, {
            dimensions: checkVisibility(),
            isConnected: container.isConnected,
            parentElement: container.parentElement?.tagName,
          });
        });

        canvas.addEventListener("webglcontextrestored", (event) => {
          console.warn(`${logPrefix} ✅ WebGL context RESTORED:`, event);
        });
      }
    };

    // Start monitoring
    resizeObserver.observe(container);
    mutationObserver.observe(container, {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      subtree: true,
    });

    // Check for canvas periodically (it might be added after mount)
    const canvasCheckInterval = setInterval(() => {
      const canvas = container.querySelector("canvas");
      if (canvas) {
        monitorCanvas();
        clearInterval(canvasCheckInterval);
      }
    }, 100);

    // Monitor visibility changes via polling (since there's no native event)
    const visibilityCheckInterval = setInterval(() => {
      const currentVisibility = checkVisibility();
      const changed = Object.keys(currentVisibility).some(
        (key) => currentVisibility[key] !== lastVisibility[key]
      );

      if (changed) {
        console.warn(`${logPrefix} 👁️ Visibility state changed:`, {
          before: lastVisibility,
          after: currentVisibility,
        });
        lastVisibility = currentVisibility;
      }
    }, 100);

    console.warn(`${logPrefix} 🚀 Container monitoring started`);

    // Cleanup
    return () => {
      console.warn(`${logPrefix} 🛑 Container monitoring stopped`);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      clearInterval(canvasCheckInterval);
      clearInterval(visibilityCheckInterval);
    };
  }, [containerRef, enabled]);
}
