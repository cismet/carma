import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useLocation } from "react-router-dom";

import { registerConfig, type MappingConfig } from "@carma-api";
import {
  type SelectedObject,
  useAdhocFeatureDisplay,
  type LayerMap,
  type SelectionItem,
  type Settings,
} from "@carma-appframeworks/portals";
import type { BackgroundLayer, Layer } from "@carma-mapping/layers";
import { updateHashHistoryState, getHashParams } from "@carma-commons/utils";

import { findFachzwillingByPathname } from "../constants/fachzwillinge";

import {
  setBackgroundLayer,
  setConfigSelection,
  setLayers,
  setSelectedLuftbildLayer,
  setSelectedMapLayer,
} from "../store/slices/mapping";

import { AppDispatch } from "../store";

type View = {
  center: string[];
  zoom: string;
};

type Config = {
  layers: Layer[];
  /** optional: a display that wants layers over nothing sends no base map */
  backgroundLayer?: BackgroundLayer & { selectedLayerId: string };
  settings?: Settings;
  view?: View;
  gazetteerSelection?: SelectionItem;
  selectedFeature?: SelectedObject;
};

const DEFAULT_CONFIG_KEY = "config";

const onLoadedConfig = (
  config: Config,
  layerMap: LayerMap,
  dispatch: AppDispatch,
  setSelectedFeatureById: (
    id: string,
    collectionId: string,
    layerId: string
  ) => void
) => {
  dispatch(setLayers(config.layers));

  // A configuration may leave the base map out entirely, which is what a
  // display projecting layers onto a physical model wants. The descriptive
  // texts always come from layerMap, so the configuration only ever carries
  // the choice, never the content.
  const selectedMapLayerId = config.backgroundLayer?.selectedLayerId;
  const mapLayerEntry = selectedMapLayerId
    ? layerMap[selectedMapLayerId]
    : undefined;
  if (config.backgroundLayer && mapLayerEntry) {
    const selectedBackgroundLayer: BackgroundLayer = {
      title: mapLayerEntry.title,
      id: selectedMapLayerId as string,
      opacity: config.backgroundLayer.opacity,
      description: mapLayerEntry.description,
      inhalt: mapLayerEntry.inhalt,
      eignung: mapLayerEntry.eignung,
      visible: config.backgroundLayer.visible,
      layerType: "wmts",
      layers: mapLayerEntry.layers,
    };
    dispatch(
      setBackgroundLayer({
        ...selectedBackgroundLayer,
        id: config.backgroundLayer.id,
      })
    );
    if (config.backgroundLayer.id === "luftbild") {
      dispatch(setSelectedLuftbildLayer(selectedBackgroundLayer));
    } else {
      dispatch(setSelectedMapLayer(selectedBackgroundLayer));
    }
  } else if (config.backgroundLayer) {
    // named a base map the app does not have: keep the current one rather than
    // reading through an undefined entry
    console.warn(
      `[CONFIG] unknown backgroundLayer.selectedLayerId "${String(
        selectedMapLayerId
      )}", keeping the current base map.`
    );
  }

  if (config.gazetteerSelection) {
    dispatch(setConfigSelection(config.gazetteerSelection));
  }
  if (config.selectedFeature) {
    if (
      config.selectedFeature.id &&
      config.selectedFeature.properties.collectionId &&
      config.selectedFeature.properties.layerId
    ) {
      // 3d selection
      setSelectedFeatureById(
        config.selectedFeature.id,
        config.selectedFeature.properties.collectionId,
        config.selectedFeature.properties.layerId
      );
    }
  }
};

export const useAppConfig = (
  configBaseUrl: string,
  layerMap: LayerMap,
  configKey = DEFAULT_CONFIG_KEY
) => {
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const { setSelectedFeatureById } = useAdhocFeatureDisplay();
  const fachzwilling = findFachzwillingByPathname(pathname);
  // a route may hold its config under a key of its own, see configHashKey
  const effectiveConfigKey = fachzwilling?.configHashKey ?? configKey;
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean | null>(null); // initially null to indicate undetermined state
  const [configId, setConfigId] = useState<string | undefined>(
    () => getHashParams()[effectiveConfigKey]
  );
  /** the config whose layers are currently applied, so a rewritten hash that
   * leaves the key untouched does not re-fetch and re-dispatch it */
  const appliedConfigRef = useRef<string | undefined>(undefined);
  /** the key this hook stripped from the hash itself. Removing it goes through
   * window.location.replace, which does fire a hashchange, so the listener below
   * would otherwise read the key as gone and drop the config mid-fetch. */
  const strippedConfigRef = useRef<string | undefined>(undefined);
  const initialLoadDoneRef = useRef(false);
  /** the load currently running, aborted when a newer one starts */
  const inFlightRef = useRef<AbortController | null>(null);

  /** Read through a ref so applyConfigById can stay identity-stable: it is
   * registered as an adapter, and re-registering on every render of a hook this
   * central would be churn for nothing. */
  const depsRef = useRef({
    configBaseUrl,
    layerMap,
    dispatch,
    setSelectedFeatureById,
  });
  depsRef.current = {
    configBaseUrl,
    layerMap,
    dispatch,
    setSelectedFeatureById,
  };

  /**
   * Apply a configuration the caller already holds. Same effect as loading a
   * stored one with this content: both end in `onLoadedConfig`, this one
   * without the fetch in front of it.
   *
   * Reaching the app through `carma.config.setMappingConfig`, this is how a
   * remote hands a display exactly what to show, without a stored configuration
   * having to exist for it and without a round trip to fetch one.
   */
  const applyMappingConfig = useCallback(
    async (incoming: MappingConfig): Promise<boolean> => {
      if (!incoming || !Array.isArray(incoming.layers)) {
        console.warn(
          "[CONFIG] ignoring a configuration without a layers array.",
          incoming
        );
        return false;
      }

      // A configuration handed over directly is newer than any load still in
      // flight, which would otherwise land afterwards and overwrite it.
      inFlightRef.current?.abort();

      const {
        layerMap: map,
        dispatch: d,
        setSelectedFeatureById,
      } = depsRef.current;
      try {
        onLoadedConfig(
          incoming as unknown as Config,
          map,
          d,
          setSelectedFeatureById
        );
      } catch (error) {
        console.error("[CONFIG] applying a configuration failed:", error);
        return false;
      }
      // Content that no stored configuration backs, so no id describes what is
      // on screen now. Tracking that is the caller's own business.
      appliedConfigRef.current = undefined;
      initialLoadDoneRef.current = true;
      setIsLoadingConfig(false);
      return true;
    },
    []
  );

  /**
   * Load a shared configuration by its id and apply its content. The hash
   * effect below calls it, and so does anything reaching the app through
   * `carma.config.applyById`.
   */
  const applyConfigById = useCallback(async (id: string): Promise<boolean> => {
    if (!id) {
      console.info("[CONFIG] ignoring an empty config id.");
      return false;
    }
    if (id === appliedConfigRef.current) {
      setIsLoadingConfig(false);
      return true;
    }

    // A switch arriving while an earlier one is still loading must win, or the
    // slower response would land last and the app would show the wrong config.
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;

    // Only the first load blanks the app (isLoadingConfig stays null until it
    // resolves). A later switch keeps the map mounted and just swaps the
    // content, so the outlet's fitted view survives it.
    if (!initialLoadDoneRef.current) {
      setIsLoadingConfig(true);
    }

    const { configBaseUrl: baseUrl, ...rest } = depsRef.current;
    try {
      const response = await fetch(baseUrl + id, { signal: controller.signal });
      const newConfig = (await response.json()) as Config;
      onLoadedConfig(
        newConfig,
        rest.layerMap,
        rest.dispatch,
        rest.setSelectedFeatureById
      );
      appliedConfigRef.current = id;
      initialLoadDoneRef.current = true;
      setIsLoadingConfig(false);
      return true;
    } catch (error) {
      // An abort means a newer load took over and owns the state from here.
      if (error instanceof Error && error.name === "AbortError") {
        return false;
      }
      initialLoadDoneRef.current = true;
      setIsLoadingConfig(false);
      console.error("Error loading config:", error);
      return false;
    } finally {
      if (inFlightRef.current === controller) {
        inFlightRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    registerConfig({
      applyById: applyConfigById,
      setMappingConfig: applyMappingConfig,
      getAppliedId: () => appliedConfigRef.current ?? null,
    });
    return () => {
      registerConfig(null);
    };
  }, [applyConfigById, applyMappingConfig]);

  useEffect(
    () => () => {
      inFlightRef.current?.abort();
    },
    []
  );

  // Editing the config key in the address bar must take effect without a
  // reload. The app's own hash writes go through pushState or location.replace,
  // so they land here too; the applied-config check below makes those a no-op.
  useEffect(() => {
    const readConfigFromHash = () => {
      const next = getHashParams()[effectiveConfigKey];
      setConfigId((current) => {
        if (current === next) {
          return current;
        }
        if (next === undefined && current === strippedConfigRef.current) {
          // our own removal of the key, keep the config that is being loaded
          return current;
        }
        return next;
      });
    };
    // also on mount, so switching to a route with its own key re-reads it
    readConfigFromHash();
    window.addEventListener("hashchange", readConfigFromHash);
    window.addEventListener("popstate", readConfigFromHash);
    return () => {
      window.removeEventListener("hashchange", readConfigFromHash);
      window.removeEventListener("popstate", readConfigFromHash);
    };
  }, [effectiveConfigKey]);

  useEffect(() => {
    const config = configId;
    if (config !== undefined && config === appliedConfigRef.current) {
      setIsLoadingConfig(false);
      return;
    }
    if (config === undefined) {
      setIsLoadingConfig(false);
      console.info("[CONFIG] No config key provided in hash parameters.");
      return;
    }
    // Dropping the parameter is itself a hash write, so routes that own their
    // url keep it. They need it: without it a reload falls back to whatever
    // redux-persist happens to hold instead of the configured layers.
    if (!fachzwilling?.disableHashWrite) {
      strippedConfigRef.current = config;
      // TODO use HashStateProvider Here since its toplevel now
      // can't use HashStateProvider here
      // because it's not yet available
      // and needs to be configured by the config itself
      // use direct history state update instead
      updateHashHistoryState({ [effectiveConfigKey]: undefined }, pathname, {
        label: "remove config search parameter",
        replace: true,
      });
    }

    if (config === null || config === "") {
      setIsLoadingConfig(false);
      console.info("[CONFIG] Empty config key provided in hash parameters.");

      return;
    }

    console.info("[CONFIG] config  provided in hash parameters.", { config });

    void applyConfigById(config);
    // re-runs whenever the config key in the hash changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId]);
  return isLoadingConfig;
};
