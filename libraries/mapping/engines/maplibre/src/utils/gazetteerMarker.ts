import { icon, type IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBicycle,
  faBookmark,
  faChargingStation,
  faCodeBranch,
  faFile,
  faGraduationCap,
  faHome,
  faMapMarker,
  faRoad,
  faTag,
  faTags,
} from "@fortawesome/free-solid-svg-icons";
import maplibregl from "maplibre-gl";

// sprite + rules of the pin react-cismap's GazetteerHitDisplay used
import "leaflet-extra-markers/dist/css/leaflet.extra-markers.min.css";

/**
 * Glyph names the gazetteer sources deliver (`g` in the payload, FontAwesome 4
 * vocabulary), mapped to the SVG icons. Unknown glyphs fall back to a plain
 * marker.
 */
const GLYPH_ICONS: Record<string, IconDefinition> = {
  bicycle: faBicycle,
  bookmark: faBookmark,
  "charging-station": faChargingStation,
  "code-fork": faCodeBranch,
  file: faFile,
  "graduation-cap": faGraduationCap,
  home: faHome,
  road: faRoad,
  tag: faTag,
  tags: faTags,
};

// L.ExtraMarkers.icon defaults: iconSize [35,45], iconAnchor [17,42],
// shadowSize [36,16], shadowAnchor [10,12]
const ICON_WIDTH = 35;
const ICON_HEIGHT = 45;
const ICON_ANCHOR = { x: 17, y: 42 };
const SHADOW_ANCHOR = { x: 10, y: 12 };

const createGazetteerMarkerElement = (glyph: string | undefined) => {
  const definition = (glyph && GLYPH_ICONS[glyph]) || faMapMarker;

  const element = document.createElement("div");
  element.style.width = `${ICON_WIDTH}px`;
  element.style.height = `${ICON_HEIGHT}px`;
  element.style.position = "relative";
  element.style.pointerEvents = "none";

  const shadow = document.createElement("div");
  shadow.className = "extra-marker-shadow";
  shadow.style.position = "absolute";
  shadow.style.left = `${ICON_ANCHOR.x - SHADOW_ANCHOR.x}px`;
  shadow.style.top = `${ICON_ANCHOR.y - SHADOW_ANCHOR.y}px`;

  const pin = document.createElement("div");
  pin.className = "extra-marker extra-marker-circle-cyan";
  pin.innerHTML = icon(definition).html.join("");

  element.append(shadow, pin);
  return element;
};

/**
 * Marker for a gazetteer hit: the leaflet-extra-markers cyan pin with the
 * hit's glyph, as react-cismap's GazetteerHitDisplay rendered it, anchored
 * so the pin tip sits on the position.
 */
export const createGazetteerMarker = (glyph: string | undefined) =>
  new maplibregl.Marker({
    element: createGazetteerMarkerElement(glyph),
    anchor: "top-left",
    offset: [-ICON_ANCHOR.x, -ICON_ANCHOR.y],
  });
