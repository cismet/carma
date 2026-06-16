import { useState } from "react";
import { Tooltip } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import GenericModalApplicationMenu from "react-cismap/topicmaps/menu/ModalApplicationMenu";
import { getCollabedHelpComponentConfig } from "@carma-collab/wuppertal/belis-desktop";
import { getApplicationVersion } from "@carma-commons/utils";
import versionData from "../../version.json";

// "Kompaktanleitung und Hintergrundinformationen" – mirrors the Geoportal help
// dialog. The collab content (belis-desktop) is built on react-cismap's
// GenericModalApplicationMenu/Section (react-bootstrap panels); the required
// UIContext/ResponsiveTopicMapContext are already supplied app-wide by the
// TopicMapContextProvider in main.tsx. Visibility is controlled locally via the
// visible/setVisible props so it stays independent of the shared app menu state.
const HelpModal = () => {
  const [open, setOpen] = useState(false);
  const version = getApplicationVersion(versionData);

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
      <GenericModalApplicationMenu
        visible={open}
        setVisible={setOpen}
        {...getCollabedHelpComponentConfig({ versionString: version })}
      />
    </>
  );
};

export default HelpModal;
