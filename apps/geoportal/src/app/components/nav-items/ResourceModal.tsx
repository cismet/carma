import { message } from "antd";
import { useCallback, useContext, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import {
  useAdhocFeatureDisplay,
  useMapStyle,
} from "@carma-appframeworks/portals";
import { LayerCatalog } from "@carma-mapping/layers";
import type { CustomCategoryDefinition, Item } from "@carma-mapping/layers";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";
import { useLibreContext } from "@carma-mapping/contexts";
import { addCustomFeatureFlags } from "../../store/slices/layers";
import {
  appendSavedLayerConfig,
  deleteSavedLayerConfig,
  getBackgroundLayer,
  getLayers,
  getLayerStack,
  getSavedLayerConfigs,
  removeLastLayer,
  updateLayer,
} from "../../store/slices/mapping";
import { getMeasurements } from "../../store/slices/measurements";
import {
  getUIShowResourceModal,
  setShowLoginModal,
  setShowResourceModal,
} from "../../store/slices/ui";
import store from "../../store";
import { withSavedMeasurementCarrierImport } from "../layers/measurement-import-utils";
import { createResourceLayerUpdater } from "./resource-layer-updater";
import { useCarmaMapAPIActions } from "@carma-mapping/carma-map-api";
import {
  useTimeSeriesLauncher,
  useFlowFieldLauncher,
  type FlowFieldConfig,
  useVehicleAnimationLauncher,
  useFloodLauncher,
  type FloodSimulationConfig,
  type TimeSliderConfig,
  type VehicleAnimationConfig,
} from "@carma-mapping/addons";

const ResourceModal = () => {
  const { setCurrentStyle } = useMapStyle();

  const dispatch = useDispatch();

  const activeLayers = useSelector(getLayers);
  const layerStack = useSelector(getLayerStack);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const measurements = useSelector(getMeasurements);
  const savedLayerConfigs = useSelector(getSavedLayerConfigs);
  const showResourceModal = useSelector(getUIShowResourceModal);

  const [messageApi, contextHolder] = message.useMessage();

  const { routedMapRef: routedMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);
  const { map: libreMap } = useLibreContext();

  const {
    addFeature,
    setSelectedFeatureById,
    setShouldFocusSelected,
    clearFeatureCollections,
  } = useAdhocFeatureDisplay();
  const { toggle, getIsLeaflet, getIsCesium } =
    useMapFrameworkSwitcherContext();
  const { addLayerById } = useCarmaMapAPIActions();

  // the favorites-derived subcategories are registry defaults of the lib;
  // only the genuinely app-owned measurements category is added here
  const customCategories = useMemo<CustomCategoryDefinition[]>(
    () => [
      {
        id: "measurements",
        label: "Meine Messungen",
        mainCategoryId: "objects",
        hideWhenEmpty: true,
        keepItemServiceName: true,
        source: { kind: "items", items: measurements as unknown as Item[] },
      },
    ],
    [measurements]
  );

  const getFrameworkMode = useCallback(
    () => ({
      isLeaflet: getIsLeaflet(),
      isCesium: getIsCesium(),
    }),
    [getIsCesium, getIsLeaflet]
  );

  const { toggleSeries } = useTimeSeriesLauncher();
  const { toggleField } = useFlowFieldLauncher();
  const { toggleFlood } = useFloodLauncher();
  /** a workflow card's timeSlider tool: its config is the series to run */
  const startTimeSeries = useCallback(
    (config: TimeSliderConfig) => {
      const { wmsUrl, layers } = config;
      if (!wmsUrl || !layers?.length) {
        messageApi.open({
          type: "error",
          content: "Der Workflow enthält keine vollständige Zeitreihe.",
        });
        return;
      }
      toggleSeries({
        title: config.title ?? "Zeitreihe",
        wmsUrl,
        layers,
        labels: config.labels ?? [],
        styles: config.styles ?? "",
        intermediateValuesCount: config.intermediateValuesCount,
        opacity: config.opacity,
        initialStep: config.initialStep,
        // what the row's info view shows; the card's own texts by default,
        // see the workflow branch in `resource-layer-updater`
        description: config.description,
        metaDataText: config.metaDataText,
        links: config.links,
        legend: config.legend,
      });
    },
    [toggleSeries, messageApi]
  );

  /** a workflow card's flowField tool: its config is the animation to run */
  const startFlowField = useCallback(
    (config: FlowFieldConfig) => {
      const { service, scenario } = config;
      if (!service || !scenario) {
        messageApi.open({
          type: "error",
          content: "Der Workflow enthält keine vollständige Fließwege-Animation.",
        });
        return;
      }
      // Spread rather than rebuilt field by field: a `FlowFieldConfig` is a
      // `FlowFieldDefinition` plus the keys only a route uses, and listing the
      // definition's keys here meant every one added since was silently
      // dropped on the way from a card into the channel. `startEnabled`,
      // `showControl` and the rest ride along and are ignored by the channel.
      toggleField({
        ...config,
        title: config.title ?? "Fließwege",
        service,
        scenario,
      });
    },
    [toggleField, messageApi]
  );

  const { toggleVehicle } = useVehicleAnimationLauncher();
  /** a workflow card's vehicleAnimation tool: its config is the route to run */
  const startVehicleAnimation = useCallback(
    (config: VehicleAnimationConfig) => {
      const { trackUrl } = config;
      if (!trackUrl) {
        messageApi.open({
          type: "error",
          content: "Der Workflow enthält keine Strecke für die Animation.",
        });
        return;
      }
      toggleVehicle({
        title: config.title ?? "Fahrzeug",
        trackUrl,
        lengthMeters: config.lengthMeters,
        widthMeters: config.widthMeters,
        sectionShares: config.sectionShares,
        jointMeters: config.jointMeters,
        speedKmh: config.speedKmh,
        mode: config.mode,
        schedule: config.schedule,
        bodyColor: config.bodyColor,
        jointColor: config.jointColor,
        outlineColor: config.outlineColor,
        opacity: config.opacity,
        showTrack: config.showTrack,
        trackColor: config.trackColor,
        structureUrl: config.structureUrl,
        timetableUrl: config.timetableUrl,
        renderer: config.renderer,
      });
    },
    [toggleVehicle, messageApi]
  );

  /** a workflow card's floodSimulation tool: its config is the flood to show */
  const startFlood = useCallback(
    (config: FloodSimulationConfig) => {
      toggleFlood({
        title: config.title ?? "Hochwasser",
        terrain: config.terrain,
        level: config.level,
        range: config.range,
        opacity: config.opacity,
      });
    },
    [toggleFlood]
  );

  const updateLayers = withSavedMeasurementCarrierImport(
    createResourceLayerUpdater({
      dispatch,
      activeLayers,
      layerStack,
      addFeature,
      setSelectedFeatureById,
      setShouldFocusSelected,
      clearFeatureCollections,
      toggleFramework: toggle,
      getFrameworkMode,
      routedMap,
      libreMap,
      setCurrentStyle,
      messageApi,
      addLayerById,
      startTimeSeries,
      startFlowField,
      startVehicleAnimation,
      startFlood,
    }),
    { measurements }
  );

  return (
    <>
      {contextHolder}
      <LayerCatalog
        open={showResourceModal}
        setOpen={(show) => dispatch(setShowResourceModal(show))}
        setAdditionalLayers={updateLayers}
        savedCollections={savedLayerConfigs}
        onAddCollection={(layer) => {
          dispatch(appendSavedLayerConfig(layer));
        }}
        onRemoveCollection={(layer) => {
          dispatch(deleteSavedLayerConfig(layer.id));
        }}
        activeLayers={[backgroundLayer, ...activeLayers]}
        customCategories={customCategories}
        updateActiveLayer={(layer) => {
          dispatch(updateLayer(layer));

          if (layer.layerType !== "vector" || !layer.props?.style) {
            return;
          }

          const entry = store
            .getState()
            .mapping.maplibreMaps.find((e) => e.id === layer.id);
          if (!entry?.map) {
            return;
          }

          const raw = layer.props.style;
          let updatedStyle = raw;
          if (typeof raw === "string" && raw.trim().startsWith("{")) {
            try {
              updatedStyle = JSON.parse(raw);
            } catch (err) {
              console.error("parse failed", err);
              throw err;
            }
          }
          try {
            entry.map.setStyle(updatedStyle);
          } catch (err) {
            console.error("setStyle failed", err);
            throw err;
          }
        }}
        removeLastLayer={() => {
          dispatch(removeLastLayer());
        }}
        setFeatureFlags={(flags) => {
          dispatch(addCustomFeatureFlags(flags));
        }}
        unauthorizedCallback={() => {
          dispatch(setShowLoginModal(true));
        }}
        appKey="geoportal"
      />
    </>
  );
};

export default ResourceModal;
