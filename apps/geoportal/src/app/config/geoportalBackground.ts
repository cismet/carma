import type {
  LayerInfo,
  LayerMap,
  NamedLayers,
} from "@carma-appframeworks/portals";
import type { SceneStyleId } from "@carma-mapping/engines/cesium/react/runtime";
import type { Availability } from "@carma-commons/utils";

import { MapStyleKeys } from "../constants/MapStyleKeys";

/*
 * The background as declared: types and the plain geoportal's own categories,
 * base maps and services. Deliberately free of any availability or route
 * import so `availability.ts` can read the declared feature flags from here;
 * the resolved, route- and availability-aware config is `backgroundConfig`.
 */

/**
 * One background category, i.e. one button of the map switch. Its `id` is at
 * the same time the map style key (the `mapStyle` hash param) and the `id` of
 * the store's `backgroundLayer`, so switching the category is switching the
 * style.
 */
export type BackgroundCategory = {
  /** category id; doubles as the map style key and as backgroundLayer.id */
  id: string;
  /** navbar / selection button label in 2D */
  title: string;
  /** label in 3D */
  title3d?: string;
  /** info panel texts in 3D */
  description3d?: { inhalt: string; eignung: string };
  /**
   * which Cesium scene setup this category shows; several may share one. Must
   * name a scene of `defaultCesiumState.sceneStyles`, defaults to the id.
   */
  cesiumSceneStyle?: SceneStyleId;
  /** ids into layerMap, in display order */
  entries: string[];
  /** defaults to entries[0] */
  defaultEntry?: string;
  /**
   * where this category is offered; omitted means everywhere. Single base
   * maps are gated on their layerMap entry instead.
   */
  availability?: Availability;
};

export type BackgroundConfig = {
  categories: BackgroundCategory[];
  defaultCategory: string;
  /** base map definitions the category entries reference */
  layerMap: LayerMap;
  /**
   * service definitions the layer strings reference, on top of the shared
   * `defaultLayerConf.namedLayers`
   */
  namedLayers?: NamedLayers;
};

/**
 * What a Fachzwilling route may change about the background. Everything is
 * optional and merged over the app-wide config:
 * - `categories` replaces the whole list (a route that wants a single "Karte"
 *   button with two base maps lists exactly that)
 * - `defaultCategory` must be one of the resulting categories, otherwise the
 *   app-wide default (if still present) or the first category is used
 * - `layerMap` is merged per entry: a partial entry overrides the fields it
 *   names on the app-wide base map of the same id, a new id needs at least
 *   `title` and `layers`; `layerType` defaults to "wmts"
 * - `namedLayers` adds service definitions for the layer strings
 * - an `availability` on a base map or category (deployments, feature flag)
 *   restricts where it is offered. A flag named only here (or in the app-wide
 *   config) resolves like one on an addon: default off, switched on with
 *   `ff=<name>` in the url hash, no entry in featureFlags.ts needed.
 */
export type BackgroundConfigOverride = {
  categories?: BackgroundCategory[];
  defaultCategory?: string;
  layerMap?: Record<string, Partial<LayerInfo>>;
  namedLayers?: NamedLayers;
};

/** the app-wide base maps of the plain geoportal */
export const geoportalLayerMap: LayerMap = {
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
  osm: {
    title: "OpenStreetMap (OSM)",
    layers: "osm_shortbread@100",
    description: `OpenStreetMap (Shortbread) © OpenStreetMap contributors`,
    inhalt: `Mapbox-konformer Vector-Tiles-Kartendienst auf Grundlage der OpenStreetMap`,
    eignung: `Die OpenStreetMap ist eine von Freiwilligen gepflegte, weltweit verfügbare Karte mit einem breiten Inhaltsspektrum von Straßen und Wegen über Gebäude bis zu Points of Interest. Sie eignet sich als vertrauter, schnell ladender Kartenhintergrund für beliebige Maßstäbe. Aktualität und Vollständigkeit hängen von der Aktivität der OSM-Community vor Ort ab.`,
    availability: {
      featureFlag: "osm",
    },
  },
};

/** the plain geoportal's background: the categories of the map switch */
export const geoportalBackgroundConfig: BackgroundConfig = {
  defaultCategory: MapStyleKeys.TOPO,
  layerMap: geoportalLayerMap,
  namedLayers: {
    osm_shortbread: {
      type: "vector",
      style: "https://tiles.cismet.de/osm_shortbread/osm_shortbread.style.json",
    },
  },
  categories: [
    {
      id: MapStyleKeys.TOPO,
      title: "Karte",
      title3d: "LoD2-Gebäude (NRW)",
      description3d: {
        inhalt: `Ausschnitt des für ganz Nordrhein-Westfalen vorliegenden 3D-Gebäudemodells der Landesvermessung NRW (Geobasis NRW) in der inhaltlichen Ausbaustufe "Level of Detail 2 (LoD2)".`,
        eignung: `Ein 3D-Gebäudemodell in der Ausbaustufe "Level of Detail 2 (LoD2)" umfasst einfache Gebäudeformen mit standardisierten Dachformen. Ein solches Modell strebt eine abstrahierte, also nicht realistisch wirkende Darstellung der Gebäudesituation an. Es eignet sich dann als Grundlage, wenn die Gebäude aufgrund ihrer Eigenschaften thematisch dargestellt werden sollen (z. B. unterschiedliche Einfärbung von öffentlichen und privaten Gebäuden). Als Datenquelle für die die Gebäudehöhen dienen die Ergebnisdaten von Laserscanner-Befliegungen, die das Land NRW regelmäßig für Teilbereiche der Landesfläche durchführt, für Wuppertal zuletzt im Jahr 2020.`,
      },
      cesiumSceneStyle: MapStyleKeys.TOPO,
      entries: ["stadtplan", "gelaende", "amtlich", "osm"],
    },
    {
      id: MapStyleKeys.AERIAL,
      title: "Luftbild",
      title3d: "3D-Mesh 03/2024",
      description3d: {
        inhalt: `3D-Mesh, berechnet auf der Grundlage von Senkrecht- und Schrägluftbildern aus Bildflügen der Firma Aerowest GmbH/Dortmund vom 14.03. und 17.03.2024, hergestellt durch Aerowest GmbH/Dortmund, Bodenauflösung des Ausgangsbildmaterials 3 cm.`,
        eignung: `Ein 3D-Mesh wird automatisiert aus Senkrecht- und Schrägluftbildern erzeugt, die bei derselben Befliegung erstellt wurden. Dabei wird aus den Bilddaten ein digitales Oberflächenmodell in Form eines Dreiecksnetzes berechnet, auf das die Bilder projiziert werden. Solche Modelle können Fehler und Lücken enthalten, vor allem dort, wo verschiedene Ebenen übereinander liegen, wie zum Beispiel bei den Schwebebahnhöfen. Ein 3D-Mesh strebt eine fotorealistische Darstellung der Situation an. Es eignet sich daher immer dann, wenn Anschaulichkeit, einfache Orientierung und schnelles Wiedererkennen der Örtlichkeit benötigt werden. Das 3D-Mesh 03/2024 basiert auf einer von der Stadt Wuppertal beauftragten Befliegung vor dem Einsetzen der Belaubung (Winterbefliegung). Die Straßenbereiche sind daher vollständig sichtbar, während die Grünbereiche nicht gut zu interpretieren sind. Aktualität: Wuppertal lässt in einem Turnus von 2 Jahren Bildflüge durchführen. Die dargestellte Situation, z. B. bezüglich des Gebäudebestandes, kann daher bis zu 2,5 Jahre alt sein.`,
      },
      cesiumSceneStyle: MapStyleKeys.AERIAL,
      entries: ["luftbild", "luftbild21"],
    },
  ],
};
