import { useState, useMemo } from "react";
import { List, Tree, Select } from "antd";
import type { TreeProps } from "antd/es/tree";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { CustomCard } from "../commons/CustomCard";
import {
  keyTableDisplayConfig,
  SortMode,
} from "../../config/keyTableDisplayConfig";
import { getItemDisplayText } from "../../utils/templateParser";
import {
  buildTreeData,
  GroupingMode,
  StrassenItem,
} from "../../utils/strassenGrouping";

interface SelectedItem {
  item: Record<string, unknown>;
  tableName: string;
}

interface KeyTableDataGroupsListProps {
  tableName: string;
  items: unknown[];
  selectedItem: SelectedItem | null;
  onItemSelect: (item: unknown, tableName: string) => void;
  onAddItem: () => void;
  onRemoveItem: () => void;
  sortMode?: SortMode;
}

const formatTableName = (key: string) => {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

const GROUPING_OPTIONS = [
  { value: "byKey", label: "Nach Schlüssel" },
  { value: "byStreet", label: "Nach Straße" },
];

const KeyTableDataGroupsList = ({
  tableName,
  items,
  selectedItem,
  onItemSelect,
  onAddItem,
  onRemoveItem,
  sortMode = "none",
}: KeyTableDataGroupsListProps) => {
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("byKey");

  const useGroupedDisplay = tableName === "straßenschlüssel";

  const treeData = useMemo(() => {
    if (!useGroupedDisplay) return [];
    return buildTreeData(items as StrassenItem[], groupingMode);
  }, [items, groupingMode, useGroupedDisplay]);

  const selectedKeys = useMemo(() => {
    if (!selectedItem || selectedItem.tableName !== tableName) return [];
    return [`item-${selectedItem.item.id}`];
  }, [selectedItem, tableName]);

  const handleTreeSelect: TreeProps["onSelect"] = (_selectedKeys, info) => {
    const node = info.node as { isLeaf?: boolean; data?: StrassenItem };
    if (node.isLeaf && node.data) {
      onItemSelect(node.data, tableName);
    }
  };

  const getSortedItems = () => {
    if (sortMode === "none") {
      return items;
    }

    return [...items].sort((a, b) => {
      const aRecord = a as Record<string, unknown>;
      const bRecord = b as Record<string, unknown>;
      const aText = getItemDisplayText(
        aRecord,
        tableName,
        keyTableDisplayConfig
      );
      const bText = getItemDisplayText(
        bRecord,
        tableName,
        keyTableDisplayConfig
      );

      if (sortMode === "alphabetical") {
        return aText.localeCompare(bText, "de", { sensitivity: "base" });
      }

      if (sortMode === "numeric") {
        return aText.localeCompare(bText, "de", { numeric: true });
      }

      return 0;
    });
  };

  const sortedItems = getSortedItems();

  const renderGroupedList = () => (
    <Tree
      showIcon={false}
      selectedKeys={selectedKeys}
      onSelect={handleTreeSelect}
      treeData={treeData}
      style={{ background: "transparent" }}
      className="strassen-tree"
    />
  );

  const renderFlatList = () => (
    <List
      size="small"
      dataSource={sortedItems}
      renderItem={(item: unknown) => {
        const itemRecord = item as Record<string, unknown>;
        const isSelected =
          selectedItem?.item.id === itemRecord.id &&
          selectedItem?.tableName === tableName;
        return (
          <List.Item
            style={{
              cursor: "pointer",
              backgroundColor: isSelected ? "#e6f4ff" : undefined,
              borderLeft: isSelected
                ? "3px solid #1677ff"
                : "3px solid transparent",
              padding: "8px 12px",
            }}
            className="hover:bg-gray-50"
            onClick={() => onItemSelect(item, tableName)}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: "#262626",
              }}
            >
              {getItemDisplayText(itemRecord, tableName, keyTableDisplayConfig)}
            </span>
          </List.Item>
        );
      }}
      locale={{ emptyText: "Keine Daten" }}
    />
  );

  return (
    <CustomCard
      title={formatTableName(tableName)}
      style={{ height: "100%" }}
      extra={
        <div className="flex items-center gap-2">
          {useGroupedDisplay && (
            <Select
              size="small"
              value={groupingMode}
              onChange={(value: GroupingMode) => setGroupingMode(value)}
              options={GROUPING_OPTIONS}
              style={{ width: 120 }}
              className="strassen-grouping-select"
              popupClassName="strassen-grouping-select-dropdown"
            />
          )}
          <PlusOutlined
            className="cursor-pointer hover:text-blue-500"
            onClick={onAddItem}
          />
          <DeleteOutlined
            className="cursor-pointer hover:text-red-500"
            onClick={onRemoveItem}
          />
        </div>
      }
    >
      {useGroupedDisplay ? renderGroupedList() : renderFlatList()}
    </CustomCard>
  );
};

export default KeyTableDataGroupsList;
