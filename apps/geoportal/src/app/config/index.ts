import type {
  DefaultLayerConfig,
  LayerMap,
  NamedStyles,
} from "@carma-apps/portals";

export const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
export const APP_KEY = "geoportal";
export const STORAGE_PREFIX = "1";

export const namedStyles: NamedStyles = {
  default: { opacity: 0.6 },
  night: {
    opacity: 0.9,
    "css-filter": "filter:grayscale(0.9)brightness(0.9)invert(1)",
  },
  blue: {
    opacity: 1.0,
    "css-filter":
      "filter:sepia(0.5) hue-rotate(155deg) contrast(0.9) opacity(0.9) invert(0)",
  },
};

export const defaultLayerConfig: DefaultLayerConfig = {
  namedStyles: {
    default: { opacity: 0.6 },
    night: {
      opacity: 0.9,
      "css-filter": "filter:grayscale(0.9)brightness(0.9)invert(1)",
    },
    blue: {
      opacity: 1.0,
      "css-filter":
        "filter:sepia(0.5) hue-rotate(155deg) contrast(0.9) opacity(0.9) invert(0)",
    },
  },
  defaults: {
    wms: {
      format: "image/png",
      tiled: true,
      maxZoom: 22,
      opacity: 0.6,
      version: "1.1.1",
      pane: "backgroundLayers",
    },
    vector: {},
  },
  namedLayers: {
    "wupp-plan-live": {
      type: "wms",
      url: "https://geodaten.metropoleruhr.de/spw2/service",
      layers: "spw2_light",
      tiled: false,
      version: "1.3.0",
    },
    trueOrtho2020: {
      type: "wms",
      url: "https://maps.wuppertal.de/karten",
      layers: "R102:trueortho2020",
      transparent: true,
    },
    rvrGrundriss: {
      type: "wmts",
      url: "https://geodaten.metropoleruhr.de/spw2/service",
      layers: "spw2_light_grundriss",
      version: "1.3.0",
      transparent: true,
      tiled: false,
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
    trueOrtho2024Alternative: {
      type: "wms",
      url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
      layers: "GIS-102:trueortho2024",
      // maxNativeZoom: 20,
      transparent: true,
    },
    trueOrtho2021: {
      type: "wms",
      url: "https://www.wms.nrw.de/geobasis/wms_nw_hist_dop",
      layers: "nw_hist_dop_2021",
      transparent: true,
    },
    rvrSchriftNT: {
      type: "wmts-nt",
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
    amtlich: {
      type: "tiles",
      maxNativeZoom: 20,
      maxZoom: 22,
      url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    },
    basemap_relief: {
      type: "vector",
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
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
  },
};

export const layerMap: LayerMap = {
  luftbild: {
    title: "Luftbildkarte 03/24",
    layers: "rvrGrundriss@100|trueOrtho2024Alternative@75|rvrSchriftNT@100",
    description: `Luftbildkarte (aus True Orthofoto 03/24) © Stadt Wuppertal / RVR und Kooperationspartner`,
    inhalt: `<span>(1) Kartendienst (WMS) der Stadt Wuppertal. Datengrundlage:
               True Orthofoto aus Bildflügen vom 14.03. und 17.03.2024, hergestellt durch Aerowest
              GmbH/Dortmund, Bodenauflösung 3 cm.
              (True Orthofoto: Aus Luftbildern mit hoher Längs- und Querüberdeckung
              in einem automatisierten Bildverarbeitungsprozess
              berechnetes Bild in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche.) © Stadt Wuppertal (</span>
              <a class="remove-margins" href="https://www.wuppertal.de/geoportal/Nutzungsbedingungen/NB-GDIKOM-C_Geodaten.pdf">NB-GDIKOM C</a>
              <span>). (2) Kartendienste (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlagen:
              Stadtkarte 2.0 und Kartenschrift aus der Stadtkarte 2.0. Details s. Hintergrundkarte Stadtplan).</span>`,
    eignung: `Luftbildkarten eignen sich wegen ihrer Anschaulichkeit und ihres Inhaltsreichtums vor allem für Detailbetrachtungen. Durch die Verwendung eines "True Orthofotos" ist die passgenaue Überlagerung mit grundrisstreuen Kartenebenen möglich. Die Luftbildkarte 03/24 basiert auf einer von der Stadt Wuppertal beauftragten Befliegung vor dem Einsetzen der Belaubung (Winterbefliegung). Die Straßenbereiche sind daher vollständig sichtbar, während die Grünbereiche nicht gut zu interpretieren sind. Aktualität: Wuppertal lässt in einem Turnus von 2 Jahren Bildflüge durchführen. Die dargestellte Situation, z. B. bezüglich des Gebäudebestandes, kann daher bis zu 2,5 Jahre alt sein.`,
    url: "https://maps.wuppertal.de/karten?service=WMS&request=GetMap&layers=R102%3Aluftbild2022",
  },
  luftbild21: {
    title: "Luftbildkarte 06/21",
    layers: "rvrGrundriss@100|trueOrtho2021@75|rvrSchriftNT@100",
    description: `Luftbildkarte (aus True Orthofoto 06/21) © Geobasis NRW  / RVR und Kooperationspartner`,
    inhalt: `<span>(1) Kartendienst (WMS) des Landes NRW, gehostet von IT.NRW. Datengrundlage: True Orthofoto weit überwiegend aus Bildflügen vom 01. und 02. Juni 2021, durchgeführt im Auftrag von Geobasis NRW durch MGGP AERO Sp. z o.o./Krakau, Bodenauflösung 10 cm. In Teilen von Nächstebreck-Ost, Beyenburg-Mitte und Herbringhausen Bildflug vom 30. März 2021, durchgeführt durch Aerowest GmbH/Dortmund. (True Orthofoto: Aus Luftbildern mit hoher Längs- und Querüberdeckung in einem automatisierten Bildverarbeitungsprozess berechnetes Bild in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche.) © Geobasis NRW (</span>
              <a class="remove-margins" href="https://www.govdata.de/dl-de/zero-2-0">dl-zero-de/2.0</a>
              <span>). (2) Kartendienste (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlagen: Stadtkarte 2.0 und Kartenschrift aus der Stadtkarte 2.0. Details s. Hintergrundkarte Stadtplan).</span>`,
    eignung: `Luftbildkarten eignen sich wegen ihrer Anschaulichkeit und ihres Inhaltsreichtums vor allem für Detailbetrachtungen. Durch die Verwendung eines "True Orthofotos" ist die passgenaue Überlagerung mit grundrisstreuen Kartenebenen möglich. Die Luftbildkarte 06/21 basiert auf einer vom Land NRW (Geobasis NRW) beauftragten Befliegung bei voller Belaubung (Sommerbefliegung). Die Straßenbereiche sind daher nicht vollständig sichtbar, während die Grünbereiche anschaulich und gut zu interpretieren sind. Aktualität: Geobasis NRW lässt in einem Turnus von 4 Jahren solche Sommerbildflüge durchführen. Die dargestellte Situation, z. B. bezüglich des Gebäudebestandes, kann daher bis zu 4,5 Jahre alt sein.`,
    url: "https://maps.wuppertal.de/karten?service=WMS&request=GetMap&layers=R102%3Aluftbild2022",
  },
  stadtplan: {
    title: "Stadtplan",
    layers: "amtlich@90",
    description: `Stadtplan (Stadtkarte 2.0) © RVR und Kooperationspartner`,
    inhalt: `<span>Kartendienst (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlage: Stadtkarte 2.0. Wöchentlich in einem automatischen Prozess aktualisierte Zusammenführung des Straßennetzes der OpenStreetMap mit Amtlichen Geobasisdaten des Landes NRW aus den Fachverfahren ALKIS (Gebäude, Flächennutzungen) und ATKIS (Gewässer). © RVR und Kooperationspartner (</span><a class="remove-margins" href="https://www.govdata.de/dl-de/by-2-0">
                Datenlizenz Deutschland - Namensnennung - Version 2.0
              </a><span>). Lizenzen der Ausgangsprodukte: </span><a href="https://www.govdata.de/dl-de/zero-2-0">
                Datenlizenz Deutschland - Zero - Version 2.0
              </a><span> (Amtliche Geobasisdaten) und </span><a href="https://opendatacommons.org/licenses/odbl/1-0/">    ODbL    </a><span> (OpenStreetMap contributors).</span>`,
    eignung: `Der Stadtplan ist der am einfachsten und sichersten interpretierbare Kartenhintergrund, weil er an den von Stadtplänen geprägten Sehgewohnheiten von Kartennutzerinnen und -nutzern anschließt. Durch die schrittweise Reduzierung des Karteninhalts bei kleiner werdenden Maßstäben eignet sich der Stadtplan als Hintergrund für beliebige Maßstäbe. Aktualität: der Gebäudebestand ist durch die wöchentliche Ableitung aus dem Liegenschaftskataster sehr aktuell. Gebäude können sicher identifiziert werden, da bei Detailbetrachtungen alle Hausnummern dargestellt werden.`,
    url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  },
  gelaende: {
    title: "Gelände",
    layers: "basemap_relief@40",
    description: `Gelände (basemap.de Web Vektor) © GeoBasis-DE / BKG (2024)`,
    inhalt: `<span>Mapbox-konformer Vector-Tiles-Kartendienst</span>
              <a href="https://basemap.de/web-vektor/">basemap.de Web Vektor</a>
              <span>des Bundesamtes für Kartographie und Geodäsie (BKG), Kartenstil "Relief". © GeoBasis-DE /</span>
              <a href="https://www.bkg.bund.de/">BKG</a>
              <span>(2024)</span>
              <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>`,
    eignung: `Mit diesem Kartenhintergrund wird durch eine Geländeschummerung, Höhenlinien und im Detailmaßstab perspektivische Gebäudedarstellung ein plastischer Geländeeindruck erzeugt. Er eignet sich damit in beliebigen Maßstäben für Karten, bei denen die Geländeform wichtig ist, z. B. zu Radwegen oder zum Regenwasserabfluss. "Gelände" basiert auf Vektor-Kacheln und ist dadurch die Hintergrundkarte mit der kürzesten Ladezeit. Der Gebäudebestand wird jährlich aktualisiert, hat also keine Spitzenaktualität.`,
    url: "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
  },
  amtlich: {
    title: "Amtliche Basiskarte",
    layers: "amtlichBasiskarte@90",
    description: `Amtliche Basiskarte (Stadtgrundkarte / ABK) © Stadt Wuppertal`,
    inhalt: `<span>Kartendienst (WMS) der Stadt Wuppertal. Datengrundlage: Amtliche Basiskarte ABK, farbige Ausprägung, wöchentlich in einem automatisierten Prozess aus dem Fachverfahren ALKIS des Liegenschaftskatasters abgeleitet. © Stadt Wuppertal (</span>
              <a class="remove-margins" href="https://www.govdata.de/dl-de/zero-2-0">Datenlizenz Deutschland - Zero - Version 2.0</a>
              <span>).</span>`,
    eignung: `Die Amtliche Basiskarte ABK ist ein Kartenprodukt, das aus dem Amtlichen Liegenschaftskatasterinformationssystem ALKIS abgeleitet ist. Neben einer detaillierten Darstellung der Gebäude werden daher auch die Grundstücksgrenzen dargestellt. Damit eignet sich die ABK insbesondere als Hintergrund für gebäude- und grundstücksbezogene Fachdaten sowie planungsrechtliche Darstellungen. Aktualität: der Gebäudebestand ist durch die wöchentliche Ableitung der Karten aus dem ALKIS-Datenbestand sehr aktuell. Die Identifikation der Gebäude ist mit etwas Aufwand verbunden, da nur ausgewählte Hausnummern dargestellt werden.`,
    url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  },
};

export const convertLayerStringToLayers = (
  layerString: string,
  visible: boolean,
  mainOpacity?: number
): any => {
  const layers = layerString.split("|");
  return layers.map((layer) => {
    const [layerConfigName, opacity] = layer.split("@");
    const config = defaultLayerConfig.namedLayers[layerConfigName];
    return {
      ...config,
      visible,
      layerType: config.type,
      opacity: ((Number(opacity) || 1) / 100) * mainOpacity || 1,
    };
  });
};
