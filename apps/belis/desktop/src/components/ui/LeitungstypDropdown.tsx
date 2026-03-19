import { useMemo, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Dropdown, Switch } from "antd";
import type { MenuProps } from "antd";
import { CaretDownFilled } from "@ant-design/icons";
import { useSelector, useDispatch } from "react-redux";
import { useState } from "react";
import { getKeyTablesData } from "../../store/slices/keyTables";
import {
  getEnabledLeitungstypen,
  setLeitungstypEnabled,
  setAllLeitungstypen,
} from "../../store/slices/mapSettings";

interface LeitungstypDropdownProps {
  children: ReactNode;
  masterChecked?: boolean;
}

const LeitungstypDropdown = ({
  children,
  masterChecked,
}: LeitungstypDropdownProps) => {
  const dispatch = useDispatch();
  const keyTablesData = useSelector(getKeyTablesData);
  const enabledTypes = useSelector(getEnabledLeitungstypen);
  const [open, setOpen] = useState(false);

  const sortedItems = useMemo(() => {
    return (
      (keyTablesData.leitungstyp || []) as {
        id: number;
        bezeichnung?: string;
      }[]
    )
      .slice()
      .sort((a, b) => a.id - b.id);
  }, [keyTablesData.leitungstyp]);

  // When master "Leitungen" is switched off, set all items off
  const prevMasterChecked = useRef(masterChecked);
  useEffect(() => {
    if (prevMasterChecked.current === true && masterChecked === false && sortedItems.length > 0) {
      dispatch(
        setAllLeitungstypen(
          Object.fromEntries(sortedItems.map((item) => [item.id, false]))
        )
      );
    }
    prevMasterChecked.current = masterChecked;
  }, [masterChecked, sortedItems, dispatch]);

  const isEnabled = (id: number) => enabledTypes[id] !== false;

  const menuItems: MenuProps["items"] = useMemo(
    () =>
      sortedItems.map((item) => ({
        key: item.id,
        label: (
          <div
            className="flex items-center justify-between gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <Switch
              size="small"
              checked={isEnabled(item.id)}
              onChange={(checked) => {
                dispatch(
                  setLeitungstypEnabled({ id: item.id, enabled: checked })
                );
              }}
            />
            <span>{item.bezeichnung || `ID ${item.id}`}</span>
          </div>
        ),
      })),
    [sortedItems, enabledTypes, dispatch]
  );

  return (
    <Dropdown
      menu={{ items: menuItems }}
      open={open}
      onOpenChange={(flag) => {
        if (!flag) setOpen(false);
      }}
      placement="bottomLeft"
    >
      <div className="flex items-center">
        {children}
        <CaretDownFilled
          className="ml-1 text-gray-500 cursor-pointer hover:text-gray-700"
          style={{ fontSize: 10 }}
          onClick={() => setOpen((prev) => !prev)}
        />
      </div>
    </Dropdown>
  );
};

export default LeitungstypDropdown;
