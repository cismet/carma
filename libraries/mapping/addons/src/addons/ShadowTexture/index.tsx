import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { faArrowRotateLeft, faSun } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Checkbox, ColorPicker, Popover, Radio, Tooltip } from "antd";

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
import {
  createInitialDzbPrmModelState,
  loadDzbPrmCollection,
  type DzbPrmModelCollection,
} from "../ModelCollection/dzb-prm-collection";
import {
  DEFAULT_CAPTURE_HEIGHT_METERS,
  SHADOW_TEXTURE_RESOLUTIONS,
} from "./shadow-texture-camera";
import { DZ_B_PRM_POSITION } from "./shadow-texture-georef";
import { DEFAULT_SHADOW_TEXTURE_APPEARANCE } from "./shadow-texture-appearance";
import "./shadow-texture.css";

export type ShadowTextureConfig = {
  /** Root directory of the independently addressable LOD subdirectories. */
  assetBaseUrl: string;
  /** Georeference, part variants and available geometry tiers. */
  manifestUrl?: string;
  /** Optional route default; omitted for workflows that start on demand. */
  enabledByDefault?: boolean;
  /** Workflow-card preset; the route addon ignores this presentation choice. */
  workflowBackgroundVisible?: boolean;
  /**
   * Switch the shadows on at mount and off at teardown. Set for a layer that
   * launches the addon (`getLayerLaunchedAddons`): the layer is the switch.
   */
  startEnabled?: boolean;
  /** the layer is the face of the shadows; no sun button of their own */
  permanent?: boolean;
  /**
   * The stack layer that launched the addon. Its style marks with a
   * `shadowTexture` slot (`style-slot.ts`) where in the layer order the shadows
   * are drawn; they show while that placeholder is on the map, so the layer's
   * eye hides them and its slider fades them.
   */
  anchorLayerId?: string;
  /** the bridge the shadows are cast by: today's or the BuGa design */
  bridge?: "existing" | "planning";
};

export type ShadowTextureState = {
  quality: keyof typeof SHADOW_TEXTURE_RESOLUTIONS;
  mode: "hard" | "sun-disc";
  captureProjection: "orthographic" | "perspective";
  cameraHeightMeters: number;
  cameraHeightAdjusting: boolean;
  timeAdjusting?: boolean;
  color?: string;
  intensity?: number;
  status: string;
  shadowOnly: boolean;
  useCatalogBridgeCaster?: boolean;
};

const ShadowTextureRuntime = lazy(() =>
  import("./ShadowTextureRuntime").then((module) => ({
    default: module.ShadowTextureRuntime,
  }))
);
const ModelCollectionRuntime = lazy(() =>
  import("../ModelCollection/ModelCollectionRuntime").then((module) => ({
    default: module.ModelCollectionRuntime,
  }))
);

const INITIAL_TEXTURE_STATE = {
  quality: "4k",
  mode: "sun-disc",
  captureProjection: "orthographic",
  cameraHeightMeters: DEFAULT_CAPTURE_HEIGHT_METERS,
  cameraHeightAdjusting: false,
  status: "idle",
  shadowOnly: true,
  ...DEFAULT_SHADOW_TEXTURE_APPEARANCE,
} satisfies ShadowTextureState;

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

const ShadowAnimationSpeedControl = lazy(() =>
  import("@carma-mapping/shadow-simulation").then((module) => ({
    default: module.ShadowAnimationSpeedControl,
  }))
);

export const ShadowTexture = ({
  config,
  libreMap,
  target,
  store,
  carma,
}: AddonComponentProps<"shadowTexture">) => {
  const [shadowState, setShadowState] = useAddonState("shadowSimulation");
  const [dateState, setDateState] = useAddonState("shadowDate");
  const [textureState, setTextureState] = useAddonState("shadowTexture");
  const [modelState, setModelState] = useAddonState("modelCollection");
  const manifestUrl = config?.manifestUrl;
  const [collection, setCollection] = useState<DzbPrmModelCollection | null>(
    null
  );
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const backgroundVisible = useSyncExternalStore(
    store.subscribe,
    () =>
      (
        store.getState() as {
          mapping?: { backgroundLayer?: { visible?: boolean } };
        }
      ).mapping?.backgroundLayer?.visible ?? true
  );
  const initialShadowState = useMemo(
    () => ({
      ...createInitialShadowSimulationState(undefined),
      enabled: config?.enabledByDefault ?? false,
      animationDaylightOnly: false,
    }),
    [config?.enabledByDefault]
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
      setTextureState(INITIAL_TEXTURE_STATE);
    }
  }, [setTextureState, textureState]);
  useEffect(() => {
    if (!modelState) setModelState(createInitialDzbPrmModelState());
  }, [modelState, setModelState]);

  // A layer that launched the shadows is their switch: on while it is in the
  // stack, off with it. Its bridge is the variant the layer stands for.
  const startEnabled = !target && config?.startEnabled === true;
  const bridge = config?.bridge;
  useEffect(() => {
    if (!startEnabled) return;
    if (bridge) {
      setModelState((previous) => ({
        ...(previous ?? createInitialDzbPrmModelState()),
        bridge,
      }));
    }
    setShadowState((previous) => ({
      ...(previous ?? initialShadowState),
      enabled: true,
    }));
    return () =>
      setShadowState((previous) => ({
        ...(previous ?? initialShadowState),
        enabled: false,
        isAnimating: false,
      }));
  }, [bridge, initialShadowState, setModelState, setShadowState, startEnabled]);
  // Only the shadows: the layer takes the base map off while it is in the
  // stack, like the "Schatten ohne Karte" card, and puts it back as it was
  // when it leaves. "Karte" in the panel still brings the map back meanwhile.
  useEffect(() => {
    if (!startEnabled) return;
    const previousVisible =
      (
        store.getState() as {
          mapping?: { backgroundLayer?: { visible?: boolean } };
        }
      ).mapping?.backgroundLayer?.visible ?? true;
    store.dispatch({
      type: "mapping/changeBackgroundVisibility",
      payload: false,
    });
    return () => {
      store.dispatch({
        type: "mapping/changeBackgroundVisibility",
        payload: previousVisible,
      });
    };
  }, [startEnabled, store]);
  useEffect(() => {
    let cancelled = false;
    setCollection(null);
    setCollectionError(null);
    if (!manifestUrl) return;
    void loadDzbPrmCollection(manifestUrl)
      .then((value) => {
        if (!cancelled) setCollection(value);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCollectionError(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [manifestUrl]);
  useEffect(() => {
    if (target || !shadowState?.enabled) return;
    // Decision: this addon owns its variants, not companion layer rows; see
    // apps/geoportal/scripts/README.dz-b-prm.md#unified-shadow-controls.
    if (carma.mapping2D.getLayerVisibility("wuppObjects_bridge") === true) {
      setModelState((previous) => ({
        ...(previous ?? createInitialDzbPrmModelState()),
        bridge: "planning",
      }));
      setTextureState((previous) => ({
        ...(previous ?? INITIAL_TEXTURE_STATE),
        useCatalogBridgeCaster: true,
      }));
    }
    carma.mapping2D.removeLayer("wuppObjects_bridge");
  }, [carma, setModelState, setTextureState, shadowState?.enabled, target]);

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
    const status =
      collectionError ??
      (textureState?.status === "idle" ? undefined : textureState?.status);
    return (
      <div
        className="shadow-texture-panel text-sm"
        data-test-id="shadow-texture-panel"
      >
        <ShadowTextureHeaderControls />
        {/* a layer that stands for one bridge does not offer the other */}
        {!config?.bridge && (
          <Radio.Group
            aria-label="Brückenvariante"
            size="small"
            optionType="button"
            buttonStyle="solid"
            value={modelState?.bridge === "existing" ? "existing" : "planning"}
            options={[
              { label: "Bestand", value: "existing" },
              { label: "BuGa-Entwurf", value: "planning" },
            ]}
            onChange={({ target: { value } }) =>
              setModelState((previous) => ({
                ...(previous ?? createInitialDzbPrmModelState()),
                bridge: value,
              }))
            }
          />
        )}
        <details className="shadow-texture-options">
          <summary>
            Einstellungen{" "}
            <span className="shadow-texture-summary-meta">
              {status && (
                <span
                  role="status"
                  className="shadow-texture-status"
                  title={status}
                >
                  {status}
                </span>
              )}
              <span>
                {textureState?.captureProjection === "perspective"
                  ? "Perspektivisch"
                  : "Orthografisch"}{" "}
                · {(textureState?.quality ?? "4k").toUpperCase()}
              </span>
            </span>
          </summary>
          <section aria-label="Animation">
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Animation
            </h4>
            <div className="shadow-texture-option-row">
              <Suspense fallback={null}>
                <ShadowAnimationSpeedControl
                  value={shadowState?.animationSpeed ?? 4}
                  onChange={(animationSpeed) =>
                    setShadowState((previous) => ({
                      ...(previous ?? initialShadowState),
                      animationSpeed,
                    }))
                  }
                />
              </Suspense>
              <Radio.Group
                aria-label="Zeitraum des Tageslaufs"
                size="small"
                optionType="button"
                buttonStyle="solid"
                value={shadowState?.animationDaylightOnly ?? false}
                options={[
                  { label: "24 h", value: false },
                  { label: "Sonnenaufgang–Sonnenuntergang", value: true },
                ]}
                onChange={({ target: { value } }) =>
                  setShadowState((previous) => ({
                    ...(previous ?? initialShadowState),
                    animationDaylightOnly: value,
                  }))
                }
              />
            </div>
          </section>

          <section aria-label="Kamera">
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Kamera
            </h4>
            <div className="shadow-texture-option-row">
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
              <Radio.Group
                aria-label="Schattenraster-Auflösung"
                size="small"
                optionType="button"
                buttonStyle="solid"
                value={textureState?.quality ?? "4k"}
                options={Object.entries(SHADOW_TEXTURE_RESOLUTIONS).map(
                  ([value, { label }]) => ({ value, label })
                )}
                onChange={({ target: { value } }) =>
                  setTextureState((previous) => ({
                    ...(previous ?? INITIAL_TEXTURE_STATE),
                    quality: value,
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
                    min={1}
                    max={5}
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
          </section>
          <section aria-label="Schattenqualität">
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Schatten
            </h4>
            <div className="shadow-texture-option-row">
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
              <ColorPicker
                size="small"
                placement="bottomLeft"
                getPopupContainer={(trigger) =>
                  trigger.parentElement ?? trigger
                }
                value={`${
                  textureState?.color ?? INITIAL_TEXTURE_STATE.color
                }${Math.round(
                  (textureState?.intensity ?? INITIAL_TEXTURE_STATE.intensity) *
                    255
                )
                  .toString(16)
                  .padStart(2, "0")}`}
                showText={() => "Farbe / Stärke"}
                onChange={(color) =>
                  setTextureState((previous) => ({
                    ...(previous ?? INITIAL_TEXTURE_STATE),
                    color: color.toHexString().slice(0, 7),
                    intensity: color.toRgb().a,
                  }))
                }
              />
            </div>
          </section>
          <section aria-label="Modell">
            <h4 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Modell
            </h4>
            <div className="shadow-texture-option-row">
              <Radio.Group
                aria-label="Geometriedetaillierung"
                size="small"
                optionType="button"
                buttonStyle="solid"
                value={modelState?.quality ?? "5m"}
                options={(["5m", "2m", "original"] as const)
                  .filter((quality) => collection?.qualities[quality])
                  .map((quality) => ({
                    value: quality,
                    label:
                      quality === "original"
                        ? "Original"
                        : quality.replace("m", " m"),
                  }))}
                onChange={({ target: { value } }) =>
                  setModelState((previous) => ({
                    ...(previous ?? createInitialDzbPrmModelState()),
                    quality: value,
                  }))
                }
              />
              <Checkbox
                checked={textureState?.shadowOnly === false}
                onChange={(event) =>
                  setTextureState((previous) => ({
                    ...previous!,
                    shadowOnly: !event.target.checked,
                  }))
                }
              >
                3D-Geometrie
              </Checkbox>
            </div>
            {textureState?.shadowOnly === false && (
              <label className="shadow-texture-option-row">
                Deckkraft{" "}
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  aria-label="Geometriedeckkraft"
                  value={modelState?.opacity ?? 1}
                  onChange={(event) =>
                    setModelState((previous) => ({
                      ...(previous ?? createInitialDzbPrmModelState()),
                      opacity: Number(event.target.value),
                    }))
                  }
                />
              </label>
            )}

            <Radio.Group
              aria-label="Entwurfsmodell"
              size="small"
              optionType="button"
              buttonStyle="solid"
              value={
                textureState?.useCatalogBridgeCaster ??
                modelState?.bridge === "catalog"
              }
              options={[
                { label: "Gedrucktes Modell", value: false },
                { label: "Realistisches Modell", value: true },
              ]}
              onChange={({ target: { value } }) =>
                setTextureState((previous) => ({
                  ...(previous ?? INITIAL_TEXTURE_STATE),
                  useCatalogBridgeCaster: value,
                }))
              }
            />
          </section>
          <section aria-label="Karte">
            <Checkbox
              checked={backgroundVisible}
              onChange={(event) =>
                store.dispatch({
                  type: "mapping/changeBackgroundVisibility",
                  payload: event.target.checked,
                })
              }
            >
              Karte
            </Checkbox>
          </section>
          <div className="flex justify-end text-sm text-neutral-600">
            <button
              type="button"
              className="flex items-center gap-2 whitespace-nowrap hover:text-amber-700"
              onClick={() => {
                setTextureState((previous) => ({
                  ...previous,
                  ...INITIAL_TEXTURE_STATE,
                  useCatalogBridgeCaster: false,
                  timeAdjusting: false,
                }));
                setModelState((previous) => ({
                  ...(previous ?? createInitialDzbPrmModelState()),
                  quality: createInitialDzbPrmModelState().quality,
                  opacity: createInitialDzbPrmModelState().opacity,
                }));
                setShadowState((previous) => ({
                  ...(previous ?? initialShadowState),
                  animationSpeed: initialShadowState.animationSpeed,
                  animationDaylightOnly:
                    initialShadowState.animationDaylightOnly,
                  isAnimating: false,
                }));
              }}
            >
              <FontAwesomeIcon icon={faArrowRotateLeft} />
              Zurücksetzen
            </button>
          </div>
        </details>
      </div>
    );
  }

  return (
    <>
      {/* shadows a layer launched are switched by that layer */}
      {libreMap && !config?.permanent && (
        <Control position="topleft" order={71}>
          {controlContent}
        </Control>
      )}
      {libreMap &&
        shadowState &&
        textureState &&
        dateState &&
        modelState &&
        config?.assetBaseUrl && (
          <Suspense fallback={null}>
            <ShadowTextureRuntime
              assetBaseUrl={config.assetBaseUrl}
              manifestUrl={manifestUrl}
              anchorLayerId={config.anchorLayerId}
              map={libreMap}
              shadowState={shadowState}
              dateState={dateState}
              textureState={textureState}
              modelState={modelState as ModelCollectionState}
              setTextureState={setTextureState}
              setDateState={setDateState}
            />
            {shadowState?.enabled && !textureState.shadowOnly && collection && (
              <ModelCollectionRuntime
                map={libreMap}
                collection={collection}
                assetBaseUrl={config.assetBaseUrl}
                state={{
                  ...modelState,
                  visible: true,
                  bridge:
                    modelState.bridge === "existing"
                      ? "existing"
                      : textureState.useCatalogBridgeCaster ??
                        modelState.bridge === "catalog"
                      ? "catalog"
                      : "planning",
                }}
              />
            )}
          </Suspense>
        )}
    </>
  );
};

export const ShadowTextureHeaderControls = ({
  compact = false,
}: {
  compact?: boolean;
}) => {
  const [state, setState] = useAddonState("shadowSimulation");
  const [dateState, setDateState] = useAddonState("shadowDate");
  const [, setTextureState] = useAddonState("shadowTexture");
  const onTimeInteractionChange = useCallback(
    (timeAdjusting: boolean) =>
      setTextureState((previous) =>
        previous?.timeAdjusting === timeAdjusting
          ? previous
          : { ...(previous ?? INITIAL_TEXTURE_STATE), timeAdjusting }
      ),
    [setTextureState]
  );
  useEffect(
    () => () => onTimeInteractionChange(false),
    [onTimeInteractionChange]
  );
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
        onTimeInteractionChange={onTimeInteractionChange}
        showYearSlider
        compact={compact}
      />
    </Suspense>
  );
};
