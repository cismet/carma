import { useContext } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import FilterUI from "./Menu/FilterUI";
import { getFilterHeader, FilterStyle } from "@carma-collab/wuppertal/e-bikes";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import { MenuFooter } from "@carma-collab/wuppertal/commons";
import ConfigurableDocBlocks from "react-cismap/topicmaps/ConfigurableDocBlocks";
// @ts-ignore
import { getSimpleHelpForTM } from "react-cismap/tools/uiHelper";

let simpleHelp = "";

const Menu = () => {
  const { filteredItems, shownFeatures } = useContext<
    typeof FeatureCollectionContext
  >(FeatureCollectionContext);
  const { setAppMenuActiveMenuSection } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);
  // const getFilterHeader = () => {
  //   const count = filteredItems?.length || 0;

  //   let term;
  //   if (count === 1) {
  //     term = "Angebot";
  //   } else {
  //     term = "Angebote";
  //   }

  //   return `Filter (${count} ${term} gefunden, davon ${
  //     shownFeatures?.length || "0"
  //   } in der Karte)`;
  // };

  return (
    <CustomizationContextProvider customizations={{}}>
      <ModalApplicationMenu
        menuIcon={"bars"}
        // menuTitle={<MenuTitle />}
        menuFooter={
          <MenuFooter
            title="Vorhabenkarte Wuppertal"
            version={"0.0.1"}
            skipHintergrundkarten={false}
          />
        }
        menuIntroduction={
          <div>
            Über Einstellungen können Sie die Darstellung der Hintergrundkarte
            und der Objekte an Ihre Vorlieben anpassen. Wählen Sie
            Kompaktanleitung für detailliertere Bedienungsinformationen.
          </div>
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
            sectionContent={<FilterUI />}
          />,
          <DefaultSettingsPanel
            key="settings"
            // checkBoxSettingsSectionTitle="Einstellungen"
            checkBoxTextClustering="Vorhaben maßstabsabhängig zusammenfassen"
          />,
          <Section
            key="help"
            sectionKey="HelpSection"
            sectionTitle="Kompaktanleitung"
            sectionBsStyle="default"
            sectionContent={
              <ConfigurableDocBlocks
                configs={getSimpleHelpForTM(
                  "Vorhabenkarte Wuppertal",
                  simpleHelp
                )}
              />
            }
          />,
          <GenericDigitalTwinReferenceSection />,
        ]}
      />
    </CustomizationContextProvider>
  );
};

export default Menu;
