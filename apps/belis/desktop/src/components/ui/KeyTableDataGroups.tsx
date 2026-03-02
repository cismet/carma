import { List } from "antd";
import { MenuFoldOutlined } from "@ant-design/icons";
import { CustomCard } from "../commons/CustomCard";
import { keyTableDisplayConfig } from "../../config/keyTableDisplayConfig";

interface KeyTableDataGroupsProps {
  data: Record<string, unknown[]>;
  selectedTable: string | null;
  onTableSelect: (tableName: string) => void;
  onCollapse: () => void;
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

const KeyTableDataGroups = ({
  data,
  selectedTable,
  onTableSelect,
  onCollapse,
}: KeyTableDataGroupsProps) => {
  return (
    <CustomCard
      title="Schlüsseltabellen"
      style={{ height: "100%" }}
      extra={
        <MenuFoldOutlined
          className="cursor-pointer hover:text-blue-500"
          onClick={onCollapse}
        />
      }
    >
      <List
        size="small"
        dataSource={Object.keys(data)
          .filter((key) => key in keyTableDisplayConfig)
          .sort((a, b) =>
            getTableDisplayName(a).localeCompare(getTableDisplayName(b), "de", {
              sensitivity: "base",
            })
          )}
        renderItem={(tableName: string) => {
          const items = data[tableName];
          const count = Array.isArray(items) ? items.length : 0;
          const isSelected = selectedTable === tableName;
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
              onClick={() => onTableSelect(tableName)}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    color: "#262626",
                  }}
                >
                  {getTableDisplayName(tableName)}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 400,
                    color: "#bfbfbf",
                  }}
                >
                  ({count})
                </span>
              </div>
            </List.Item>
          );
        }}
        locale={{ emptyText: "Keine Tabellen" }}
      />
    </CustomCard>
  );
};

export default KeyTableDataGroups;
