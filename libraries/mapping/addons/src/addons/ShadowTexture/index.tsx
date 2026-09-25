import { lazy, Suspense, useEffect, useMemo } from "react";
import { faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Checkbox, Popover, Radio, Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import {
  createInitialShadowDateState,
  createInitialShadowSimulationState,
} from "@carma-mapping/shadow-simulation/core";

import { useAddonState, useRouteAddons } from "../../lib/AddonStateContext";
import {
  resolveAddonEntries,
  type AddonComponentProps,
} from "../../lib/registry";
import type { ModelCollectionState } from "../ModelCollection";
import { DEFAULT_CAPTURE_HEIGHT_METERS } from "./shadow-texture-camera";
import { DZ_B_PRM_POSITION } from "./shadow-texture-georef";

export type ShadowTextureConfig = {
  /** Root directory of the independently addressable LOD subdirectories. */
  assetBaseUrl: string;
  /** Optional route default; omitted for workflows that start on demand. */
  enabledByDefault?: boolean;
  /** Workflow-card preset; the route addon ignores this presentation choice. */
  workflowBackgroundVisible?: boolean;
  /** Route-local comparison of the existing BuGa bridge and catalog GLB. */
  workflowBridgeComparison?: boolean;
};

export type ShadowTextureState = {
  quality: "4k" | "8k";
  mode: "hard" | "sun-disc";
  captureProjection: "orthographic" | "perspective";
  cameraHeightMeters: number;
  cameraHeightAdjusting: boolean;
  status: string;
  shadowOnly: boolean;
};

const ShadowTextureRuntime = lazy(() =>
  import("./ShadowTextureRuntime").then((module) => ({
    default: module.ShadowTextureRuntime,
  }))
);

const ShadowCaptureCameraVisualizer = lazy(() =>
  import("./ShadowCaptureCameraVisualizer").then((module) => ({
    default: module.ShadowCaptureCameraVisualizer,
  }))
);

const ShadowHeader = lazy(() =>
  import("@carma-mapping/shadow-simulation").then((module) => ({
    default: module.ShadowSimulationHeaderControlsView,
  }))
);

export const ShadowTexture = ({
  config,
  libreMap,
  target,
}: AddonComponentProps<"shadowTexture">) => {
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  const [dateState, setDateState] = useAddonState("shadowDate");
  const [textureState, setTextureState] = useAddonState("shadowTexture");
  const [modelState] = useAddonState("modelCollection");
  const routeAddons = useRouteAddons();
  const manifestUrl = useMemo(
    () =>
      resolveAddonEntries(routeAddons).find(
        (entry) => entry.kind === "modelCollection"
      )?.config.manifestUrl,
    [routeAddons]
  );
  const initialShadowState = useMemo(
    () => ({
      ...createInitialShadowSimulationState(undefined),
      enabled: config.enabledByDefault ?? false,
    }),
    [config.enabledByDefault]
  );
  const initialDateState = useMemo(
    () => createInitialShadowDateState(undefined, DZ_B_PRM_POSITION),
    []
  );

  useEffect(() => {
    if (!shadowState) setShadowState(initialShadowState);
  }, [initialShadowState, setShadowState, shadowState]);
  useEffect(() => {
    if (!dateState) setDateState(initialDateState);
  }, [dateState, initialDateState, setDateState]);
  useEffect(() => {
    if (!textureState) {
      setTextureState({
        quality: "4k",
        mode: "sun-disc",
        captureProjection: "orthographic",
        cameraHeightMeters: DEFAULT_CAPTURE_HEIGHT_METERS,
        cameraHeightAdjusting: false,
        status: "idle",
        shadowOnly: false,
      });
    }
  }, [setTextureState, textureState]);

  useEffect(() => {
    if (!textureState?.cameraHeightAdjusting) return;
    const timeout = setTimeout(
      () =>
        setTextureState((previous) => ({
          ...previous!,
          cameraHeightAdjusting: false,
        })),
      2_000
    );
    return () => clearTimeout(timeout);
  }, [
    setTextureState,
    textureState?.cameraHeightAdjusting,
    textureState?.cameraHeightMeters,
  ]);

  const controlContent = useMemo(
    () => (
      <Tooltip title="Schatten-Textur ein-/ausschalten" placement="right">
        <ControlButtonStyler
          onClick={() =>
            setShadowState((previous) => ({
              ...(previous ?? initialShadowState),
              enabled: !previous?.enabled,
              isAnimating: false,
            }))
          }
          aria-label="Schatten-Textur ein-/ausschalten"
          aria-pressed={shadowState?.enabled ?? false}
        >
          <FontAwesomeIcon
            icon={faSun}
            style={shadowState?.enabled ? { color: "#1677ff" } : undefined}
          />
        </ControlButtonStyler>
      </Tooltip>
    ),
    [initialShadowState, setShadowState, shadowState?.enabled]
  );

  if (target) {
    return (
      <div className="flex flex-col gap-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Radio.Group
            aria-label="Auflösung"
            size="small"
            optionType="button"
            buttonStyle="solid"
            value={textureState?.quality ?? "4k"}
            options={[
              { label: "4K", value: "4k" },
              { label: "8K", value: "8k" },
            ]}
            onChange={({ target: { value } }) =>
              setTextureState((previous) => ({ ...previous!, quality: value }))
            }
          />
          <Radio.Group
            aria-label="Schatten"
            size="small"
            optionType="button"
            buttonStyle="solid"
            value={textureState?.mode ?? "sun-disc"}
            disabled={shadowState?.isAnimating}
            options={[
              { label: "Hart", value: "hard" },
              { label: "Sonnenscheibe", value: "sun-disc" },
            ]}
            onChange={({ target: { value } }) =>
              setTextureState((previous) => ({ ...previous!, mode: value }))
            }
          />
          <Radio.Group
            aria-label="Aufnahmekamera"
            size="small"
            optionType="button"
            buttonStyle="solid"
            value={textureState?.captureProjection ?? "orthographic"}
            options={[
              { label: "Orthografisch", value: "orthographic" },
              { label: "Perspektivisch", value: "perspective" },
            ]}
            onChange={({ target: { value } }) =>
              setTextureState((previous) => ({
                ...previous!,
                captureProjection: value,
              }))
            }
          />
        </div>
        {(textureState?.captureProjection ?? "orthographic") ===
          "perspective" && (
          <Popover
            open={textureState?.cameraHeightAdjusting ?? false}
            placement="bottom"
            content={
              <Suspense fallback={null}>
                <ShadowCaptureCameraVisualizer
                  heightMeters={
                    textureState?.cameraHeightMeters ??
                    DEFAULT_CAPTURE_HEIGHT_METERS
                  }
                />
              </Suspense>
            }
          >
            <label className="flex items-center gap-3">
              Kamerahöhe
              <input
                type="range"
                className="min-w-0 flex-1"
                min={0.5}
                max={10}
                step={0.1}
                value={
                  textureState?.cameraHeightMeters ??
                  DEFAULT_CAPTURE_HEIGHT_METERS
                }
                onChange={(event) =>
                  setTextureState((previous) => ({
                    ...previous!,
                    cameraHeightMeters: Number(event.target.value),
                    cameraHeightAdjusting: true,
                  }))
                }
              />
              {(
                textureState?.cameraHeightMeters ??
                DEFAULT_CAPTURE_HEIGHT_METERS
              ).toFixed(1)}{" "}
              m<span className="text-neutral-500">· Maßstab 1:2000</span>
            </label>
          </Popover>
        )}
        <div className="flex items-center justify-between gap-3">
          <Checkbox
            checked={textureState?.shadowOnly ?? false}
            onChange={(event) =>
              setTextureState((previous) => ({
                ...previous!,
                shadowOnly: event.target.checked,
              }))
            }
          >
            Nur Schatten
          </Checkbox>
          <span role="status" className="text-xs text-neutral-500">
            {textureState?.status}
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      {libreMap && (
        <Control position="topleft" order={71}>
          {controlContent}
        </Control>
      )}
      {libreMap &&
        textureState &&
        dateState &&
        modelState &&
        config?.assetBaseUrl && (
          <Suspense fallback={null}>
            <ShadowTextureRuntime
              assetBaseUrl={config.assetBaseUrl}
              manifestUrl={manifestUrl}
              map={libreMap}
              shadowState={shadowState}
              dateState={dateState}
              textureState={textureState}
              modelState={modelState as ModelCollectionState}
              setTextureState={setTextureState}
              setDateState={setDateState}
            />
          </Suspense>
        )}
    </>
  );
};

export const ShadowTextureHeaderControls = () => {
  const [state, setState] = useAddonState("shadowSimulation");
  const [dateState, setDateState] = useAddonState("shadowDate");
  return (
    <Suspense fallback={null}>
      <ShadowHeader
        config={{
          latitude: DZ_B_PRM_POSITION.latitude,
          longitude: DZ_B_PRM_POSITION.longitude,
        }}
        libreMap={null}
        state={state}
        setState={setState}
        dateState={dateState}
        setDateState={setDateState}
      />
    </Suspense>
  );
};
