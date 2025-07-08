import { Tooltip } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { getLogin, storeJWT, storeLogin } from "../../store/slices/auth";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import SettingsUi from "../ui/SettingsUi";

const UserBar = () => {
  const dispatch = useDispatch();
  const userLogin = useSelector(getLogin);
  const navigate = useNavigate();

  return (
    <div className="flex items-center h-[calc(5%-20px)] mx-3">
      <div className="ml-auto flex items-center gap-2 justify-between">
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
export default UserBar;
