import { Tooltip } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { storeJWT, storeLogin } from "../../store/slices/auth";
import { getDraftFeaturesCount } from "../../store/slices/featuresForms";
import { useDispatch, useSelector } from "react-redux";
import { NavLink, useNavigate } from "react-router-dom";
import SettingsUi from "../ui/SettingsUi";
import SyncMenuModal from "../ui/SyncMenuModal";

const TopNavbar = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const draftsCount = useSelector(getDraftFeaturesCount);

  return (
    <div className="flex items-center mx-3 mb-4 mt-2">
      <span className="font-semibold mr-8">BelISDesktop</span>
      <div className="flex items-center gap-4">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `text-base hover:text-gray-600`}
          style={({ isActive }) => ({
            color: isActive ? "#1677ff" : undefined,
          })}
        >
          Karte
        </NavLink>
        <NavLink
          to="/key-tables"
          className={({ isActive }) => `text-base hover:text-gray-600`}
          style={({ isActive }) => ({
            color: isActive ? "#1677ff" : undefined,
          })}
        >
          Schlüsseltabellen
        </NavLink>
      </div>
      <div className="ml-auto flex items-center gap-4">
        {/* {draftsCount > 0 && (
          <span className="text-base text-gray-600">
            nicht gespeicherte Änderungen ({draftsCount})
          </span>
        )} */}
        <SyncMenuModal />
        <Tooltip title="Ausloggen" placement="bottom">
          <LogoutOutlined
            className="text-base cursor-pointer"
            onClick={() => {
              dispatch(storeJWT(null));
              dispatch(storeLogin(null));
              navigate("/login");
            }}
          />
        </Tooltip>
        <SettingsUi />
      </div>
    </div>
  );
};
export default TopNavbar;
