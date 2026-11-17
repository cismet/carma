import { Button } from "react-bootstrap";
import { KompaktanleitungFooter } from "@carma-collab/wuppertal/verdis-online";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "../../../version.json";
import { Link } from "react-router-dom";
import "./Menu00MainComponent.css";

const Menu99Footer = () => {
  const version = getApplicationVersion(versionData);
  return (
    <div className="help-menu-footer">
      <KompaktanleitungFooter version={version} />
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
