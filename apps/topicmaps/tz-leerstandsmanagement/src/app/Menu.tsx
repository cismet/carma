import CustomizationContextProvider from "react-cismap/contexts/CustomizationContextProvider";
import DefaultSettingsPanel from "react-cismap/topicmaps/menu/DefaultSettingsPanel";
import ModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { Form } from "react-bootstrap";
import { getApplicationVersion } from "@carma-commons/utils";
import { PreviewLibreMap } from "@carma-mapping/engines/maplibre";
import versionData from "../version.json";
import { useDisplayOptions } from "./DisplayOptionsContext";

const previewSVG = (size: number) => {
  const s = size * 1.3;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" fill="#c62828" stroke="#7f0000" strokeWidth="3" opacity="0.85" />
    </svg>
  );
};

export const Menu = () => {
  const { showHausnummern, setShowHausnummern } = useDisplayOptions();

  return (
    <CustomizationContextProvider customizations={{}}>
      <ModalApplicationMenu
        menuIcon="bars"
        menuTitle="Einstellungen"
        menuIntroduction={
          <p>
            Mit dieser Anwendung werden leerstehende Ladenlokale erfasst. Ein
            Tipp auf ein ALKIS-Gebäude zeigt Adresse, Gebäudefunktion und
            Geschosszahl an; über das Plus-Symbol in der Infobox werden Fotos
            und die Angaben zum Leerstand erfasst. Bereits erfasste Leerstände
            erscheinen als rote Punkte, ein Tipp darauf öffnet das Datenblatt.
          </p>
        }
        menuFooter={
          <div style={{ fontSize: 12, color: "#777" }}>
            Teilzwilling Leerstandsmanagement, Version{" "}
            {getApplicationVersion(versionData)}
          </div>
        }
        menuSections={[
          <DefaultSettingsPanel
            key="settings"
            skipClusteringSettings={true}
            getSymbolSVG={previewSVG}
            overridingMapPreview={<PreviewLibreMap />}
            sparseSettingsSectionsExtensions={[
              <Form key="display-options">
                <label
                  style={{
                    display: "inline-block",
                    maxWidth: "100%",
                    marginBottom: "5px",
                    fontWeight: 700,
                  }}
                >
                  Hilfsebenen
                </label>
                <br />
                <Form.Check
                  type="checkbox"
                  id="checkbox_hausnummern"
                  checked={showHausnummern}
                  onChange={() => setShowHausnummern(!showHausnummern)}
                  label="Hausnummern aus der Stadtgrundkarte (ALKIS) einblenden"
                />
              </Form>,
            ]}
          />,
        ]}
      />
    </CustomizationContextProvider>
  );
};
