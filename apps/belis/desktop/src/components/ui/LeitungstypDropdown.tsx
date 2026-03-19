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
  onMasterChange?: (checked: boolean) => void;
}

const LeitungstypDropdown = ({
  children,
  masterChecked,
  onMasterChange,
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

  // Sync sub-toggles on master switch transitions:
  // off → on: set all items on (dark blue)
  // on → off: set all items off
  const prevMasterChecked = useRef(masterChecked);
  useEffect(() => {
    if (sortedItems.length === 0) return;
    const prev = prevMasterChecked.current;
    if (prev !== masterChecked) {
      dispatch(
        setAllLeitungstypen(
          Object.fromEntries(
            sortedItems.map((item) => [item.id, !!masterChecked])
          )
        )
      );
    }
    prevMasterChecked.current = masterChecked;
  }, [masterChecked, sortedItems, dispatch]);

  const isEnabled = (id: number) => enabledTypes[id] !== false;

  // Partial state: master is on but not all sub-toggles are on
  const isPartial = useMemo(() => {
    if (!masterChecked || sortedItems.length === 0) return false;
    return sortedItems.some((item) => !isEnabled(item.id));
  }, [masterChecked, sortedItems, enabledTypes]);

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
                // Compute would-be state to sync master switch
                const allOff = sortedItems.every((si) =>
                  si.id === item.id ? !checked : !isEnabled(si.id)
                );
                if (allOff && masterChecked) {
                  onMasterChange?.(false);
                }
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
        <style>{`
          .leitungstyp-partial .ant-switch-checked {
            background: #93c5fd !important;
          }
        `}</style>
        <div className={isPartial ? "leitungstyp-partial" : ""}>
          {children}
        </div>
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
