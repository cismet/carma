import { lazy, Suspense, useEffect, useState } from "react";

import { useAddonState } from "../../lib/AddonStateContext";
import type { AddonComponentProps } from "../../lib/registry";
import {
  createInitialDzbPrmModelState,
  loadDzbPrmCollection,
  type DzbPrmModelCollection,
  type DzbPrmModelState,
} from "./dzb-prm-collection";

export type ModelCollectionConfig = {
  manifestUrl: string;
  assetBaseUrl?: string;
};
export type ModelCollectionState = DzbPrmModelState;

const ModelCollectionRuntime = lazy(() =>
  import("./ModelCollectionRuntime").then((module) => ({
    default: module.ModelCollectionRuntime,
  }))
);

export const CatalogBridgeModel = lazy(() =>
  import("./CatalogBridgeModel").then((module) => ({
    default: module.CatalogBridgeModel,
  }))
);

export const ModelCollection = ({
  config,
  libreMap,
  target,
}: AddonComponentProps<"modelCollection">) => {
  const [state, setState] = useAddonState("modelCollection");
  const [manifest, setManifest] = useState<DzbPrmModelCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) setState(createInitialDzbPrmModelState());
    else if (state.bridge === "catalog")
      setState({ ...state, bridge: "planning" });
  }, [setState, state]);

  useEffect(() => {
    let cancelled = false;
    loadDzbPrmCollection(config.manifestUrl)
      .then((collection) => {
        if (!cancelled) setManifest(collection);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [config.manifestUrl]);

  if (!target) {
    if (!libreMap || !manifest || !state) return null;
    const assetBaseUrl =
      config.assetBaseUrl ||
      new URL(".", new URL(config.manifestUrl, globalThis.location.href)).href;
    return (
      <Suspense fallback={null}>
        <ModelCollectionRuntime
          map={libreMap}
          collection={manifest}
          assetBaseUrl={assetBaseUrl}
          state={state}
        />
      </Suspense>
    );
  }
  if (!state) return <div>Lade Modell-Collection …</div>;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="font-semibold">BuGa · Modell-Collection</div>
      <div>
        <div className="mb-1">Brücke</div>
        <div className="flex gap-4">
          {(["existing", "planning"] as const).map((bridge) => (
            <label key={bridge} className="flex items-center gap-1">
              <input
                type="radio"
                name="dzb-prm-bridge"
                checked={state.bridge === bridge}
                onChange={() => setState({ ...state, bridge })}
              />
              {bridge === "existing" ? "Bestand" : "Entwurf"}
            </label>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1">Detaillierung</div>
        <div className="flex gap-4">
          {(["2m", "5m", "original"] as const)
            .filter((quality) => Boolean(manifest?.qualities[quality]))
            .map((quality) => (
              <label key={quality} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="dzb-prm-quality"
                  checked={state.quality === quality}
                  onChange={() => setState({ ...state, quality })}
                />
                {quality === "original" ? "Original" : quality}
              </label>
            ))}
        </div>
      </div>
      <label className="flex items-center gap-3">
        <span>Deckkraft</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(state.opacity * 100)}
          onChange={(event) =>
            setState({ ...state, opacity: Number(event.target.value) / 100 })
          }
        />
        <span>{Math.round(state.opacity * 100)} %</span>
      </label>
      <div className="text-neutral-500">Umgebung · Zoo · Bergstation</div>
      {error && <div role="alert">{error}</div>}
    </div>
  );
};
