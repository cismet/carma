const CROSSHAIR_CURSOR_HOTSPOT_X = 17;
const CROSSHAIR_CURSOR_HOTSPOT_Y = 17;

const CROSSHAIR_CURSOR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34" fill="none">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="0" stdDeviation="0.7" flood-color="rgba(0,0,0,0.95)"/>
      <feDropShadow dx="0" dy="0" stdDeviation="1.35" flood-color="rgba(0,0,0,0.9)"/>
    </filter>
  </defs>
  <g filter="url(#glow)" stroke="rgba(255,255,255,0.97)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 6.5V11.5" />
    <path d="M17 22.5V27.5" />
    <path d="M6.5 17H11.5" />
    <path d="M22.5 17H27.5" />
    <circle cx="17" cy="17" r="1.25" fill="rgba(255,255,255,0.97)" stroke="none" />
  </g>
</svg>`;

const CROSSHAIR_CURSOR_URL = `url("data:image/svg+xml,${encodeURIComponent(
  CROSSHAIR_CURSOR_SVG
)}") ${CROSSHAIR_CURSOR_HOTSPOT_X} ${CROSSHAIR_CURSOR_HOTSPOT_Y}, crosshair`;

export const resolveCrosshairCanvasCursor = ({
  queryEnabled,
  showCursor,
  hideNativeCursor,
}: {
  queryEnabled: boolean;
  showCursor: boolean;
  hideNativeCursor: boolean;
}) => {
  if (queryEnabled && showCursor) {
    return CROSSHAIR_CURSOR_URL;
  }

  if (queryEnabled && hideNativeCursor) {
    return "none";
  }

  return "";
};
