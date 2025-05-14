import liegenschaftsThumb from "..//thumbnails/liegenschaft.png";
import wohnlagenThumb from "../thumbnails/wohnlagen.png";

export const discoverConfig = {
  POI: {
    Title: "POI",
    id: "discoverPoi",
    layers: [],
  },
  Planung: {
    Title: "Planung",
    id: "discoverPlanung",
    layers: [],
  },
  Verkehr: {
    Title: "Verkehr",
    id: "discoverVerkehr",
    layers: [],
  },
  Umwelt: {
    Title: "Umwelt",
    id: "discoverUmwelt",
    layers: [],
  },
  Infra: {
    Title: "Infrastruktur",
    id: "discoverInfra",
    layers: [],
  },
  Immo: {
    Title: "Immobilien",
    id: "discoverImmo",
    layers: [
      {
        description: `Inhalt: Vom Gutachterausschuss für Grundstückswerte in der Stadt Wuppertal am 16.04.2024 beschlossene vierstufige Klassifizierung der Wuppertaler Wohnlagen zum Stichtag 01.01.2024 mit dem wöchentlich aktualisierten Amtlichen Stadtplan (Stadtkarte 2.0) als Hintergrund. Verwendungszweck: Ermittlung von Wohnlagen gemäß Nr. 6.9 des qualifizierten Mietspiegels der Stadt Wuppertal für die Ermittlung ortsüblicher Vergleichsmieten.`,
        type: "collection",
        thumbnail: wohnlagenThumb,
        title: "Wohnlagenkarte",
        serviceName: "discoverImmo",
        id: "discoverImmo_wohnlagen",
        path: "Immobilien",
        backgroundLayer: {
          title: "Stadtplan",
          id: "karte",
          opacity: 1,
          description: "",
          inhalt:
            '<span>Kartendienst (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlage: Stadtkarte 2.0. Wöchentlich in einem automatischen Prozess aktualisierte Zusammenführung des Straßennetzes der OpenStreetMap mit Amtlichen Geobasisdaten des Landes NRW aus den Fachverfahren ALKIS (Gebäude, Flächennutzungen) und ATKIS (Gewässer). © RVR und Kooperationspartner (</span><a class="remove-margins" href="https://www.govdata.de/dl-de/by-2-0">\n                Datenlizenz Deutschland - Namensnennung - Version 2.0\n              </a><span>). Lizenzen der Ausgangsprodukte: </span><a href="https://www.govdata.de/dl-de/zero-2-0">\n                Datenlizenz Deutschland - Zero - Version 2.0\n              </a><span> (Amtliche Geobasisdaten) und </span><a href="https://opendatacommons.org/licenses/odbl/1-0/">    ODbL    </a><span> (OpenStreetMap contributors).</span>',
          eignung:
            "Der Stadtplan ist der am einfachsten und sichersten interpretierbare Kartenhintergrund, weil er an den von Stadtplänen geprägten Sehgewohnheiten von Kartennutzerinnen und -nutzern anschließt. Durch die schrittweise Reduzierung des Karteninhalts bei kleiner werdenden Maßstäben eignet sich der Stadtplan als Hintergrund für beliebige Maßstäbe. Aktualität: der Gebäudebestand ist durch die wöchentliche Ableitung aus dem Liegenschaftskataster sehr aktuell. Gebäude können sicher identifiziert werden, da bei Detailbetrachtungen alle Hausnummern dargestellt werden.",
          visible: true,
          layerType: "wmts",
          props: {
            name: "",
            url: "https://geodaten.metropoleruhr.de/spw2?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=spw2_light&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
          },
          layers: "amtlich@90",
        },
        layers: [
          {
            title: "Wohnlagen 2025",
            id: "wuppImmo:wohnlagen2025",
            layerType: "vector",
            opacity: 1,
            description:
              "Inhalt: Vom Gutachterausschuss für Grundstückswerte in der Stadt Wuppertal am 20.03.2025 beschlossene vierstufige Klassifizierung der Wuppertaler Wohnlagen zum Stichtag 01.01.2025; die räumliche Auflösung orientiert sich an den Baublöcken aus der kleinräumigen Gliederung der Stadt Wuppertal, weicht im Detail aber an etlichen Stellen von dieser Gebietsgliederung ab; die in der jeweiligen Zone dargestellte Wohnlage beschreibt deren überwiegenden Charakter, die Lagequalität einzelner Grundstücke kann abweichen. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes; der zugrunde liegende Datensatz ist unter einer Open-Data-Lizenz (dl-de/by-2-0) verfügbar",
            conf: {
              thumbnail:
                "https://www.wuppertal.de/geoportal/geoportal_vorschau/immo_wohnlagen2025.png",
              opendata:
                "https://www.offenedaten-wuppertal.de/dataset/wohnlagen-wuppertal",
              vectorStyle: "https://tiles.cismet.de/wohnlagen2025/style.json",
              infoboxMapping: [
                "function createInfoBoxInfo(p) { let color = '#006c72'; switch(p.wlcode) { case 1: color = '#FF0000'; break; case 2: color = '#FFC000'; break; case 3: color = '#92D050'; break; case 4: color = '#00C5FF'; break; } const info = { title: p.wohnlage, headerColor: color, header: 'Wohnlagen 2025', }; return info; }",
              ],
            },
            queryable: true,
            useInFeatureInfo: true,
            visible: true,
            props: {
              style: "https://tiles.cismet.de/wohnlagen2025/style.json",
              minZoom: 9,
              maxZoom: 24,
              legend: [
                {
                  Format: "image/png",
                  OnlineResource:
                    "https://www.wuppertal.de/geoportal/legenden/default_wohnlagenkarte_2025.png",
                  size: [230, 334],
                },
              ],
              metaData: [
                {
                  Format: "application/xml",
                  OnlineResource:
                    "https://apps.geoportal.nrw.de/soapServices/CSWStartup?Service=CSW&Request=GetRecordById&Version=2.0.2&outputSchema=https://www.isotc211.org/2005/gmd&elementSetName=full&id=91fe8f8d-fccb-437b-bd5f-4b114d4a84b5",
                  type: "TC211",
                },
              ],
            },
            other: {
              title: "Wohnlagen 2025",
              description:
                "Inhalt: Vom Gutachterausschuss für Grundstückswerte in der Stadt Wuppertal am 20.03.2025 beschlossene vierstufige Klassifizierung der Wuppertaler Wohnlagen zum Stichtag 01.01.2025; die räumliche Auflösung orientiert sich an den Baublöcken aus der kleinräumigen Gliederung der Stadt Wuppertal, weicht im Detail aber an etlichen Stellen von dieser Gebietsgliederung ab; die in der jeweiligen Zone dargestellte Wohnlage beschreibt deren überwiegenden Charakter, die Lagequalität einzelner Grundstücke kann abweichen. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes; der zugrunde liegende Datensatz ist unter einer Open-Data-Lizenz (dl-de/by-2-0) verfügbar",
              tags: ["Immobilien"],
              keywords: [
                "carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/immo_wohnlagen2025.png",
                "carmaConf://opendata:https://www.offenedaten-wuppertal.de/dataset/wohnlagen-wuppertal",
                "carmaConf://vectorStyle:https://tiles.cismet.de/wohnlagen2025/style.json",
                "carmaconf://infoBoxMapping:function createInfoBoxInfo(p) { let color = '#006c72'; switch(p.wlcode) { case 1: color = '#FF0000'; break; case 2: color = '#FFC000'; break; case 3: color = '#92D050'; break; case 4: color = '#00C5FF'; break; } const info = { title: p.wohnlage, headerColor: color, header: 'Wohnlagen 2025', }; return info; }",
                ":vec:",
              ],
              id: "wuppImmo:wohnlagen2025",
              name: "wohnlagen2025",
              type: "layer",
              layerType: "wmts",
              queryable: true,
              maxZoom: 24,
              minZoom: 10,
              serviceName: "wuppImmo",
              path: "Immobilien",
              icon: "immo/Wohnlagen_2024",
              service: {
                url: "https://maps.wuppertal.de/immo",
                name: "wuppImmo",
              },
              thumbnail:
                "https://www.wuppertal.de/geoportal/geoportal_vorschau/immo_wohnlagen2025.png",
            },
          },
        ],
        settings: {
          minZoomlevel: 15,
        },
      },
    ],
  },
  Gebiet: {
    Title: "Gebiete",
    id: "discoverGebiet",
    layers: [],
  },
  Basis: {
    Title: "Basis",
    id: "discoverBasis",
    layers: [
      {
        description: `Inhalt: Strichdarstellung der aktuellen Liegenschaftskarte aus dem Amtlichen Liegenschaftskatasterinformationssystem ALKIS mit dem Wuppertaler True Orthofoto (abgeleitet aus Bildflügen vom 14.03. und 17.03.2024, Bodenauflösung 3 cm) als Hintergrund. Verwendungszweck: Anschauliche Darstellung von Grenzverläufen in der Örtlichkeit. (Wo verlaufen meine Grundstücksgrenzen?)`,
        type: "collection",
        thumbnail: liegenschaftsThumb,
        title: "Liegenschaftskarte mit Luftbild",
        serviceName: "discoverBasis",
        id: "discoverBasis_liegenschaft",
        path: "Basis",
        backgroundLayer: {
          id: "luftbild",
          title: "Luftbildkarte 03/24",
          opacity: 0,
          description:
            "Luftbildkarte (aus True Orthofoto 03/24) © Stadt Wuppertal / RVR und Kooperationspartner",
          inhalt:
            '<span>(1) Kartendienst (WMS) der Stadt Wuppertal. Datengrundlage:\n               True Orthofoto aus Bildflügen vom 14.03. und 17.03.2024, hergestellt durch Aerowest\n              GmbH/Dortmund, Bodenauflösung 3 cm.\n              (True Orthofoto: Aus Luftbildern mit hoher Längs- und Querüberdeckung\n              in einem automatisierten Bildverarbeitungsprozess\n              berechnetes Bild in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche.) © Stadt Wuppertal (</span>\n              <a class="remove-margins" href="https://www.wuppertal.de/geoportal/Nutzungsbedingungen/NB-GDIKOM-C_Geodaten.pdf">NB-GDIKOM C</a>\n              <span>). (2) Kartendienste (WMS) des Regionalverbandes Ruhr (RVR). Datengrundlagen:\n              Stadtkarte 2.0 und Kartenschrift aus der Stadtkarte 2.0. Details s. Hintergrundkarte Stadtplan).</span>',
          eignung:
            'Luftbildkarten eignen sich wegen ihrer Anschaulichkeit und ihres Inhaltsreichtums vor allem für Detailbetrachtungen. Durch die Verwendung eines "True Orthofotos" ist die passgenaue Überlagerung mit grundrisstreuen Kartenebenen möglich. Die Luftbildkarte 03/24 basiert auf einer von der Stadt Wuppertal beauftragten Befliegung vor dem Einsetzen der Belaubung (Winterbefliegung). Die Straßenbereiche sind daher vollständig sichtbar, während die Grünbereiche nicht gut zu interpretieren sind. Aktualität: Wuppertal lässt in einem Turnus von 2 Jahren Bildflüge durchführen. Die dargestellte Situation, z. B. bezüglich des Gebäudebestandes, kann daher bis zu 2,5 Jahre alt sein.',
          layerType: "wmts",
          visible: false,
          props: {
            name: "",
            url: "https://maps.wuppertal.de/karten?service=WMS&request=GetMap&layers=R102%3Aluftbild2022",
          },
          layers: "rvrGrundriss@100|trueOrtho2024@75|rvrSchriftNT@100",
        },
        layers: [
          {
            title: "Wuppertaler True Orthofoto 2024",
            id: "wuppKarten:R102:trueortho2024",
            layerType: "wmts",
            opacity: 1,
            description:
              "Inhalt: True Orthophoto für das Stadtgebiet von Wuppertal aus Bildflügen vom 14.03.und 17.03.2024 (Frühjahrsbefliegung mit geringer Belaubung) mit 80% Längs- und 60% Querüberdeckung; hergestellt im Zusammenhang mit einer Schrägluftbildbefliegung durch Aerowest GmbH /Dortmund, Bodenauflösung 3 cm (True Orthophoto: Aus Luftbildern mit hoher Längs- und Querüberdeckung in einem automatisierten Bildverarbeitungsprozess berechnetes Bild in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche). Sichtbarkeit: öffentlich, Detailzooms nur für interne und autorisierte externe Nutzer. Nutzung: Detailzooms für externe Nutzer i. A. kostenpflichtig nach Abschluss eines schriftlichen Nutzungsrechtsvertrages.",
            conf: {
              thumbnail:
                "https://www.wuppertal.de/geoportal/geoportal_vorschau/karten_R102_trueortho2024.png",
            },
            visible: true,
            queryable: false,
            useInFeatureInfo: true,
            props: {
              url: "https://maps.wuppertal.de/karten?",
              legend: [
                {
                  Format: "image/png",
                  OnlineResource:
                    "https://www.wuppertal.de/geoportal/legenden/WuppTrueOrtho2024.png",
                  size: [32, 32],
                },
              ],
              name: "R102:trueortho2024",
              minZoom: -4,
            },
            other: {
              title: "Wuppertaler True Orthofoto 2024",
              description:
                "Inhalt: True Orthophoto für das Stadtgebiet von Wuppertal aus Bildflügen vom 14.03.und 17.03.2024 (Frühjahrsbefliegung mit geringer Belaubung) mit 80% Längs- und 60% Querüberdeckung; hergestellt im Zusammenhang mit einer Schrägluftbildbefliegung durch Aerowest GmbH /Dortmund, Bodenauflösung 3 cm (True Orthophoto: Aus Luftbildern mit hoher Längs- und Querüberdeckung in einem automatisierten Bildverarbeitungsprozess berechnetes Bild in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche). Sichtbarkeit: öffentlich, Detailzooms nur für interne und autorisierte externe Nutzer. Nutzung: Detailzooms für externe Nutzer i. A. kostenpflichtig nach Abschluss eines schriftlichen Nutzungsrechtsvertrages.",
              tags: ["Basis", "True Orthofotos"],
              keywords: [
                "carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/karten_R102_trueortho2024.png",
              ],
              id: "wuppKarten:R102:trueortho2024",
              name: "R102:trueortho2024",
              type: "layer",
              layerType: "wmts",
              queryable: false,
              minZoom: -4,
              props: {
                Name: "R102:trueortho2024",
                Title: "Wuppertaler True Orthofoto 2024",
                Abstract:
                  "Inhalt: True Orthophoto für das Stadtgebiet von Wuppertal aus Bildflügen vom 14.03.und 17.03.2024 (Frühjahrsbefliegung mit geringer Belaubung) mit 80% Längs- und 60% Querüberdeckung; hergestellt im Zusammenhang mit einer Schrägluftbildbefliegung durch Aerowest GmbH /Dortmund, Bodenauflösung 3 cm (True Orthophoto: Aus Luftbildern mit hoher Längs- und Querüberdeckung in einem automatisierten Bildverarbeitungsprozess berechnetes Bild in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche). Sichtbarkeit: öffentlich, Detailzooms nur für interne und autorisierte externe Nutzer. Nutzung: Detailzooms für externe Nutzer i. A. kostenpflichtig nach Abschluss eines schriftlichen Nutzungsrechtsvertrages.",
                KeywordList: [
                  "carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/karten_R102_trueortho2024.png",
                ],
                SRS: [
                  "EPSG:4326",
                  "EPSG:3857",
                  "EPSG:31466",
                  "EPSG:31467",
                  "EPSG:25832",
                  "EPSG:4258",
                ],
                LatLonBoundingBox: [7, 51.1, 7.4, 51.4],
                BoundingBox: [
                  {
                    crs: "EPSG:4326",
                    extent: [7, 51.1, 7.4, 51.4],
                    res: [null, null],
                  },
                  {
                    crs: "EPSG:3857",
                    extent: [
                      779236.43555291, 6639001.66376131, 823764.23187022,
                      6692356.43526254,
                    ],
                    res: [null, null],
                  },
                  {
                    crs: "EPSG:31466",
                    extent: [
                      2569633.25126776, 5663247.70326252, 2598105.25973185,
                      5697078.47942478,
                    ],
                    res: [null, null],
                  },
                  {
                    crs: "EPSG:31467",
                    extent: [
                      3359986.02717938, 5663987.8210395, 3388728.52162088,
                      5698044.33551918,
                    ],
                    res: [null, null],
                  },
                  {
                    crs: "EPSG:25832",
                    extent: [
                      359968.672087, 5662162.82306526, 388699.92654467,
                      5696205.92336619,
                    ],
                    res: [null, null],
                  },
                  {
                    crs: "EPSG:4258",
                    extent: [7, 51.1, 7.4, 51.4],
                    res: [null, null],
                  },
                ],
                Style: [
                  {
                    Name: "default",
                    Title: "default",
                    LegendURL: [
                      {
                        Format: "image/png",
                        OnlineResource:
                          "https://www.wuppertal.de/geoportal/legenden/WuppTrueOrtho2024.png",
                        size: [32, 32],
                      },
                    ],
                  },
                ],
                ScaleHint: { min: 0, max: 2999999.99999937 },
                queryable: false,
                cascaded: 1,
                opaque: false,
                noSubsets: false,
                fixedWidth: 0,
                fixedHeight: 0,
                tags: ["Basis", "True Orthofotos"],
                url: "https://maps.wuppertal.de/karten?",
              },
              serviceName: "wuppKarten",
              path: "Basis",
              Name: "R102:trueortho2024",
              Title: "Wuppertaler True Orthofoto 2024",
              Abstract:
                "Inhalt: True Orthophoto für das Stadtgebiet von Wuppertal aus Bildflügen vom 14.03.und 17.03.2024 (Frühjahrsbefliegung mit geringer Belaubung) mit 80% Längs- und 60% Querüberdeckung; hergestellt im Zusammenhang mit einer Schrägluftbildbefliegung durch Aerowest GmbH /Dortmund, Bodenauflösung 3 cm (True Orthophoto: Aus Luftbildern mit hoher Längs- und Querüberdeckung in einem automatisierten Bildverarbeitungsprozess berechnetes Bild in Parallelprojektion, also ohne Gebäudeverkippung und sichttote Bereiche). Sichtbarkeit: öffentlich, Detailzooms nur für interne und autorisierte externe Nutzer. Nutzung: Detailzooms für externe Nutzer i. A. kostenpflichtig nach Abschluss eines schriftlichen Nutzungsrechtsvertrages.",
              KeywordList: [
                "carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/karten_R102_trueortho2024.png",
              ],
              SRS: [
                "EPSG:4326",
                "EPSG:3857",
                "EPSG:31466",
                "EPSG:31467",
                "EPSG:25832",
                "EPSG:4258",
              ],
              LatLonBoundingBox: [7, 51.1, 7.4, 51.4],
              BoundingBox: [
                {
                  crs: "EPSG:4326",
                  extent: [7, 51.1, 7.4, 51.4],
                  res: [null, null],
                },
                {
                  crs: "EPSG:3857",
                  extent: [
                    779236.43555291, 6639001.66376131, 823764.23187022,
                    6692356.43526254,
                  ],
                  res: [null, null],
                },
                {
                  crs: "EPSG:31466",
                  extent: [
                    2569633.25126776, 5663247.70326252, 2598105.25973185,
                    5697078.47942478,
                  ],
                  res: [null, null],
                },
                {
                  crs: "EPSG:31467",
                  extent: [
                    3359986.02717938, 5663987.8210395, 3388728.52162088,
                    5698044.33551918,
                  ],
                  res: [null, null],
                },
                {
                  crs: "EPSG:25832",
                  extent: [
                    359968.672087, 5662162.82306526, 388699.92654467,
                    5696205.92336619,
                  ],
                  res: [null, null],
                },
                {
                  crs: "EPSG:4258",
                  extent: [7, 51.1, 7.4, 51.4],
                  res: [null, null],
                },
              ],
              Style: [
                {
                  Name: "default",
                  Title: "default",
                  LegendURL: [
                    {
                      Format: "image/png",
                      OnlineResource:
                        "https://www.wuppertal.de/geoportal/legenden/WuppTrueOrtho2024.png",
                      size: [32, 32],
                    },
                  ],
                },
              ],
              ScaleHint: { min: 0, max: 2999999.99999937 },
              cascaded: 1,
              opaque: false,
              noSubsets: false,
              fixedWidth: 0,
              fixedHeight: 0,
              service: {
                url: "https://maps.wuppertal.de/karten",
                name: "wuppKarten",
              },
              thumbnail:
                "https://www.wuppertal.de/geoportal/geoportal_vorschau/karten_R102_trueortho2024.png",
            },
          },
          {
            title: "ALKIS Strichkarte (gelb)",
            id: "wuppKarten:expg",
            layerType: "wmts",
            opacity: 1,
            description:
              "Inhalt: Aus dem Amtlichen Liegenschaftskataster-Informationssystem ALKIS der Stadt Wuppertal erzeugte tagesaktuelle Hintergrundkarte; optimierte Geschwindigkeit durch maßstabsabhängige Darstellung von Teilinhalten des Grunddatenbestandes NRW (Modellarten DLKM und DKKM 1000), Flurstücke, Gebäude und Nutzungsarten werden bei Detailansichten vollständig dargestellt; frei definierte gelbe Strichkartenausprägungen ohne Bezug zum Signaturenkatalog NRW, geeignet für die Überlagerung eines Luftbildes mit Inhalten des Liegenschaftskatasters. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.",
            conf: {
              thumbnail:
                "https://www.wuppertal.de/geoportal/geoportal_vorschau/karten_expg.png",
            },
            visible: true,
            queryable: false,
            useInFeatureInfo: true,
            props: {
              url: "https://maps.wuppertal.de/karten?",
              legend: [
                {
                  Format: "image/png",
                  OnlineResource:
                    "https://www.wuppertal.de/geoportal/legenden/default_R102_ALKIS_express_strich_gelb.png",
                  size: [230, 215],
                },
              ],
              name: "expg",
              minZoom: 17,
            },
            other: {
              title: "ALKIS Strichkarte (gelb)",
              description:
                "Inhalt: Aus dem Amtlichen Liegenschaftskataster-Informationssystem ALKIS der Stadt Wuppertal erzeugte tagesaktuelle Hintergrundkarte; optimierte Geschwindigkeit durch maßstabsabhängige Darstellung von Teilinhalten des Grunddatenbestandes NRW (Modellarten DLKM und DKKM 1000), Flurstücke, Gebäude und Nutzungsarten werden bei Detailansichten vollständig dargestellt; frei definierte gelbe Strichkartenausprägungen ohne Bezug zum Signaturenkatalog NRW, geeignet für die Überlagerung eines Luftbildes mit Inhalten des Liegenschaftskatasters. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.",
              tags: ["Basis", "Liegenschaftskataster"],
              keywords: [
                "carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/karten_expg.png",
              ],
              id: "wuppKarten:expg",
              name: "expg",
              type: "layer",
              layerType: "wmts",
              queryable: false,
              minZoom: 17,
              props: {
                Name: "expg",
                Title: "ALKIS Strichkarte (gelb)",
                Abstract:
                  "Inhalt: Aus dem Amtlichen Liegenschaftskataster-Informationssystem ALKIS der Stadt Wuppertal erzeugte tagesaktuelle Hintergrundkarte; optimierte Geschwindigkeit durch maßstabsabhängige Darstellung von Teilinhalten des Grunddatenbestandes NRW (Modellarten DLKM und DKKM 1000), Flurstücke, Gebäude und Nutzungsarten werden bei Detailansichten vollständig dargestellt; frei definierte gelbe Strichkartenausprägungen ohne Bezug zum Signaturenkatalog NRW, geeignet für die Überlagerung eines Luftbildes mit Inhalten des Liegenschaftskatasters. Sichtbarkeit: öffentlich. Nutzung: frei innerhalb der Grenzen des Urheberrechtsgesetzes.",
                KeywordList: [
                  "carmaConf://thumbnail:https://www.wuppertal.de/geoportal/geoportal_vorschau/karten_expg.png",
                ],
                SRS: [
                  "EPSG:31466",
                  "EPSG:31467",
                  "EPSG:25832",
                  "EPSG:4326",
                  "EPSG:3857",
                  "EPSG:4258",
                ],
                LatLonBoundingBox: [7, 51.1, 7.4, 51.4],
                BoundingBox: [
                  {
                    crs: "EPSG:31466",
                    extent: [
                      2569633.25126776, 5663247.70326252, 2598105.25973185,
                      5697078.47942478,
                    ],
                    res: [null, null],
                  },
                  {
                    crs: "EPSG:31467",
                    extent: [
                      3359986.02717938, 5663987.8210395, 3388728.52162088,
                      5698044.33551918,
                    ],
                    res: [null, null],
                  },
                  {
                    crs: "EPSG:25832",
                    extent: [
                      359968.672087, 5662162.82306526, 388699.92654467,
                      5696205.92336619,
                    ],
                    res: [null, null],
                  },
                  {
                    crs: "EPSG:4326",
                    extent: [7, 51.1, 7.4, 51.4],
                    res: [null, null],
                  },
                  {
                    crs: "EPSG:3857",
                    extent: [
                      779236.43555291, 6639001.66376131, 823764.23187022,
                      6692356.43526254,
                    ],
                    res: [null, null],
                  },
                  {
                    crs: "EPSG:4258",
                    extent: [7, 51.1, 7.4, 51.4],
                    res: [null, null],
                  },
                ],
                Style: [
                  {
                    Name: "default",
                    Title: "default",
                    LegendURL: [
                      {
                        Format: "image/png",
                        OnlineResource:
                          "https://www.wuppertal.de/geoportal/legenden/default_R102_ALKIS_express_strich_gelb.png",
                        size: [230, 215],
                      },
                    ],
                  },
                ],
                ScaleHint: { min: 0, max: 1.1 },
                queryable: false,
                cascaded: 1,
                opaque: false,
                noSubsets: false,
                fixedWidth: 0,
                fixedHeight: 0,
                tags: ["Basis", "Liegenschaftskataster"],
                url: "https://maps.wuppertal.de/karten?",
              },
              serviceName: "wuppKarten",
              path: "Basis",
              pictureBoundingBox: [
                784874.5156892611, 6655868.893474152, 821182.1041247197,
                6679927.448126909,
              ],
              icon: "basis/Expresskarte_Strichkarte_gelb",
              service: {
                url: "https://maps.wuppertal.de/karten",
                name: "wuppKarten",
              },
              thumbnail:
                "https://www.wuppertal.de/geoportal/geoportal_vorschau/karten_expg.png",
            },
          },
        ],
        settings: {
          minZoomlevel: 18,
        },
      },
    ],
  },
};
