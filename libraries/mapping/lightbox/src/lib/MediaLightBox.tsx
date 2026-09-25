import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  LightBoxContext,
  LightBoxDispatchContext,
  type LightBoxDispatchValue,
  type LightBoxSlide,
  type LightBoxState,
} from "./LightBoxContextProvider";

import "./MediaLightBox.css";

// The custom mixed-media lightbox shell. Unlike react-image-lightbox (which can
// only render an <img> from a URL), this reproduces the familiar top/bottom
// navbar + prev/next chrome and renders EITHER an image OR an arbitrary custom
// node (e.g. a panorama viewer) in the centre, chosen per slide. That lets a
// single lightbox carry images and a panorama and flip between them with the
// same navigation.
//
// It is used by PhotoLightBox whenever the slide set contains a custom slide;
// pure-image sets keep using react-image-lightbox (no regression).

export interface MediaLightBoxProps {
  defaultContextValues?: Partial<LightBoxState & LightBoxDispatchValue>;
}

const slideTitle = (slide: LightBoxSlide | undefined): ReactNode =>
  slide?.title;
const slideCaption = (slide: LightBoxSlide | undefined): ReactNode =>
  slide?.caption;

// Image zoom: click steps by ZOOM_STEP, wheel by WHEEL_STEP, both bounded to
// [1, MAX_ZOOM]. 1 = fit-to-screen (no pan).
const ZOOM_STEP = 1.4;
const WHEEL_STEP = 1.1;
const MAX_ZOOM = 6;

export const MediaLightBox = ({
  defaultContextValues = {},
}: MediaLightBoxProps) => {
  const state = useContext(LightBoxContext) ?? defaultContextValues;
  const dispatchContext =
    useContext(LightBoxDispatchContext) ?? defaultContextValues;

  const { slides = [], index = 0, visible, title, caption } = state;
  const { setVisible, setIndex } = dispatchContext;

  const count = slides.length;
  // Wrap the incoming index defensively so a stale/out-of-range value never
  // lands on `undefined`.
  const safeIndex = count > 0 ? ((index % count) + count) % count : 0;
  const activeSlide = slides[safeIndex];
  const isImage = activeSlide?.type === "image";

  const close = useCallback(() => setVisible?.(false), [setVisible]);
  const goPrev = useCallback(() => {
    if (count > 1) setIndex?.((safeIndex + count - 1) % count);
  }, [count, safeIndex, setIndex]);
  const goNext = useCallback(() => {
    if (count > 1) setIndex?.((safeIndex + 1) % count);
  }, [count, safeIndex, setIndex]);

  // Image zoom + pan state (images only; the panorama has its own pannellum
  // zoom). Reset whenever the slide or visibility changes so each image opens
  // fit-to-screen.
  const contentRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [safeIndex, visible]);

  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(z * ZOOM_STEP, MAX_ZOOM)),
    []
  );
  const zoomOut = useCallback(() => {
    setZoom((z) => {
      const next = Math.max(z / ZOOM_STEP, 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Wheel zoom. Attached natively (not via onWheel) so preventDefault works —
  // React's synthetic wheel listener is passive and cannot block the page.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !visible || !isImage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => {
        const next =
          e.deltaY < 0
            ? Math.min(z * WHEEL_STEP, MAX_ZOOM)
            : Math.max(z / WHEEL_STEP, 1);
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [visible, isImage, safeIndex]);

  // Drag to pan while zoomed in. Captures the pan origin at mousedown and
  // tracks via window listeners so the drag continues outside the image.
  const onImageMouseDown = useCallback(
    (e: ReactMouseEvent) => {
      if (zoom <= 1) return;
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
      const onMove = (ev: MouseEvent) => {
        setPan({ x: start.ox + (ev.clientX - start.x), y: start.oy + (ev.clientY - start.y) });
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [zoom, pan]
  );

  // Esc closes; Left/Right move between slides. Up/Down are intentionally left
  // alone so a panorama slide can use them for its own street-view tour nav.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      } else if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key === "ArrowRight") {
        goNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, close, goPrev, goNext]);

  if (!visible || count === 0) {
    return null;
  }

  const headerTitle = slideTitle(activeSlide) ?? title;
  const footerCaption = slideCaption(activeSlide) ?? caption;
  const showNav = count > 1;

  let center: ReactNode = null;
  if (activeSlide?.type === "image") {
    center = (
      <img
        className="carma-media-lightbox__image"
        src={activeSlide.src}
        alt={typeof headerTitle === "string" ? headerTitle : ""}
        draggable={false}
        onMouseDown={onImageMouseDown}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          cursor: zoom > 1 ? "grab" : "default",
        }}
        onLoad={() => window.dispatchEvent(new Event("resize"))}
      />
    );
  } else if (activeSlide?.type === "custom") {
    // Only the active slide is rendered, so a heavy viewer (panorama) mounts
    // once and is torn down when the user navigates away.
    center = activeSlide.render({ active: true });
  }

  // Chrome (toolbar / caption / nav) intentionally mirrors react-image-lightbox
  // — same icons, bar heights, translucency — so a panorama or image opened in
  // this shell looks identical to the photo lightbox used elsewhere.
  return createPortal(
    <div className="carma-media-lightbox" role="dialog" aria-modal="true">
      <div className="carma-media-lightbox__content" ref={contentRef}>
        {center}
      </div>

      <div className="carma-media-lightbox__toolbar">
        <div className="carma-media-lightbox__title">{headerTitle}</div>
        <div className="carma-media-lightbox__toolbar-right">
          {isImage && (
            <button
              type="button"
              onClick={zoomIn}
              aria-label="Vergrößern"
              className="carma-media-lightbox__zoom carma-media-lightbox__zoom--in"
            />
          )}
          {isImage && (
            <button
              type="button"
              onClick={zoomOut}
              aria-label="Verkleinern"
              className="carma-media-lightbox__zoom carma-media-lightbox__zoom--out"
            />
          )}
          <button
            type="button"
            onClick={close}
            aria-label="Schließen"
            className="carma-media-lightbox__close"
          />
        </div>
      </div>

      {showNav && (
        <button
          type="button"
          onClick={goPrev}
          aria-label="Vorheriges Medium"
          className="carma-media-lightbox__nav carma-media-lightbox__nav--prev"
        />
      )}
      {showNav && (
        <button
          type="button"
          onClick={goNext}
          aria-label="Nächstes Medium"
          className="carma-media-lightbox__nav carma-media-lightbox__nav--next"
        />
      )}

      {footerCaption ? (
        <div className="carma-media-lightbox__caption">
          <div className="carma-media-lightbox__caption-content">
            {footerCaption}
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
};

export default MediaLightBox;
