import { useMemo, useCallback } from "react";
import { Dropdown } from "antd";
import type { MenuProps } from "antd";
import { CaretDownFilled } from "@ant-design/icons";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../store/slices/keyTables";

const LeitungstypDropdown = () => {
  const keyTablesData = useSelector(getKeyTablesData);

  const menuItems: MenuProps["items"] = useMemo(() => {
    const items = (
      (keyTablesData.leitungstyp || []) as {
        id: number;
        bezeichnung?: string;
      }[]
    )
      .slice()
      .sort((a, b) => a.id - b.id);
    return items.map((item) => ({
      key: item.id,
      label: item.bezeichnung || `ID ${item.id}`,
    }));
  }, [keyTablesData.leitungstyp]);

  const onClick: MenuProps["onClick"] = useCallback(
    ({ key }) => {
      const selected = (
        (keyTablesData.leitungstyp || []) as {
          id: number;
          bezeichnung?: string;
        }[]
      ).find((t) => t.id === Number(key));
      console.log("[Leitungstyp] Selected:", selected);
    },
    [keyTablesData.leitungstyp]
  );

  return (
    <Dropdown menu={{ items: menuItems, onClick }} trigger={["click"]}>
      <CaretDownFilled
        className="ml-1 text-gray-500 cursor-pointer hover:text-gray-700"
        style={{ fontSize: 10 }}
      />
    </Dropdown>
  );
};

export default LeitungstypDropdown;
