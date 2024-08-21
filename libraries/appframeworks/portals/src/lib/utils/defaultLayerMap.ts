import { LayerMap } from "../types";

// TODO make this fallback default less Wuppertal specific

export const defaultLayerMap: LayerMap = {
  luftbild: {
    title: "Luftbild",
    layers: "rvrGrundriss@100|trueOrtho2022@75|rvrSchriftNT@100",
    description: ``,
    inhalt: `<span>(1) Kartendienst (WMS) der Stadt Wuppertal. Datengrundlage:
              True Orthophoto aus Bildflug vom 16.03.2022, hergestellt durch Aerowest
              GmbH/Dortmund, Bodenauflösung 5 cm.
              (True Orthophoto: Aus Luftbildern mit hoher Längs- und Querüberdeckung
              in einem automatisierten Bildverarbeitungsprozess
              berechnetes Bild in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche.) © Stadt Wuppertal (</span>
              <a class="remove-margins" href="https://www.wuppertal.de/geoportal/Nutzungsbedingungen/NB-GDIKOM-C_Geodaten.pdf">NB-GDIKOM C</a>
              <span>). (2) Kartendienste (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlagen:
              Stadtkarte 2.0 und Kartenschrift aus der Stadtkarte 2.0. Details s. Hintergrundkarte Stadtplan).</span>`,
    eignung: `Die Luftbildkarte ist der anschaulichste und inhaltsreichste Kartenhintergrund, geeignet vor allem für Detailbetrachtungen. Durch die Verwendung eines "True Orthophotos" ist die passgenaue Überlagerung mit grundrisstreuen Kartenebenen möglich. Aktualität: Wuppertal lässt in einem Turnus von 2 Jahren Bildflüge durchführen, aus denen ein True Orthophoto abgeleitet wird. Die dargestellte Situation, z. B. bezüglich des Gebäudebestandes, kann daher bis zu 2,5 Jahre alt sein.`,
    url: "https://maps.wuppertal.de/karten?service=WMS&request=GetMap&layers=R102%3Aluftbild2022",
  },
  stadtplan: {
    title: "Stadtplan",
    layers: "amtlich@90",
    description: ``,
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
    description: ``,
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
    title: "Amtliche Geobasisdaten",
    layers: "amtlichBasiskarte@90",
    description: ``,
    inhalt: `<span>Kartendienst (WMS) der Stadt Wuppertal. Datengrundlagen: (1) Stadtgrundkarte / Liegenschaftskarte (bei großmaßstäbigen Darstellungen), (2) Amtliche Basiskarte ABK, jeweils farbige Ausprägung. Die Karten werden täglich (Stadtgrundkarte) bzw. wöchentlich (ABK) in einem automatisierten Prozess aus dem Fachverfahren ALKIS des Liegenschaftskatasters abgeleitet. © Stadt Wuppertal (</span>
              <a class="remove-margins" href="https://www.govdata.de/dl-de/zero-2-0">Datenlizenz Deutschland - Zero - Version 2.0</a>
              <span>).</span>`,
    eignung: `Die Kartenprodukte aus dem Amtlichen Liegenschaftskatasterinformationssystem ALKIS enthalten neben einer detaillierten Darstellung der Gebäude in großen Maßstäben (Liegenschaftskarte) die Flurstücksgrenzen und -nummern. In kleineren Maßstäben (Amtliche Basiskarte) werden die Grundstücksgrenzen dargestellt. Damit eignen sich die Amtlichen Geobasisdaten insbesondere als Hintergrund für gebäude- und grundstücksbezogene Fachdaten sowie planungsrechtliche Darstellungen. Aktualität: der Gebäudebestand ist durch die wöchentliche Ableitung der Karten aus dem ALKIS-Datenbestand sehr aktuell. Gebäude können sicher identifiziert werden, da in der Liegenschaftskarte alle Hausnummern dargestellt werden.`,
    url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  },
};
