import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { faChevronLeft, faChevronRight, faCircleInfo, faMap, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as THREE from "three";
import { FloatingPanel } from "../../../ng-topicmap-playground/src/app/pointcloud/PointColorizer";
import { POINT_SHAPES, POINT_SIZE_MODES } from "../../../ng-topicmap-playground/src/app/pointcloud/copcPointsLayer";
import type { PointShape, PointSizeMode } from "../../../ng-topicmap-playground/src/app/pointcloud/copcPointsLayer";

import {
  solveRigidRegistration,
  type RegistrationConstraint,
  type RegistrationPair,
  type RigidRegistrationResult,
} from "../registration/rigid-registration";

export type RegistrationWorkbenchProps = {
  pairs: readonly RegistrationPair[];
  onRemoveLastPair: () => void;
  onClear: () => void;
  onSolved?: (result: RigidRegistrationResult) => void;
  onSelectPair: (index: number) => void;
  selectedPairIndex: number | null;
  onUpdatePair: (index: number, pair: RegistrationPair) => void;
  onRemovePair: (index: number) => void;
  onAddPointPair: () => void;
  onImportPairs?: (pairs: RegistrationPair[]) => void;
  /** Replaces the current pairs with the story's bundled preset. */
  onLoadPreset?: () => void;
  /** Registerable dataset presets (ng playground FeatureCollection entries). */
  datasetPresets?: ReadonlyArray<{ id: string; label: string }>;
  activeDatasetId?: string;
  onSelectDataset?: (id: string) => void;
  meshLoadState: "loading" | "loaded" | "error";
  onFramePointCloud: () => void;
  onMaximizeCurrentView: () => void;
  onFrameMesh: () => void;
  onFrameRegistrationPairs: () => void;
  onFrameRegistrationPair: (index: number) => void;
  pointStyle: { sizeMode: PointSizeMode; pointSize: number; radiusMeters: number; radiusScale: number; shape: PointShape };
  onPointStyleChange: (next: RegistrationWorkbenchProps["pointStyle"]) => void;
  /** Opens the field colorizer panel; renders its trigger in the style section. */
  onOpenFieldColorizer?: () => void;
  meshInspectionPreview: { enabled: boolean; opacity: number; wireframe: boolean };
  onMeshInspectionPreviewChange: (next: RegistrationWorkbenchProps["meshInspectionPreview"]) => void;
  meshErrorTarget: number;
  onMeshErrorTargetChange: (value: number) => void;
};

type RegistrationExport = {
  format: "carma-mesh-registration-v1";
  pairs: Array<{ source: [number, number, number]; target: [number, number, number] }>;
  constraints: {
    allowRotation: boolean;
    allowVerticalTranslation: boolean;
    maxTranslation: number;
    allowUniformScale: boolean;
  };
};

const formatVector = (value: THREE.Vector3) =>
  `[${value.x.toFixed(3)}, ${value.y.toFixed(3)}, ${value.z.toFixed(3)}]`;

function MeshXYPad({
  pair,
  anchor,
  onChange,
}: {
  pair: RegistrationPair;
  anchor: { east: number; north: number };
  onChange: (east: number, north: number) => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 4 - 2, -2, 2);
    const y = THREE.MathUtils.clamp(2 - ((event.clientY - rect.top) / rect.height) * 4, -2, 2);
    const length = Math.hypot(x, y);
    const scale = length > 2 ? 2 / length : 1;
    onChange(x * scale, y * scale);
  };
  const deltaEast = pair.target.x - anchor.east;
  const deltaNorth = -pair.target.z - anchor.north;
  return (
    <div
      ref={padRef}
      className="mesh-xy-pad"
      role="slider"
      aria-label="Mesh relative East North adjustment"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event);
      }}
    >
      <span className="mesh-xy-pad-axis mesh-xy-pad-axis-x" />
      <span className="mesh-xy-pad-axis mesh-xy-pad-axis-y" />
      <span
        className="mesh-xy-pad-point"
        style={{ left: `${50 + deltaEast * 25}%`, top: `${50 - deltaNorth * 25}%` }}
      />
      <span className="mesh-xy-pad-label mesh-xy-pad-label-x">+E</span>
      <span className="mesh-xy-pad-label mesh-xy-pad-label-y">+N</span>
    </div>
  );
}

function MeshPointAdjustment({
  pair,
  xyAnchor,
  zAnchor,
  onXYChange,
  onZChange,
  onZStart,
}: {
  pair: RegistrationPair;
  xyAnchor: { east: number; north: number };
  zAnchor: number;
  onXYChange: (east: number, north: number) => void;
  onZChange: (up: number) => void;
  onZStart: () => void;
}) {
  return (
    <div className="mesh-point-adjustment">
      <div className="mesh-point-delta" aria-live="polite">
        ΔE {(pair.target.x - xyAnchor.east).toFixed(2)} m · ΔN {(-pair.target.z - xyAnchor.north).toFixed(2)} m · ΔU {(pair.target.y - zAnchor).toFixed(2)} m
      </div>
      <div className="mesh-point-inputs">
        <div title="Mesh relative East/North adjustment, maximum radius 2 meters">
          <MeshXYPad pair={pair} anchor={xyAnchor} onChange={onXYChange} />
        </div>
        <input type="range" min="-10" max="10" step="0.01"
          className="mesh-z-adjustment"
          aria-label="Mesh relative Up adjustment"
          title="Mesh relative Up adjustment"
          value={pair.target.y - zAnchor} onFocus={onZStart}
          onChange={(event) => onZChange(Number(event.target.value))} />
      </div>
    </div>
  );
}

export function RegistrationWorkbench({
  pairs,
  onRemoveLastPair,
  onClear,
  onSolved,
  onSelectPair,
  selectedPairIndex,
  onUpdatePair,
  onRemovePair,
  onAddPointPair,
  onImportPairs,
  onLoadPreset,
  datasetPresets,
  activeDatasetId,
  onSelectDataset,
  meshLoadState,
  onFramePointCloud,
  onMaximizeCurrentView,
  onFrameMesh,
  onFrameRegistrationPairs,
  onFrameRegistrationPair,
  pointStyle,
  onPointStyleChange,
  onOpenFieldColorizer,
  meshInspectionPreview,
  onMeshInspectionPreviewChange,
  meshErrorTarget,
  onMeshErrorTargetChange,
}: RegistrationWorkbenchProps) {
  const [allowRotation, setAllowRotation] = useState(true);
  const [allowUniformScale, setAllowUniformScale] = useState(true);
  const [maxTranslation, setMaxTranslation] = useState(100);
  const [result, setResult] = useState<RigidRegistrationResult | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const zAnchors = useRef(new Map<number, number>());
  const xyAnchors = useRef(new Map<number, { east: number; north: number }>());
  const pairSignature = useMemo(
    () => pairs.map(({ source, target }) =>
      `${source.x},${source.y},${source.z}|${target.x},${target.y},${target.z}`
    ).join(";"),
    [pairs]
  );
  const constraint = useMemo<RegistrationConstraint>(
    () => ({
      allowRotation: { x: allowRotation, y: allowRotation, z: allowRotation },
      // Seven-DOF solve: translation X/Y/Z, three-axis rotation, optional
      // uniform scale. Rotation cap (3° total), scale cap (±0.5%), vertical
      // priority, and density weighting come from the solver defaults.
      allowTranslation: { x: true, y: true, z: true },
      maxTranslationMeters: maxTranslation,
      allowUniformScale,
    }),
    [allowRotation, maxTranslation, allowUniformScale]
  );
  const solve = () => {
    if (pairs.length < 3) return;
    const next = solveRigidRegistration(pairs, constraint);
    setResult(next);
    onSolved?.(next);
  };
  useEffect(() => {
    if (pairs.length >= 3) {
      solve();
    } else {
      setResult(null);
    }
  }, [pairSignature, constraint]);
  const exportPairs = () => {
    const payload: RegistrationExport = {
      format: "carma-mesh-registration-v1",
      pairs: pairs.map(({ source, target }) => ({
        source: [source.x, source.y, source.z],
        target: [target.x, target.y, target.z],
      })),
      constraints: {
        allowRotation,
        allowVerticalTranslation: true,
        maxTranslation,
        allowUniformScale,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mesh-registration.json";
    link.click();
    URL.revokeObjectURL(url);
  };
  const importPairs = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<RegistrationExport>;
      if (parsed.format !== "carma-mesh-registration-v1" || !Array.isArray(parsed.pairs)) {
        throw new Error("Unsupported registration file");
      }
      const imported = parsed.pairs.map(({ source, target }) => {
        if (![source, target].every((value) => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite))) {
          throw new Error("Invalid registration pair");
        }
        return {
          source: new THREE.Vector3(...source),
          target: new THREE.Vector3(...target),
        };
      });
      onImportPairs?.(imported);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Invalid registration file");
    }
  };
  return (
    <>
    <FloatingPanel
      title="Mesh registration"
      onClose={() => undefined}
      showClose={false}
      className="registration-modal"
      initial={{ x: 12, y: 12 }}
      zIndex={20}
      headerActions={
        <button className="info-action" type="button" onClick={() => setInfoOpen((open) => !open)} title="Registration info" aria-label="Registration info">
          <FontAwesomeIcon icon={faCircleInfo} />
        </button>
      }
    >
      <aside className="pointcloud-registration-panel" aria-label="Registration">
      {infoOpen && <div className="registration-info">
      <p>
        Click a point on the point cloud, then the corresponding point on the
        mesh. The solver moves point-cloud coordinates into Mesh 2024
        coordinates. Pair {pairs.length} of at least 3 is currently selected.
      </p>
      <div className="pointcloud-registration-status">
        Mesh 2024: {meshLoadState === "loaded" ? "loaded" : meshLoadState === "error" ? "error" : "loading…"}
      </div>
      </div>}
      {datasetPresets && datasetPresets.length > 0 && onSelectDataset && (
        <label className="registration-dataset-picker">
          Dataset
          <select
            value={activeDatasetId}
            onChange={(event) => onSelectDataset(event.target.value)}
          >
            {datasetPresets.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset className="pointcloud-style-fieldset">
        <legend>Point cloud style</legend>
        <label>Size mode
          <span className="pointcloud-style-buttons">
            {[
              [POINT_SIZE_MODES.AUTO, "Auto"],
              [POINT_SIZE_MODES.PIXELS, "Pixels"],
              [POINT_SIZE_MODES.METERS, "Meters"],
            ].map(([value, label]) => (
              <button key={value} type="button" className={pointStyle.sizeMode === value ? "is-active" : ""}
                onClick={() => onPointStyleChange({ ...pointStyle, sizeMode: value as PointSizeMode })}>{label}</button>
            ))}
          </span>
        </label>
        {pointStyle.sizeMode === POINT_SIZE_MODES.PIXELS && <label className="inline-range-label">Point size <input type="range" min="0.5" max="8" step="0.25" value={pointStyle.pointSize} onChange={(event) => onPointStyleChange({ ...pointStyle, pointSize: Number(event.target.value) })} /><output>{pointStyle.pointSize.toFixed(2)} px</output></label>}
        {pointStyle.sizeMode === POINT_SIZE_MODES.METERS && <label className="inline-range-label">Radius <input type="range" min="0.01" max="2" step="0.01" value={pointStyle.radiusMeters} onChange={(event) => onPointStyleChange({ ...pointStyle, radiusMeters: Number(event.target.value) })} /><output>{pointStyle.radiusMeters.toFixed(2)} m</output></label>}
        {pointStyle.sizeMode === POINT_SIZE_MODES.AUTO && <label className="inline-range-label">Radius scale <input type="range" min="0.25" max="4" step="0.25" value={pointStyle.radiusScale} onChange={(event) => onPointStyleChange({ ...pointStyle, radiusScale: Number(event.target.value) })} /><output>×{pointStyle.radiusScale.toFixed(2)}</output></label>}
        <label>Form
          <span className="pointcloud-style-buttons">
            {[
              [POINT_SHAPES.SQUARE, "Square"],
              [POINT_SHAPES.CIRCLE, "Circle"],
              [POINT_SHAPES.DOME, "Dome"],
              [POINT_SHAPES.SOFT_SPLAT, "Gradient"],
            ].map(([value, label]) => (
              <button key={value} type="button" className={pointStyle.shape === value ? "is-active" : ""}
                onClick={() => onPointStyleChange({ ...pointStyle, shape: value as PointShape })}>{label}</button>
            ))}
          </span>
        </label>
        {onOpenFieldColorizer && (
          <div className="pointcloud-style-buttons">
            <button type="button" onClick={onOpenFieldColorizer}>Field colorizer…</button>
          </div>
        )}
      </fieldset>
      <div className="mesh-appearance-controls">
        <label>Quality
          <input type="range" min="0" max="50" step="0.5" value={meshErrorTarget} onChange={(event) => onMeshErrorTargetChange(Number(event.target.value))} />
          <output>{meshErrorTarget.toFixed(1)}</output>
        </label>
        <label>Opacity
          <input type="range" min="0.1" max="1" step="0.05" value={meshInspectionPreview.opacity} onChange={(event) => {
            const opacity = Number(event.target.value);
            onMeshInspectionPreviewChange({ ...meshInspectionPreview, enabled: opacity < 1 || meshInspectionPreview.wireframe, opacity });
          }} />
          <output>{Math.round(meshInspectionPreview.opacity * 100)}%</output>
        </label>
        <button type="button" className={meshInspectionPreview.wireframe ? "is-active" : ""} onClick={() => {
          const wireframe = !meshInspectionPreview.wireframe;
          onMeshInspectionPreviewChange({ ...meshInspectionPreview, enabled: wireframe || meshInspectionPreview.opacity < 1, wireframe });
        }}>Wireframe</button>
      </div>
      <div className="pointcloud-registration-actions pointcloud-registration-view-actions">
        <button type="button" onClick={onFramePointCloud}>Fly to point cloud</button>
        <button type="button" onClick={onMaximizeCurrentView}>Maximize current view</button>
        <button type="button" disabled={meshLoadState !== "loaded"} onClick={onFrameMesh}>Fly to mesh</button>
        <button type="button" disabled={pairs.length === 0} onClick={onFrameRegistrationPairs}>Fly to pairs</button>
      </div>
      <div className="registration-constraints">
        <label><input type="checkbox" checked={allowRotation} onChange={(event) => setAllowRotation(event.target.checked)} /> Rotation</label>
        <label><input type="checkbox" checked={allowUniformScale} onChange={(event) => setAllowUniformScale(event.target.checked)} /> Scale</label>
      </div>
      <div className="pointcloud-registration-actions">
        <button type="button" disabled={pairs.length < 3} onClick={solve}>
          Solve
        </button>
        <button type="button" disabled={pairs.length === 0} onClick={exportPairs}>
          Export JSON
        </button>
        <label className="pointcloud-registration-file-button">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importPairs(file);
              event.target.value = "";
            }}
          />
        </label>
        {onLoadPreset && (
          <button type="button" onClick={onLoadPreset}>
            Nordbahn preset
          </button>
        )}
      </div>
      </aside>
    </FloatingPanel>
    <FloatingPanel
      title={`Point pairs (${pairs.length})`}
      onClose={() => undefined}
      showClose={false}
      className="point-pairs-modal"
      headerActions={
        <span className="pair-header-actions">
          <button type="button" disabled={pairs.length === 0} onClick={onFrameRegistrationPairs} title="Fly to all pairs" aria-label="Fly to all pairs"><FontAwesomeIcon icon={faMap} /></button>
          <button type="button" disabled={selectedPairIndex === null || selectedPairIndex <= 0} onClick={() => { if (selectedPairIndex !== null) { const next = selectedPairIndex - 1; onSelectPair(next); onFrameRegistrationPair(next); } }} title="Previous pair" aria-label="Previous pair"><FontAwesomeIcon icon={faChevronLeft} /></button>
          <button type="button" disabled={selectedPairIndex === null || selectedPairIndex >= pairs.length - 1} onClick={() => { if (selectedPairIndex !== null) { const next = selectedPairIndex + 1; onSelectPair(next); onFrameRegistrationPair(next); } }} title="Next pair" aria-label="Next pair"><FontAwesomeIcon icon={faChevronRight} /></button>
        </span>
      }
      initial={{ x: 430, y: 12 }}
      zIndex={21}
    >
      <aside className="pointcloud-registration-panel pointcloud-pair-list-panel" aria-label="Point pairs">
      <div className="pointcloud-registration-actions">
        <button type="button" onClick={onAddPointPair}>Add point pair</button>
        <button type="button" disabled={pairs.length === 0} onClick={onRemoveLastPair}>Remove last</button>
        <button type="button" disabled={pairs.length === 0} onClick={onClear}>Clear</button>
      </div>
      <ol>
        {pairs.map((pair, index) => (
          <li key={index} className="pointcloud-registration-pair">
            <button className={`pair-summary-button${selectedPairIndex === index ? " is-selected" : ""}`} type="button" onClick={() => onSelectPair(index)} title="Adjust pair">
              <span>Pair {index + 1}</span>
              <code>{formatVector(new THREE.Vector3(pair.source.x, pair.source.y, pair.source.z))}</code>
            </button>
            <span className="pair-target-summary" title="Mesh point">
              → {formatVector(new THREE.Vector3(pair.target.x, pair.target.y, pair.target.z))}
            </span>
            <span className="pair-delta-summary" title="Mesh adjustment delta">
              Δ {((pair.target.x - (xyAnchors.current.get(index)?.east ?? pair.target.x))).toFixed(2)}, {((-pair.target.z - (xyAnchors.current.get(index)?.north ?? -pair.target.z))).toFixed(2)}, {((pair.target.y - (zAnchors.current.get(index) ?? pair.target.y))).toFixed(2)} m
            </span>
            {result && Number.isFinite(result.residuals[index]) && (
              <small className={`pair-error${result.residuals[index] === result.maximumResidualMeters ? " is-worst" : ""}`} title="Pair residual">
                {result.residuals[index].toFixed(3)} m
              </small>
            )}
            <button className="icon-action" type="button" onClick={() => onFrameRegistrationPair(index)} title="Fly to pair" aria-label="Fly to pair">
              <FontAwesomeIcon icon={faMap} />
            </button>
            <button className="icon-action icon-action-danger" type="button" onClick={() => onRemovePair(index)} title="Delete pair" aria-label="Delete pair">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </li>
        ))}
      </ol>
      {result && (
        <output className="registration-result">
          RMS residual: {result.rmsResidualMeters.toFixed(3)} m; maximum: {" "}
          {result.maximumResidualMeters.toFixed(3)} m
          {allowUniformScale && `; scale: ${result.uniformScale.toFixed(5)}×`}
          <div className="matrix-readout" aria-label="Solved transformation matrix">
            {Array.from({ length: 4 }, (_, row) => (
              <div key={row}>
                {Array.from({ length: 4 }, (_, column) =>
                  result.matrix.elements[column * 4 + row].toFixed(5)
                ).join("  ")}
              </div>
            ))}
          </div>
        </output>
      )}
      </aside>
    </FloatingPanel>
    {selectedPairIndex !== null && pairs[selectedPairIndex] && (
      <FloatingPanel
        title={`Adjust pair ${selectedPairIndex + 1}`}
        onClose={() => undefined}
        showClose={false}
        className="point-adjustment-modal"
        transparent
        headerActions={
          <span className="pair-header-actions">
            <button type="button" disabled={selectedPairIndex <= 0} onClick={() => { const next = selectedPairIndex - 1; onSelectPair(next); onFrameRegistrationPair(next); }} title="Previous pair" aria-label="Previous pair"><FontAwesomeIcon icon={faChevronLeft} /></button>
            <button type="button" disabled={selectedPairIndex >= pairs.length - 1} onClick={() => { const next = selectedPairIndex + 1; onSelectPair(next); onFrameRegistrationPair(next); }} title="Next pair" aria-label="Next pair"><FontAwesomeIcon icon={faChevronRight} /></button>
          </span>
        }
        initial={{ x: 430, y: 360 }}
        zIndex={22}
      >
        <div className="point-adjustment-modal-content">
            <MeshPointAdjustment
            pair={pairs[selectedPairIndex]}
            xyAnchor={xyAnchors.current.get(selectedPairIndex) ?? { east: pairs[selectedPairIndex].target.x, north: -pairs[selectedPairIndex].target.z }}
            zAnchor={zAnchors.current.get(selectedPairIndex) ?? pairs[selectedPairIndex].target.y}
            onXYChange={(east, north) => {
              const index = selectedPairIndex;
              const pair = pairs[index];
              const anchor = xyAnchors.current.get(index) ?? { east: pair.target.x, north: -pair.target.z };
              xyAnchors.current.set(index, anchor);
              onUpdatePair(index, { source: pair.source, target: new THREE.Vector3(anchor.east + east, pair.target.y, -(anchor.north + north)) });
            }}
            onZStart={() => zAnchors.current.set(selectedPairIndex, pairs[selectedPairIndex].target.y)}
            onZChange={(up) => {
              const index = selectedPairIndex;
              const pair = pairs[index];
              const anchor = zAnchors.current.get(index) ?? pair.target.y;
              onUpdatePair(index, { source: pair.source, target: new THREE.Vector3(pair.target.x, anchor + up, pair.target.z) });
            }}
            />
        </div>
      </FloatingPanel>
    )}
    </>
  );
}
