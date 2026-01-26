import { useContext } from "react";
import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import { UIDispatchContext } from "react-cismap/contexts/UIContextProvider";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import Section from "react-cismap/topicmaps/menu/Section";
import {
  KompaktanleitungSection,
  Footer,
  MenuIntroduction,
} from "@carma-collab/wuppertal/tz-baumbewirtschaftung";
import { GenericDigitalTwinReferenceSection } from "@carma-collab/wuppertal/commons";
import versionData from "../version.json";
import { getApplicationVersion } from "@carma-commons/utils";
import { TaskPanel } from "@carma-providers/syncing";
import { Form } from "react-bootstrap";
import { useDisplayModes } from "./App";

const Menu = () => {
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);
  const { followMode, setFollowMode, crossHair, setCrossHair } =
    useDisplayModes();

  const previewSVG = (size) => {
    const _size = size * 1.3;
    return (
      <svg width={_size} height={_size} viewBox="0 0 24 24">
        <circle
          cx="12"
          cy="12"
          r="8"
          fill="#4CAF50"
          stroke="#2E7D32"
          strokeWidth="3"
          opacity="0.8"
        />
      </svg>
    );
  };
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
            sparseSettingsSectionsExtensions={[
              ,
              <Form key="display-modes">
                <label
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    marginBottom: "5px",
                    fontWeight: 700,
                  }}
                >
                  Anzeigemodi
                </label>
                <br />
                <Form.Check
                  type="checkbox"
                  id="checkbox_followMode"
                  checked={followMode}
                  onChange={() => setFollowMode(!followMode)}
                  label="Follow-Modus (Karte folgt neuen Aktionen)"
                />
                <Form.Check
                  type="checkbox"
                  id="checkbox_crossHair"
                  checked={crossHair}
                  onChange={() => setCrossHair(!crossHair)}
                  label="Fadenkreuz bei Auswahl anzeigen"
                />
              </Form>,
            ]}
          />,
          <Section
            key="tasks"
            sectionKey="tasks"
            sectionTitle="Aktionen"
            sectionBsStyle="warning"
            sectionContent={<TaskPanel />}
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
