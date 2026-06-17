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

// Lazily inject the bootstrap/topicMaps stylesheet the first time the help modal
// is opened, and then LEAVE it in the document. It ships in its own low-priority
// cascade layer (see help-modal-vendor.css) and the root font-size is pinned in
// index.css, so once loaded it has no effect on the rest of the app — it renders
// exactly like `dev`. Crucially we must NOT add/remove the link on every toggle:
// adding or removing a stylesheet this large forces the browser to re-run the
// whole cascade against every element in the app (a full style recalc + reflow),
// which is what flickered the shell and momentarily shifted the layout on each
// open/close. Loading it once pays that recalc a single time.
//
// Returns whether the stylesheet has finished loading. The modal must wait for
// this: react-bootstrap's modal/backdrop renders as a solid black screen until
// its CSS arrives, so mounting it before the stylesheet is ready flashes black.
const useVendorCss = (active: boolean): boolean => {
  const [ready, setReady] = useState(
    () => document.getElementById(VENDOR_CSS_ID) !== null
  );
  useEffect(() => {
    if (!active || ready) {
      return;
    }
    const existing = document.getElementById(
      VENDOR_CSS_ID
    ) as HTMLLinkElement | null;
    if (existing) {
      setReady(true);
      return;
    }
    const link = document.createElement("link");
    link.id = VENDOR_CSS_ID;
    link.rel = "stylesheet";
    link.href = vendorCssUrl;
    link.onload = () => setReady(true);
    document.head.appendChild(link);
    // Intentionally no cleanup: the stylesheet stays loaded for the lifetime of
    // the app so reopening the modal never re-triggers a full-page style recalc.
  }, [active, ready]);
  return ready;
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
  const cssReady = useVendorCss(open);

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
      {open && cssReady && (
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
