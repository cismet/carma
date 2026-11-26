/** the shared named background layers, referenced by key in layer strings like "rvrGrundriss@100|trueOrtho2025@75" */
export const namedLayers = {
  osm: {
    type: "wms",
    url: "https://ows.mundialis.de/services/service?",
    layers: "OSM-WMS",
    tiled: false,
  },
  osm2: {
    type: "wms",
    url: "https://ows.terrestris.de/osm/service?",
    layers: "OSM-WMS",
    tiled: false,
  },
  bplan_abkg: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "bplanreihe",
  },
  bplan_abkg_uncached: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "bplanreihe",
  },
  bplan_ovl: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "bplanhintergrund",
  },
  abkIntra: {
    type: "wms",
    url: "http://s10221:7098/alkis/services",
    layers: "alkomf",
  },
  uwBPlan: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "bplanreihe,bplanhintergrund",
  },
  webatlas: {
    type: "wms",
    url: "https://sg.geodatenzentrum.de/wms_webatlasde__60d825c3-a2c2-2133-79c0-48721caab5c3?",
    layers: "webatlasde",
    tiled: "false",
  },
  rvrSchriftNT: {
    type: "wms-nt",
    url: "https://geodaten.metropoleruhr.de/dop/dop_overlay?language=ger",
    layers: "dop_overlay",
    version: "1.3.0",
    tiled: false,
    transparent: true,
    buffer: 50,
  },
  rvrSchrift: {
    type: "wmts",
    url: "https://geodaten.metropoleruhr.de/dop/dop_overlay?language=ger",
    layers: "dop_overlay",
    version: "1.3.0",
    tiled: false,
    transparent: true,
  },
  rvrSchrift2: {
    type: "wms",
    url: "https://geodaten.metropoleruhr.de/spw2/service",
    layers: "spw2_schrift",
    version: "1.3.0",
    tiled: false,
    transparent: true,
  },
  rvrGrundriss: {
    type: "wms",
    url: "https://geodaten.metropoleruhr.de/spw2/service",
    layers: "spw2_light_grundriss",
    version: "1.3.0",
    transparent: true,
    tiled: false,
  },
  ruhrWMS: {
    type: "wms",
    url: "https://geodaten.metrotadtpoleruhr.de/spw2/service",
    layers: "spw2_light",
    tiled: "false",
    version: "1.3.0",
  },
  rvrGrau: {
    type: "wms",
    url: "https://geodaten.metropoleruhr.de/spw2/service",
    layers: "spw2_graublau",
    tiled: "false",
    version: "1.3.0",
  },
  empty: {
    type: "empty",
  },
  "wupp-plan-live": {
    type: "wms",
    url: "https://geodaten.metropoleruhr.de/spw2/service",
    layers: "spw2_light",
    tiled: "false",
    version: "1.3.0",
  },
  "wupp-plan-live-tiles-3857": {
    type: "tiles",
    url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    maxNativeZoom: 20,
    maxZoom: 22,
  },
  "rvrGrau-tiles-3857": {
    type: "tiles",
    url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_graublau&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    maxNativeZoom: 20,
    maxZoom: 22,
  },
  orthoIntra: {
    type: "wms",
    url: "http://s10221:7098/orthofotos/services",
    layers: "WO2018",
    transparent: true,
  },
  trueOrthoIntra: {
    type: "wms",
    url: "http://s10221:7098/orthofotos/services",
    layers: "WTO2018",
    transparent: true,
  },
  trueOrtho2018: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "R102:trueortho2018",
    transparent: true,
  },
  trueOrtho2020: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "R102:trueortho2020",
    transparent: true,
  },
  trueOrtho2022: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "R102:trueortho2022",
    transparent: true,
  },
  trueOrtho2024: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "R102:trueortho2024",
    transparent: true,
  },
  hillshade: {
    type: "wms",
    url: "https://maps.wuppertal.de/karten",
    layers: "hillshade",
  },
  ESRILayer: {
    type: "tiles",
    url: "http://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 22,
    maxNativeZoom: 18,
  },
  CartoLayer: {
    type: "tiles",
    url: "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      "&copy; <a href=&quot;http://www.openstreetmap.org/copyright&quot;>OpenStreetMap</a> contributors, &copy; <a href=&quot;https://carto.com/attributions&quot;>CARTO</a>",
    maxNativeZoom: 19,
    maxZoom: 22,
  },
  LocalOMT_Klokantech_basic: {
    type: "vector",
    style: "http://localhost:888/styles/klokantech-basic/style.json",
  },
  LocalOMT_OSM_bright: {
    type: "vector",
    style: "http://localhost:888/styles/osm-bright/style.json",
  },
  OMT_Klokantech_basic: {
    type: "vector",
    style: "https://omt.map-hosting.de/styles/klokantech-basic/style.json",
  },
  OMT_OSM_bright: {
    type: "vector",
    style: "https://omt.map-hosting.de/styles/osm-bright/style.json",
  },
  basemap_grey: {
    type: "vector",
    style:
      "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json",
  },
  basemap_color: {
    type: "vector",
    style:
      "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json",
  },
  basemap_relief: {
    type: "vector",
    style:
      "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
  },
  osm_shortbread: {
    type: "vector",
    style: "https://tiles.cismet.de/osm_shortbread/osm_shortbread.style.json",
  },
  stadtplan_vector: {
    type: "vector",
    style: "https://tiles.cismet.de/stadtplan/style.json",
  },
  stadtplan_nacht: {
    type: "vector",
    style: "https://tiles.cismet.de/stadtplan/nacht.style.json",
  },
  our_basemap_grey: {
    type: "vector",
    style: "https://tiles.cismet.de/basemap_de/basemap_grey.style.json",
  },
  our_basemap_color: {
    type: "vector",
    style: "https://tiles.cismet.de/basemap_de/basemap_color.style.json",
  },
  our_basemap_relief: {
    type: "vector",
    style: "https://tiles.cismet.de/basemap_de/basemap_relief.style.json",
  },
  bergisches_staedtedreieck: {
    type: "vector",
    style: "https://tiles.cismet.de/bergisches_staedtedreieck/style.json",
  },
  amtlich: {
    type: "tiles",
    maxNativeZoom: 20,
    maxZoom: 22,
    url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  },
  amtlichBasiskarte: {
    type: "wmts",
    // url: "https://maps.wuppertal.de/karten",
    // layers: "abkf",
    url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
    layers: "GIS-102:abkf",
    maxNativeZoom: 20,
    transparent: true,
  },
  trueOrtho2024Alternative: {
    type: "wms",
    url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
    layers: "GIS-102:trueortho2024",
    maxNativeZoom: 22,
    transparent: true,
    // geoserver-cloud rejects `styles=default` for this cascaded layer;
    // empty string means "server default style" per WMS spec.
    styles: "",
  },
  trueOrtho2025: {
    type: "wms",
    url: "https://www.wms.nrw.de/geobasis/wms_nw_dop",
    layers: "nw_dop_rgb",
    transparent: true,
  },
  trueOrtho2021: {
    type: "wms",
    url: "https://www.wms.nrw.de/geobasis/wms_nw_hist_dop",
    layers: "nw_hist_dop_2021",
    transparent: true,
  },
  trueOrtho2024cismet: {
    type: "wms",
    url: "https://woodaigooweve0oonga7phai.cismet.de/geoserver/ows",
    layers: "ortho:trueortho_vrt",
    transparent: true,
  },
};
