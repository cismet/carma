import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import type maplibregl from "maplibre-gl";
import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  LightBoxContext,
  LightBoxDispatchContext,
  defaultLightBoxCaptionFactory,
  type LightBoxCustomSlide,
  type LightBoxImageSlide,
  type LightBoxSlide,
} from "@carma-mapping/lightbox";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useLibreContext } from "@carma-mapping/contexts";
import { updateUrl } from "@carma-commons/utils";
import {
  PanoramaViewer,
  PanoramaPreview,
  PanoramaStationSwitcher,
  type PanoramaHotspot,
  type PanoramaView,
} from "@carma-appframeworks/portals";

import {
  getSelectedFeature,
  setSelectedFeature,
} from "../../store/slices/features";
import { getLayers, getMaplibreMaps } from "../../store/slices/mapping";
import { useLibreMapEnabled } from "../../hooks/useLibreMapEnabled";
import { createVectorFeature } from "../GeoportalMap/topicmap.utils";
import {
  fetchPanoramaStations,
  locatePanoramaOnStations,
  pickStationPano,
  type PanoramaStations,
} from "./panoramaStations";
import {
  usePanoramaPopout,
  type PanoramaPopoutSource,
} from "./usePanoramaPopout";
import {
  PANORAMA_INITIAL_YAW,
  PANORAMA_NAV_HEMISPHERE_DEG,
  PANORAMA_YAW_OFFSET,
  PANORAMA_YAW_SIGN,
  angularDiffDeg,
  buildPanoramaHotspots,
  findSelectionArrowLayer,
  readPanoramaConf,
  type PanoTarget,
} from "./panoramaHotspots";

/**
 * Everything the geoportal infobox does for a selected panorama: the map arrow
 * that follows the view, tour hops and station jumps, the fullscreen lightbox
 * with its photos, and the popout tab. Returns the preview elements for the
 * infobox; empty when the selected feature is no panorama.
 */
export const usePanoramaSelection = (): ReactNode[] => {
  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const layers = useSelector(getLayers);
  const maplibreMaps = useSelector(getMaplibreMaps);
  const lightBoxDispatchContext = useContext(LightBoxDispatchContext);
  const lightBoxState = useContext(LightBoxContext);
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const { map: libreMap } = useLibreContext();
  const isLibreMap = useLibreMapEnabled();
  const panoramaConf = useMemo(
    () =>
      readPanoramaConf(layers.find((l) => l.id === selectedFeature?.id)?.conf),
    [layers, selectedFeature?.id]
  );

  // The map rendering the currently selected pano (selectedFeature.id is the
  // layer id): the one merged map on the libre path, the layer's own maplibre
  // map from the redux registry on the leaflet path. The pano source is taken
  // from the selected feature's own maplibre feature (click hit or tour hop),
  // since a style may combine several vector sources (e.g. oelberg_kombi).
  const panoSourceId = selectedFeature?.sourceFeature?.source as
    | string
    | undefined;
  const panoSourceLayer = selectedFeature?.sourceFeature?.sourceLayer as
    | string
    | undefined;
  const isPanoramaFeature = !!selectedFeature?.properties?.panorama;
  const panoTarget = useMemo<PanoTarget | null>(() => {
    const layerId = selectedFeature?.id;
    if (!layerId || !panoSourceId || !isPanoramaFeature) {
      return null;
    }
    const map: maplibregl.Map | undefined = isLibreMap
      ? libreMap ?? undefined
      : maplibreMaps?.find((entry) => entry.id === layerId)?.map;
    if (!map) {
      return null;
    }
    return {
      map,
      sourceId: panoSourceId,
      sourceLayer: panoSourceLayer,
      arrowLayerId: findSelectionArrowLayer(map, panoSourceId),
      selectionStateManaged: isLibreMap,
    };
  }, [
    isLibreMap,
    libreMap,
    maplibreMaps,
    selectedFeature?.id,
    panoSourceId,
    panoSourceLayer,
    isPanoramaFeature,
  ]);

  // Latest panorama view, captured from the active viewer's view poll, so the
  // arrow-key navigation can pick the neighbour nearest the current view and
  // the preview and fullscreen viewer can open where the other one left off.
  const panoramaViewRef = useRef<PanoramaView | null>(null);

  // Rotate the selected arrow to follow the panorama view direction. The value
  // is an expression on the feature's own `heading` (not a precomputed scalar),
  // so the visible arrow stays correct even in the single frame where the
  // selection moves before the snap effect runs (avoids a heading-flip flicker).
  const handlePanoramaView = useCallback(
    (view: PanoramaView) => {
      panoramaViewRef.current = view;
      const { yaw } = view;
      const arrowLayerId = panoTarget?.arrowLayerId;
      if (
        !panoTarget ||
        !arrowLayerId ||
        !panoTarget.map.getLayer(arrowLayerId)
      ) {
        return;
      }
      panoTarget.map.setLayoutProperty(arrowLayerId, "icon-rotate", [
        "+",
        ["get", "heading"],
        yaw * PANORAMA_YAW_SIGN + PANORAMA_YAW_OFFSET,
      ]);
    },
    [panoTarget]
  );

  // Restore the style's own icon-rotate and clear the highlight when the
  // selection leaves this layer (the map changes) or the box unmounts; we
  // override icon-rotate and drive feature-state programmatically. The style's
  // value is read here, before the snap effect below first overrides it (each
  // style decides which way its arrows point, see PanoramaConf initialYaw).
  useEffect(() => {
    if (!panoTarget) {
      return;
    }
    const { map, sourceId, sourceLayer, arrowLayerId, selectionStateManaged } =
      panoTarget;
    let styleIconRotate: unknown;
    try {
      styleIconRotate =
        arrowLayerId && map.getLayer(arrowLayerId)
          ? map.getLayoutProperty(arrowLayerId, "icon-rotate")
          : undefined;
    } catch {
      // style not ready, fall back to the default below
    }
    return () => {
      // The map may already be torn down here (e.g. the user removed this
      // layer): getLayer/setLayoutProperty then throw because the map's style
      // is gone. A typeof check doesn't prevent that, so guard the call.
      try {
        if (arrowLayerId && map.getLayer(arrowLayerId)) {
          map.setLayoutProperty(
            arrowLayerId,
            "icon-rotate",
            styleIconRotate ?? [
              "+",
              ["get", "heading"],
              PANORAMA_INITIAL_YAW * PANORAMA_YAW_SIGN + PANORAMA_YAW_OFFSET,
            ]
          );
        }
      } catch {
        // map already removed — nothing to restore
      }
      if (selectionStateManaged) {
        return;
      }
      try {
        map.removeFeatureState({ source: sourceId, sourceLayer });
      } catch {
        // ignore feature-state errors
      }
    };
  }, [panoTarget]);

  // Keep the pano selection highlight in sync with the redux selection. The
  // click path sets feature-state itself, but programmatic tour hops do not, so
  // we make the highlight a pure function of the current selection. On the
  // libre map the MapSelectionContext already does that (it follows the redux
  // selection's sourceFeature), so there only the arrow is snapped.
  useEffect(() => {
    if (!panoTarget) {
      return;
    }
    const { map, sourceId, sourceLayer, arrowLayerId, selectionStateManaged } =
      panoTarget;
    const fid = selectedFeature?.properties?.sourceProps?.fid;
    if (fid == null || !arrowLayerId || !map.getLayer(arrowLayerId)) {
      return;
    }
    try {
      if (!selectionStateManaged) {
        // The pano feature's id is its `fid` natively: vector tiles bake it in,
        // and the geojson dataset carries it as the GeoJSON feature `id` (so the
        // style must NOT set generateId, which would override it).
        map.removeFeatureState({ source: sourceId, sourceLayer });
        map.setFeatureState(
          { source: sourceId, sourceLayer, id: fid },
          { selected: true }
        );
      }
      // Snap the arrow to the new feature's initial (forward) orientation right
      // away. Data-driven on heading so it is correct the instant the selection
      // moves, before the new viewer's first yaw tick arrives.
      map.setLayoutProperty(arrowLayerId, "icon-rotate", [
        "+",
        ["get", "heading"],
        panoramaConf.initialYaw * PANORAMA_YAW_SIGN + PANORAMA_YAW_OFFSET,
      ]);
    } catch {
      // ignore feature-state errors
    }
  }, [selectedFeature, panoTarget, panoramaConf]);

  // Select another pano: build its carma feature from the raw vector feature
  // via the layer's infoBoxMapping, move the map highlight, and select it —
  // the viewer, infobox and arrow all follow. minZoom: zoom the map in to at
  // least this (a station jump, see PanoramaStations).
  const selectPanoramaFeature = useCallback(
    async (raw: maplibregl.MapGeoJSONFeature, minZoom?: number) => {
      if (!panoTarget || !selectedFeature) {
        return;
      }
      const { map, sourceId, sourceLayer } = panoTarget;
      const layer = layers.find((l) => l.id === selectedFeature.id);
      if (!layer) {
        return;
      }
      // querySourceFeatures results carry no source ids; the libre selection
      // sync needs them on the selected feature's sourceFeature.
      raw.source = sourceId;
      raw.sourceLayer = sourceLayer;
      const geom = raw.geometry;
      if (geom?.type !== "Point") {
        return;
      }
      const [lng, lat] = geom.coordinates as number[];
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        return;
      }
      const neighborFeature = await createVectorFeature(layer, raw, map, {
        lat,
        lng,
      });
      if (!neighborFeature) {
        return;
      }
      // Recenter the base map on the pano we jump to, so that when the
      // fullscreen viewer is closed the just-visited point sits in the map
      // centre. Navigation hotspots only exist in the fullscreen viewer, so this
      // path only runs for in-viewer tour hops. Keep the current zoom unless
      // minZoom asks for more; no animation since the map is hidden behind the
      // lightbox. The zoom-in is measured on the pano's maplibre map, whose
      // zoom levels need not match the leaflet ones.
      const zoomIn = minZoom != null ? Math.max(0, minZoom - map.getZoom()) : 0;
      if (isLibreMap) {
        map.jumpTo({ center: [lng, lat], zoom: map.getZoom() + zoomIn });
      } else {
        const leaflet = routedMapRef?.leafletMap?.leafletElement;
        if (leaflet) {
          leaflet.setView([lat, lng], leaflet.getZoom() + zoomIn, {
            animate: false,
          });
        }
      }
      // The map highlight (selection-arrow feature-state) is kept in sync with
      // the redux selection by the effect below, so just select the neighbour.
      dispatch(setSelectedFeature(neighborFeature));
    },
    [panoTarget, selectedFeature, layers, dispatch, routedMapRef, isLibreMap]
  );

  // Jump to a neighbouring panorama (tour hop), found in the loaded tiles.
  const handlePanoramaNavigate = useCallback(
    (targetFid: number) => {
      if (!panoTarget) {
        return;
      }
      const { map, sourceId, sourceLayer } = panoTarget;
      let raw: maplibregl.MapGeoJSONFeature | undefined;
      try {
        raw = map.querySourceFeatures(sourceId, {
          sourceLayer,
          filter: ["==", "fid", targetFid],
        })?.[0] as maplibregl.MapGeoJSONFeature | undefined;
      } catch {
        return;
      }
      if (raw) {
        selectPanoramaFeature(raw);
      }
    },
    [panoTarget, selectPanoramaFeature]
  );

  // The PanoramaConf `stations` of the selected pano's layer, once loaded.
  const [panoramaStations, setPanoramaStations] =
    useState<PanoramaStations | null>(null);
  useEffect(() => {
    const url = panoramaConf.stations;
    if (!url) {
      setPanoramaStations(null);
      return;
    }
    let cancelled = false;
    fetchPanoramaStations(url).then((stations) => {
      if (!cancelled) setPanoramaStations(stations);
    });
    return () => {
      cancelled = true;
    };
    // per selection too: cached on success, retried after a failed fetch
  }, [panoramaConf.stations, selectedFeature]);

  // Where the selected pano is on the line of stations (at one, or between
  // two), for the station switcher in the lightbox toolbar.
  const panoramaStationLocation = useMemo(() => {
    const props = selectedFeature?.properties?.sourceProps;
    if (!panoramaStations || !props) {
      return undefined;
    }
    const geometry = selectedFeature?.geometry;
    return locatePanoramaOnStations(
      panoramaStations,
      props,
      geometry?.type === "Point" ? geometry.coordinates : undefined
    );
  }, [panoramaStations, selectedFeature]);

  // fid of the pano a station jump goes to. Only that jump shows the viewer's
  // loading overlay (not opening a pano, not the hops between neighbours).
  const [stationJumpFid, setStationJumpFid] = useState<number>();
  const panoramaShowLoading =
    stationJumpFid != null &&
    stationJumpFid === Number(selectedFeature?.properties?.sourceProps?.fid);
  // Arrived: forget the jump, so a later hop back to that pano stays quiet.
  // The viewers read the flag when their pano changes, which their own
  // effects do before this one runs.
  useEffect(() => {
    if (panoramaShowLoading) {
      setStationJumpFid(undefined);
    }
  }, [panoramaShowLoading]);

  // Jump to a station: its pano on the current pano's trip, so the travel and
  // view direction carry over.
  const handlePanoramaStation = useCallback(
    (index: number) => {
      const props = selectedFeature?.properties?.sourceProps;
      const pano =
        panoramaStations && props
          ? pickStationPano(panoramaStations, index, props)
          : undefined;
      if (!pano) {
        return;
      }
      const fid = Number(pano.properties.fid ?? pano.id);
      setStationJumpFid(Number.isFinite(fid) ? fid : undefined);
      // a fresh object: selectPanoramaFeature sets the source ids on it
      selectPanoramaFeature(
        {
          type: "Feature",
          id: pano.id,
          geometry: pano.geometry,
          properties: { ...pano.properties },
        } as unknown as maplibregl.MapGeoJSONFeature,
        panoramaStations?.zoom
      );
    },
    [panoramaStations, selectedFeature, selectPanoramaFeature]
  );

  // Build navigation hotspots from the panos surrounding the selected one, and
  // surface the kept neighbours' file names so their images can be preloaded.
  const { hotspots: panoramaHotspots, neighbourFileNames } = useMemo(
    () =>
      buildPanoramaHotspots(
        panoTarget,
        selectedFeature?.properties?.sourceProps,
        handlePanoramaNavigate
      ),
    [selectedFeature, panoTarget, handlePanoramaNavigate]
  );

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

  // ↑/↓ in the fullscreen viewer: hop to the neighbour nearest the current view
  // direction (↑) or its opposite (↓). The hotspots already carry each
  // neighbour's panorama yaw + its navigate handler, so reuse them.
  const navigatePanoramaTowardView = useCallback(
    (offsetDeg: number) => {
      const viewYaw = panoramaViewRef.current?.yaw ?? panoramaConf.initialYaw;
      const targetYaw = viewYaw + offsetDeg;
      let best: PanoramaHotspot | null = null;
      let bestDiff = Infinity;
      for (const hotspot of panoramaHotspots) {
        const diff = angularDiffDeg(hotspot.yaw, targetYaw);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = hotspot;
        }
      }
      if (best && bestDiff <= PANORAMA_NAV_HEMISPHERE_DEG) {
        best.clickHandlerFunc?.();
      }
    },
    [panoramaHotspots, panoramaConf]
  );
  const handlePanoramaNext = useCallback(
    () => navigatePanoramaTowardView(0),
    [navigatePanoramaTowardView]
  );
  const handlePanoramaPrevious = useCallback(
    () => navigatePanoramaTowardView(180),
    [navigatePanoramaTowardView]
  );

  // The panorama viewer in a tab of its own: it shows what the lightbox would
  // and hops through the same handlers, see usePanoramaPopout.
  const panoramaPopoutSource = useMemo<PanoramaPopoutSource | null>(() => {
    const props = selectedFeature?.properties;
    if (!props?.panorama) {
      return null;
    }
    const heading = Number(props.sourceProps?.heading);
    return {
      src: props.panorama as string,
      multiResConfigUrl: props.panoramaMultiResConfig as string | undefined,
      hotspots: panoramaHotspots,
      initialYaw: panoramaConf.initialYaw,
      keepViewOnHop: panoramaConf.keepViewOnHop,
      heading: Number.isFinite(heading) ? heading : undefined,
      showLoading: panoramaShowLoading,
      stations:
        panoramaStations && panoramaStationLocation
          ? {
              stations: panoramaStations.stations.map(({ name }) => name),
              ...panoramaStationLocation,
            }
          : undefined,
      title: typeof props.title === "string" ? props.title : undefined,
    };
  }, [
    selectedFeature,
    panoramaHotspots,
    panoramaConf,
    panoramaStations,
    panoramaStationLocation,
    panoramaShowLoading,
  ]);
  const panoramaPopout = usePanoramaPopout(
    panoramaPopoutSource,
    panoramaViewRef,
    {
      onView: handlePanoramaView,
      onNext: handlePanoramaNext,
      onPrevious: handlePanoramaPrevious,
      onStation: handlePanoramaStation,
    }
  );
  const openPanoramaPopout = panoramaPopout.open;
  // A connected popout drives the map arrow; the in-page viewers yield to it.
  const panoramaPopoutConnected = panoramaPopout.connected;

  // The panorama as a custom lightbox slide: it hosts the embeddable
  // PanoramaViewer (the media lightbox supplies the surrounding chrome). Only
  // the active slide is rendered, so the viewer mounts once and tears down when
  // the user pages to a photo.
  const panoramaSlide = useMemo<LightBoxCustomSlide | null>(() => {
    const props = selectedFeature?.properties;
    if (!props?.panorama) {
      return null;
    }
    const src = props.panorama as string;
    const multiResConfigUrl = props.panoramaMultiResConfig as
      | string
      | undefined;
    const heading = Number(props.sourceProps?.heading);
    return {
      type: "custom",
      key: "panorama",
      render: ({ active }) =>
        active ? (
          <PanoramaViewer
            src={src}
            multiResConfigUrl={multiResConfigUrl}
            onViewChange={
              panoramaPopoutConnected ? undefined : handlePanoramaView
            }
            onNext={handlePanoramaNext}
            onPrevious={handlePanoramaPrevious}
            hotspots={panoramaHotspots}
            initialYaw={panoramaConf.initialYaw}
            // open where the user left the infobox preview
            startView={panoramaViewRef.current ?? undefined}
            keepViewOnHop={panoramaConf.keepViewOnHop}
            heading={Number.isFinite(heading) ? heading : undefined}
            showLoading={panoramaShowLoading}
          />
        ) : null,
      // the station switcher takes the toolbar's title slot
      title:
        panoramaStations && panoramaStationLocation ? (
          <PanoramaStationSwitcher
            stations={panoramaStations.stations.map(({ name }) => name)}
            {...panoramaStationLocation}
            onSelect={handlePanoramaStation}
          />
        ) : undefined,
      // the viewer moves to its own tab, so the lightbox closes
      actions: (
        <button
          type="button"
          title="Panorama in neuem Tab öffnen"
          aria-label="Panorama in neuem Tab öffnen"
          className="carma-media-lightbox__action"
          onClick={() => {
            openPanoramaPopout();
            lightBoxDispatchContext?.setVisible(false);
          }}
        >
          <FontAwesomeIcon icon={faUpRightFromSquare} />
        </button>
      ),
    };
  }, [
    selectedFeature,
    handlePanoramaView,
    handlePanoramaNext,
    handlePanoramaPrevious,
    panoramaHotspots,
    panoramaConf,
    panoramaStations,
    panoramaStationLocation,
    handlePanoramaStation,
    panoramaPopoutConnected,
    openPanoramaPopout,
    lightBoxDispatchContext,
    panoramaShowLoading,
  ]);

  // Simple photo images (single `foto` or a `fotos` array) as image slides, so
  // they sit alongside the panorama in one lightbox. The harvested-fotostrecke
  // path stays on the legacy react-image-lightbox flow (used when there is no
  // panorama). An optional `fotoPreviews` array (index-aligned with `fotos`)
  // holds downsized versions: the small preview in the InfoBox shows those,
  // the fullscreen lightbox keeps the full-size `fotos`.
  const photoSources = useMemo<{ src: string; preview: string }[]>(() => {
    const props = selectedFeature?.properties;
    if (!props) {
      return [];
    }
    const isUrl = (u: unknown): u is string =>
      typeof u === "string" && u.length > 0;
    const urls: unknown[] = [];
    const previews: unknown[] = [];
    if (Array.isArray(props.fotos)) {
      urls.push(...props.fotos);
      if (Array.isArray(props.fotoPreviews)) {
        previews.push(...props.fotoPreviews);
      }
    } else if (props.foto) {
      urls.push(props.foto);
    }
    return urls
      .map((u, i) => ({ u, p: previews[i] }))
      .filter((entry): entry is { u: string; p: unknown } => isUrl(entry.u))
      .map(({ u, p }) => ({
        src: updateUrl(u),
        preview: updateUrl(isUrl(p) ? p : u),
      }));
  }, [selectedFeature]);

  const photoSlides = useMemo<LightBoxImageSlide[]>(
    () => photoSources.map(({ src }) => ({ type: "image", src })),
    [photoSources]
  );

  const mediaSlides = useMemo<LightBoxSlide[]>(
    () => (panoramaSlide ? [panoramaSlide, ...photoSlides] : photoSlides),
    [panoramaSlide, photoSlides]
  );

  // While the unified (panorama) lightbox is open, keep its slides current: a
  // tour hop swaps selectedFeature, so src/hotspots/handlers change and the
  // embedded viewer must follow. Guarded to the custom-slide case so the
  // photo-only react-image-lightbox path keeps managing its own slides.
  const lightboxVisible = !!lightBoxState?.visible;

  // When the lightbox closes, turn the preview to the fullscreen viewer's last
  // view (the reverse of startView), so both stay in sync.
  const [previewView, setPreviewView] = useState<PanoramaView>();
  const wasLightboxVisibleRef = useRef(lightboxVisible);
  useEffect(() => {
    if (
      wasLightboxVisibleRef.current &&
      !lightboxVisible &&
      panoramaViewRef.current
    ) {
      setPreviewView({ ...panoramaViewRef.current });
    }
    wasLightboxVisibleRef.current = lightboxVisible;
  }, [lightboxVisible]);
  const lightboxHasCustomSlides = !!lightBoxState?.slides?.some(
    (slide) => slide.type === "custom"
  );
  useEffect(() => {
    if (lightboxVisible && lightboxHasCustomSlides) {
      lightBoxDispatchContext?.setSlides(mediaSlides);
    }
  }, [
    mediaSlides,
    lightboxVisible,
    lightboxHasCustomSlides,
    lightBoxDispatchContext,
  ]);

  // `index` is the slide the preview shows: 0 the panorama, 1..n the photos.
  const openPanoramaLightBox = useCallback(
    (index = 0) => {
      lightBoxDispatchContext?.setAll({
        // No title — matches the standalone photo lightbox, which shows none here.
        title: "",
        photourls: [],
        // Same Stadt-Wuppertal attribution the photo lightbox shows, so the two
        // viewers read identically. Slides may override per-slide if needed.
        caption: defaultLightBoxCaptionFactory(),
        index, // the panorama is always the first slide, the photos follow
        visible: true,
        slides: mediaSlides,
      });
    },
    [lightBoxDispatchContext, selectedFeature, mediaSlides]
  );

  const panoramaElements = selectedFeature?.properties?.panorama
    ? [
        <PanoramaPreview
          key="infobox-panorama-preview"
          src={selectedFeature.properties.panorama}
          multiResConfigUrl={selectedFeature.properties.panoramaMultiResConfig}
          // the photos step through in the preview, in lightbox slide order
          // (downsized `fotoPreviews` where available)
          photos={photoSources.map(({ preview }) => preview)}
          onExpand={openPanoramaLightBox}
          // Only the active viewer drives the map arrow; yield to the
          // popout tab or the lightbox viewer while one is open.
          onViewChange={
            lightboxVisible || panoramaPopoutConnected
              ? undefined
              : handlePanoramaView
          }
          initialYaw={panoramaConf.initialYaw}
          view={previewView}
        />,
      ]
    : [];

  return panoramaElements;
};
