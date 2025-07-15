import { DashboardOutlined, MenuOutlined } from "@ant-design/icons";
import { NavLink } from "react-router-dom";
import { Menu } from "antd";
import { useState } from "react";
import { getIsMenuCollapsed, setIsMenuCollapsed } from "../../store/slices/ui";
import { useDispatch, useSelector } from "react-redux";
import { AppDispatch } from "../../store";
function getItem(label, key, icon) {
  return {
    key,
    icon,
    label,
  };
}
const SidebarMenu = () => {
  const dispatch: AppDispatch = useDispatch();
  const collapsed = useSelector(getIsMenuCollapsed);
  //   const [collapsed, setCollapsed] = useState(false);
  const items = [
    getItem(<NavLink to="/">Übersicht</NavLink>, "/", <DashboardOutlined />),
  ];
  const toggleCollapsed = () => {
    dispatch(setIsMenuCollapsed(!collapsed));
    // setMenuWidth()
  };
  return (
    <div className="bg-white pl-1 pt-2">
      <div className="ml-2 mt-[6px] mb-4">
        <span
          className="cursor-pointer"
          style={{
            display: "flex",
            justifyContent: !collapsed ? "start" : "center",
            marginRight: !collapsed ? 0 : "10px",
            marginTop: !collapsed ? 0 : "15px",
            // marginBottom: "16px",
          }}
        >
          <MenuOutlined
            onClick={toggleCollapsed}
            // style={{ textAlign: "left" }}
          />
          {!collapsed && <span className="ml-2">BelISDesktop</span>}
        </span>
      </div>
      <Menu
        style={{ border: 0, width: !collapsed ? "200px" : "68px" }}
        defaultSelectedKeys={["/"]}
        selectedKeys={["/"]}
        items={items}
        mode="inline"
      />
    </div>
  );
};
export default SidebarMenu;
