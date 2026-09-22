import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "antd";
import { useDispatch, useStore } from "react-redux";
import { useLocation } from "react-router-dom";

import { registerConfig, type MappingConfig } from "@carma-api";
import {
  type SelectedObject,
  type ShareConfigMode,
  useAdhocFeatureDisplay,
  type LayerMap,
  type SelectionItem,
  type Settings,
} from "@carma-appframeworks/portals";
import {
  isLayerGroup,
  type BackgroundLayer,
  type Layer,
  type LayerStackEntry,
} from "@carma-mapping/layers";
import { updateHashHistoryState, getHashParams } from "@carma-commons/utils";

import {
  DEFAULT_BACKGROUND_LAYER_ID,
  DEFAULT_BACKGROUND_SELECTED_LAYER_ID,
} from "../config";
import { toBackgroundLayer } from "../config/backgroundConfig";
import { findFachzwillingByPathname } from "../constants/fachzwillinge";
import { readCachedConfig, writeCachedConfig } from "../helper/config-cache";
import { stripInteractionButtons } from "../store/persisted-layer-stack";

import {
  appendLayer,
  getLayerStack,
  getLayerState,
  removeLayer,
  setBackgroundLayer,
  setConfigSelection,
  setLayers,
  setSelectedByCategory,
} from "../store/slices/mapping";

import type { AppDispatch, RootState } from "../store";

type View = {
  center: string[];
  zoom: string;
};

type Config = {
  /** absent means `replace`, see ShareConfigMode */
  mode?: ShareConfigMode;
  layers: LayerStackEntry[];
  /** optional: a display that wants layers over nothing sends no base map */
  backgroundLayer?: BackgroundLayer & { selectedLayerId: string };
  settings?: Settings;
  view?: View;
  gazetteerSelection?: SelectionItem;
  selectedFeature?: SelectedObject;
};

const DEFAULT_CONFIG_KEY = "config";

/** enough of a configuration to apply; what a fetch or the cache returns is checked against it */
const isUsableConfig = (value: unknown): value is Config =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as { layers?: unknown }).layers);

/**
 * Append the configuration's entries to the stack the visitor already has.
 * Nothing else in the configuration is read: no base map, no view, no
 * selection. A layer whose id is already on the map is left alone, so opening
 * the same link twice does not stack it twice. A workflow row (a `__` id, see
 * `persisted-layer-stack.ts`) replaces the one already there instead: its
 * engine holds one workflow at a time, and the link's is the one asked for.
 * A group brings its members with it: a member already on the map on its own
 * is taken off, so the map shows it once, inside the group; the link is an
 * intentional act and the group's copy is the one asked for.
 */
const applyAdditiveConfig = (
  config: Config,
  currentStack: LayerStackEntry[],
  dispatch: AppDispatch
) => {
  const presentIds = new Set(currentStack.map((entry) => entry.id));
  const added: string[] = [];
  const skipped: string[] = [];
  console.info("[CONFIG] additive entries", { layers: config.layers });
  // a link is JSON, so any `interactionButtons` in it are dead React elements
  // (see `stripInteractionButtons`); the row's mode rebuilds them once it runs
  for (const entry of stripInteractionButtons(config.layers)) {
    if (presentIds.has(entry.id)) {
      if (!entry.id.startsWith("__") && !isLayerGroup(entry)) {
        skipped.push(entry.title);
        continue;
      }
      dispatch(removeLayer(entry.id));
    }
    if (isLayerGroup(entry)) {
      for (const member of entry.layers) {
        if (presentIds.has(member.id)) {
          dispatch(removeLayer(member.id));
          presentIds.delete(member.id);
        }
      }
    }
    dispatch(appendLayer(entry));
    presentIds.add(entry.id);
    added.push(entry.title);
  }
  if (added.length > 0) {
    message.success(`${added.join(", ")} wurde hinzugefügt.`);
  }
  if (skipped.length > 0) {
    message.info(`${skipped.join(", ")} ist bereits auf der Karte.`);
  }
};

const onLoadedConfig = (
  config: Config,
  layerMap: LayerMap,
  dispatch: AppDispatch,
  setSelectedFeatureById: (
    id: string,
    collectionId: string,
    layerId: string
  ) => void,
  getCurrentStack: () => LayerStackEntry[]
): { replacedMap: boolean } => {
  if (config.mode === "additive") {
    applyAdditiveConfig(config, getCurrentStack(), dispatch);
    // what is on screen is still the visitor's own map, plus a few rows
    return { replacedMap: false };
  }

  dispatch(setLayers(config.layers));

  // A configuration may leave the base map out entirely, and then the current
  // one stays: this call sets what it names, it does not reset what it omits.
  //
  // Naming one without saying which map it is falls back to the default pair,
  // so a configuration can ask for no base map without first having to pick
  // one: `"backgroundLayer": { "visible": false }`. The descriptive texts come
  // from layerMap either way, a configuration only ever carries the choice.
  if (config.backgroundLayer) {
    const { id: givenId, selectedLayerId: givenSelectedLayerId } =
      config.backgroundLayer;
    if ((givenId === undefined) !== (givenSelectedLayerId === undefined)) {
      // They belong together, so half a pair is a mistake worth saying out loud
      // rather than silently combining a group with another group's map.
      console.warn(
        "[CONFIG] backgroundLayer gives only one of id and selectedLayerId; the missing one falls back to the default.",
        { id: givenId, selectedLayerId: givenSelectedLayerId }
      );
    }
    const backgroundLayerId = givenId ?? DEFAULT_BACKGROUND_LAYER_ID;
    const selectedMapLayerId =
      givenSelectedLayerId ?? DEFAULT_BACKGROUND_SELECTED_LAYER_ID;
    if (layerMap[selectedMapLayerId]) {
      const selectedBackgroundLayer = toBackgroundLayer(
        selectedMapLayerId,
        {
          opacity: config.backgroundLayer.opacity,
          visible: config.backgroundLayer.visible,
        },
        layerMap
      );
      dispatch(
        setBackgroundLayer({
          ...selectedBackgroundLayer,
          id: backgroundLayerId,
        })
      );
      dispatch(
        setSelectedByCategory({
          categoryId: backgroundLayerId,
          layer: selectedBackgroundLayer,
        })
      );
    } else {
      // named a base map the app does not have: keep the current one rather
      // than reading through an undefined entry
      console.warn(
        `[CONFIG] unknown backgroundLayer.selectedLayerId "${selectedMapLayerId}", keeping the current base map.`
      );
    }
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
  return { replacedMap: true };
};

export const useAppConfig = (
  configBaseUrl: string,
  layerMap: LayerMap,
  configKey = DEFAULT_CONFIG_KEY
) => {
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const { pathname } = useLocation();
  const { setSelectedFeatureById } = useAdhocFeatureDisplay();
  // read at apply time, an additive config lands on whatever is there by then
  const getCurrentStack = useCallback(
    () => getLayerStack(store.getState()),
    [store]
  );
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
  const cacheConfigsById = fachzwilling?.cacheConfigsById ?? false;
  const depsRef = useRef({
    configBaseUrl,
    layerMap,
    dispatch,
    setSelectedFeatureById,
    cacheConfigsById,
    getCurrentStack,
  });
  depsRef.current = {
    configBaseUrl,
    layerMap,
    dispatch,
    setSelectedFeatureById,
    cacheConfigsById,
    getCurrentStack,
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
        getCurrentStack: getStack,
      } = depsRef.current;
      try {
        onLoadedConfig(
          incoming as unknown as Config,
          map,
          d,
          setSelectedFeatureById,
          getStack
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

    const {
      configBaseUrl: baseUrl,
      cacheConfigsById: useCache,
      ...rest
    } = depsRef.current;
    const url = baseUrl + id;
    try {
      const cached = useCache ? await readCachedConfig(url) : undefined;
      if (controller.signal.aborted) {
        // a newer load took over while the cache was being read
        return false;
      }
      let newConfig: Config;
      if (isUsableConfig(cached)) {
        newConfig = cached;
        console.debug(`[CONFIG] ${id} taken from the device cache`);
      } else {
        const response = await fetch(url, { signal: controller.signal });
        const body: unknown = await response.json();
        if (!response.ok || !isUsableConfig(body)) {
          // The config service answers an unknown id with 404 and an error
          // body. That body has no layers, and applying it would empty the
          // layer stack instead of leaving it as it was.
          console.error(
            `[CONFIG] config ${id} could not be loaded (HTTP ${response.status}), keeping the current layers.`,
            body
          );
          initialLoadDoneRef.current = true;
          setIsLoadingConfig(false);
          return false;
        }
        newConfig = body;
        if (useCache) {
          void writeCachedConfig(url, body);
        }
      }
      const { replacedMap } = onLoadedConfig(
        newConfig,
        rest.layerMap,
        rest.dispatch,
        rest.setSelectedFeatureById,
        rest.getCurrentStack
      );
      // An additive config does not describe what is on screen, so it is not
      // the applied one; the key is stripped from the hash either way, so it
      // is not re-applied on the next hash write.
      appliedConfigRef.current = replacedMap ? id : undefined;
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

  /**
   * What the map shows now, in the shape a share stores and `applyMappingConfig`
   * takes: the pm-show scenes are made of it. Read from the store at call time,
   * so it needs no subscription.
   */
  const getMappingConfig = useCallback((): MappingConfig => {
    const { layers, backgroundLayer, selectedByCategory } = getLayerState(
      store.getState()
    );
    const selectedLayerId = selectedByCategory[backgroundLayer.id]?.id;
    return {
      layers: layers as unknown as MappingConfig["layers"],
      ...(selectedLayerId
        ? { backgroundLayer: { ...backgroundLayer, selectedLayerId } }
        : {}),
    };
  }, [store]);

  useEffect(() => {
    registerConfig({
      applyById: applyConfigById,
      setMappingConfig: applyMappingConfig,
      getAppliedId: () => appliedConfigRef.current ?? null,
      getMappingConfig,
    });
    return () => {
      registerConfig(null);
    };
  }, [applyConfigById, applyMappingConfig, getMappingConfig]);

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
