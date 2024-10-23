import { useContext } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { getSimpleHelpForTM } from "react-cismap/tools/uiHelper";
import { Link } from "react-scroll";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import FilterPanel from "react-cismap/topicmaps/menu/FilterPanel";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import ConfigurableDocBlocks from "react-cismap/topicmaps/ConfigurableDocBlocks";
import { LOOKUP } from "./helper/constants";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import Icon from "react-cismap/commons/Icon";
import {
  KompaktanleitungSection,
  MenuTitle,
  MenuIntroduction,
  Footer,
  getFilterHeader,
  FilterStyle,
} from "@carma-collab/wuppertal/luftmessstationen";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";

const MyMenu = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  const { filterState, filterMode, filteredItems, shownFeatures } = useContext(
    FeatureCollectionContext,
  );
  const { setFilterState, setFilterMode } = useContext(
    FeatureCollectionDispatchContext,
  );

  const { items } = useContext(FeatureCollectionContext);

  const kategorien = [];
  const katValues = [];
  const themen = [];
  const themenValues = [];
  const topicMapTitle = "Luftmessstationskarte Wuppertal";

  // const getFilterHeader = () => {
  //   const count = filteredItems?.length || 0;

  //   let term;
  //   if (count === 1) {
  //     term = "Standort";
  //   } else {
  //     term = "Standorte";
  //   }

  //   return `Messstationen der Luftqualität (${count} ${term} gefunden, davon ${
  //     shownFeatures?.length || "0"
  //   } in der Karte)`;
  // };

  const filterConfiguration = {
    mode: "list", // list or tabs
    resetedFilter: {
      stations: [
        "unauffaellig",
        "auffaellig",
        "warnend",
        "inaktiv",
        "abgebaut",
      ],
    },
    filterMode: "gibtnureinen",
    filters: [
      {
        title: "aktive Messstationen",
        key: "stations",
        type: "checkBoxes",
        values: [
          {
            keys: ["unauffaellig", "auffaellig", "warnend", "inaktiv"],
            title: "alle aktiven Stationen",
          },
          {
            key: "unauffaellig",
            indent: 30,
            title: "unauffällige Stationen",
            color: LOOKUP.unauffaellig.color,
            icon: "square",
            iconPos: "pre",
          },
          {
            key: "auffaellig",
            indent: 30,
            title: "auffällige Stationen",
            color: LOOKUP.auffaellig.color,
            icon: "square",
            iconPos: "pre",
          },
          {
            key: "warnend",
            indent: 30,
            title: "warnende Stationen",
            color: LOOKUP.warnend.color,
            icon: "square",
            iconPos: "pre",
          },
          {
            key: "inaktiv",
            indent: 30,
            title: "Stationen mit Messausfall",
            color: LOOKUP.inaktiv.color,
            icon: "square",
            iconPos: "pre",
          },
        ],
        setAll: () => {
          setFilterState({ ...filterState, themen });
        },
        setNone: () => {
          setFilterState({ ...filterState, themen: [] });
        },
        colorizer: (item, selected) => (selected ? item.color : "#eeeeee"),
      },
      {
        title: "inaktive Messstationen",
        key: "stations",
        type: "checkBoxes",
        values: [
          {
            key: "abgebaut",
            title: "abmontierte Stationen",
            color: LOOKUP.abgebaut.color,
            icon: "square",
            iconPos: "pre",
          },
        ],
        setAll: () => {
          setFilterState({ ...filterState, kategorien });
        },
        setNone: () => {
          setFilterState({ ...filterState, kategorien: [] });
        },
      },
    ],
  };
  const simpleHelp = {
    content: `Die Stadt Wuppertal führt seit vielen Jahren Messungen und Kartierungen durch,
um Aufschlüsse über die Luftbelastungssituation zu erhalten. Diese Erkenntnisse werden 
für Maßnahmen zur Luftreinhaltung und die Stadtentwicklung genutzt. Einer der derzeit 
am meisten diskutierte Luftschadstoff ist Stickstoffdioxid (NO₂). Dieser wird als 
Reizgas mit stechend-stickigem Geruch bereits in geringen Konzentrationen wahrgenommen. 
Die Inhalation ist für den Menschen der einzig relevante Aufnahmeweg. 
   
Die europäische Union hat für ihre Mitgliedsstaaten mit mehreren Luftqualitätsrichtlinien
verbindliche Luftqualitätsziele zur Vermeidung oder Verringerung schädlicher Auswirkungen
auf die menschliche Gesundheit und die Umwelt festgelegt. Danach wird die Luftqualität
in den Staaten der EU nach einheitlichen Methoden und Kriterien beurteilt. In der
Bundesrepublik Deutschland wurden diese Richtlinien durch Novellierung des
Bundes-Immissions­schutzgesetzes (BImSchG) sowie durch die Einführung der 39. Verordnung
zum BImSchG (39. BImSchV) in deutsches Recht umgesetzt. Für Stickstoffdioxid (NO₂) gilt
seit dem Jahr 2010 ein Jahresmittelwert für NO₂ von 40 µg pro Kubikmeter Luft. Die
Messungen von Stickstoffdioxid (NO₂) werden in Wuppertal mit sogenannten Passivsammlern
durchgeführt und nahezu monatlich abgelesen.
  
Die Luftmessstationskarte zeigt die Positionen dieser Passivsammler im Wuppertaler Stadtgebiet,
welche in den vergangenen zehn Jahren Messwerte lieferten. Die farbigen Signaturen in der
Karte beziehen sich dabei auf den zuletzt verfügbaren monatlichen NO₂-Messwert: unauffällig
grün (≦ 35 mg/m³), auffällig gelb (> 35 µg/m³) und warnend rot (> 40 µg/m³). Die Signaturen
für Passivsammler, welche bei der letzten monatlichen Ablesung keinen Messwert geliefert
haben, sind türkis eingefärbt (temporärer Ausfall). Wenn eine Messstation in den letzten
zehn Jahren abgebaut wurde und damit keine weiteren NO₂-Messwerte liefert, liegt eine
blaugraue Signatur vor. 

Ein Passivsammler ist ein kleines mit Adsorbermaterial gefülltes Röhrchen, welches ohne Pumpe 
(ohne aktive Probenahme) Schadstoffe aus der Luft über die natürliche Ausbreitung und Verteilung 
(Diffusion) aufnehmen und anreichern kann. Zur Verringerung von wind- und turbulenzbedingten 
Einflüssen befindet sich an der offenen Seite des Probeentnahmeröhrchens eine Glasfritte. 
Zum Schutz vor Witterungseinflüssen werden die Sammler in einem nach unten geöffneten Gehäuse 
eingehängt und exponiert.

<div style="text-align:center">
<img width="50%" src="https://topicmaps-wuppertal.github.io/luftmessstationen/img/passivsammler.jpg" />
</div>

_Beispiel für einen [Passivsammler](https://www.lanuv.nrw.de/fileadmin/lanuv/luft/gifs/no2_gr.jpg); 
Bildquelle: Landesamt für Natur- Umwelt und Verbraucherschutz NRW ([LANUV](https://www.lanuv.nrw.de/impressum))._

Die Funktionsweise eines Passivsammlers basiert auf der Anreicherung von Stickstoffdioxid (NO₂) an einem 
geeigneten Adsorbens ohne aktive Probennahme. Das Probeentnahmesystem besteht aus einem Kunststoffröhrchen, 
an dessen einem Ende sich ein mit Triethanolamin imprägniertes Edelstahl-Drahtsieb als Adsorbens befindet. 
Das in der Außenluft enthaltene NO₂ wird durch Diffusion zu diesem Adsorbens transportiert und dort adsorbiert. 
Die Röhrchen bzw. die Stickstoffdioxidmenge werden anschließend im Labor als Nitrit, z.B. mittels Fotometrie, 
analysiert. Aus der Analytmenge, dem Expositionszeitraum und der Sammelrate wird die mittlere Konzentration 
im Expositionszeitraum berechnet. Typische Expositionszeiträume liegen im Bereich von zwei bis sechs Wochen.

Für die in Wuppertal durchgeführten Messungen wurden Expositions- bzw. Messzeiträume von etwa vier Wochen 
realisiert, um eine Auswertung auf Monatsmittelwertbasis zu ermöglichen. Der vorliegende Messwert beschreibt 
die mittlere Konzentration im Expositionsraum. Nach etwa vier Wochen erfolgt an den Wuppertaler Messstationen 
der Probeentnahmewechsel durch ein beauftragtes Unternehmen. Nach dem Wechsel werden die Proben im Labor 
analysiert. Die Messergebnisse liegen ca. 2-3 Wochen nach dem Wechsel vor; mögliche Verzögerungen bei der 
Datenlieferung treten selten auf. Nach Vorliegen der Daten werden diese seitens der Stadt Wuppertal auf 
Plausibilität geprüft. Die Daten werden spätestens eine Woche nach Erhalt in das Fachsystem übernommen. 
Es ergibt sich daraus eine maximale Verzögerung hinsichtlich des Zeitpunkts der Veröffentlichung der 
NO₂-Messwerte von ca. vier Wochen.
`,
  };

  const titleContent = "Die Karte <b>" + topicMapTitle + "</b>";
  const helpConfig = [
    {
      type: "FAQS",
      configs: [
        {
          title: "Datengrundlage",
          bsStyle: "secondary",
          contentBlockConf: {
            type: "DOCBLOCK",
            docBlockConfigs: [
              {
                type: "HTML",
                content:
                  "\n\t\t\t\t\t\t\t\t\t\t" +
                  titleContent +
                  " bietet ihnen die folgenden\n\t\t\t\t\t\t\t\t\t\tHintergrundkarten an, die auf verschiedenen Geodatendiensten und Geodaten\n\t\t\t\t\t\t\t\t\t\tbasieren:\n\t\t\t\t\t\t\t\t\t\t",
              },
              {
                type: "HTML",
                content: `<p><ul><li id="lic_lbk"/><li id="lic_sp"/></ul>
                  
                  Neben dem Datensatz der <a href="https://offenedaten-wuppertal.de/dataset/umweltzonen-wuppertal" 
                  target="_opendata">Umweltzonen Wuppertal</a> stellt die Luftmessstationskarte 
                  auch die Daten der Luftmessstationen aus dem Open-Data-Angebot der Stadt Wuppertal dar:
                  <br/> <br/>
                  <ul>
                    <li>
                      <a
                        target='_opendata'
                        href='https://offenedaten-wuppertal.de/dataset/luftmessstationen-wuppertal-passivsammler'
                      >
                        Stammdaten der Luftmessstationen
                      </a>
                    </li>
                    <li>
                      <a
                        target='_opendata'
                        href='https://offenedaten-wuppertal.de/dataset/no2-messdaten-wuppertal-passivsammler-ab-2008'
                      >
                        Messdaten (Monatsmittelwerte) seit dem Jahr 2008
                      </a>
                    </li>
                    <li>
                      <a
                        target='_opendata'
                        href='https://offenedaten-wuppertal.de/dataset/no2-jahresmittelwerte-wuppertal-passivsammler-ab-2008'
                      >
                        Jahresmittelwerte seit dem Jahr 2008
                      </a>
                    </li>
                    <li>
                      <a
                        target='_opendata'
                        href='https://offenedaten-wuppertal.de/dataset/no2-messdaten-wuppertal-passivsammler-2006-und-2007'
                      >
                        Messdaten der Jahre 2006 und 2007
                      </a>
                    </li>
                  </ul>
                  </p>`,
                replaceConfig: {
                  lic_lbk: {
                    type: "LICENSE_LBK",
                  },
                  lic_sp: {
                    type: "LICENSE_STADTPLAN",
                  },
                },
              },
            ],
          },
        },
        {
          title: "Hintergrund",
          bsStyle: "secondary",
          contentBlockConf: {
            type: simpleHelp.type || "MARKDOWN",
            content: simpleHelp.content,
          },
        },
        {
          title: "Fachobjekte auswählen und abfragen",
          bsStyle: "success",
          contentBlockConf: {
            type: "FACHOBJEKTEAUSWAEHLENUNDABFRAGEN",
          },
        },
        {
          title: "Kartendarstellung der Fachobjekte",
          bsStyle: "success",
          contentBlockConf: {
            type: "KARTENDARSTELLUNGDERFACHOBJEKTE",
          },
        },
        {
          title: "In Karte positionieren",
          bsStyle: "warning",
          contentBlockConf: {
            type: "INKARTEPOSITIONIEREN",
          },
        },
        {
          title: "Mein Standort",
          bsStyle: "warning",
          contentBlockConf: {
            type: "MEINSTANDORT",
          },
        },
        {
          title: "Filtern",
          bsStyle: "warning",
          contentBlockConf: {
            type: "REACTCOMP",
            content: (
              <div>
                <p>
                  Im Bereich &quot;
                  <strong>Messstationen der Luftqualität</strong>&quot; können
                  Sie im Anwendungsmenü <Icon name="bars" /> die in der Karte
                  angezeigten Luftmessstationen so ausdünnen, dass nur die für
                  Sie interessanten Stationen übrig bleiben. Standardmäßig sind
                  die Einstellungen hier so gesetzt, dass alle verfügbaren
                  Luftmessstationen angezeigt werden.
                </p>
                <p>
                  Mit den Optionsgruppen &quot;
                  <strong>aktive Messstationen</strong>&quot; und &quot;
                  <strong>inaktive Messstationen</strong>&quot; können Sie die
                  Kartenanzeige auf Luftmessstationen beschränken, die im
                  letzten verfügbaren Messzeitraum NO₂-Messwerte lieferten (ggf.
                  kann ein temporärer Messausfall vorliegen) oder bei denen es
                  sich um abmontierte Stationen handelt (ggf. werden in der
                  Vergangenheit erfasste Messwerte im Datenblatt präsentiert).
                  Die Unterteilung (Klassifizierung) der Stationen in der
                  Optionsgruppe &quot;<strong>aktive Messstationen</strong>
                  &quot; wird anhand des NO₂-Messwertes vorgenommen: unauffällig
                  grün (≦ 35 µg/m³), auffällig gelb (&gt; 35 µg/m³), warnend rot
                  (&gt; 40 µg/m³); temporärer Ausfall türkis (siehe auch
                  Abschnitt{" "}
                  <Link
                    to={"Hintergrund"}
                    containerId={"myMenu"}
                    style={{ cursor: "pointer", color: "#4688F7" }}
                  >
                    Hintergrund
                  </Link>
                  ) .
                </p>
                <p>
                  Ihre Einstellungen werden direkt in der blauen Titelzeile des
                  Bereichs &quot;
                  <strong>Messstationen der Luftqualität</strong>&quot; und in
                  dem Donut-Diagramm, das Sie rechts neben oder unter den
                  Filteroptionen finden, ausgewertet. Die Titelzeile zeigt die
                  Gesamtanzahl der Luftmessstationen, die den von Ihnen
                  gesetzten Filterbedingungen entsprechen. Das Donut-Diagramm
                  zeigt zusätzlich die Verteilung der klassifizierten
                  Luftmessstationen (unauffällige, auffällige, warnende
                  Stationen; Stationen mit Messausfall; abmontierte Stationen).
                  Bewegen Sie dazu den Mauszeiger auf eines der farbigen
                  Segmente des Diagramms.
                </p>
              </div>
            ),
          },
        },
        {
          title: "Einstellungen",
          bsStyle: "info",
          contentBlockConf: {
            type: "EINSTELLUNGEN",
          },
        },
      ],
    },
  ];
  return (
    <CustomizationContextProvider
      customizations={{
        inKartePositionieren: {
          listWithSymbols: (
            <p>
              Durch das in der Auswahlliste vorangestellte Symbol erkennen Sie,
              ob es sich bei einem Treffer um einen{" "}
              <NW>
                <Icon name="circle" /> Stadtbezirk
              </NW>
              , ein{" "}
              <NW>
                <Icon name="pie-chart" /> Quartier
              </NW>
              , eine{" "}
              <NW>
                <Icon name="home" /> Adresse
              </NW>
              , eine{" "}
              <NW>
                <Icon name="road" /> Straße ohne Hausnummern
              </NW>
              , einen{" "}
              <NW>
                <Icon name="tag" /> POI
              </NW>
              , die{" "}
              <NW>
                <Icon name="tags" /> alternative Bezeichnung eines POI
              </NW>
              , eine{" "}
              <NW>
                <Icon name="child" /> Kindertageseinrichtung
              </NW>
              , eine{" "}
              <NW>
                <Icon name="graduation-cap" /> Schule
              </NW>{" "}
              oder eine{" "}
              <NW>
                <Icon name="cloudscale" /> Luftmessstation
              </NW>{" "}
              handelt.
            </p>
          ),
        },
      }}
    >
      <ModalApplicationMenu
        menuIcon={"bars"}
        menuTitle={<MenuTitle />}
        menuFooter={
          <Footer
            version={getApplicationVersion(versionData)}
            setAppMenuActiveMenuSection={setAppMenuActiveMenuSection}
          />
        }
        menuIntroduction={
          <MenuIntroduction
            setAppMenuActiveMenuSection={setAppMenuActiveMenuSection}
          />
        }
        menuSections={[
          <Section
            key="filter"
            sectionKey="filter"
            sectionTitle={getFilterHeader(
              filteredItems?.length,
              shownFeatures?.length,
            )}
            sectionBsStyle={FilterStyle}
            sectionContent={
              <div>
                {/* <div>
                  Die Filterung bezieht sich auf die Angaben zu einer Messstation im letzten
                  Kalendermonat (letzte monatliche Datenerhebung). Wenn Sie weitergehende
                  Informationen wünschen, können Sie eine Auswahl von Messwerten/Jahresmittelwerten
                  im Datenblatt einer Messstation einsehen oder vollständigen Datenzugriff im
                  Open-Data-Portal der Stadt Wuppertal erhalten. Die entsprechenden Links finden Sie
                  im Abschnitt <a className='renderWithoutHref'>Datengrundlage</a> im Abschnitt
                  Kompaktanleitung.
                </div> */}
                <FilterPanel filterConfiguration={filterConfiguration} />
                <div>
                  Die Filterung bezieht sich auf die Angaben zu einer
                  Messstation im letzten Kalendermonat (letzte monatliche
                  Datenerhebung). Wenn Sie weitergehende Informationen wünschen,
                  können Sie eine Auswahl von Messwerten/Jahresmittelwerten im
                  Datenblatt einer Messstation einsehen oder vollständigen
                  Datenzugriff im Open-Data-Portal der Stadt Wuppertal erhalten.
                  Die entsprechenden Links finden Sie im Abschnitt{" "}
                  <a
                    className="renderWithoutHref"
                    onClick={() => setAppMenuActiveMenuSection("help")}
                  >
                    Datengrundlage
                  </a>{" "}
                  im Abschnitt Kompaktanleitung.
                </div>
              </div>
            }
          />,
          <DefaultSettingsPanel
            previewMapPosition="lat=51.2607860760692&lng=7.164304562911684&title&zoom=9"
            previewMapClusteringOptions={undefined}
            key="settings"
          />,
          <KompaktanleitungSection />,
          <GenericDigitalTwinReferenceSection />,
        ]}
      />
    </CustomizationContextProvider>
  );
};
export default MyMenu;
const NW = (props) => {
  return <span style={{ whiteSpace: "nowrap" }}>{props.children}</span>;
};
