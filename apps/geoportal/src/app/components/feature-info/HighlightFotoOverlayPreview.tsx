import { useState, type CSSProperties, type MouseEvent } from "react";
import {
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { parseFotoHighlight } from "./useHighlightedFoto";

// same width as the panorama preview, so both line up above the infobox
const PREVIEW_WIDTH = 250;
const DIM_COLOR = "rgba(0, 0, 0, 0.45)";

const cycleButtonStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  width: 28,
  height: 28,
  border: "none",
  borderRadius: "50%",
  background: "rgba(0, 0, 0, 0.55)",
  color: "white",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const cycleBadgeStyle: CSSProperties = {
  position: "absolute",
  bottom: 6,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "1px 8px",
  borderRadius: 10,
  background: "rgba(0, 0, 0, 0.55)",
  color: "white",
  fontSize: 12,
  pointerEvents: "none",
};

export interface FotoCycle {
  index: number;
  count: number;
  onPrevious: () => void;
  onNext: () => void;
}

interface HighlightFotoOverlayPreviewProps {
  url: string | undefined;
  highlight: unknown;
  color?: string;
  // stepping through overlapping features; arrows show when count > 1
  cycle?: FotoCycle;
  // the lightbox can't take the overlay, so the caller opens it with a copy
  // that has the box drawn in (see useHighlightedFoto)
  onOpenLightBox: () => void;
}

// Variant of react-cismap's InfoBoxFotoPreview: the photo stays unchanged and
// the highlight box is laid over it as SVG. The viewBox uses the natural photo
// size, so the pixel coordinates scale to the preview width by themselves.
const HighlightFotoOverlayPreview = ({
  url,
  highlight,
  color = "#3A7CEB",
  cycle,
  onOpenLightBox,
}: HighlightFotoOverlayPreviewProps) => {
  const [size, setSize] = useState<{ w: number; h: number }>();
  const box = parseFotoHighlight(highlight);

  if (!url) {
    return <div />;
  }

  // a few screen pixels of air between box and frame, in photo pixels
  const pad = size ? (2 * size.w) / PREVIEW_WIDTH : 0;
  const frame = box
    ? {
        x: box[0] - pad,
        y: box[1] - pad,
        w: box[2] - box[0] + 2 * pad,
        h: box[3] - box[1] + 2 * pad,
      }
    : undefined;

  const showCycle = !!cycle && cycle.count > 1;
  // the arrows sit on the photo, which opens the lightbox on click
  const step = (e: MouseEvent, action: () => void) => {
    e.stopPropagation();
    action();
  };

  return (
    <table style={{ width: "100%", opacity: 0.9 }}>
      <tbody>
        <tr>
          <td style={{ textAlign: "right", verticalAlign: "top" }}>
            <a
              style={{ cursor: "pointer" }}
              onClick={onOpenLightBox}
            >
              <div
                style={{
                  position: "relative",
                  display: "inline-block",
                  marginBottom: 5,
                }}
              >
                <img
                  alt="Bild"
                  src={url}
                  width={PREVIEW_WIDTH}
                  style={{
                    display: "block",
                    maxWidth: "calc(100vw - 16px)",
                    height: "auto",
                  }}
                  onLoad={(e) =>
                    setSize({
                      w: e.currentTarget.naturalWidth,
                      h: e.currentTarget.naturalHeight,
                    })
                  }
                />
                {frame && size && (
                  <svg
                    viewBox={`0 0 ${size.w} ${size.h}`}
                    preserveAspectRatio="none"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      pointerEvents: "none",
                    }}
                  >
                    <path
                      fillRule="evenodd"
                      fill={DIM_COLOR}
                      d={`M0 0H${size.w}V${size.h}H0Z M${frame.x} ${
                        frame.y
                      }h${frame.w}v${frame.h}h${-frame.w}Z`}
                    />
                    {/* white halo below the coloured frame; stroke widths in screen px */}
                    <rect
                      x={frame.x}
                      y={frame.y}
                      width={frame.w}
                      height={frame.h}
                      fill="none"
                      stroke="white"
                      strokeWidth={3}
                      vectorEffect="non-scaling-stroke"
                    />
                    <rect
                      x={frame.x}
                      y={frame.y}
                      width={frame.w}
                      height={frame.h}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                )}
                {showCycle && (
                  <>
                    <button
                      type="button"
                      title="vorheriges Objekt"
                      aria-label="vorheriges Objekt"
                      style={{ ...cycleButtonStyle, left: 6 }}
                      onClick={(e) => step(e, cycle.onPrevious)}
                    >
                      <FontAwesomeIcon icon={faChevronLeft} />
                    </button>
                    <button
                      type="button"
                      title="nächstes Objekt"
                      aria-label="nächstes Objekt"
                      style={{ ...cycleButtonStyle, right: 6 }}
                      onClick={(e) => step(e, cycle.onNext)}
                    >
                      <FontAwesomeIcon icon={faChevronRight} />
                    </button>
                    <div style={cycleBadgeStyle}>
                      {cycle.index + 1} / {cycle.count}
                    </div>
                  </>
                )}
              </div>
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
};

export default HighlightFotoOverlayPreview;
