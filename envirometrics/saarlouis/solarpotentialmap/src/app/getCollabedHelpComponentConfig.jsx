import Help05Introduction from "./help/Help05Introduction";
import Help10AllgemeineHinweise from "./help/Help10AllgemeineHinweise";
import Help30InKartePositionieren from "./help/Help30InKartePositionieren";
import Help40MeinStandort from "./help/Help40MeinStandort";
import Help60SimulierteSzenarien from "./help/Help65FAQ";
import Help70AussagekraftDerSimulationen from "./help/Help70Erstellung";
import Help90Haftungsausschluss from "./help/Help90Haftungsausschluss";
import Help98Kontakt from "./help/Help98Kontakt";
import Help99Footer from "./help/Help99Footer";

const getCollabedHelpComponentConfig = ({
  version,
  reactCismapRHMVersion,
  footerLogoUrl,
  email,
}) => {
  const menuIntroduction = <Help05Introduction />;
  const menuIcon = "info";
  const menuTitle = "Kompaktanleitung und Hintergrundinformationen";
  const menuSections = [
    <Help10AllgemeineHinweise key="AllgemeineHinweise" />,
    <Help30InKartePositionieren key="InKartePositionieren" />,
    <Help40MeinStandort key="MeinStandort" />,

    <Help70AussagekraftDerSimulationen key="AussagekraftDerSimulationen" />,
    <Help60SimulierteSzenarien key="SimulierteSzenarien" />,
    <Help90Haftungsausschluss key="Haftungsausschluss" />,
    <Help98Kontakt key="Kontakt" email={email} />,
  ];
  console.log("xxx getCollabedHelpComponentConfig version", version);

  const menuFooter = (
    <Help99Footer
      appName="Solarpotenzial Saarlouis"
      hintergrundkartenText=" DOP © LVGL | Basiskarte (grau/bunt) © BKG basemap.de"
      taglineModelling={
        <div>
          <b>Modellierung</b> (Version 1.0 | 12/2024):{" "}
          <a target="_model" href="https://www.izes.de/">
            IZES gGmbH
          </a>{" "}
        </div>
      }
      version={version}
      reactCismapRHMVersion={reactCismapRHMVersion}
      logoUrl={footerLogoUrl}
    />
  );
  return {
    menuIntroduction,
    menuIcon,
    menuTitle,
    menuSections,
    menuFooter,
  };
};

export { getCollabedHelpComponentConfig };
