import React, { useContext, useMemo } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";

// import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
// import Section from "react-cismap/topicmaps/menu/Section";
// import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import FilterUI from "./FilterUI";
import { getSymbolSVG } from "./helper/helper";
import {
  KompaktanleitungSection,
  MenuIntroduction,
  Footer,
  getFilterHeader,
  FilterStyle,
} from "@carma-collab/wuppertal/e-auto-ladestation";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import {
  DefaultSettingsPanel,
  FeatureCollectionContext,
  FeatureCollectionDispatchContext,
  ModalApplicationMenu,
  Section,
  UIDispatchContext,
} from "@carma-apps/portals";

const Menu = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  const { filteredItems, shownFeatures, filterState, itemsDictionary } =
    useContext(FeatureCollectionContext);
  const { setFilterState } = useContext(FeatureCollectionDispatchContext);

  const onlineSVG = getSymbolSVG(24, "#003B80", "pr", "onlineSVGinHELP");
  const offlineSVG = getSymbolSVG(24, "#888A87", "pr", "offlineSVGinHELP");

  // const getFilterHeader = () => {
  //   const count = filteredItems?.length || 0;

  //   let term;
  //   if (count === 1) {
  //     term = "Ladestation";
  //   } else {
  //     term = "Ladestationen";
  //   }

  //   return `Filter (${count} ${term} gefunden, davon ${
  //     shownFeatures?.length || "0"
  //   } in der Karte)`;
  // };

  const steckertypes = useMemo(
    () => itemsDictionary?.steckerverbindungen || [],
    [itemsDictionary]
  );

  return (
    <CustomizationContextProvider customizations={{}}>
      <ModalApplicationMenu
        menuIcon={"bars"}
        menuTitle={"Filter, Einstellungen und Kompaktanleitung"}
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
              shownFeatures?.length
            )}
            sectionBsStyle={FilterStyle}
            sectionContent={
              <FilterUI
                filter={filterState}
                setFilter={setFilterState}
                steckertypes={steckertypes}
              />
            }
          />,
          <DefaultSettingsPanel
            key="settings"
            checkBoxSettingsSectionTitle="Ladestation-Einstellungen"
            checkBoxTextClustering="Ladestationen maßstabsabhängig zusammenfassen"
          />,
          <KompaktanleitungSection
            onlineSVG={onlineSVG}
            offlineSVG={offlineSVG}
          />,
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
