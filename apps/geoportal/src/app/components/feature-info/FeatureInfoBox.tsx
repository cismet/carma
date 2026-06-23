import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { useDispatch, useSelector } from "react-redux";

import InfoBoxFotoPreview from "react-cismap/topicmaps/InfoBoxFotoPreview";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { LightBoxDispatchContext } from "react-cismap/contexts/LightBoxContextProvider";

import { additionalInfoFactory } from "@carma-collab/wuppertal/geoportal";
import { genericSecondaryInfoFooterFactory } from "@carma-collab/wuppertal/commons";

import {
  setPreferredLayerId,
  setSelectedFeature,
  updateSecondaryInfoBoxElements,
  getInfoText,
  getSecondaryInfoBoxElements,
  getSelectedFeature,
  setSecondaryInfoBoxElements,
  getLoading,
  moveFeatureToEnd,
  removeSecondaryInfoBoxElement,
  moveFeatureToFront,
  setPreferredVectorLayerId,
} from "../../store/slices/features";
import { getLayers, getMaplibreMaps } from "../../store/slices/mapping";
import { truncateString } from "./featureInfoHelper";

import "../infoBox.css";
import LoadingInfoBox from "./LoadingInfoBox";

import versionData from "../../../version.json";
import {
  getApplicationVersion,
  isHtmlString,
  updateUrl,
} from "@carma-commons/utils";
import {
  InfoBox,
  InfoBoxHeader,
  utils,
  getActionLinksForFeature,
  PanoramaLightBox,
  PanoramaPreview,
  type PanoramaHotspot,
} from "@carma-appframeworks/portals";
import { createFeature } from "../GeoportalMap/libremap.utils";
import { parseColor } from "../../helper/color";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { addCustomFeatureFlags } from "../../store/slices/layers";
import type { FeatureInfo } from "@carma-mapping/utils";
import { selectionPadding } from "../../constants/selection";

// Panorama: live-rotate the selected arrow on the map to follow the viewing
// direction inside the 360° viewer. The style layer that renders the selected
// arrow (see oelberg_panorama style.json). Only the selected feature is visible
// in that layer, so overriding the layer-wide icon-rotate to a constant rotates
// just the visible arrow; we restore the data-driven value on deselect.
const PANORAMA_SELECTION_ARROW_LAYER = "selection-arrow";
// Calibration: map icon-rotate is clockwise-from-north (deg); pannellum yaw is
// degrees from the image centre (positive to the right). Tune sign/offset once
// against the live behaviour.
const PANORAMA_YAW_SIGN = 1;
const PANORAMA_YAW_OFFSET = 0;
// The panorama image's yaw=0 (centre) faces the BACK of the survey car, so the
// viewer must START rotated 180° to look forward (down the street / toward the
// next pano). This lives on the IMAGE (pannellum initial yaw), NOT on the arrow:
// the arrow already follows getYaw(), so with the image rotated the arrow tracks
// correctly and stays in sync with what is on screen.
const PANORAMA_INITIAL_YAW = 180;

// Tour navigation hotspots: pick surrounding panos from the vector source and
// render a clickable arrow at each one's bearing.
const PANORAMA_NEIGHBOR_RADIUS_M = 12;
const PANORAMA_MAX_HOTSPOTS = 6;
// Drop a candidate whose bearing is within this of an already-kept one (keeps
// the nearer); avoids a cluster of overlapping arrows down a straight street.
const PANORAMA_MIN_HOTSPOT_SEPARATION_DEG = 22;
// Assumed camera height above ground; together with the horizontal distance and
// the proj_z difference it sets how far below the horizon a hotspot sits.
const PANORAMA_CAMERA_HEIGHT_M = 2.2;
const PANORAMA_HOTSPOT_MIN_PITCH = -45;
const PANORAMA_HOTSPOT_MAX_PITCH = 5;

// Wrap an angle (deg) into (-180, 180].
const normalizeDeg = (deg: number): number => {
  let x = deg % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
};
const angularDiffDeg = (a: number, b: number): number =>
  Math.abs(normalizeDeg(a - b));

// The pano source of a panorama style (the oelberg_panorama style has exactly
// one). Supports both a vector-tile source (needs a source-layer) and a
// client-side geojson source (no source-layer). querySourceFeatures /
// feature-state accept an undefined sourceLayer for geojson sources.
const resolvePanoSource = (
  map: { getStyle?: () => unknown } | undefined
): { sourceId: string; sourceLayer?: string } | null => {
  try {
    const style = map?.getStyle?.() as
      | {
          sources?: Record<string, { type?: string }>;
          layers?: Array<{ source?: string; "source-layer"?: string }>;
        }
      | undefined;
    const sources = style?.sources ?? {};
    // Prefer a vector source with its source-layer.
    const vectorId = Object.keys(sources).find(
      (id) => sources[id]?.type === "vector"
    );
    if (vectorId) {
      const sourceLayer = style?.layers?.find(
        (l) => l.source === vectorId && l["source-layer"]
      )?.["source-layer"];
      if (sourceLayer) return { sourceId: vectorId, sourceLayer };
    }
    // Fall back to a geojson source (no source-layer).
    const geojsonId = Object.keys(sources).find(
      (id) => sources[id]?.type === "geojson"
    );
    if (geojsonId) return { sourceId: geojsonId };
    return null;
  } catch {
    return null;
  }
};

interface InfoBoxProps {
  pos?: [number, number];
  onZoomToFeature?: (feature: FeatureInfo) => void;
  displayOrbit?: boolean;
  isOrbiting?: boolean;
  onOrbitToggle?: () => void;
  additionalSecondaryInfoBoxElements?: ReactNode[];
}

const FeatureInfoBox = ({
  pos,
  onZoomToFeature,
  displayOrbit = false,
  isOrbiting = false,
  onOrbitToggle,
  additionalSecondaryInfoBoxElements = [],
}: InfoBoxProps) => {
  const [open, setOpen] = useState(false);
  const [openPanorama, setOpenPanorama] = useState(false);
  const [shouldRenderLoadingInfobox, setShouldRenderLoadingInfobox] =
    useState(false);
  const [headerColor, setHeaderColor] = useState<string>("");
  const [parsedHeader, setParsedHeader] = useState<string>("");
  const dispatch = useDispatch();
  const flags = useFeatureFlags();

  const loadingFeatureInfo = useSelector(getLoading);
  const selectedFeature = useSelector(getSelectedFeature);
  const secondaryInfoBoxElements = useSelector(getSecondaryInfoBoxElements);
  const layers = useSelector(getLayers);
  const numOfLayers = layers.length;
  const infoText = useSelector(getInfoText);
  const maplibreMaps = useSelector(getMaplibreMaps);
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);

  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  if (secondaryInfoBoxElements.length > 4) {
    dispatch(setSecondaryInfoBoxElements([]));
    dispatch(
      setSelectedFeature({
        properties: {
          header: "Information",
          headerColor: "#0078a8",
          title: `Es wurden ${secondaryInfoBoxElements.length} Objekte gefunden. Bis zu 4 Objekte können angezeigt werden.`,
          additionalInfo: `Position: ${pos[0].toFixed(5)}, ${pos[1].toFixed(
            5
          )}`,
          subtitle:
            "Hereinzoomen oder Kartenebenen ausblenden, um die Objektanzahl zu reduzieren.",
        },
        id: "information",
      })
    );
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (secondaryInfoBoxElements.length === 0) {
        return;
      }
      if (event.ctrlKey) {
        switch (event.key) {
          case "ArrowUp":
            event.preventDefault();
            const nextFeature = secondaryInfoBoxElements[0];
            dispatch(removeSecondaryInfoBoxElement(nextFeature));
            dispatch(moveFeatureToEnd(selectedFeature));
            dispatch(setSelectedFeature(nextFeature));
            break;
          case "ArrowDown":
            event.preventDefault();
            const prevFeature =
              secondaryInfoBoxElements[secondaryInfoBoxElements.length - 1];
            dispatch(removeSecondaryInfoBoxElement(prevFeature));

            dispatch(moveFeatureToFront(selectedFeature));
            dispatch(setSelectedFeature(prevFeature));
            break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [secondaryInfoBoxElements]);

  let links = [];

  const canZoomToFeature = (selectedFeature) => {
    if (
      selectedFeature.properties?.sourceProps?.bounds ||
      selectedFeature.geometry
    ) {
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (selectedFeature?.properties?.ffmodal) {
      dispatch(
        addCustomFeatureFlags({
          [selectedFeature.properties.ffmodal]: {
            alias: selectedFeature.properties.ffmodal,
            default: false,
          },
        })
      );
    }
  }, [selectedFeature, dispatch]);

  const shouldDisplaySecondaryInfo = (() => {
    if (!selectedFeature?.properties) return false;

    if (selectedFeature.properties.modal) return true;

    // if ffmodal is used check for the it as a feature flag
    if (selectedFeature.properties.ffmodal) {
      return !!flags[selectedFeature.properties.ffmodal];
    }
    return false;
  })();

  if (selectedFeature && canZoomToFeature(selectedFeature)) {
    links = getActionLinksForFeature(selectedFeature, {
      displaySecondaryInfoAction: shouldDisplaySecondaryInfo,
      setVisibleStateOfSecondaryInfo: () => {
        setOpen(true);
      },
      displayZoomToFeature: true,
      zoomToFeature: () => {
        utils.zoomToFeature({
          selectedFeature,
          leafletMap: routedMapRef?.leafletMap?.leafletElement,
          padding: selectionPadding,
        });
        if (onZoomToFeature) {
          onZoomToFeature(selectedFeature as FeatureInfo);
        }
      },
      displayOrbit,
      isOrbiting,
      onOrbitToggle,
    });
  }

  const loadingRef = useRef(loadingFeatureInfo);

  useEffect(() => {
    loadingRef.current = loadingFeatureInfo;

    if (!loadingFeatureInfo) {
      setShouldRenderLoadingInfobox(false);
    } else {
      setTimeout(() => {
        if (loadingRef.current) {
          setShouldRenderLoadingInfobox(true);
        }
      }, 100);
    }
  }, [loadingFeatureInfo]);

  useEffect(() => {
    if (selectedFeature && selectedFeature.properties.sourceProps) {
      console.log(
        "feature properties:",
        selectedFeature.properties.sourceProps
      );
    }

    const updateHeaderAndColor = async () => {
      // Parse header if it exists
      if (selectedFeature?.properties?._header) {
        const header = await utils.parseHeader(
          selectedFeature.properties._header,
          selectedFeature.properties.sourceProps ?? {}
        );
        setParsedHeader(header || "Informationen");
      } else {
        setParsedHeader(selectedFeature?.properties?.header || "Informationen");
      }

      // Parse header color
      if (selectedFeature?.properties?.accentColor) {
        const color = await parseColor(
          selectedFeature.properties.accentColor,
          selectedFeature.properties.sourceProps ?? {}
        );
        setHeaderColor(color || "#0078a8");
      } else {
        setHeaderColor(selectedFeature?.properties?.headerColor || "#0078a8");
      }
    };

    updateHeaderAndColor();
  }, [selectedFeature]);

  useEffect(() => {
    console.log("[PANORAMA] selected feature", {
      selectedFeature,
      panorama: selectedFeature?.properties?.panorama,
      sourceProps: selectedFeature?.properties?.sourceProps,
    });
  }, [selectedFeature]);

  // The maplibre map for the currently selected layer (holds the panorama
  // arrow layers); selectedFeature.id is the layer id.
  const selectedLayerMap = useMemo(
    () => maplibreMaps?.find((entry) => entry.id === selectedFeature?.id)?.map,
    [maplibreMaps, selectedFeature?.id]
  );

  // Rotate the selected arrow to follow the panorama view direction. The value
  // is an expression on the feature's own `heading` (not a precomputed scalar),
  // so the visible arrow stays correct even in the single frame where the
  // selection moves before the snap effect runs (avoids a heading-flip flicker).
  const handlePanoramaYaw = useCallback(
    (yaw: number) => {
      if (
        !selectedLayerMap ||
        typeof selectedLayerMap.getLayer !== "function" ||
        !selectedLayerMap.getLayer(PANORAMA_SELECTION_ARROW_LAYER)
      ) {
        return;
      }
      selectedLayerMap.setLayoutProperty(
        PANORAMA_SELECTION_ARROW_LAYER,
        "icon-rotate",
        ["+", ["get", "heading"], yaw * PANORAMA_YAW_SIGN + PANORAMA_YAW_OFFSET]
      );
    },
    [selectedLayerMap]
  );

  // Restore the data-driven heading and clear the highlight when the selection
  // leaves this layer (the map changes) or the box unmounts; we overrode
  // icon-rotate to a constant and drive feature-state programmatically.
  useEffect(() => {
    if (!selectedLayerMap) return;
    return () => {
      // The map may already be torn down here (e.g. the user removed this
      // layer): getLayer/setLayoutProperty then throw because the map's style
      // is gone. A typeof check doesn't prevent that, so guard the call.
      try {
        if (
          typeof selectedLayerMap.getLayer === "function" &&
          selectedLayerMap.getLayer(PANORAMA_SELECTION_ARROW_LAYER)
        ) {
          selectedLayerMap.setLayoutProperty(
            PANORAMA_SELECTION_ARROW_LAYER,
            "icon-rotate",
            [
              "+",
              ["get", "heading"],
              PANORAMA_INITIAL_YAW * PANORAMA_YAW_SIGN + PANORAMA_YAW_OFFSET,
            ]
          );
        }
      } catch {
        // map already removed — nothing to restore
      }
      const src = resolvePanoSource(selectedLayerMap);
      if (src) {
        try {
          selectedLayerMap.removeFeatureState({
            source: src.sourceId,
            sourceLayer: src.sourceLayer,
          });
        } catch {
          // ignore feature-state errors
        }
      }
    };
  }, [selectedLayerMap]);

  // Keep the pano selection highlight in sync with the redux selection. The
  // click path sets feature-state itself, but programmatic tour hops do not, so
  // we make the highlight a pure function of the current selection.
  useEffect(() => {
    if (!selectedLayerMap) return;
    const fid = selectedFeature?.properties?.sourceProps?.fid;
    const src = resolvePanoSource(selectedLayerMap);
    if (
      !src ||
      fid == null ||
      typeof selectedLayerMap.getLayer !== "function" ||
      !selectedLayerMap.getLayer(PANORAMA_SELECTION_ARROW_LAYER)
    ) {
      return;
    }
    try {
      // The pano feature's id is its `fid` natively: vector tiles bake it in,
      // and the geojson dataset carries it as the GeoJSON feature `id` (so the
      // style must NOT set generateId, which would override it).
      selectedLayerMap.removeFeatureState({
        source: src.sourceId,
        sourceLayer: src.sourceLayer,
      });
      selectedLayerMap.setFeatureState(
        { source: src.sourceId, sourceLayer: src.sourceLayer, id: fid },
        { selected: true }
      );
      // Snap the arrow to the new feature's initial (forward) orientation right
      // away. Data-driven on heading so it is correct the instant the selection
      // moves, before the new viewer's first yaw tick arrives.
      selectedLayerMap.setLayoutProperty(
        PANORAMA_SELECTION_ARROW_LAYER,
        "icon-rotate",
        [
          "+",
          ["get", "heading"],
          PANORAMA_INITIAL_YAW * PANORAMA_YAW_SIGN + PANORAMA_YAW_OFFSET,
        ]
      );
    } catch {
      // ignore feature-state errors
    }
  }, [selectedFeature, selectedLayerMap]);

  // Jump to a neighbouring panorama (tour hop): build its carma feature from the
  // raw vector feature via the layer's infoBoxMapping, move the map highlight,
  // and select it — the viewer, infobox and arrow all follow.
  const handlePanoramaNavigate = useCallback(
    async (targetFid: number) => {
      if (!selectedLayerMap || !selectedFeature) return;
      const layer = layers.find((l) => l.id === selectedFeature.id);
      const src = resolvePanoSource(selectedLayerMap);
      if (!layer || !src) return;
      let raw;
      try {
        raw = selectedLayerMap.querySourceFeatures(src.sourceId, {
          sourceLayer: src.sourceLayer,
          filter: ["==", "fid", targetFid],
        })?.[0];
      } catch {
        return;
      }
      if (!raw) return;
      const neighborFeature = await createFeature(raw, layer);
      if (!neighborFeature) return;
      // The map highlight (selection-arrow feature-state) is kept in sync with
      // the redux selection by the effect below, so just select the neighbour.
      dispatch(setSelectedFeature(neighborFeature));
    },
    [selectedLayerMap, selectedFeature, layers, dispatch]
  );

  // Build navigation hotspots from the panos surrounding the selected one, and
  // surface the kept neighbours' file names so their images can be preloaded.
  const { hotspots: panoramaHotspots, neighbourFileNames } = useMemo<{
    hotspots: PanoramaHotspot[];
    neighbourFileNames: string[];
  }>(() => {
    const empty = { hotspots: [], neighbourFileNames: [] };
    const props = selectedFeature?.properties?.sourceProps;
    if (
      !selectedLayerMap ||
      !props ||
      typeof selectedLayerMap.querySourceFeatures !== "function"
    ) {
      return empty;
    }
    const cx = Number(props.proj_x);
    const cy = Number(props.proj_y);
    const cz = Number(props.proj_z);
    const cHeading = Number(props.heading);
    const cFid = props.fid;
    if (Number.isNaN(cx) || Number.isNaN(cy) || Number.isNaN(cHeading)) {
      return empty;
    }
    const src = resolvePanoSource(selectedLayerMap);
    if (!src) return empty;

    let all: Array<{ properties?: Record<string, number> }> = [];
    try {
      all = selectedLayerMap.querySourceFeatures(src.sourceId, {
        sourceLayer: src.sourceLayer,
      });
    } catch {
      return empty;
    }

    const seen = new Set<number>();
    const candidates: Array<{
      fid: number;
      dist: number;
      dz: number;
      bearing: number;
      fileName?: string;
    }> = [];
    for (const f of all) {
      const p = f?.properties;
      if (!p || p.fid === cFid || seen.has(p.fid)) continue;
      seen.add(p.fid);
      const px = Number(p.proj_x);
      const py = Number(p.proj_y);
      if (Number.isNaN(px) || Number.isNaN(py)) continue;
      const dE = px - cx;
      const dN = py - cy;
      const dist = Math.hypot(dE, dN);
      if (dist < 0.01 || dist > PANORAMA_NEIGHBOR_RADIUS_M) continue;
      const dz = Number(p.proj_z) - cz;
      const bearing = (Math.atan2(dE, dN) * 180) / Math.PI; // 0=N, clockwise
      const rawFileName = (p as { file_name?: unknown }).file_name;
      candidates.push({
        fid: p.fid,
        dist,
        dz: Number.isNaN(dz) ? 0 : dz,
        bearing,
        fileName: typeof rawFileName === "string" ? rawFileName : undefined,
      });
    }

    candidates.sort((a, b) => a.dist - b.dist);
    const kept: typeof candidates = [];
    for (const c of candidates) {
      if (kept.length >= PANORAMA_MAX_HOTSPOTS) break;
      if (
        kept.some(
          (k) =>
            angularDiffDeg(k.bearing, c.bearing) <
            PANORAMA_MIN_HOTSPOT_SEPARATION_DEG
        )
      ) {
        continue;
      }
      kept.push(c);
    }

    const hotspots = kept.map((c) => {
      // Inverse of the arrow calibration: absolute bearing = heading + yaw.
      const yaw = normalizeDeg(
        (c.bearing - cHeading - PANORAMA_YAW_OFFSET) / PANORAMA_YAW_SIGN
      );
      const pitch = Math.max(
        PANORAMA_HOTSPOT_MIN_PITCH,
        Math.min(
          PANORAMA_HOTSPOT_MAX_PITCH,
          (Math.atan2(c.dz - PANORAMA_CAMERA_HEIGHT_M, c.dist) * 180) / Math.PI
        )
      );
      return {
        id: `pano-nav-${c.fid}`,
        pitch,
        yaw,
        cssClass: "carma-pano-nav-hotspot",
        clickHandlerFunc: () => handlePanoramaNavigate(c.fid),
      };
    });

    const neighbourFileNames = kept
      .map((c) => c.fileName)
      .filter((n): n is string => !!n);

    return { hotspots, neighbourFileNames };
  }, [selectedFeature, selectedLayerMap, handlePanoramaNavigate]);

  // Preload the reachable neighbours' panorama images so a tour hop is
  // near-instant (fetch + decode happen while the user looks at the current
  // pano). Each neighbour URL is derived by swapping the current file name in
  // the current panorama URL — the file name appears verbatim once. The Image
  // objects are kept in a ref so their in-flight downloads aren't GC'd.
  const preloadedPanoramasRef = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    const currentUrl = selectedFeature?.properties?.panorama;
    const currentFile = selectedFeature?.properties?.sourceProps?.file_name;
    if (
      typeof currentUrl !== "string" ||
      typeof currentFile !== "string" ||
      !currentFile ||
      neighbourFileNames.length === 0
    ) {
      preloadedPanoramasRef.current = [];
      return;
    }
    const images: HTMLImageElement[] = [];
    for (const fileName of neighbourFileNames) {
      if (fileName === currentFile) continue;
      const url = currentUrl.replace(currentFile, fileName);
      if (url === currentUrl) continue;
      const img = new Image();
      img.src = url;
      img.decode?.().catch(() => {
        // ignore decode failures (e.g. aborted when selection changes)
      });
      images.push(img);
    }
    preloadedPanoramasRef.current = images;
  }, [selectedFeature, neighbourFileNames]);

  if (loadingFeatureInfo && shouldRenderLoadingInfobox)
    return <LoadingInfoBox />;

  if (!selectedFeature) {
    return null;
  }

  const featureHeaders = secondaryInfoBoxElements.map((feature, i) => {
    return (
      <div
        style={{
          width: "340px",
          paddingBottom: 3,
          paddingLeft: 10 + i * 10,
          cursor: "pointer",
        }}
        key={"overlapping."}
        onClick={() => {
          dispatch(setSelectedFeature(feature));
          dispatch(updateSecondaryInfoBoxElements(feature));
          dispatch(setPreferredLayerId(feature.id));
          if (feature.vectorId) {
            dispatch(setPreferredVectorLayerId(feature.vectorId));
          } else {
            dispatch(setPreferredVectorLayerId(undefined));
          }
        }}
      >
        <InfoBoxHeader
          content={
            feature.properties.header ||
            feature.properties._header ||
            "Informationen"
          }
          headerColor={"grey"}
          properties={feature.properties.sourceProps}
        ></InfoBoxHeader>
      </div>
    );
  });

  const Modal = additionalInfoFactory(
    selectedFeature?.properties?.ffmodal ?? selectedFeature?.properties?.modal
  );

  if (!headerColor) {
    return <></>;
  }

  const panoramaElements = selectedFeature.properties.panorama
    ? [
        <PanoramaPreview
          key="infobox-panorama-preview"
          src={selectedFeature.properties.panorama}
          multiResConfigUrl={selectedFeature.properties.panoramaMultiResConfig}
          onExpand={() => setOpenPanorama(true)}
          // Only the active viewer drives the map arrow; yield to the
          // fullscreen lightbox while it is open.
          onYawChange={openPanorama ? undefined : handlePanoramaYaw}
          initialYaw={PANORAMA_INITIAL_YAW}
        />,
      ]
    : [];

  const visibleSecondaryInfoBoxElements =
    selectedFeature.properties.foto || selectedFeature.properties.fotos
      ? [
          ...additionalSecondaryInfoBoxElements,
          ...featureHeaders,
          ...panoramaElements,
          <InfoBoxFotoPreview
            currentFeature={selectedFeature}
            lightBoxDispatchContext={lightBoxDispatchContext}
            urlManipulation={updateUrl}
          />,
        ]
      : [
          ...additionalSecondaryInfoBoxElements,
          ...featureHeaders,
          ...panoramaElements,
        ];

  return (
    <>
      <InfoBox
        pixelwidth={350}
        currentFeature={selectedFeature}
        hideNavigator={true}
        {...selectedFeature?.properties}
        headerColor={headerColor}
        title={
          selectedFeature?.properties?.title?.includes("undefined")
            ? undefined
            : selectedFeature?.properties?.title
        }
        noCurrentFeatureTitle={
          infoText
            ? infoText
            : numOfLayers > 0
            ? "Auf die Karte klicken um Informationen abzurufen"
            : "Layer hinzufügen um Informationen abrufen zu können"
        }
        header={
          parsedHeader && isHtmlString(parsedHeader) ? (
            parsedHeader
          ) : (
            <div
              className="w-full"
              style={{
                backgroundColor: headerColor,
              }}
            >
              {parsedHeader
                ? truncateString(parsedHeader, 66)
                : "Informationen"}
            </div>
          )
        }
        noCurrentFeatureContent=""
        secondaryInfoBoxElements={visibleSecondaryInfoBoxElements}
        links={links}
      />
      {open && Modal && (
        <Modal
          setOpen={() => setOpen(false)}
          feature={
            selectedFeature.properties.sourceProps?.properties ||
            selectedFeature.properties.sourceProps?.targetProperties
              ? selectedFeature.properties.sourceProps
              : { properties: selectedFeature.properties.sourceProps }
          }
          versionString={getApplicationVersion(versionData)}
          Footer={genericSecondaryInfoFooterFactory({
            skipTeilzwilling: true,
            isTopicMap: false,
          })}
          skipTeilzwilling={true}
        />
      )}
      {openPanorama && selectedFeature.properties.panorama && (
        <PanoramaLightBox
          src={selectedFeature.properties.panorama}
          multiResConfigUrl={selectedFeature.properties.panoramaMultiResConfig}
          title={selectedFeature.properties.title}
          onClose={() => setOpenPanorama(false)}
          onYawChange={handlePanoramaYaw}
          hotspots={panoramaHotspots}
          initialYaw={PANORAMA_INITIAL_YAW}
        />
      )}
    </>
  );
};

export default FeatureInfoBox;
