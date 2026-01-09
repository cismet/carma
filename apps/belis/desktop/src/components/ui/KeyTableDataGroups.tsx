import { List } from "antd";
import { CustomCard } from "../commons/CustomCard";

interface KeyTableDataGroupsProps {
  data: Record<string, unknown[]>;
  selectedTable: string | null;
  onTableSelect: (tableName: string) => void;
}

const formatTableName = (key: string) => {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

const KeyTableDataGroups = ({
  data,
  selectedTable,
  onTableSelect,
}: KeyTableDataGroupsProps) => {
  return (
    <CustomCard title="Schlüsseltabellen" style={{ height: "100%" }}>
      <List
        size="small"
        dataSource={Object.keys(data).sort((a, b) =>
          formatTableName(a).localeCompare(formatTableName(b), "de", { sensitivity: "base" })
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
                  {formatTableName(tableName)}
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
