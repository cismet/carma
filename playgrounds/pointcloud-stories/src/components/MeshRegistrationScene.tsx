import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import * as THREE from "three";

import {
  POINT_CLOUD_ASSET_IDENTITIES,
  POINT_CLOUD_PUBLIC_BASE_URL,
} from "../../../ng-topicmap-playground/src/app/pointcloud/point-cloud-assets";
import {
  POINT_CLOUD_HEIGHT_DATUMS,
  POINT_METRICS,
  POINT_SHAPES,
  StandalonePointCloudViewer,
} from "./StandalonePointCloudViewer";
import type {
  PointMetric,
  StandaloneBackground,
  StandaloneClampMode,
  StandalonePointCloudColor,
  StandalonePointSizeMode,
  StandaloneMetricBlendMode,
  PointCompositeMode,
  PointShape,
} from "./StandalonePointCloudViewer";
import type { RampName } from "../../../ng-topicmap-playground/src/app/pointcloud/colorRamps";
import { RegistrationWorkbench } from "./RegistrationWorkbench";
import type { RegistrationPair, RigidRegistrationResult } from "../registration/rigid-registration";
import nordbahnRegistrationPresetJson from "../data/mesh-registration-nordbahn.json?raw";

const DATA_BASE =
  import.meta.env.VITE_POINTCLOUD_DATA_BASE_URL ?? POINT_CLOUD_PUBLIC_BASE_URL;
const REGISTRATION_STORAGE_KEY = "carma.mesh-registration.seg2512";
const SOLVE_STORAGE_KEY = `${REGISTRATION_STORAGE_KEY}.solve`;
const STYLE_STORAGE_KEY = `${REGISTRATION_STORAGE_KEY}.style`;
const MESH_PREVIEW_STORAGE_KEY = `${REGISTRATION_STORAGE_KEY}.mesh-preview`;

type StoredSolve = {
  pairSignature: string;
  matrix: number[];
  translation: [number, number, number];
  rotation: [number, number, number];
  residuals: number[];
  rmsResidualMeters: number;
  maximumResidualMeters: number;
  uniformScale: number;
};

/** Registration pair with concrete vector instances owned by this scene. */
type ScenePair = { source: THREE.Vector3; target: THREE.Vector3 };

const toScenePair = (pair: RegistrationPair): ScenePair => ({
  source: new THREE.Vector3(pair.source.x, pair.source.y, pair.source.z),
  target: new THREE.Vector3(pair.target.x, pair.target.y, pair.target.z),
});

// Curated Nordbahntrasse pair set (a workbench "Export JSON" snapshot). Used
// as the initial pairs when nothing is stored yet, and available any time
// through the workbench's "Nordbahn preset" button.
const NORDBAHN_PRESET = JSON.parse(nordbahnRegistrationPresetJson) as {
  pairs: Array<{
    source: [number, number, number];
    target: [number, number, number];
  }>;
};

const presetScenePairs = (): ScenePair[] =>
  NORDBAHN_PRESET.pairs.map(({ source, target }) => ({
    source: new THREE.Vector3(...source),
    target: new THREE.Vector3(...target),
  }));

export interface MeshRegistrationSceneProps {
  color?: StandalonePointCloudColor;
  metric?: PointMetric;
  colorRamp?: RampName;
  sizeMode?: StandalonePointSizeMode;
  pointSize?: number;
  radiusMeters?: number;
  radiusScale?: number;
  shape?: PointShape;
  metricBlendMode?: StandaloneMetricBlendMode;
  pointCompositeMode?: PointCompositeMode;
  background?: StandaloneBackground;
  sourceHeightDatum?: (typeof POINT_CLOUD_HEIGHT_DATUMS)[keyof typeof POINT_CLOUD_HEIGHT_DATUMS];
  heightOffset?: number;
  meshOpacity?: number;
  meshErrorTarget?: number;
  meshWhite?: boolean;
  clampMode?: StandaloneClampMode;
  clampMin?: number;
  clampMax?: number;
  onColorizerOptionsChange?: ComponentProps<typeof StandalonePointCloudViewer>["onColorizerOptionsChange"];
}

export function MeshRegistrationScene({
  color = "classification",
  metric = "z",
  colorRamp,
  sizeMode,
  pointSize,
  radiusMeters,
  radiusScale,
  shape = POINT_SHAPES.CIRCLE,
  metricBlendMode,
  pointCompositeMode,
  background,
  sourceHeightDatum = POINT_CLOUD_HEIGHT_DATUMS.ELLIPSOIDAL,
  heightOffset,
  meshOpacity,
  meshErrorTarget,
  meshWhite,
  clampMode,
  clampMin,
  clampMax,
  onColorizerOptionsChange,
}: MeshRegistrationSceneProps = {}) {
  const identity = POINT_CLOUD_ASSET_IDENTITIES.seg2512;
  const [pairs, setPairs] = useState<ScenePair[]>(() => {
    try {
      const saved = localStorage.getItem(REGISTRATION_STORAGE_KEY);
      if (!saved) return presetScenePairs();
      const parsed = JSON.parse(saved) as Array<{ source: number[]; target: number[] }>;
      return parsed.map(({ source, target }) => ({
        source: new THREE.Vector3(...source as [number, number, number]),
        target: new THREE.Vector3(...target as [number, number, number]),
      }));
    } catch {
      return presetScenePairs();
    }
  });
  const [nextKind, setNextKind] = useState<"pointcloud" | "mesh">("pointcloud");
  const [pairPickingArmed, setPairPickingArmed] = useState(false);
  const [storedSolve] = useState<StoredSolve | null>(() => {
    try {
      const saved = localStorage.getItem(SOLVE_STORAGE_KEY);
      return saved ? JSON.parse(saved) as StoredSolve : null;
    } catch {
      return null;
    }
  });
  const [result, setResult] = useState<RigidRegistrationResult | null>(() => storedSolve ? {
    matrix: new THREE.Matrix4().fromArray(storedSolve.matrix),
    translation: new THREE.Vector3(...storedSolve.translation),
    rotation: new THREE.Euler(...storedSolve.rotation),
    residuals: storedSolve.residuals,
    rmsResidualMeters: storedSolve.rmsResidualMeters,
    maximumResidualMeters: storedSolve.maximumResidualMeters,
    uniformScale: storedSolve.uniformScale ?? 1,
  } : null);
  const [registrationMatrix, setRegistrationMatrix] = useState(() =>
    storedSolve ? new THREE.Matrix4().fromArray(storedSolve.matrix) : new THREE.Matrix4()
  );
  const [selectedPairIndex, setSelectedPairIndex] = useState<number | null>(null);
  // Mesh opacity and wireframe set in the workbench survive reloads and
  // Storybook arg churn; the derived "enabled" flag is never stored.
  const [meshInspectionPreview, setMeshInspectionPreview] = useState(() => {
    try {
      const saved = localStorage.getItem(MESH_PREVIEW_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { opacity?: number; wireframe?: boolean };
        const opacity =
          typeof parsed.opacity === "number"
            ? Math.min(1, Math.max(0.1, parsed.opacity))
            : 1;
        const wireframe = Boolean(parsed.wireframe);
        return { enabled: opacity < 1 || wireframe, opacity, wireframe };
      }
    } catch {
      // Malformed storage falls back to the defaults below.
    }
    return { enabled: false, opacity: 1, wireframe: false };
  });
  // Best available mesh quality by default; the quality slider stays as a
  // manual escape hatch for weak machines.
  const [activeMeshErrorTarget, setActiveMeshErrorTarget] = useState(meshErrorTarget ?? 0.5);
  const preserveSolveOnPairEdit = useRef(false);
  const [meshLoadState, setMeshLoadState] = useState<"loading" | "loaded" | "error">("loading");
  // Point style tweaks from the workbench (radius, size mode, form) override
  // the story args and survive reloads.
  const [pointStyle, setPointStyle] = useState(() => {
    const fallback = {
      sizeMode: sizeMode ?? "meters",
      pointSize: pointSize ?? 2,
      radiusMeters: radiusMeters ?? 0.3,
      radiusScale: radiusScale ?? 1,
      shape,
    };
    try {
      const saved = localStorage.getItem(STYLE_STORAGE_KEY);
      if (!saved) return fallback;
      return { ...fallback, ...(JSON.parse(saved) as Partial<typeof fallback>) };
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(pointStyle));
  }, [pointStyle]);
  useEffect(() => {
    localStorage.setItem(
      MESH_PREVIEW_STORAGE_KEY,
      JSON.stringify({
        opacity: meshInspectionPreview.opacity,
        wireframe: meshInspectionPreview.wireframe,
      })
    );
  }, [meshInspectionPreview]);
  const viewerActions = useRef({
    framePointCloud: () => undefined,
    frameMesh: () => undefined,
    frameRegistrationPairs: (_points: readonly THREE.Vector3[]) => undefined,
    maximizeCurrentView: () => undefined,
    setRegistrationPairLines: (
      _pairs: readonly { pointcloud: THREE.Vector3; mesh: THREE.Vector3 }[],
      _selectedPairIndex?: number | null
    ) => undefined,
    highlightPoint: (_kind: "pointcloud" | "mesh", _point: THREE.Vector3) => undefined,
    setMeshInspectionPreview: (_preview: { enabled: boolean; opacity: number; wireframe: boolean }) => undefined,
    openFieldColorizer: () => undefined,
  });
  const pairsRef = useRef(pairs);
  pairsRef.current = pairs;
  const onPick = useCallback(
    (kind: "pointcloud" | "mesh", point: THREE.Vector3) => {
      if (kind !== nextKind) return;
      if (kind === "pointcloud") {
        setPairs(
          pairsRef.current.concat({
            source: point.clone(),
            target: new THREE.Vector3(),
          })
        );
        setNextKind("mesh");
      } else {
        const current = pairsRef.current;
        const last = current[current.length - 1];
        if (!last) return;
        const completed = current
          .slice(0, -1)
          .concat({ source: last.source, target: point.clone() });
        setPairs(completed);
        // Select the completed pair in the complete-pairs index space that
        // the workbench list uses.
        setSelectedPairIndex(
          completed.filter((pair) => pair.target.lengthSq() > 0).length - 1
        );
        setNextKind("pointcloud");
        setPairPickingArmed(false);
      }
    },
    [nextKind]
  );
  const completePairs = pairs.filter((pair) => pair.target.lengthSq() > 0);
  // Shared selection path for the workbench list and clicks on the pair's
  // scene markers (cloned point, mesh axes, connecting line).
  const selectPair = (index: number) => {
    setSelectedPairIndex(index);
    const pair = completePairs[index];
    if (pair) {
      viewerActions.current.highlightPoint("pointcloud", new THREE.Vector3(pair.source.x, pair.source.y, pair.source.z));
      viewerActions.current.highlightPoint("mesh", new THREE.Vector3(pair.target.x, pair.target.y, pair.target.z));
    }
  };
  const updatePairLines = useCallback(() => {
    viewerActions.current.setRegistrationPairLines(
      completePairs.map((pair) => ({
        pointcloud: new THREE.Vector3(pair.source.x, pair.source.y, pair.source.z).applyMatrix4(registrationMatrix),
        mesh: new THREE.Vector3(pair.target.x, pair.target.y, pair.target.z),
      })),
      selectedPairIndex
    );
  }, [completePairs, registrationMatrix, selectedPairIndex]);
  useEffect(updatePairLines, [updatePairLines]);
  const pairSignature = completePairs.map(({ source, target }) =>
    `${source.x},${source.y},${source.z}|${target.x},${target.y},${target.z}`
  ).join(";");
  useEffect(() => {
    if (storedSolve && storedSolve.pairSignature !== pairSignature) {
      if (preserveSolveOnPairEdit.current) {
        preserveSolveOnPairEdit.current = false;
      } else {
        setResult(null);
        setRegistrationMatrix(new THREE.Matrix4());
        localStorage.removeItem(SOLVE_STORAGE_KEY);
      }
    }
  }, [pairSignature, storedSolve]);
  useEffect(() => {
    if (!result) {
      localStorage.removeItem(SOLVE_STORAGE_KEY);
      return;
    }
    localStorage.setItem(SOLVE_STORAGE_KEY, JSON.stringify({
      pairSignature,
      matrix: result.matrix.toArray(),
      translation: [result.translation.x, result.translation.y, result.translation.z],
      rotation: [result.rotation.x, result.rotation.y, result.rotation.z],
      residuals: result.residuals,
      rmsResidualMeters: result.rmsResidualMeters,
      maximumResidualMeters: result.maximumResidualMeters,
      uniformScale: result.uniformScale,
    } satisfies StoredSolve));
  }, [pairSignature, result]);
  useEffect(() => {
    localStorage.setItem(
      REGISTRATION_STORAGE_KEY,
      JSON.stringify(completePairs.map(({ source, target }) => ({
        source: [source.x, source.y, source.z],
        target: [target.x, target.y, target.z],
      })))
    );
  }, [completePairs]);
  return (
    <div className="pointcloud-registration-scene">
      <StandalonePointCloudViewer
        datasetUrl={`${DATA_BASE}/${identity.artifactFileName}`}
        datasetName={identity.label}
        sourceTag={identity.sourceTag}
        fieldDimensions={identity.fieldDimensions}
        hasRgb={identity.hasRgb}
        sourceHeightDatum={sourceHeightDatum}
        color={color}
        metric={metric}
        colorRamp={colorRamp}
        sizeMode={pointStyle.sizeMode}
        pointSize={pointStyle.pointSize}
        radiusMeters={pointStyle.radiusMeters}
        shape={pointStyle.shape}
        metricBlendMode={metricBlendMode}
        pointCompositeMode={pointCompositeMode}
        // Keep the registration preview responsive; the full-resolution COPC
        // remains available through the playground app. This story is for
        // interactive pairing, not exhaustive point inspection.
        pointBudgetPercent={5}
        background={background}
        heightOffset={heightOffset}
        clampMode={clampMode}
        clampMin={clampMin}
        clampMax={clampMax}
        showFieldColorizer
        showFieldColorizerButton={false}
        showMesh2024
        registrationMatrix={registrationMatrix}
        meshErrorTarget={activeMeshErrorTarget}
        meshOpacity={meshOpacity}
        meshWhite={meshWhite}
        pickingEnabled={pairPickingArmed}
        pickKind={nextKind}
        cameraStorageKey={`${REGISTRATION_STORAGE_KEY}.camera`}
        autoMaximizeOnCameraEnd
        onPick={onPick}
        onPairPicked={selectPair}
        onColorizerOptionsChange={onColorizerOptionsChange}
        onMeshLoadStateChange={setMeshLoadState}
        onViewerReady={(actions) => {
          viewerActions.current = actions;
          updatePairLines();
          // Re-apply a restored mesh preview (opacity/wireframe) so the
          // viewer matches the persisted workbench state after a reload.
          if (meshInspectionPreview.enabled) {
            actions.setMeshInspectionPreview(meshInspectionPreview);
          }
        }}
      />
      <RegistrationWorkbench
        pairs={completePairs}
        onImportPairs={(imported) => {
          setPairs(imported.map(toScenePair));
          setNextKind("pointcloud");
          setResult(null);
        }}
        onLoadPreset={() => {
          setPairs(presetScenePairs());
          setNextKind("pointcloud");
          setResult(null);
        }}
        onRemoveLastPair={() => {
          setPairs((current) => current.slice(0, -1));
          setNextKind("pointcloud");
        }}
        onClear={() => {
          setPairs([]);
          setResult(null);
          setNextKind("pointcloud");
        }}
        onSolved={(next) => {
          setResult(next);
          setRegistrationMatrix(next.matrix.clone());
        }}
        onSelectPair={selectPair}
        selectedPairIndex={selectedPairIndex}
        onUpdatePair={(index, next) => {
          const currentPair = completePairs[index];
          const nextPair = toScenePair(next);
          preserveSolveOnPairEdit.current = true;
          setPairs((current) => current.map((pair) => pair === currentPair ? nextPair : pair));
          // Keep the point-cloud marker fixed and move only the selected Mesh
          // endpoint while the adjustment modal is being edited.
          viewerActions.current.highlightPoint("mesh", new THREE.Vector3(next.target.x, next.target.y, next.target.z));
        }}
        onRemovePair={(index) => {
          const currentPair = completePairs[index];
          setPairs((current) => current.filter((pair) => pair !== currentPair));
          setSelectedPairIndex(null);
          setResult(null);
          setRegistrationMatrix(new THREE.Matrix4());
          setNextKind("pointcloud");
        }}
        onAddPointPair={() => {
          setNextKind("pointcloud");
          setPairPickingArmed(true);
        }}
        meshLoadState={meshLoadState}
        onFramePointCloud={() => viewerActions.current.framePointCloud()}
        onMaximizeCurrentView={() => viewerActions.current.maximizeCurrentView()}
        onFrameMesh={() => viewerActions.current.frameMesh()}
        onFrameRegistrationPairs={() => viewerActions.current.frameRegistrationPairs(
          completePairs.flatMap((pair) => [
            new THREE.Vector3(pair.source.x, pair.source.y, pair.source.z).applyMatrix4(registrationMatrix),
            new THREE.Vector3(pair.target.x, pair.target.y, pair.target.z),
          ])
        )}
        onFrameRegistrationPair={(index) => {
          const pair = completePairs[index];
          if (!pair) return;
          viewerActions.current.frameRegistrationPairs([
            new THREE.Vector3(pair.source.x, pair.source.y, pair.source.z).applyMatrix4(registrationMatrix),
            new THREE.Vector3(pair.target.x, pair.target.y, pair.target.z),
          ]);
        }}
        pointStyle={pointStyle}
        onPointStyleChange={setPointStyle}
        onOpenFieldColorizer={() => viewerActions.current.openFieldColorizer()}
        meshInspectionPreview={meshInspectionPreview}
        onMeshInspectionPreviewChange={(next) => {
          const normalized = { ...next, enabled: next.opacity < 1 || next.wireframe };
          setMeshInspectionPreview(normalized);
          viewerActions.current.setMeshInspectionPreview(normalized);
        }}
        meshErrorTarget={activeMeshErrorTarget}
        onMeshErrorTargetChange={(value) => setActiveMeshErrorTarget(value)}
      />
      <div className="pointcloud-registration-instruction">
        {result ? "Solved. Export the transform from the result panel." : pairPickingArmed ? `Pick a ${nextKind} point.` : "Use Add point pair to start picking."}
      </div>
    </div>
  );
}
