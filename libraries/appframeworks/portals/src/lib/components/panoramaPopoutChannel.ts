// Messages between a host app (which owns the map and the panorama selection)
// and the panorama viewer opened in a tab of its own (PanoramaPopout). The host
// stays the brain: it sends the scene to show, the popout only renders it and
// sends back what the user does. See docs/panorama-popout-viewer.md.

import type { PanoramaHotspot } from "./PanoramaViewer";
import type { PanoramaStationSwitcherProps } from "./PanoramaStationSwitcher";
import type { PanoramaView } from "./panoramaScene";

/** Everything the popout needs to show the selected pano. */
export interface PanoramaPopoutScene {
  src: string;
  multiResConfigUrl?: string;
  /** Without their click handlers; the popout reports a click by hotspot id. */
  hotspots: Omit<PanoramaHotspot, "clickHandlerFunc">[];
  initialYaw?: number;
  keepViewOnHop?: boolean;
  heading?: number;
  /** See PanoramaViewer showLoading. */
  showLoading?: boolean;
  /** View the popout's viewer opens at when it is created. */
  startView?: PanoramaView;
  stations?: Omit<PanoramaStationSwitcherProps, "onSelect">;
  /** Shown in the tab title. */
  title?: string;
}

export type PanoramaPopoutHostMessage =
  | { type: "scene"; scene: PanoramaPopoutScene }
  // the selection is not a panorama (or there is none)
  | { type: "empty" }
  // the host tab is closing or reloading
  | { type: "bye" };

export type PanoramaPopoutViewerMessage =
  | { type: "hello" }
  | { type: "view"; view: PanoramaView }
  | { type: "hotspot"; id: string }
  | { type: "next" }
  | { type: "previous" }
  | { type: "station"; index: number }
  | { type: "bye" };

export const panoramaPopoutChannelName = (id: string) =>
  `carma-panorama-popout:${id}`;

/** window.open target, so a second open reuses the tab. */
export const panoramaPopoutWindowName = (id: string) =>
  `carma-panorama-popout-${id}`;

/** Popout url in a hash-routed app served from the current page. */
export const panoramaPopoutUrl = (id: string, route = "/panorama") =>
  `${window.location.pathname}${window.location.search}#${route}?channel=${encodeURIComponent(id)}`;
