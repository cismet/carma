import { useContext } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import {
  KompaktanleitungSection,
  Footer,
  MenuIntroduction,
} from "@carma-collab/wuppertal/tz-baumbewirtschaftung";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";

const Menu = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  return (
    <CustomizationContextProvider customizations={{}}>
      <ModalApplicationMenu
        menuIcon={"bars"}
        menuTitle={"Einstellungen und Kompaktanleitung"}
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
            skipClusteringSettings={true}
            getSymbolSVG={previewSVG}
          />,
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
