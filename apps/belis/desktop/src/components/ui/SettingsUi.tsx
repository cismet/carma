import { Drawer, Tooltip, Avatar, Switch } from "antd";
import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear } from "@fortawesome/free-solid-svg-icons";
import Settings from "./Settings";
const SettingsUi = () => {
  const dispatch = useDispatch();
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <Tooltip title="Einstellungen" placement="right">
        <FontAwesomeIcon
          icon={faGear}
          className="cursor-pointer hover:text-slate-400 text-lg"
          onClick={() => setDrawerOpen(true)}
        />
      </Tooltip>
      <Drawer
        title="Einstellungen"
        placement="right"
        zIndex={2000}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="default"
      >
        <Settings />
      </Drawer>
    </>
  );
};

export default SettingsUi;
