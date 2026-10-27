import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import "pannellum/build/pannellum.css";
import "pannellum";
import "./PanoramaPreview.css";
import {
  resolvePanoramaScene,
  type PannellumViewer,
  type PanoramaView,
} from "./panoramaScene";

interface PanoramaPreviewProps {
  /** URL of an equirectangular panorama image (fallback when no multires). */
  src: string;
  /** URL of a pannellum multiresolution config.json; preferred over `src`. */
  multiResConfigUrl?: string;
  /**
   * Further photos taken together with the panorama (e.g. side cameras). They
   * follow the panorama as slides 2..n; arrows on the preview step through them.
   */
  photos?: string[];
  /**
   * Called when the user clicks the expand control (open fullscreen), with the
   * slide shown in the preview: 0 is the panorama, 1..n the `photos`.
   */
  onExpand?: (index: number) => void;
  /** Called with the viewer's current view as the user looks around. */
  onViewChange?: (view: PanoramaView) => void;
  /** Initial view yaw (deg); rotates the image so it opens facing forward. */
  initialYaw?: number;
  /**
   * Turn to this view whenever a new object is passed (e.g. the fullscreen
   * viewer's view when it closes), so the two viewers stay in sync.
   */
  view?: PanoramaView;
}

/**
 * Desktop: fixed thumbnail. Mobile (infobox goes full width): fill the row.
 *
 * The infobox places each secondary element in a shrink-to-fit, right-aligned
 * cell, so a percentage width collapses the cell to ~zero. We must set an
 * explicit pixel width.
 */
const getPreviewWidth = () =>
  typeof window !== "undefined" && window.innerWidth <= 700
    ? window.innerWidth - 16
    : 250;

const PREVIEW_HEIGHT = 160;

/**
 * Small inline, draggable 360° preview rendered in the infobox. Drag to peek;
 * the expand control opens the fullscreen PanoramaLightBox.
 */
export const PanoramaPreview = ({
  src,
  multiResConfigUrl,
  photos = [],
  onExpand,
  onViewChange,
  initialYaw,
  view,
}: PanoramaPreviewProps) => {
  // Slide shown in the preview: 0 is the panorama, 1..n the photos. Kept when
  // the next feature is selected, so the user stays on the same camera.
  const [index, setIndex] = useState(0);
  const slideCount = 1 + photos.length;
  const shownIndex = index < slideCount ? index : 0;
  const step = (e: MouseEvent, delta: number) => {
    // don't let the click reach the viewer (drag) or the photo (expand)
    e.stopPropagation();
    setIndex((shownIndex + delta + slideCount) % slideCount);
  };
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PannellumViewer | null>(null);
  const [width, setWidth] = useState<number>(getPreviewWidth);
  // Held in refs so changing their identity never re-inits the viewer.
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  const initialYawRef = useRef(initialYaw);
  initialYawRef.current = initialYaw;
  // A host-given view not applied yet: used as the start view of a viewer
  // being created, or applied by the poll once the current viewer has loaded
  // (pannellum overwrites a view set before that).
  const pendingViewRef = useRef<PanoramaView | undefined>(undefined);

  useEffect(() => {
    if (view) {
      pendingViewRef.current = view;
    }
  }, [view]);

  useEffect(() => {
    const onResize = () => setWidth(getPreviewWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Init the viewer once per panorama. Re-initialising on width changes would
  // reload the image; instead we refit the existing viewer below.
  useEffect(() => {
    const el = containerRef.current;
    const pannellum = window.pannellum;
    if (!el || !pannellum) return;

    // Scene resolution is async (a multires config is fetched), so guard against
    // the effect being cleaned up before the viewer is created.
    let cancelled = false;
    let raf = 0;

    resolvePanoramaScene(src, multiResConfigUrl).then((scene) => {
      if (cancelled) return;
      const startView = pendingViewRef.current;
      pendingViewRef.current = undefined;
      const viewer = pannellum.viewer(el, {
        ...scene,
        autoLoad: true,
        showControls: false,
        showFullscreenCtrl: false,
        showZoomCtrl: false,
        keyboardZoom: false,
        mouseZoom: false,
        compass: false,
        draggable: true,
        yaw: startView?.yaw ?? initialYawRef.current ?? 0,
        pitch: startView?.pitch ?? 0,
      });
      viewerRef.current = viewer;

      // Pannellum has no continuous "view changed" event, so poll the view on
      // each frame and report changes (lets the map's selection arrow follow).
      let lastYaw = NaN;
      let lastPitch = NaN;
      const tick = () => {
        // Skip until loaded: before that pannellum reports yaw 0, not the
        // configured initial yaw, which would briefly flip the map arrow 180°.
        if (!viewer.isLoaded || viewer.isLoaded()) {
          const pending = pendingViewRef.current;
          if (pending) {
            pendingViewRef.current = undefined;
            viewer.lookAt(pending.pitch, pending.yaw, undefined, false);
          }
          const yaw = viewer.getYaw();
          const pitch = viewer.getPitch();
          if (yaw !== lastYaw || pitch !== lastPitch) {
            lastYaw = yaw;
            lastPitch = pitch;
            onViewChangeRef.current?.({ yaw, pitch });
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      viewerRef.current?.destroy();
      viewerRef.current = null;
    };
  }, [src, multiResConfigUrl]);

  // Refit the already-loaded viewer to the new container width (no reload).
  useEffect(() => {
    viewerRef.current?.resize();
  }, [width]);

  return (
    <div
      className="carma-panorama-preview"
      style={{ width, height: PREVIEW_HEIGHT }}
    >
      {/* the viewer stays mounted under a photo, so going back to the
          panorama neither reloads it nor loses the view direction */}
      <div ref={containerRef} className="carma-panorama-preview__viewer" />
      {shownIndex > 0 && (
        <img
          src={photos[shownIndex - 1]}
          alt=""
          className="carma-panorama-preview__photo"
          onClick={() => onExpand?.(shownIndex)}
        />
      )}
      {onExpand && (
        <button
          type="button"
          aria-label="Panorama im Vollbild öffnen"
          onClick={(e) => {
            e.stopPropagation();
            onExpand(shownIndex);
          }}
          className="carma-panorama-preview__expand"
        >
          ⤢
        </button>
      )}
      {slideCount > 1 && (
        <>
          <button
            type="button"
            title="vorheriges Bild"
            aria-label="vorheriges Bild"
            className="carma-panorama-preview__step carma-panorama-preview__step--previous"
            onClick={(e) => step(e, -1)}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            type="button"
            title="nächstes Bild"
            aria-label="nächstes Bild"
            className="carma-panorama-preview__step carma-panorama-preview__step--next"
            onClick={(e) => step(e, 1)}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
          <div className="carma-panorama-preview__badge">
            {shownIndex + 1} / {slideCount}
          </div>
        </>
      )}
    </div>
  );
};

export default PanoramaPreview;
