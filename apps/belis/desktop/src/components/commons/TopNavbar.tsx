import { Tooltip } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { getLogin, storeJWT, storeLogin } from "../../store/slices/auth";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import SettingsUi from "../ui/SettingsUi";
import Filter from "../ui/Filter";

const TopNavbar = ({ innerRef }) => {
  const dispatch = useDispatch();
  const userLogin = useSelector(getLogin);
  const navigate = useNavigate();

  return (
    <div className="flex items-center  mx-3 mb-4 mt-2" ref={innerRef}>
      <Filter />
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
