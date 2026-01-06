import { Tooltip } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { getLogin, storeJWT, storeLogin } from "../../store/slices/auth";
import { useSelector, useDispatch } from "react-redux";
import { NavLink, useNavigate } from "react-router-dom";
import SettingsUi from "../ui/SettingsUi";
import Filter from "../ui/Filter";

const TopNavbar = ({ innerRef }) => {
  const dispatch = useDispatch();
  const userLogin = useSelector(getLogin);
  const navigate = useNavigate();

  return (
    <div className="flex items-center  mx-3 mb-4 mt-2" ref={innerRef}>
      <div className="flex items-center gap-4">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `text-sm hover:text-blue-600 ${isActive ? "font-semibold" : ""}`
          }
          style={({ isActive }) => ({
            color: isActive ? "#1777ff" : undefined,
          })}
        >
          Karte
        </NavLink>
        <NavLink
          to="/key-tables"
          className={({ isActive }) =>
            `text-sm hover:text-blue-600 ${isActive ? "font-semibold" : ""}`
          }
          style={({ isActive }) => ({
            color: isActive ? "#1777ff" : undefined,
          })}
        >
          Schlüsseltabellen
        </NavLink>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Tooltip title="Ausloggen" placement="right">
          <LogoutOutlined
            className="text-sm cursor-pointer"
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
