import { useContext } from "react";
import {
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
} from "react-cismap/contexts/FeatureCollectionContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import ConfigurableDocBlocks from "react-cismap/topicmaps/ConfigurableDocBlocks";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import FilterPanel from "react-cismap/topicmaps/menu/FilterPanel";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import {
  MenuTitle,
  MenuIntroduction,
  KompaktanleitungSection,
  Footer,
  getFilterHeader,
  FilterStyle,
} from "@carma-collab/wuppertal/potenzialflaechen-online";
import { GenericDigitalTwinReferenceTextComponent } from "@carma-collab/wuppertal/commons";
import versionData from "../../version.json";
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

  let kampagnen = [];
  const kampagnenValues = [];

  for (const item of items || []) {
    if (!kampagnen.includes(item.kampagne.bezeichnung)) {
      kampagnen.push(item.kampagne.bezeichnung);
      kampagnenValues.push({
        key: item.kampagne.bezeichnung,
        title: item.kampagne.bezeichnung,
        color: item.kampagne.color,
        icon: "square",
        iconPos: "pre",
        order: item.kampagne.order_by,
      });
    }
  }
  kampagnenValues.sort((a, b) => {
    return parseInt(a.order) - parseInt(b.order);
  });

  //delte and add sorted kamapgnen again
  kampagnen = [];
  for (const kampagnenvalue of kampagnenValues) {
    kampagnen.push(kampagnenvalue.key);
  }
  const filterConfiguration = {
    mode: "list", // list or tabs
    resetedFilter: {
      kampagnen,
    },
    filters: [
      {
        title: "Kategorien",
        key: "kampagnen",
        icon: "layer-group",
        type: "checkBoxes", //"tags" or "checkBoxes",
        values: kampagnenValues,
        setAll: () => {
          setFilterState({ ...filterState, kampagnen });
        },
        setNone: () => {
          setFilterState({ ...filterState, kampagnen: [] });
        },
        // colorizer: (item, selected) => {
        //   console.log("yyy colorizer item", item);

        //   return selected ? item.kampagne.color : "#ee00ee";
        // },
      },
    ],
  };

  if (filterState === undefined && items !== undefined && items.length !== 0) {
    setFilterState({ kampagnen });
  }
  if (filterMode === undefined && items !== undefined) {
    setFilterMode("kampagnen");
  }

  // const getFilterHeader = () => {
  //   const count = filteredItems?.length || 0;

  //   let term;
  //   if (count === 1) {
  //     term = "Fläche";
  //   } else {
  //     term = "Flächen";
  //   }

  //   return `Meine Potenzialflächen (${count} ${term} gefunden, davon ${
  //     shownFeatures?.length || "0"
  //   } in der Karte)`;
  // };

  return (
    <ModalApplicationMenu
      menuIcon={"bars"}
      menuTitle={<MenuTitle />}
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
            <FilterPanel filterConfiguration={filterConfiguration} />
          }
        />,
        <DefaultSettingsPanel
          key="settings"
          skipFilterTitleSettings={true}
          skipClusteringSettings={true}
          skipSymbolsizeSetting={true}
        />,
        <KompaktanleitungSection />,
        <Section
          key="digiTal"
          sectionKey="digiTal"
          sectionTitle={"DigiTal Zwilling"}
          sectionBsStyle="warning"
          sectionContent={<GenericDigitalTwinReferenceTextComponent />}
        ></Section>,
      ]}
      menuFooter={
        <Footer
          version={getApplicationVersion(versionData)}
          setAppMenuActiveMenuSection={setAppMenuActiveMenuSection}
        />
      }
    />
  );
};
export default MyMenu;
