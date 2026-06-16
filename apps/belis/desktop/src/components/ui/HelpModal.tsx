import { useEffect, useState } from "react";
import { Tooltip } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/belis-desktop";
import { getApplicationVersion } from "@carma-commons/utils";
// `?url` gives us the bundled stylesheet URL without injecting it at startup.
// Bootstrap + topicMaps carry global `reboot` rules that would inflate the whole
// BelIS desktop layout (gaps/padding/margins), so we must NOT load them app-wide.
import vendorCssUrl from "../../help-modal-vendor.css?url";
import versionData from "../../version.json";

const VENDOR_CSS_ID = "belis-help-modal-vendor-css";

// Inject the bootstrap/topicMaps stylesheet only while the help modal is open,
// and remove it again on close, so the rest of the app renders exactly like it
// does without the modal (identical to `dev`). The CSS still ships in its own
// cascade layer (see help-modal-vendor.css) so that, even while it is loaded,
// the modal's vendor styles stay below the app's own styles.
const useVendorCss = (active: boolean) => {
  useEffect(() => {
    if (!active) return;
    let link = document.getElementById(
      VENDOR_CSS_ID
    ) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = VENDOR_CSS_ID;
      link.rel = "stylesheet";
      link.href = vendorCssUrl;
      document.head.appendChild(link);
    }
    return () => {
      document.getElementById(VENDOR_CSS_ID)?.remove();
    };
  }, [active]);
};

// "Kompaktanleitung und Hintergrundinformationen" – mirrors the Geoportal help
// dialog. The collab content (belis-desktop) is built on react-cismap's
// GenericModalApplicationMenu/Section (react-bootstrap panels); the required
// UIContext/ResponsiveTopicMapContext are already supplied app-wide by the
// TopicMapContextProvider in main.tsx. Visibility is controlled locally via the
// visible/setVisible props so it stays independent of the shared app menu state.
const HelpModal = () => {
  const [open, setOpen] = useState(false);
  const version = getApplicationVersion(versionData);
  useVendorCss(open);

  return (
    <>
      <Tooltip
        title="Kompaktanleitung und Hintergrundinformationen"
        placement="bottom"
      >
        <QuestionCircleOutlined
          className="text-base cursor-pointer"
          onClick={() => setOpen(true)}
        />
      </Tooltip>
      {open && (
        <GenericModalApplicationMenu
          visible={open}
          setVisible={setOpen}
          {...getCollabedHelpComponentConfig({ versionString: version })}
        />
      )}
    </>
  );
};

export default HelpModal;
