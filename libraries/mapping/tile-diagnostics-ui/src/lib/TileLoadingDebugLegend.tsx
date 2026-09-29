import {
  TILE_DIAGNOSTIC_KIND,
  type TileDiagnostics,
  type TileDiagnosticKind,
} from "@carma-mapping/engines/maplibre";

const LEGEND: ReadonlyArray<[TileDiagnosticKind, string]> = [
  [TILE_DIAGNOSTIC_KIND.DISPLAYED, "drawn (including fallback coverage)"],
  [TILE_DIAGNOSTIC_KIND.RESIDENT, "not drawn; see symbol for load state"],
];

export const TileLoadingDebugLegend = ({
  popout,
  fill,
  colors,
  hoverColors,
}: {
  popout: boolean;
  fill: TileDiagnostics["FILL"];
  colors: TileDiagnostics["OVERVIEW_COLORS"];
  hoverColors: TileDiagnostics["HOVER"];
}) => (
  <div
    style={{
      font: "12px/1.5 system-ui",
      color: "#e6edf3",
      background: "rgb(38 46 56 / 94%)",
      padding: 12,
      boxSizing: "border-box",
    }}
    data-test-id="mesh-coverage-legend"
  >
    <div>
      {popout &&
        LEGEND.map(([kind, label]) => (
          <div
            key={kind}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                background: fill[kind],
                border: "1px solid rgba(0,0,0,0.5)",
                display: "inline-block",
              }}
            />
            {label}
          </div>
        ))}
      <div style={{ fontWeight: 600, marginTop: 6 }}>Detail versus target</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1fr",
          alignItems: "center",
          gap: "6px 8px",
          marginTop: 8,
        }}
      >
        <svg width="28" height="24" viewBox="-12 -12 24 24" aria-hidden="true">
          <g fill="none" stroke={colors.quality} strokeWidth="1.5">
            <circle r="10" />
            <circle r="6" />
            <circle r="2" />
          </g>
        </svg>
        <span>Needs finer detail</span>
        <svg
          width="28"
          height="24"
          viewBox="0 0 28 24"
          aria-label="Leaf tile dot"
        >
          <circle cx="14" cy="12" r="3" fill={colors.quality} />
        </svg>
        <span>Finest available tile · target not met</span>
        <svg
          width="28"
          height="24"
          viewBox="-3.5 -3.5 7 7"
          aria-label="Concentric squares"
        >
          <path
            d="M-3,-3H3V3H-3Z M-1.5,-1.5H1.5V1.5H-1.5Z"
            fill="none"
            stroke={colors.quality}
            strokeWidth="0.4"
          />
        </svg>
        <span>More detail than requested</span>
        <span style={{ textAlign: "center", color: "#9da7b1" }}>—</span>
        <span>On target · no symbol</span>
      </div>
      <div style={{ color: "#aebac5", fontSize: 11, marginTop: 8 }}>
        One contour per LOD step · ≈ estimated
      </div>
      <div style={{ fontWeight: 600, marginTop: 10 }}>
        Processing · left-to-right phase fill
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "28px 1fr",
          alignItems: "center",
          gap: "6px 8px",
          marginTop: 8,
        }}
      >
        {(
          [
            [0, "Queued"],
            [1 / 3, "Downloading"],
            [2 / 3, "Parsing"],
          ] as const
        ).map(([progress, label]) => (
          <div key={label} style={{ display: "contents" }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: `1.5px solid ${colors.processing}`,
                overflow: "hidden",
                boxSizing: "border-box",
              }}
            >
              <span
                style={{
                  display: "block",
                  width: `${progress * 100}%`,
                  height: "100%",
                  background: colors.processing,
                }}
              />
            </span>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div style={{ color: "#aebac5", fontSize: 11, marginTop: 8 }}>
        Ready: outline only. Phase fill, not download percentage.
      </div>
      <div style={{ marginTop: 6 }}>× Failed · Ⅱ Deferred</div>
      <div style={{ fontWeight: 600, marginTop: 10 }}>
        Coverage · tile frame
      </div>
      {[
        [colors.grid, "Viewport · camera demand"],
        [colors.seam, "Seam · sibling support and outward LOD rings"],
        [colors.reserve, "Base resolution · extent coverage"],
        [colors.baseline, "Outside all views · no LOD target"],
      ].map(([color, label]) => (
        <div
          key={label}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{
              width: 14,
              height: 10,
              border: `2px solid ${color}`,
              background: "#30363d",
              flexShrink: 0,
            }}
          />
          {label}
        </div>
      ))}
      <div style={{ fontWeight: 600, marginTop: 10 }}>Spatial diagnostics</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 14,
            height: 14,
            border: `1px solid ${colors.frustum}`,
            background: colors.backdrop,
            display: "inline-block",
          }}
        />
        Four camera side planes cut through presented tile bounds
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 14,
            height: 14,
            border: `1px solid ${hoverColors.tile}`,
            display: "inline-block",
          }}
        />
        Hovered tile, parent and siblings
      </div>
    </div>
  </div>
);
