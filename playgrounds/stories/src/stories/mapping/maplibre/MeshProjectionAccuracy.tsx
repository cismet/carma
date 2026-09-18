import { useEffect, useState } from "react";
import { InputNumber, Segmented, Space, Table, Tag } from "antd";
import { MercatorCoordinate } from "maplibre-gl";
import { Vector3 } from "three";
import { degToRadNumeric } from "@carma-units";
import { cartographicToEcef, ecefToEnuMatrix } from "@carma-geo/proj";
import {
  compareMeshReprojection,
  MESH_REPROJECTION_METHODS,
  MESH_REPROJECTION_MODE,
  MESH_PROJECTION_ACCURACY,
  type MeshProjectionAccuracy as AccuracyProfile,
  type MeshReprojectionComparison,
} from "@carma-geo/utils";
import {
  MESH_MOUNT_PRESETS,
  MESH_MOUNT_VIEW,
  type MeshMountView,
} from "./mesh-mount-presets";

/** Same algorithms as the tile plugin; no imagery/GPU acceptance implied. */
export const MeshProjectionAccuracy = () => {
  const [profile, setProfile] = useState<AccuracyProfile | "screen">("1cm");
  const [zoom, setZoom] = useState(18);
  const [manualGridStepMeters, setGridStep] = useState(250);
  const gridStepMeters =
    profile === "screen"
      ? manualGridStepMeters
      : MESH_PROJECTION_ACCURACY[profile].gridStepMeters;
  const [view, setView] = useState<MeshMountView>(MESH_MOUNT_VIEW.ROOT);
  const [scope, setScope] = useState<"domain" | "camera">("domain");
  const [rows, setRows] = useState<MeshReprojectionComparison[]>([]);
  const [status, setStatus] = useState("");
  const root = MESH_MOUNT_PRESETS[MESH_MOUNT_VIEW.ROOT].lngLat;
  const camera = MESH_MOUNT_PRESETS[view].lngLat;
  // Errors use fixed root-scale metres, including at distant camera positions.
  const metresPerPixel =
    1 /
    (MercatorCoordinate.fromLngLat(root).meterInMercatorCoordinateUnits() *
      512 *
      2 ** zoom);
  const tolerance =
    profile === "screen"
      ? 0.5 * metresPerPixel
      : MESH_PROJECTION_ACCURACY[profile].targetMeters;
  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setStatus("Comparing methods…");
    const yieldControl = async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (cancelled) throw new Error("Comparison cancelled");
    };
    const cameraLocal = cartographicToEcef(
      degToRadNumeric(camera[0]),
      degToRadNumeric(camera[1]),
      0
    ).applyMatrix4(
      ecefToEnuMatrix(
        cartographicToEcef(
          degToRadNumeric(root[0]),
          degToRadNumeric(root[1]),
          0
        )
      )
    );
    const points = Array.from({ length: 603 }, (_, i) => {
      const sample = Math.floor(i / 3);
      const east =
        scope === "domain"
          ? -23000 + sample * 230
          : cameraLocal.x + 200 * Math.cos(sample * 2.399);
      const south =
        scope === "domain"
          ? 21000 * Math.sin(sample)
          : -cameraLocal.y + 200 * Math.sin(sample * 2.399);
      return new Vector3(east, (i % 3) * 300, south);
    });
    void (async () => {
      for (const mode of Object.values(MESH_REPROJECTION_MODE)) {
        await yieldControl();
        const row = await compareMeshReprojection(
          mode,
          {
            longitudeDegrees: root[0],
            latitudeDegrees: root[1],
            gridStepMeters,
          },
          camera,
          points,
          yieldControl
        );
        if (cancelled) return;
        setRows((previous) => [...previous, row]);
      }
      setStatus("Complete · sampled errors, not a worst-case proof");
    })().catch((error) => {
      if (!cancelled) setStatus(String(error));
    });
    return () => {
      cancelled = true;
    };
  }, [gridStepMeters, camera, root, scope]);
  return (
    <main
      style={{
        padding: 16,
        font: "13px system-ui",
        maxWidth: 1400,
        margin: "auto",
      }}
    >
      <h2>Projection methods · numerical acceptance</h2>
      <Space wrap>
        <Segmented
          value={profile}
          options={[
            { label: "1 cm", value: "1cm" },
            { label: "10 cm", value: "10cm" },
            { label: "1 m", value: "1m" },
            { label: "0.5 CSS px", value: "screen" },
          ]}
          onChange={(value) => setProfile(value as typeof profile)}
        />
        <label>
          Zoom{" "}
          <InputNumber
            min={0}
            max={24}
            value={zoom}
            onChange={(value) => value !== null && setZoom(value)}
          />
        </label>
        <label>
          LUT grid (m){" "}
          <InputNumber
            min={25}
            max={4000}
            disabled={profile !== "screen"}
            step={25}
            value={gridStepMeters}
            onChange={(value) => value !== null && setGridStep(value)}
          />
        </label>
        <Segmented
          value={scope}
          options={[
            { label: "48 km domain", value: "domain" },
            { label: "200 m around camera", value: "camera" },
          ]}
          onChange={(value) => setScope(value as typeof scope)}
        />
        <Segmented
          value={view}
          options={Object.entries(MESH_MOUNT_PRESETS).map(
            ([value, preset]) => ({ value, label: preset.label })
          )}
          onChange={(value) => setView(value as MeshMountView)}
        />
      </Space>
      <p>
        {status}. Target {(tolerance * 1000).toFixed(2)} mm in root-scale
        metres. 603 samples at local up 0/300/600 m.
      </p>
      <Table
        size="small"
        pagination={false}
        rowKey="mode"
        dataSource={rows}
        columns={[
          {
            title: "Method",
            dataIndex: "mode",
            render: (mode) =>
              MESH_REPROJECTION_METHODS[
                mode as keyof typeof MESH_REPROJECTION_METHODS
              ].label,
          },
          {
            title: "Max 3D (mm)",
            dataIndex: "maximumErrorMeters",
            render: (value) => (value * 1000).toFixed(2),
          },
          {
            title: "Horizontal (mm)",
            dataIndex: "maximumHorizontalErrorMeters",
            render: (value) => (value * 1000).toFixed(2),
          },
          {
            title: "Vertical (mm)",
            dataIndex: "maximumVerticalErrorMeters",
            render: (value) => (value * 1000).toFixed(2),
          },
          {
            title: "Target",
            dataIndex: "maximumErrorMeters",
            render: (value) => (
              <Tag color={value <= tolerance ? "green" : "orange"}>
                {value <= tolerance ? "sampled pass" : "fail"}
              </Tag>
            ),
          },
          {
            title: "Lookup MiB",
            dataIndex: "lookupBytes",
            render: (value) => (value / 1024 ** 2).toFixed(2),
          },
          {
            title: "Prepare ms¹",
            dataIndex: "preparationMilliseconds",
            render: (value) => value.toFixed(1),
          },
          {
            title: "603 points ms²",
            dataIndex: "evaluationMilliseconds",
            render: (value) => value.toFixed(2),
          },
        ]}
      />
      <p>
        ¹ Includes cooperative yields. ² CPU positions plus error comparison
        only, no geometry allocation, normals, uploads, GPU or frame timing. Not
        a reliable device-speed ranking. Direct reference is the same
        double-precision oracle; its zero error is by construction.
      </p>
      <p>
        Camera fits are local: inspect both scopes. Sphere/AEQD are hypotheses,
        not ellipsoid-equivalent transforms. “Global fit” means a
        root-preserving least-squares fit over this bounded domain. Reducing
        interpolation spacing cannot remove a wrong geometric model.
      </p>
      <p>
        All baked methods reuse prepared tile geometry during camera movement.
        Method changes deliberately rebuild the diagnostic pool. Samples do not
        prove triangle-interior, LOD seam, normal continuity, source datum, or
        orthophoto alignment. The screen target assumes a top-down map, not a
        tilted-camera Jacobian.
      </p>
    </main>
  );
};
