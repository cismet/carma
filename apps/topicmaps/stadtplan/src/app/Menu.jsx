import React, { useContext } from "react";
import Icon from "react-cismap/commons/Icon";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { addSVGToProps } from "react-cismap/tools/svgHelper";
import { getSimpleHelpForTM } from "react-cismap/tools/uiHelper";
import ConfigurableDocBlocks from "react-cismap/topicmaps/ConfigurableDocBlocks";
import Einstellungen from "react-cismap/topicmaps/docBlocks/Einstellungen";
import GenericHelpTextForMyLocation from "react-cismap/topicmaps/docBlocks/GenericHelpTextForMyLocation";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import FilterPanel from "react-cismap/topicmaps/menu/FilterPanel";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import LicenseLuftbildkarte from "react-cismap/topicmaps/wuppertal/LicenseLuftbildkarte";
import LicenseStadtplanTagNacht from "react-cismap/topicmaps/wuppertal/LicenseStadtplanTagNacht";
import { Link } from "react-scroll";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import FilterUI from "./FilterUI";
import {
  KompaktanleitungSection,
  MenuTitle,
  MenuIntroduction,
  Footer,
} from "@carma-collab/wuppertal/stadtplan";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";

const apps = [
  {
    on: ["Kinderbetreuung"],
    name: "Kita-Finder",
    bsStyle: "success",
    backgroundColor: null,
    link: "/#/kitas",
    target: "_kitas",
  },
  {
    on: ["Sport", "Freizeit"],
    name: "Bäderkarte",
    bsStyle: "primary",
    backgroundColor: null,
    link: "/#/baeder",
    target: "_baeder",
  },
  {
    on: ["Kultur"],
    name: "Kulturstadtplan",
    bsStyle: "warning",
    backgroundColor: null,
    link: "/#/kulturstadtplan",
    target: "_kulturstadtplan",
  },
  {
    on: ["Mobilität"],
    name: "Park+Ride-Karte",
    bsStyle: "warning",
    backgroundColor: "#62B7D5",
    link: "/#/xandride",
    target: "_xandride",
  },

  {
    on: ["Mobilität"],
    name: "E-Auto-Ladestationskarte",
    bsStyle: "warning",
    backgroundColor: "#003E7A",
    link: "/#/elektromobilitaet",
    target: "_elektromobilitaet",
  },
  {
    on: ["Mobilität"],
    name: "E-Fahrrad-Karte",
    bsStyle: "warning",
    backgroundColor: "#326C88", //'#15A44C', //'#EC7529',
    link: "/#ebikes",
    target: "_ebikes",
  },
  // {
  //   on: ['Gesundheit'],
  //   name: 'Corona-Präventionskarte',
  //   bsStyle: 'warning',
  //   backgroundColor: '#BD000E', //'#15A44C', //'#EC7529',
  //   link: 'https://topicmaps-wuppertal.github.io/corona-praevention/#/?title',
  //   target: '_corona',
  // },

  // {   on: ["Sport"],   name: "Sporthallen",   bsStyle: "default",
  // backgroundColor: null,   link: "/#/ehrenamt",   target: "_hallen" }
];

const getDefaultFilterConfiguration = (lebenslagen) => {
  const positiv = [...lebenslagen];
  const negativ = [];
  return { positiv, negativ };
};

const Menu = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  const {
    filterState,
    filterMode,
    filteredItems,
    shownFeatures,
    itemsDictionary,
  } = useContext(FeatureCollectionContext);
  const { setFilterState, setFilterMode } = useContext(
    FeatureCollectionDispatchContext,
  );

  const { items } = useContext(FeatureCollectionContext);

  if ((filterState === undefined) & (items !== undefined)) {
    setFilterState(getDefaultFilterConfiguration(itemsDictionary.lebenslagen));
  }
  //   if ((filterMode === undefined) & (items !== undefined)) {
  //     setFilterMode(defaultFilterMode;
  //   }
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
      term = "POI";
    } else {
      term = "POIs";
    }

    return `Mein Themenstadtplan (${count} ${term} gefunden, davon ${
      shownFeatures?.length || "0"
    } in der Karte)`;
  };

  return (
    <CustomizationContextProvider customizations={{}}>
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
            sectionTitle={getFilterHeader()}
            sectionBsStyle="primary"
            sectionContent={<FilterUI />}
          />,
          <DefaultSettingsPanel key="settings" />,
          <KompaktanleitungSection />,
          <GenericDigitalTwinReferenceSection />,
        ]}
      />
    </CustomizationContextProvider>
  );
};
export default Menu;
const NW = (props) => {
  return <span style={{ whiteSpace: "nowrap" }}>{props.children}</span>;
};
