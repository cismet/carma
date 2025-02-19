import { Drawer, Tooltip, Avatar, Switch } from "antd";
import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { getSyncLandparcel, setSyncLandparcel } from "../../store/slices/ui";
import Settings from "../commons/Settings";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear } from "@fortawesome/free-solid-svg-icons";
const UserName = ({ name = "User" }) => {
  const dispatch = useDispatch();
  const syncLandparcel = useSelector(getSyncLandparcel);
  const firstLetter = name.charAt(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <>
      <Tooltip title="Einstellungen" placement="right">
        <FontAwesomeIcon
          icon={faGear}
          // style={{ fontSize: "19px" }}
          className="cursor-pointer hover:text-slate-400 text-lg hidden md:block"
          onClick={() => setDrawerOpen(true)}
        />
      </Tooltip>
      <Drawer
        title="Einstellungen"
        placement="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        size="small"
      >
        <Settings />
      </Drawer>
    </>
  );
};

export default UserName;
