import { DashboardOutlined, MenuOutlined } from "@ant-design/icons";
import { NavLink } from "react-router-dom";
import { Menu } from "antd";
import { useState } from "react";
function getItem(label, key, icon) {
  return {
    key,
    icon,
    label,
  };
}
const SidebarMenu = () => {
  const [collapsed, setCollapsed] = useState(false);
  const items = [
    getItem(<NavLink to="/">Übersicht</NavLink>, "/", <DashboardOutlined />),
  ];
  const toggleCollapsed = () => {
    setCollapsed(!collapsed);
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
          {!collapsed && <span className="ml-2">Belis-desktop</span>}
        </span>
      </div>
      <Menu
        style={{ border: 0, width: !collapsed ? "280px" : "68px" }}
        defaultSelectedKeys={["/"]}
        selectedKeys={["/"]}
        items={items}
        mode="inline"
      />
    </div>
  );
};
export default SidebarMenu;
