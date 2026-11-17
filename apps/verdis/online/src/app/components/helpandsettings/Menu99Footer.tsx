import { Button } from "react-bootstrap";
import { KompaktanleitungFooter } from "@carma-collab/wuppertal/verdis-online";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "../../../version.json";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { getUiState } from "../../../store/slices/ui";
import ExpandableHint from "../changerequests/ExpandableHint";
import "./Menu00MainComponent.css";

const Menu99Footer = () => {
  const version = getApplicationVersion(versionData);
  const isPhone = useSelector(getUiState).width < 768;
  const footer = <KompaktanleitungFooter version={version} />;
  return (
    <div className="help-menu-footer">
      {isPhone ? (
        <ExpandableHint
          icon="ℹ"
          hint="Kartenquellen, Version, Datenschutz"
          details={footer}
        />
      ) : (
        footer
      )}
      <Button
        as={Link}
        to="/verdisOnlineHilfeFAQs"
        target="_blank"
        rel="noopener noreferrer"
        size="sm"
        variant="info"
      >
        In eigenem Fenster öffnen
      </Button>
    </div>
  );
};

export default Menu99Footer;
