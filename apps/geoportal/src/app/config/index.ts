import {
  defaultLayerConf,
  type BackgroundLayerCatalogEntry,
  type LayerMap,
} from "@carma-appframeworks/portals";

import { geoportalBackgroundConfig } from "./backgroundConfig";

export const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
export const APP_KEY = "geoportal";
export const STORAGE_PREFIX = "1";

/** 3D label per category id, for categories that declare one */
export const cesiumBackgroundlayerNames: Record<string, string> =
  Object.fromEntries(
    geoportalBackgroundConfig.categories
      .filter((category) => category.title3d)
      .map((category) => [category.id, category.title3d])
  );

/** 3D info panel texts per category id, for categories that declare them */
export const cesiumDescriptions: Record<
  string,
  { inhalt: string; eignung: string }
> = Object.fromEntries(
  geoportalBackgroundConfig.categories
    .filter((category) => category.description3d)
    .map((category) => [category.id, category.description3d])
);

/**
 * Which base map a configuration means when it names none. Only reached through
 * a `backgroundLayer` that says whether it is visible but not which map it is,
 * so a configuration can ask for no base map without having to pick one first:
 *
 *     "backgroundLayer": { "visible": false }
 *
 * The two belong together: `id` is the group the map switch shows as selected,
 * `selectedLayerId` the entry of `layerMap` actually drawn.
 */
export const DEFAULT_BACKGROUND_LAYER_ID =
  geoportalBackgroundConfig.defaultCategory;
const defaultCategory = geoportalBackgroundConfig.categories.find(
  (category) => category.id === DEFAULT_BACKGROUND_LAYER_ID
);
export const DEFAULT_BACKGROUND_SELECTED_LAYER_ID =
  defaultCategory.defaultEntry ?? defaultCategory.entries[0];

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
  },
  luftbild21: {
    title: "Luftbildkarte 06/21",
    layers: "rvrGrundriss@100|trueOrtho2021@75|rvrSchriftNT@100",
    description: `Luftbildkarte (aus True Orthofoto 06/21) © Geobasis NRW  / RVR und Kooperationspartner`,
    inhalt: `<span>(1) Kartendienst (WMS) des Landes NRW, gehostet von IT.NRW. Datengrundlage: True Orthofoto weit überwiegend aus Bildflügen vom 01. und 02. Juni 2021, durchgeführt im Auftrag von Geobasis NRW durch MGGP AERO Sp. z o.o./Krakau, Bodenauflösung 10 cm. In Teilen von Nächstebreck-Ost, Beyenburg-Mitte und Herbringhausen Bildflug vom 30. März 2021, durchgeführt durch Aerowest GmbH/Dortmund. (True Orthofoto: Aus Luftbildern mit hoher Längs- und Querüberdeckung in einem automatisierten Bildverarbeitungsprozess berechnetes Bild in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche.) © Geobasis NRW (</span>
              <a class="remove-margins" href="https://www.govdata.de/dl-de/zero-2-0">dl-zero-de/2.0</a>
              <span>). (2) Kartendienste (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlagen: Stadtkarte 2.0 und Kartenschrift aus der Stadtkarte 2.0. Details s. Hintergrundkarte Stadtplan).</span>`,
    eignung: `Luftbildkarten eignen sich wegen ihrer Anschaulichkeit und ihres Inhaltsreichtums vor allem für Detailbetrachtungen. Durch die Verwendung eines "True Orthofotos" ist die passgenaue Überlagerung mit grundrisstreuen Kartenebenen möglich. Die Luftbildkarte 06/21 basiert auf einer vom Land NRW (Geobasis NRW) beauftragten Befliegung bei voller Belaubung (Sommerbefliegung). Die Straßenbereiche sind daher nicht vollständig sichtbar, während die Grünbereiche anschaulich und gut zu interpretieren sind. Aktualität: Geobasis NRW lässt in einem Turnus von 4 Jahren solche Sommerbildflüge durchführen. Die dargestellte Situation, z. B. bezüglich des Gebäudebestandes, kann daher bis zu 4,5 Jahre alt sein.`,
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
    eignung: `Mit diesem Kartenhintergrund wird durch eine Geländeschummerung und Höhenlinien ein plastischer Geländeeindruck erzeugt. Er eignet sich damit in beliebigen Maßstäben für Karten, bei denen die Geländeform wichtig ist, z. B. zu Radwegen oder zum Regenwasserabfluss. "Gelände" basiert auf Vektor-Kacheln und ist dadurch die Hintergrundkarte mit der kürzesten Ladezeit. Der Gebäudebestand wird jährlich aktualisiert, hat also keine Spitzenaktualität.`,
  },
  amtlich: {
    title: "Amtliche Basiskarte",
    layers: "amtlichBasiskarte@90",
    description: `Amtliche Basiskarte (Stadtgrundkarte / ABK) © Stadt Wuppertal`,
    inhalt: `<span>Kartendienst (WMS) der Stadt Wuppertal. Datengrundlage: Amtliche Basiskarte ABK, farbige Ausprägung, wöchentlich in einem automatisierten Prozess aus dem Fachverfahren ALKIS des Liegenschaftskatasters abgeleitet. © Stadt Wuppertal (</span>
              <a class="remove-margins" href="https://www.govdata.de/dl-de/zero-2-0">Datenlizenz Deutschland - Zero - Version 2.0</a>
              <span>).</span>`,
    eignung: `Die Amtliche Basiskarte ABK ist ein Kartenprodukt, das aus dem Amtlichen Liegenschaftskatasterinformationssystem ALKIS abgeleitet ist. Neben einer detaillierten Darstellung der Gebäude werden daher auch die Grundstücksgrenzen dargestellt. Damit eignet sich die ABK insbesondere als Hintergrund für gebäude- und grundstücksbezogene Fachdaten sowie planungsrechtliche Darstellungen. Aktualität: der Gebäudebestand ist durch die wöchentliche Ableitung der Karten aus dem ALKIS-Datenbestand sehr aktuell. Die Identifikation der Gebäude ist mit etwas Aufwand verbunden, da nur ausgewählte Hausnummern dargestellt werden.`,
  },
};

/**
 * Flat list of every base map of every category, in config order. The entry's
 * `group` and `style` are both the category id (see BackgroundCategory).
 */
export const backgroundLayerCatalog: BackgroundLayerCatalogEntry[] =
  geoportalBackgroundConfig.categories.flatMap((category) =>
    category.entries.map((id) => ({
      id,
      title: layerMap[id].title,
      group: category.id,
      style: category.id,
      config: {
        id,
        title: layerMap[id].title,
        opacity: 1.0,
        description: layerMap[id].description,
        inhalt: layerMap[id].inhalt,
        eignung: layerMap[id].eignung,
        layerType: "wmts",
        visible: true,
        layers: layerMap[id].layers,
      },
    }))
  );

export const convertLayerStringToLayers = (
  layerString: string,
  visible: boolean,
  mainOpacity?: number
): any => {
  const layers = layerString.split("|");
  return layers.map((layer) => {
    const [layerConfigName, opacity] = layer.split("@");
    const config = defaultLayerConf.namedLayers[layerConfigName];
    return {
      ...config,
      visible,
      layerType: config.type,
      opacity: ((Number(opacity) || 1) / 100) * mainOpacity || 1,
    };
  });
};
