import { List } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { CustomCard } from "../commons/CustomCard";
import { keyTableDisplayConfig } from "../../config/keyTableDisplayConfig";
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
}

const formatTableName = (key: string) => {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

const KeyTableDataGroupsList = ({
  tableName,
  items,
  selectedItem,
  onItemSelect,
  onAddItem,
  onRemoveItem,
}: KeyTableDataGroupsListProps) => {
  return (
    <CustomCard
      title={formatTableName(tableName)}
      style={{ height: "100%" }}
      extra={
        <div className="flex items-center gap-2">
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
        dataSource={items}
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
                {getItemDisplayText(
                  itemRecord,
                  tableName,
                  keyTableDisplayConfig
                )}
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
