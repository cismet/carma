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
  return (
    <div className="min-w-[260px] bg-white pl-1 pt-2">
      <div className="ml-2 mt-[6px] mb-4">
        <span className="cursor-pointer">
          <MenuOutlined style={{ textAlign: "left" }} />
        </span>
        <span className="ml-2">Belis-desktop</span>
      </div>
      <Menu
        defaultSelectedKeys={["/"]}
        selectedKeys={["/"]}
        items={items}
        mode="inline"
      />
    </div>
  );
};
export default SidebarMenu;
