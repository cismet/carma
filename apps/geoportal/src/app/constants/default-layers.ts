import type { AdditionalStyleLayer } from "@carma-mapping/layers";
import { isAvailable, type Availability } from "@carma-commons/utils";

import { availabilityContext } from "../config/availability";

/**
 * Layers that are on the map without anyone adding them.
 *
 * A default layer is written as a style url, the same shorthand the catalog's
 * `additionalLayers` and a style dropped onto the map use: title, texts, legend
 * and the addons the layer launches all come from the style's
 * `metadata.carmaConf`, so nothing about it is repeated here. What makes it a
 * default is only that it lives in this list.
 *
 * The counterpart for a tool rather than a layer is `DEFAULT_WORKFLOWS`: that
 * list hands an engine its definition through a route's addons, this one puts a
 * layer in the stack. A style whose `carmaConf.tools` carry a complete engine
 * config needs no entry there, since the layer launches the engine itself once
 * it is in the stack, see `getLayerLaunchedAddons`.
 *
 * These are the plain geoportal's layers. A Fachzwilling states its content
 * through its own route (`additionalLayers`, `addons`, `perspectives`), so
 * `useDefaultLayers` seeds nothing on those routes, nor on `/publish`.
 */
export type DefaultLayer = AdditionalStyleLayer & {
  /** where the layer is on the map; omitted means every deployment */
  availability?: Availability;
  /**
   * What the layer row calls it, instead of the style's own
   * `layerInfo.title`. A style's title has to tell it apart from its sibling
   * variants, which is why it names the timetable and the tilting; as the
   * app's own row there is nothing to tell it apart from, so it can say what
   * it is. Everything else about the row still comes from the style.
   */
  title?: string;
};

export const DEFAULT_LAYERS: DefaultLayer[] = [
  {
    // "Schwebebahn nach Fahrplan, beim Kippen in 3D": the trace and the
    // stations flat while the camera is locked, the fleet standing up with
    // Gerüst and terrain while it is free. Held stops without markers, and the
    // bahnen the published timetable has out at the current time, so there is
    // none at night.
    //
    // The style declares the vehicleAnimation in its `metadata.carmaConf.tools`,
    // which is what starts the fleet: the row carries the config, and the
    // engine launches from it for as long as the layer is in the stack.
    styleUrl: "https://tiles.cismet.de/schwebebahn/default.style.json",
    // the style calls itself "Schwebebahn nach Fahrplan, beim Kippen in 3D",
    // which is how it is told apart from the ten other variants; the row on
    // the map only has to say what it shows
    title: "Schwebebahn",
    // The Schwebebahn is the first layer to be on the map unasked, so it stays
    // off the production geoportal until that has been seen in dev.
    availability: {
      deployments: ["localDev", "dev", "pr"],
    },
  },
];

/** The default layers of this deployment. */
export const defaultLayers = (
  layers: DefaultLayer[] = DEFAULT_LAYERS
): DefaultLayer[] =>
  layers.filter((layer) =>
    isAvailable(layer.availability, availabilityContext)
  );

/** the stack id of a default layer, the one a drop of that url would give it */
export const defaultLayerId = (layer: DefaultLayer): string =>
  layer.id ?? `custom:${layer.styleUrl}`;
