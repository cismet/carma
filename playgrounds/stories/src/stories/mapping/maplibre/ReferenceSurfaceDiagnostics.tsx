import {
  REFERENCE_ATMOSPHERE_MODE,
  type ReferenceAtmosphereMode,
} from "./reference-atmosphere-shader";
import {
  REFERENCE_CAMERA_PRESET,
  type ReferenceCameraPreset,
  type ReferencePhysicalCameraPose,
} from "./reference-camera-presets";
import {
  REFERENCE_SURFACE,
  TERRAIN_HEIGHT_DATUM,
  type ReferenceSurface,
  type TerrainGeometryMode,
  type TerrainHeightDatum,
} from "./reference-surface-types";
import type { DistanceSummaries } from "./reference-nivellement";

export type StatusKey = "gcg2016" | "terrain" | "mesh" | "nivellement";

export type LoadStatus = Record<StatusKey, string>;
const statusColor = (value: string) =>
  value.startsWith("ready")
    ? "#16794c"
    : value.startsWith("error")
    ? "#ba2b2b"
    : value === "disabled"
    ? "#697078"
    : "#9b6100";

const formatDistance = (value: number) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(Math.abs(value) < 10 ? 3 : 1)}`;

const surfaceLabel: Record<ReferenceSurface, string> = {
  tangent: "local tangent",
  sphere: "local sphere",
  ellipsoid: "WGS84 ellipsoid",
  quasigeoid: "GCG2016 quasigeoid",
  terrain: "loaded DGM1 terrain",
};

type DiagnosticsOptions = Readonly<{
  showTerrain: boolean;
  showMesh2024: boolean;
  showShadowSimulation: boolean;
  cameraPreset: ReferenceCameraPreset;
  shadowDayOfYear: number;
  shadowMinutes: number;
  softSunShadows: boolean;
  shadowAreaMeters: number;
  atmosphereMode: ReferenceAtmosphereMode;
  atmosphereVisibilityKilometers: number;
  terrainModel: "dgm1" | "dom1";
  terrainGeometryMode: TerrainGeometryMode;
  terrainHeightDatum: TerrainHeightDatum;
  terrainAppearance: "viridis" | "basemap" | "pixel-error";
  meshAppearance: "imagery" | "elevation";
  terrainErrorTargetPixels: number;
  meshErrorTargetPixels: number;
  autoElevationRange: boolean;
  showNivellementPoints: boolean;
  validationSurface: ReferenceSurface;
}>;

export const ReferenceSurfaceDiagnostics = ({
  options,
  status,
  solarElevationDegrees,
  solarAzimuthDegrees,
  referenceOrigin,
  physicalCameraPose,
  effectiveElevationRange,
  distanceSummaries,
}: {
  options: DiagnosticsOptions;
  status: LoadStatus;
  solarElevationDegrees: number;
  solarAzimuthDegrees: number;
  referenceOrigin: readonly [number, number];
  physicalCameraPose: ReferencePhysicalCameraPose | null;
  effectiveElevationRange: readonly [number, number];
  distanceSummaries: DistanceSummaries;
}) => (
  <div
    aria-label="Reference surface diagnostics"
    style={{
      position: "absolute",
      left: 12,
      bottom: 12,
      width: 430,
      maxWidth: "calc(100vw - 24px)",
      padding: "9px 11px",
      background: "rgba(255, 255, 255, 0.93)",
      color: "#17212b",
      font: "12px/1.35 system-ui, sans-serif",
      border: "1px solid rgba(0, 0, 0, 0.18)",
      boxShadow: "0 2px 12px rgba(0, 0, 0, 0.14)",
    }}
  >
    <details>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>
        {options.showTerrain
          ? `Terrain: ${status.terrain}`
          : options.showMesh2024
          ? `Mesh: ${status.mesh}`
          : `GCG2016: ${status.gcg2016}`}
        {options.showShadowSimulation &&
          ` · Reference-eye sun ${solarElevationDegrees.toFixed(
            2
          )}° / az ${solarAzimuthDegrees.toFixed(2)}°`}
      </summary>
      <div>
        <strong>Reference frame:</strong> MeshX ECEF and corrected terrain both
        resolve into east/up/south at {referenceOrigin[1].toFixed(5)}° N.
      </div>
      {physicalCameraPose && (
        <>
          <div>
            Camera: {physicalCameraPose.label},{" "}
            {(physicalCameraPose.distanceMeters / 1_000).toFixed(2)} km, bearing{" "}
            {physicalCameraPose.bearingDegrees.toFixed(2)}°.
          </div>
          <div>
            {options.cameraPreset ===
            REFERENCE_CAMERA_PRESET.TOELLETURM_TO_LANGENBERG
              ? "Langenberg: source-ground anchors and approximate mast geometry; terrain excludes vegetation and buildings."
              : "Tile reference: Toelleturm DOM1 358.35 m; covered Nordhelle max DGM1 662.94 m / DOM1 686.36 m DHHN2016. Historical sampled DOM corridor clearance: 24.86 m, not certification of this DGM scene."}
          </div>
        </>
      )}
      {options.showShadowSimulation && (
        <div>
          Sun/shadows: day {options.shadowDayOfYear}, minute{" "}
          {options.shadowMinutes}, {options.softSunShadows ? "soft" : "hard"},{" "}
          {options.shadowAreaMeters.toFixed(0)} m area.
        </div>
      )}
      <div>
        Atmosphere: {options.atmosphereMode}
        {options.atmosphereMode !== REFERENCE_ATMOSPHERE_MODE.OFF
          ? `, ${options.atmosphereVisibilityKilometers.toFixed(
              0
            )} km visibility, ellipsoid-referenced density`
          : ""}
        .
      </div>
      <div>
        Terrain: {options.terrainModel.toUpperCase()},{" "}
        {options.terrainGeometryMode}, {options.terrainHeightDatum}
        {options.terrainHeightDatum === TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL
          ? " (H + GCG2016)"
          : " (raw H)"}
        , {options.terrainAppearance}.
      </div>
      {options.showMesh2024 && (
        <div>
          MeshX: {options.meshAppearance}
          {options.meshAppearance === "elevation"
            ? " (WGS84 ellipsoidal height)"
            : ""}
          .
        </div>
      )}
      <div>
        LOD target: terrain {options.terrainErrorTargetPixels.toFixed(1)} px,
        mesh {options.meshErrorTargetPixels.toFixed(1)} px. Viridis h clamp:{" "}
        {effectiveElevationRange[0].toFixed(2)}–
        {effectiveElevationRange[1].toFixed(2)} m
        {options.autoElevationRange ? " (view tiles)" : " (manual)"}.
      </div>
      {(Object.entries(status) as [StatusKey, string][]).map(([key, value]) => (
        <div key={key} style={{ color: statusColor(value) }}>
          {key}: {value}
        </div>
      ))}
      {options.showNivellementPoints && (
        <table
          style={{
            width: "100%",
            marginTop: 6,
            borderCollapse: "collapse",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <thead>
            <tr style={{ textAlign: "right" }}>
              <th style={{ textAlign: "left" }}>signed scene distance (m)</th>
              <th>n</th>
              <th>mean</th>
              <th>RMS</th>
              <th>min…max</th>
            </tr>
          </thead>
          <tbody>
            {(Object.values(REFERENCE_SURFACE) as ReferenceSurface[]).map(
              (surface) => {
                const summary = distanceSummaries[surface];
                return (
                  <tr
                    key={surface}
                    style={{
                      color:
                        surface === options.validationSurface
                          ? "#006d75"
                          : undefined,
                      fontWeight:
                        surface === options.validationSurface ? 700 : 400,
                      textAlign: "right",
                    }}
                  >
                    <td style={{ textAlign: "left" }}>
                      {surfaceLabel[surface]}
                    </td>
                    <td>{summary?.count ?? "—"}</td>
                    <td>
                      {summary ? formatDistance(summary.meanMeters) : "—"}
                    </td>
                    <td>{summary?.rmsMeters.toFixed(3) ?? "—"}</td>
                    <td>
                      {summary
                        ? `${formatDistance(
                            summary.minimumMeters
                          )}…${formatDistance(summary.maximumMeters)}`
                        : "—"}
                    </td>
                  </tr>
                );
              }
            )}
          </tbody>
        </table>
      )}
    </details>
  </div>
);
