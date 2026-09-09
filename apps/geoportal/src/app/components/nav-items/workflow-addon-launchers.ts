import { useCallback } from "react";

import type { Item } from "@carma-mapping/layers";
import {
  resolveAddonEntries,
  useFloodLauncher,
  useFlowFieldLauncher,
  useTimeSeriesLauncher,
  useVehicleAnimationLauncher,
  type AddonEntry,
  type FloodDefinition,
  type FloodSimulationConfig,
  type FlowFieldConfig,
  type FlowFieldDefinition,
  type TimeSeriesDefinition,
  type TimeSliderConfig,
  type VehicleAnimationConfig,
  type VehicleAnimationDefinition,
} from "@carma-mapping/addons";

import type { MessageApiLike } from "./resource-layer-updater";

/**
 * The workflow cards that launch an addon instead of adding layers, from both
 * sides: the click that starts one, and the question whether it is running.
 *
 * Both sides read a card's tool config through the same `to*Definition`
 * builder on purpose. The addon channels tell a running definition apart by
 * its title and its source, so a default title applied on the start path only
 * would leave a running card looking inactive in the catalog.
 */

/** `null` when the card carries no complete series */
const toSeriesDefinition = (
  config: TimeSliderConfig
): TimeSeriesDefinition | null => {
  const { wmsUrl, layers } = config;
  if (!wmsUrl || !layers?.length) {
    return null;
  }
  return {
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
  };
};

// Spread rather than rebuilt field by field: a `FlowFieldConfig` is a
// `FlowFieldDefinition` plus the keys only a route uses, and listing the
// definition's keys here meant every one added since was silently dropped on
// the way from a card into the channel. `startEnabled`, `showControl` and the
// rest ride along and are ignored by the channel.
const toFieldDefinition = (
  config: FlowFieldConfig
): FlowFieldDefinition | null => {
  const { service, scenario } = config;
  if (!service || !scenario) {
    return null;
  }
  return { ...config, title: config.title ?? "Fließwege", service, scenario };
};

const toVehicleDefinition = (
  config: VehicleAnimationConfig
): VehicleAnimationDefinition | null => {
  const { trackUrl } = config;
  if (!trackUrl) {
    return null;
  }
  return {
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
  };
};

/** every flood is complete: without a level the slider takes one from the view */
const toFloodDefinition = (config: FloodSimulationConfig): FloodDefinition => ({
  title: config.title ?? "Hochwasser",
  terrain: config.terrain,
  level: config.level,
  range: config.range,
  opacity: config.opacity,
});

/**
 * The launchers `resource-layer-updater` calls for a workflow card's tools,
 * plus the catalog's answer to whether such a card is on the map.
 */
export const useWorkflowAddonLaunchers = (messageApi: MessageApiLike) => {
  const { toggleSeries, isSeriesRunning } = useTimeSeriesLauncher();
  const { toggleField, isFieldRunning } = useFlowFieldLauncher();
  const { toggleFlood, isFloodRunning } = useFloodLauncher();
  const { toggleVehicle, isVehicleRunning } = useVehicleAnimationLauncher();

  /** a workflow card's timeSlider tool: its config is the series to run */
  const startTimeSeries = useCallback(
    (config: TimeSliderConfig) => {
      const definition = toSeriesDefinition(config);
      if (!definition) {
        messageApi.open({
          type: "error",
          content: "Der Workflow enthält keine vollständige Zeitreihe.",
        });
        return;
      }
      toggleSeries(definition);
    },
    [toggleSeries, messageApi]
  );

  /** a workflow card's flowField tool: its config is the animation to run */
  const startFlowField = useCallback(
    (config: FlowFieldConfig) => {
      const definition = toFieldDefinition(config);
      if (!definition) {
        messageApi.open({
          type: "error",
          content: "Der Workflow enthält keine vollständige Fließwege-Animation.",
        });
        return;
      }
      toggleField(definition);
    },
    [toggleField, messageApi]
  );

  /** a workflow card's vehicleAnimation tool: its config is the route to run */
  const startVehicleAnimation = useCallback(
    (config: VehicleAnimationConfig) => {
      const definition = toVehicleDefinition(config);
      if (!definition) {
        messageApi.open({
          type: "error",
          content: "Der Workflow enthält keine Strecke für die Animation.",
        });
        return;
      }
      toggleVehicle(definition);
    },
    [toggleVehicle, messageApi]
  );

  /** a workflow card's floodSimulation tool: its config is the flood to show */
  const startFlood = useCallback(
    (config: FloodSimulationConfig) => {
      toggleFlood(toFloodDefinition(config));
    },
    [toggleFlood]
  );

  /**
   * Whether a workflow card that launches an addon is currently on the map.
   * Such a card adds no layer, so the catalog cannot tell from the layer stack
   * and would offer "Hinzufügen" for a running workflow; the addon channels
   * are the ones that know.
   */
  const isWorkflowActive = useCallback(
    (item: Item) => {
      if (item.type !== "workflow") {
        return false;
      }
      return resolveAddonEntries(item.tools as AddonEntry[] | undefined).some(
        (entry) => {
          switch (entry.kind) {
            case "timeSlider": {
              const definition = toSeriesDefinition(entry.config ?? {});
              return !!definition && isSeriesRunning(definition);
            }
            case "flowField": {
              const definition = toFieldDefinition(entry.config ?? {});
              return !!definition && isFieldRunning(definition);
            }
            case "vehicleAnimation": {
              const definition = toVehicleDefinition(entry.config ?? {});
              return !!definition && isVehicleRunning(definition);
            }
            case "floodSimulation":
              return isFloodRunning(toFloodDefinition(entry.config ?? {}));
            default:
              return false;
          }
        }
      );
    },
    [isSeriesRunning, isFieldRunning, isVehicleRunning, isFloodRunning]
  );

  return {
    startTimeSeries,
    startFlowField,
    startVehicleAnimation,
    startFlood,
    isWorkflowActive,
  };
};
