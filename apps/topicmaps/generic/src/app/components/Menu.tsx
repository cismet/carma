import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";

import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import Section from "react-cismap/topicmaps/menu/Section";
import ConfigurableDocBlocks from "react-cismap/topicmaps/ConfigurableDocBlocks";
import {
  Datengrundlage,
  Einstellungen,
  FachobjekteAuswaehlenUndAbfragen,
  GenericHelpTextForMyLocation,
  InKartePositionieren,
  KartendarstellungDerFachobjekte,
  GTMComponentDictionary,
} from "@carma-collab/wuppertal/generic-topicmap";
import GenericMenuIntroduction from "react-cismap/topicmaps/menu/Introduction";

interface MenuProps {
  menuTitle: string;
  checkBoxSettingsSectionTitle: any;
  skipClusteringSettings: boolean;
  skipSymbolsizeSetting: boolean;
  simpleHelp: any;
  previewMapPosition: any;
  previewFeatureCollectionCount: number;
  introductionMarkdown: string;
  menuIcon: string;
  menuFooter: any;
  introductionTerm?: string;
  sections: React.ReactNode[];
  layerHelpBlocks: any;
}

const Menu = (props: MenuProps) => {
  const {
    menuTitle = "Einstellungen und Kompaktanleitung",
    checkBoxSettingsSectionTitle,
    skipClusteringSettings,
    skipSymbolsizeSetting,
    simpleHelp,
    previewMapPosition,
    previewFeatureCollectionCount,
    introductionMarkdown,
    menuIcon = "bars",
    menuFooter,
    introductionTerm = "der Objekte",
    sections,
    layerHelpBlocks,
  } = props;
  console.log("xxx simpleHelp", simpleHelp);

  return (
    <CustomizationContextProvider customizations={{}}>
      <ModalApplicationMenu
        menuIcon={menuIcon}
        menuTitle={menuTitle}
        menuFooter={menuFooter}
        menuIntroduction={
          <GenericMenuIntroduction
            markdown={
              introductionMarkdown ||
              `Über **Einstellungen** können Sie die Darstellung der
             Hintergrundkarte und ${introductionTerm} an Ihre 
             Vorlieben anpassen. Wählen Sie **Kompaktanleitung** 
             für detailliertere Bedienungsinformationen.`
            }
          />
        }
        menuSections={[
          <DefaultSettingsPanel key="settings" {...props} />,
          <Section
            key="help"
            sectionKey="HelpSection"
            sectionTitle="Kompaktanleitung"
            sectionBsStyle="default"
            sectionContent={
              <ConfigurableDocBlocks
                configs={[
                  {
                    type: "FAQS",
                    configs: [
                      {
                        title: "Datengrundlage",
                        bsStyle: "secondary",
                        contentBlockConf: {
                          type: "REACTCOMP",
                          content: <Datengrundlage />,
                        },
                      },
                      simpleHelp && {
                        title: "Hintergrund",
                        bsStyle: "secondary",
                        contentBlockConf: simpleHelp,
                      },

                      ...(layerHelpBlocks || []),

                      {
                        title: "Fachobjekte auswählen und abfragen",
                        bsStyle: "success",
                        contentBlockConf: {
                          type: "REACTCOMP",
                          content: <FachobjekteAuswaehlenUndAbfragen />,
                        },
                      },
                      {
                        title: "Kartendarstellung der Fachobjekte",
                        bsStyle: "success",
                        contentBlockConf: {
                          type: "REACTCOMP",
                          content: <KartendarstellungDerFachobjekte />,
                        },
                      },
                      {
                        title: "In Karte positionieren",
                        bsStyle: "warning",
                        contentBlockConf: {
                          type: "REACTCOMP",
                          content: <InKartePositionieren />,
                        },
                      },
                      {
                        title: "Mein Standort",
                        bsStyle: "warning",
                        contentBlockConf: {
                          type: "REACTCOMP",
                          content: <GenericHelpTextForMyLocation />,
                        },
                      },
                      {
                        title: "Einstellungen",
                        bsStyle: "info",
                        contentBlockConf: {
                          type: "REACTCOMP",
                          content: <Einstellungen />,
                        },
                      },
                    ].filter(Boolean), // Filter out any falsy values (inn that case the simpleHelp if it is not set)
                  },
                ]}
              />
            }
          />,
          ...sections,
        ]}
      />
    </CustomizationContextProvider>
  );
};

export default Menu;
