import { useMemo, useEffect, useRef, useCallback } from "react";
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
  // Skip sync when master was auto-toggled by a sub-toggle change
  const prevMasterChecked = useRef(masterChecked);
  const skipNextSync = useRef(false);
  useEffect(() => {
    if (sortedItems.length === 0) return;
    const prev = prevMasterChecked.current;
    if (prev !== masterChecked) {
      if (skipNextSync.current) {
        skipNextSync.current = false;
      } else {
        dispatch(
          setAllLeitungstypen(
            Object.fromEntries(
              sortedItems.map((item) => [item.id, !!masterChecked])
            )
          )
        );
      }
    }
    prevMasterChecked.current = masterChecked;
  }, [masterChecked, sortedItems, dispatch]);

  const isEnabled = (id: number) => enabledTypes[id] !== false;

  // Partial state: master is on but not all sub-toggles match
  const isPartial = useMemo(() => {
    if (!masterChecked || sortedItems.length === 0) return false;
    const allOn = sortedItems.every((item) => isEnabled(item.id));
    return !allOn;
  }, [masterChecked, sortedItems, enabledTypes]);

  const handleToggle = useCallback(
    (id: number) => {
      const checked = !isEnabled(id);
      dispatch(setLeitungstypEnabled({ id, enabled: checked }));
      const wouldBeState = sortedItems.map((si) =>
        si.id === id ? checked : isEnabled(si.id)
      );
      const allOff = wouldBeState.every((v) => !v);
      if (allOff && masterChecked) {
        onMasterChange?.(false);
      } else if (!allOff && !masterChecked) {
        skipNextSync.current = true;
        onMasterChange?.(true);
      }
    },
    [sortedItems, enabledTypes, dispatch, masterChecked, onMasterChange]
  );

  const menuItems: MenuProps["items"] = useMemo(
    () =>
      sortedItems.map((item) => ({
        key: item.id,
        label: (
          <div
            className="flex items-center justify-between gap-3 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handleToggle(item.id);
            }}
          >
            <span onClick={(e) => e.stopPropagation()}>
              <Switch
                size="small"
                checked={isEnabled(item.id)}
                onChange={() => handleToggle(item.id)}
              />
            </span>
            <span>{item.bezeichnung || `ID ${item.id}`}</span>
          </div>
        ),
      })),
    [sortedItems, enabledTypes, handleToggle]
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
        <div className={isPartial ? "leitungstyp-partial" : ""}>{children}</div>
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
