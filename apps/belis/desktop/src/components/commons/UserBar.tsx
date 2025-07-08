import { Tooltip } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import { getLogin, storeJWT, storeLogin } from "../../store/slices/auth";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";

const UserBar = () => {
  const dispatch = useDispatch();
  const userLogin = useSelector(getLogin);
  const navigate = useNavigate();

  return (
    <div className="flex items-center h-[calc(5%-20px)]">
      <div className="ml-auto flex gap-1 items-center">
        <div className="logout ml-auto flex items-center">
          <Tooltip title="Ausloggen" placement="right">
            <LogoutOutlined
              className="text-sm cursor-pointer"
              style={{ paddingRight: "12px" }}
              onClick={() => {
                dispatch(storeJWT(null));
                dispatch(storeLogin(null));
                navigate("/login");
              }}
            />
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
export default UserBar;
