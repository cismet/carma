import { useState, useMemo } from "react";
import { List } from "antd";
import Fuse from "fuse.js";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { CustomCard } from "../commons/CustomCard";
import { SearchInput } from "../commons/SearchInput";
import {
  keyTableDisplayConfig,
  SortMode,
} from "../../config/keyTableDisplayConfig";
import { getItemDisplayText } from "../../utils/templateParser";

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

const getTableDisplayName = (key: string) => {
  return keyTableDisplayConfig[key]?.displayName ?? formatTableName(key);
};

interface SearchableItem {
  original: unknown;
  displayText: string;
}

const KeyTableDataGroupsList = ({
  tableName,
  items,
  selectedItem,
  onItemSelect,
  onAddItem,
  onRemoveItem,
  sortMode = "none",
}: KeyTableDataGroupsListProps) => {
  const [searchText, setSearchText] = useState("");

  // Prepare items with display text for Fuse.js search
  const searchableItems = useMemo(() => {
    return items.map((item) => ({
      original: item,
      displayText: String(
        getItemDisplayText(
          item as Record<string, unknown>,
          tableName,
          keyTableDisplayConfig
        ) ?? ""
      ),
    }));
  }, [items, tableName]);

  // Create Fuse instance
  const fuse = useMemo(() => {
    return new Fuse<SearchableItem>(searchableItems, {
      keys: [{ name: "displayText", weight: 1 }],
      shouldSort: false,
      includeMatches: true,
      useExtendedSearch: true,
      ignoreLocation: true,
      threshold: 0.1,
    });
  }, [searchableItems]);

  const getFilteredAndSortedItems = () => {
    let result: unknown[];

    // Filter by search text using Fuse.js
    if (searchText.trim()) {
      const fuseResults = fuse.search(searchText);
      result = fuseResults.map((r) => r.item.original);
    } else {
      result = items;
    }

    // Sort
    if (sortMode === "none") {
      return result;
    }

    return [...result].sort((a, b) => {
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

  const filteredAndSortedItems = getFilteredAndSortedItems();

  return (
    <CustomCard
      title={getTableDisplayName(tableName)}
      style={{ height: "100%" }}
      extra={
        <div className="flex items-center gap-2">
          <SearchInput value={searchText} onChange={setSearchText} />
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
      <List
        size="small"
        dataSource={filteredAndSortedItems}
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
    </CustomCard>
  );
};

export default KeyTableDataGroupsList;
