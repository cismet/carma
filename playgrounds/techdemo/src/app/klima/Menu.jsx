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
import MenuFooter from "./MenuFooter";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";

import Icon from "react-cismap/commons/Icon";
import { addSVGToProps } from "react-cismap/tools/svgHelper";

export const getFilterInfo = (items) => {
  let kategorien = [];
  const katValues = [];
  let themen = [];
  const themenValues = [];

  for (const item of items || []) {
    for (const kat of item.kategorien) {
      if (!kategorien.includes(kat)) {
        katValues.push({ key: kat });
        kategorien.push(kat);
      }
    }
    if (!themen.includes(item.thema.id)) {
      themen.push(item.thema.id);
      themenValues.push({ key: item.thema.id, title: item.thema.name, color: item.thema.farbe });
    }
  }

  themenValues.sort((a, b) => a.title.localeCompare(b.title));
  katValues.sort((a, b) => a.key.localeCompare(b.key));

  themen = [];

  for (const t of themenValues) {
    themen.push(t.key);
  }
  kategorien = [];

  for (const k of katValues) {
    kategorien.push(k.key);
  }
  return { kategorien, katValues, themen, themenValues };
};

const MyMenu = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  const { filterState, filterMode, filteredItems, shownFeatures } =
    useContext(FeatureCollectionContext);
  const { setFilterState, setFilterMode } = useContext(FeatureCollectionDispatchContext);

  const { items } = useContext(FeatureCollectionContext);

  const { kategorien, katValues, themen, themenValues } = getFilterInfo(items);

  const filterConfiguration = {
    mode: "tabs", // list or tabs
    filters: [
      {
        title: "Themen",
        key: "themen",
        icon: "folder",
        type: "tags", //"checkBoxes",
        values: themenValues,
        setAll: () => {
          setFilterState({ ...filterState, themen });
        },
        setNone: () => {
          setFilterState({ ...filterState, themen: [] });
        },
        colorizer: (item, selected) => (selected ? item.color : "#eeeeee"),
      },
      {
        title: "Kategorien",
        key: "kategorien",
        icon: "tags",
        type: "tags",
        values: katValues,
        setAll: () => {
          setFilterState({ ...filterState, kategorien });
        },
        setNone: () => {
          setFilterState({ ...filterState, kategorien: [] });
        },
      },
    ],
  };

  if ((filterState === undefined) & (items !== undefined)) {
    setFilterState({ kategorien, themen });
  }
  if ((filterMode === undefined) & (items !== undefined)) {
    setFilterMode("themen");
  }
  const topicMapTitle = "Hintergrund";
  const simpleHelp = {
    content: `Die Möglichkeiten zum Klima- und Umweltschutz werden aktuell global diskutiert, wobei bereits 
              auf kommunaler Ebene viele Akteure und Einrichtungen an deren Umsetzung beteiligt sind. 
              An diesen "Klimaorten" wird das Thema Klimaschutz praktiziert und vermittelt; hier wird der 
              Klimaschutz für die Bürger\\*innen erlebbar. Viele dieser Klimaorte sind im Rahmen von innovativen 
              Projekten durch den Wissenstransfer und das Engagement von Unternehmen, Vereinen, Verbänden sowie 
              Quartiersbewohner\\*innen entstanden, die sich aktiv für Lösungen zum Klima- und Umweltschutz in ihrem 
              Quartier und für die Stadt Wuppertal einsetzen. Zu den zielführenden Projekten gehören z.B. Wuppertals 
              Klimasiedlungen, Anlagen zur effizienten und/oder regenerativen Energieerzeugung, Projekte der Verkehrswende 
              sowie der Klima- und Umweltbildung, an denen zahlreiche Akteure mitwirken und mitgestalten.`,
  };

  const getFilterHeader = () => {
    const count = filteredItems?.length || 0;

    let term;
    if (count === 1) {
      term = "Standort";
    } else {
      term = "Standorte";
    }

    return `Meine Klimaorte (${count} ${term} gefunden, davon ${
      shownFeatures?.length || "0"
    } in der Karte)`;
  };
  const configurableDocBlocks = getSimpleHelpForTM(topicMapTitle, simpleHelp);
  configurableDocBlocks[0].configs.splice(6, 0, {
    title: "Filtern",
    bsStyle: "warning",
    contentBlockConf: {
      type: "REACTCOMP",
      content: (
        <div>
          <p>
            Im Bereich &quot;<strong>Meine Klimaorte</strong>&quot; können Sie im Anwendungsmenü{" "}
            <Icon name='bars' /> die in der Karte angezeigten Klimaorte so ausdünnen, dass nur die
            für Sie interessanten Orte übrig bleiben. Dabei umfasst die Filterung die Angebote an
            den Klimastandorten, wobei sich ein Angebot aus einem Thema und einer Kategorie ergibt.
            Standardmäßig sind die Einstellungen hier so gesetzt, dass alle verfügbaren Klimaorte
            angezeigt werden.
          </p>
          <p>
            Ihnen stehen somit zwei Filterkriterien zur Verfügung: "Themen" und "Kategorien".
            Innerhalb dieser Kriterien können sie in einer alphabetisch sortieren Menge an
            Schlagworten (Tags) bestimmte Begriffe per Mausklick selektieren bzw. deselektieren; die
            Auswahl aller bzw. keines der Schlagworte erfolgt über die Schaltfläche{" "}
            <a className='renderAsLink'>alle</a> bzw. <a className='renderAsLink'>keine</a>.
          </p>
          <p>
            Ihre Einstellungen werden direkt in der blauen Titelzeile des Bereichs "
            <strong>Meine Klimaorte</strong>" und in dem Donut-Diagramm, das Sie rechts neben oder
            unter den Filteroptionen finden, ausgewertet. Die Titelzeile zeigt die Gesamtanzahl der
            Klimaorte, die den von Ihnen gesetzten Filterbedingungen entsprechen. Das Donut-Diagramm
            zeigt zusätzlich die Verteilung der Klimaorte entsprechend der Filterkriterien "Themen"
            oder "Kategorien". Bewegen Sie dazu den Mauszeiger auf eines der farbigen Segmente des
            Diagramms. Die Farben des Donut-Diagramms entsprechen den farbigen Hintergründen der
            Schlagworte aus dem Filterkriterium "Themen".
          </p>
        </div>
      ),
    },
  });

  return (
    <CustomizationContextProvider
      customizations={{
        inKartePositionieren: {
          listWithSymbols: (
            <p>
              Durch das in der Auswahlliste vorangestellte Symbol erkennen Sie, ob es sich bei einem
              Treffer um einen{" "}
              <NW>
                <Icon name='circle' /> Stadtbezirk
              </NW>
              , ein{" "}
              <NW>
                <Icon name='pie-chart' /> Quartier
              </NW>
              , eine{" "}
              <NW>
                <Icon name='home' /> Adresse
              </NW>
              , eine{" "}
              <NW>
                <Icon name='road' /> Straße ohne Hausnummern
              </NW>
              , eine{" "}
              <NW>
                <Icon name='child' /> Kindertageseinrichtung
              </NW>
              , eine{" "}
              <NW>
                <Icon name='graduation-cap' /> Schule
              </NW>{" "}
              oder einen{" "}
              <NW>
                <Icon name='sun' /> Klimaort
              </NW>{" "}
              handelt.
            </p>
          ),
        },
        fachobjekteAuswaehlen: {
          furtherExplanationOfClickableContent: " (Signaturen oder dunkelblaue Fahrradtrassen)",
        },
        hintergrund: {
          additionalDatasources: (
            <div>
              <ul>
                <li>
                  <strong>Fernwärme</strong>: Kartendienst (WMS) der Stadt Wuppertal in
                  Zusammenarbeit mit der{" "}
                  <a
                    target='_wsw'
                    href='https://www.wsw-online.de/wsw-energie-wasser/privatkunden/produkte/fernwaerme/talwaerme-wuppertal/'
                  >
                    WSW GmbH
                  </a>
                  . Datengrundlage: Fernwärmeleitungen der Wuppertaler Stadtwerke GmbH (Stand
                  02.2021) mit einer Puffergröße von 10 m. ©{" "}
                  <a target='_wsw' href='https://www.wsw-online.de/impressum/'>
                    Wuppertaler Stadtwerke GmbH
                  </a>
                  .
                </li>
              </ul>
              <div>
                Zusätzlich stellt die Klimaortkarte Wuppertal die Daten der{" "}
                <a
                  target='_opendata'
                  href='https://offenedaten-wuppertal.de/dataset/klimaorte-wuppertal'
                >
                  Klimaorte
                </a>{" "}
                und eine Auswahl der{" "}
                <a
                  target='_opendata'
                  href='https://offenedaten-wuppertal.de/dataset/radrouten-wuppertal'
                >
                  Radrouten
                </a>{" "}
                (mit 1,5 Meter Puffer) aus dem Open-Data-Angebot der Stadt Wuppertal dar.
              </div>
            </div>
          ),
        },
      }}
    >
      <ModalApplicationMenu
        menuIcon={"bars"}
        menuTitle={"Meine Klimaorte, Einstellungen und Kompaktanleitung"}
        menuFooter={<MenuFooter />}
        menuIntroduction={
          <span>
            Benutzen Sie die Auswahlmöglichkeiten unter{" "}
            <Link
              className='useAClassNameToRenderProperLink'
              to='filter'
              containerId='myMenu'
              smooth={true}
              delay={100}
              onClick={() => setAppMenuActiveMenuSection("filter")}
            >
              Meine Klimaorte
            </Link>
            , um die in der Karte angezeigten vorbildlichen Klimaorte auf die für Sie relevanten
            Themen zu beschränken. Über{" "}
            <Link
              className='useAClassNameToRenderProperLink'
              to='settings'
              containerId='myMenu'
              smooth={true}
              delay={100}
              onClick={() => setAppMenuActiveMenuSection("settings")}
            >
              Einstellungen
            </Link>{" "}
            können Sie die Darstellung der Hintergrundkarte und der klimarelevanten Themen an Ihre
            Interesse anpassen. Wählen Sie die{" "}
            <Link
              className='useAClassNameToRenderProperLink'
              to='help'
              containerId='myMenu'
              smooth={true}
              delay={100}
              onClick={() => setAppMenuActiveMenuSection("help")}
            >
              Kompaktanleitung
            </Link>{" "}
            für detailliertere Bedienungsinformationen.
          </span>
        }
        menuSections={[
          <Section
            key='filter'
            sectionKey='filter'
            sectionTitle={getFilterHeader()}
            sectionBsStyle='primary'
            sectionContent={<FilterPanel filterConfiguration={filterConfiguration} />}
          />,
          <DefaultSettingsPanel key='settings' />,
          <Section
            key='help'
            sectionKey='help'
            sectionTitle='Kompaktanleitung'
            sectionBsStyle='default'
            sectionContent={<ConfigurableDocBlocks configs={configurableDocBlocks} />}
          />,
        ]}
      />
    </CustomizationContextProvider>
  );
};
export default MyMenu;
const NW = (props) => {
  return <span style={{ whiteSpace: "nowrap" }}>{props.children}</span>;
};
