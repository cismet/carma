import { useEffect, useRef, useState } from "react";

/**
 * How far the app's own chrome reaches down over the top of the map area.
 *
 * The geoportal's map container runs up behind the navbar and the layer bar
 * floats over it, so the top edge of the map area is not the top edge of what
 * the user can see. A mode that lays real windows out over that area either
 * accepts it, and has the upper windows cut off along their top, or asks here
 * how much is covered and keeps clear of it.
 *
 * Measured rather than taken as a number from the config, because the answer
 * changes while the comparison runs: zen mode takes the layer bar away and
 * moves the map container up under the vanished navbar in one go. Neither is a
 * size change of the map area, which is why a `ResizeObserver` on its own is
 * not enough and the tree has to be watched as well.
 *
 * Returns 0 when disabled, when no selector was given, or when nothing matches
 * it, so a route that has not said what its toolbar is simply gets the
 * uncorrected layout.
 */
export const useToolbarInset = (
  host: HTMLElement | null,
  selector: string | undefined,
  enabled: boolean
): number => {
  const [inset, setInset] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !host || !selector) {
      setInset(0);
      return;
    }

    const measure = () => {
      frameRef.current = null;
      const toolbar = document.querySelector(selector);
      if (!toolbar) {
        setInset(0);
        return;
      }
      const area = host.getBoundingClientRect();
      const bar = toolbar.getBoundingClientRect();
      // an element that is `display: none` still matches the selector and
      // measures as an empty rectangle at the origin, which is not a strip of
      // the map area being covered
      if (bar.width === 0 && bar.height === 0) {
        setInset(0);
        return;
      }
      // negative while the bar sits entirely above the map area, which is
      // nothing to keep clear of
      const covered = bar.bottom - area.top;
      setInset(Math.max(0, Math.min(covered, area.height)));
    };

    // one measurement per frame at most: reading the two rectangles forces a
    // layout, and the things that trigger it can arrive in bursts
    const schedule = () => {
      if (frameRef.current !== null) {
        return;
      }
      frameRef.current = requestAnimationFrame(measure);
    };

    measure();

    const sizes = new ResizeObserver(schedule);
    sizes.observe(host);
    const toolbar = document.querySelector(selector);
    if (toolbar) {
      sizes.observe(toolbar);
    }

    // Mutations inside the stage are ignored: the maps under it rewrite their
    // own canvases on every frame of a drag, and nothing inside the map area
    // can be the chrome covering it.
    const tree = new MutationObserver((records) => {
      if (records.every((record) => host.contains(record.target))) {
        return;
      }
      schedule();
    });
    tree.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden"],
    });

    window.addEventListener("resize", schedule);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      sizes.disconnect();
      tree.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [enabled, host, selector]);

  return inset;
};
