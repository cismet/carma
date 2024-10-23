import React, { useContext } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { Link } from "react-scroll";
import { getBadSVG } from "./helper/helper";
import { getColorForProperties } from "./helper/styler";
import {
  KompaktanleitungSection,
  Footer,
  MenuIntroduction,
} from "@carma-collab/wuppertal/baederkarte";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";

const Menu = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  const helpSVGSize = 18;
  const hallenBadSVG = getBadSVG(
    helpSVGSize,
    "#565B5E",
    "Hallenbad",
    "helpTextSVG0",
  );
  const freibadBadSVG = getBadSVG(
    helpSVGSize,
    "#565B5E",
    "Freibad",
    "helpTextSVG1",
  );

  const staedtischesFreibadSVG = getBadSVG(
    helpSVGSize,
    "#1A4860",
    "Freibad",
    "helpTextSVG2",
  );
  const oeffentlichesVereinsbadSVG = getBadSVG(
    helpSVGSize,
    getColorForProperties({
      more: { zugang: "öffentlich", betreiber: "Verein" },
      mainlocationtype: { lebenslagen: ["Freizeit", "Sport"] },
    }),
    "Freibad",
    "helpTextSVG3",
  );
  const nichtOeffentlichesVereinsbadSVG = getBadSVG(
    helpSVGSize,
    getColorForProperties({
      more: { zugang: "nicht öffentlich", betreiber: "Verein" },
      mainlocationtype: { lebenslagen: ["Freizeit", "Sport"] },
    }),
    "Freibad",
    "helpTextSVG4",
  );

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
          <DefaultSettingsPanel key="settings" />,
          <KompaktanleitungSection
            hallenBadSVG={hallenBadSVG}
            freibadBadSVG={freibadBadSVG}
            staedtischesFreibadSVG={staedtischesFreibadSVG}
            oeffentlichesVereinsbadSVG={oeffentlichesVereinsbadSVG}
            nichtOeffentlichesVereinsbadSVG={nichtOeffentlichesVereinsbadSVG}
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
