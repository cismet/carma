import { useContext } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import {
  KompaktanleitungSection,
  MenuTitle,
  MenuIntroduction,
  Footer,
} from "@carma-collab/wuppertal/stadtplan";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { PreviewLibreMap } from "@carma-mapping/engines/maplibre";

const Menu = () => {
  const { setAppMenuActiveMenuSection } =
    useContext<typeof UIDispatchContext>(UIDispatchContext);

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
          <DefaultSettingsPanel
            key="settings"
            getSymbolSVG={(size, color) => {
              return (
                <img
                  width={size}
                  src={
                    "https://wupp-digitaltwin-assets.cismet.de/v2/poi-signaturen/Icon_Parkanlage_farbig.svg"
                  }
                  style={color ? { filter: `drop-shadow(0 0 0 ${color})` } : {}}
                  alt="symbol"
                />
              );
            }}
            overridingMapPreview={<PreviewLibreMap />}
          />,
          <KompaktanleitungSection />,
          <GenericDigitalTwinReferenceSection />,
        ]}
      />
    </CustomizationContextProvider>
  );
};
export default Menu;
