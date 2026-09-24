import { lazy, Suspense, useEffect, useMemo } from "react";
import { faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "antd";

import {
  Control,
  ControlButtonStyler,
} from "@carma-mapping/map-controls-layout";
import {
  createInitialShadowDateState,
  createInitialShadowSimulationState,
} from "@carma-mapping/shadow-simulation/core";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import type { ModelCollectionState } from "../ModelCollection";
import { DZ_B_PRM_POSITION } from "./shadow-texture-georef";

export type ShadowTextureConfig = {
  /** Root directory of the independently addressable LOD subdirectories. */
  assetBaseUrl: string;
  /** Only this route opts in; existing shadow routes keep their old default. */
  enabledByDefault?: boolean;
};

export type ShadowTextureState = {
  quality: "4k" | "8k";
  mode: "hard" | "sun-disc";
  status: string;
  shadowOnly: boolean;
};

const ShadowTextureRuntime = lazy(() =>
  import("./ShadowTextureRuntime").then((module) => ({
    default: module.ShadowTextureRuntime,
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
        status: "idle",
        shadowOnly: false,
      });
    }
  }, [setTextureState, textureState]);

  if (target) {
    return (
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <span>Auflösung</span>
        {(["4k", "8k"] as const).map((quality) => (
          <label key={quality} className="flex items-center gap-1">
            <input
              type="radio"
              name="shadow-texture-quality"
              checked={(textureState?.quality ?? "4k") === quality}
              onChange={() =>
                setTextureState((previous) => ({ ...previous!, quality }))
              }
            />
            {quality.toUpperCase()}
          </label>
        ))}
        <span>Schatten</span>
        {(["hard", "sun-disc"] as const).map((mode) => (
          <label key={mode} className="flex items-center gap-1">
            <input
              type="radio"
              name="shadow-texture-mode"
              checked={(textureState?.mode ?? "sun-disc") === mode}
              disabled={shadowState?.isAnimating}
              onChange={() =>
                setTextureState((previous) => ({ ...previous!, mode }))
              }
            />
            {mode === "hard" ? "Hart" : "Sonnenscheibe"}
          </label>
        ))}
        {shadowState?.isAnimating && (
          <span className="text-neutral-500">Animation: immer hart</span>
        )}
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={textureState?.shadowOnly ?? false}
            onChange={(event) =>
              setTextureState((previous) => ({
                ...previous!,
                shadowOnly: event.target.checked,
              }))
            }
          />
          Nur Schatten anzeigen
        </label>
        <span role="status" className="text-neutral-500">
          {textureState?.status}
        </span>
      </div>
    );
  }

  return (
    <>
      {libreMap && (
        <Control position="topleft" order={71}>
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
