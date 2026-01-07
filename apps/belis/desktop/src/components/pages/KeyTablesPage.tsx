import { useEffect, useState, useRef } from "react";
import { fetchAllKeyTables } from "../../helper/apiMethods";
import { AppDispatch } from "../../store";
import { useDispatch, useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import {
  setKeyTablesData,
  setKeyTablesErrors,
  setKeyTablesLoading,
  getKeyTablesData,
  getKeyTablesErrors,
  getKeyTablesLoading,
  getKeyTablesFetched,
} from "../../store/slices/keyTables";
import { List, Spin, Alert } from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  CloseOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import type { FormInstance } from "antd";
import { CustomCard } from "../commons/CustomCard";
import KeyTableItemForm from "../ui/KeyTableItemForm";
import { keyTableDisplayConfig } from "../../config/keyTableDisplayConfig";
import { getItemDisplayText } from "../../utils/templateParser";

interface SelectedItem {
  item: Record<string, unknown>;
  tableName: string;
}

const KeyTablesPage = () => {
  const dispatch: AppDispatch = useDispatch();
  const storedJWT = useSelector(getJWT);
  const data = useSelector(getKeyTablesData);
  const errors = useSelector(getKeyTablesErrors);
  const loading = useSelector(getKeyTablesLoading);
  const fetched = useSelector(getKeyTablesFetched);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const formRef = useRef<FormInstance | null>(null);

  const adjustedHeight = "calc(100vh - 60px)";

  useEffect(() => {
    if (fetched) return;

    const fetchData = async () => {
      if (!storedJWT) return;

      dispatch(setKeyTablesLoading(true));
      try {
        const { data, errors } = await fetchAllKeyTables(storedJWT);
        dispatch(setKeyTablesData(data));
        dispatch(setKeyTablesErrors(errors));
        console.log("data", data);
        console.log("errors", errors);
      } catch (error) {
        console.error("Failed to fetch key tables:", error);
      } finally {
        dispatch(setKeyTablesLoading(false));
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    console.log("xxx selectedItem", selectedItem);
  }, [selectedItem]);

  // Select first table by default when data loads
  useEffect(() => {
    if (Object.keys(data).length > 0 && !selectedTable) {
      const firstTableKey = Object.keys(data)[0];
      setSelectedTable(firstTableKey);
    }
  }, [data]);

  // Select first item when table changes
  useEffect(() => {
    if (selectedTable && data[selectedTable]) {
      const tableItems = data[selectedTable];
      if (Array.isArray(tableItems) && tableItems.length > 0) {
        setSelectedItem({
          item: tableItems[0] as Record<string, unknown>,
          tableName: selectedTable,
        });
      } else {
        setSelectedItem(null);
      }
    }
  }, [selectedTable]);

  // Format table name for display
  const formatTableName = (key: string) => {
    return key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  };

  const handleTableClick = (tableName: string) => {
    setSelectedTable(tableName);
  };

  const handleItemClick = (item: unknown, tableName: string) => {
    setSelectedItem({ item: item as Record<string, unknown>, tableName });
  };

  const handleItemSaved = (updatedItem: Record<string, unknown>) => {
    if (!selectedItem) return;

    const newData = { ...data };
    const tableData = [...(newData[selectedItem.tableName] as unknown[])];
    const index = tableData.findIndex(
      (i: unknown) => (i as Record<string, unknown>).id === updatedItem.id
    );
    if (index !== -1) {
      tableData[index] = updatedItem;
      newData[selectedItem.tableName] = tableData;
      dispatch(setKeyTablesData(newData));
    }
    setSelectedItem(null);
  };

  const handleAddItem = () => {
    if (!selectedTable) return;
    const tableItems = data[selectedTable] as Record<string, unknown>[];
    const templateItem = tableItems[0] || {};

    // Create new item with same shape, empty values, and temporary negative id
    const newItem: Record<string, unknown> = {};
    Object.keys(templateItem).forEach((key) => {
      newItem[key] = key === "id" ? -Date.now() : "";
    });

    // Add to Redux store (at the beginning of the list)
    const newData = { ...data };
    const newTableData = [newItem, ...tableItems];
    newData[selectedTable] = newTableData;
    dispatch(setKeyTablesData(newData));

    // Select the new item to show its form
    setSelectedItem({ item: newItem, tableName: selectedTable });
  };

  const handleRemoveItem = () => {
    if (!selectedItem) return;
    console.log(
      "Remove item:",
      selectedItem.item,
      "from table:",
      selectedItem.tableName
    );
  };

  const selectedTableItems = selectedTable
    ? (data[selectedTable] as unknown[]) || []
    : [];

  return (
    <div className="mx-3 mt-1">
      {loading && (
        <div className="flex justify-center items-center py-8">
          <Spin size="large" tip="Laden..." />
        </div>
      )}

      {!loading && Object.keys(errors).length > 0 && (
        <Alert
          message="Fehler beim Laden"
          description={`Einige Tabellen konnten nicht geladen werden: ${Object.keys(
            errors
          ).join(", ")}`}
          type="warning"
          showIcon
          className="mb-4"
        />
      )}

      {!loading && Object.keys(data).length > 0 && (
        <div className="flex gap-2">
          {/* Column 1: Key Table Names */}
          <div
            style={{
              width: "20%",
              flexShrink: 0,
              height: adjustedHeight,
            }}
          >
            <CustomCard title="Schlüsseltabellen" style={{ height: "100%" }}>
              <List
                size="small"
                dataSource={Object.keys(data)}
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
                        paddingLeft: 12,
                      }}
                      className="hover:bg-gray-100"
                      onClick={() => handleTableClick(tableName)}
                    >
                      <span>
                        <strong>{formatTableName(tableName)}</strong>
                        <span style={{ marginLeft: 8, color: "#8c8c8c" }}>
                          ({count})
                        </span>
                      </span>
                    </List.Item>
                  );
                }}
                locale={{ emptyText: "Keine Tabellen" }}
              />
            </CustomCard>
          </div>

          {/* Column 2: Items List */}
          {selectedTable && (
            <div
              style={{
                width: "25%",
                flexShrink: 0,
                height: adjustedHeight,
              }}
            >
              <CustomCard
                title={formatTableName(selectedTable)}
                style={{ height: "100%" }}
                extra={
                  <div className="flex items-center gap-2">
                    <PlusOutlined
                      className="cursor-pointer hover:text-blue-500"
                      onClick={handleAddItem}
                    />
                    <DeleteOutlined
                      className="cursor-pointer hover:text-red-500"
                      onClick={handleRemoveItem}
                    />
                  </div>
                }
              >
                <List
                  size="small"
                  dataSource={selectedTableItems}
                  renderItem={(item: unknown) => {
                    const itemRecord = item as Record<string, unknown>;
                    const isSelected =
                      selectedItem?.item.id === itemRecord.id &&
                      selectedItem?.tableName === selectedTable;
                    return (
                      <List.Item
                        style={{
                          cursor: "pointer",
                          backgroundColor: isSelected ? "#e6f4ff" : undefined,
                          borderLeft: isSelected
                            ? "3px solid #1677ff"
                            : "3px solid transparent",
                          paddingLeft: 12,
                        }}
                        className="hover:bg-gray-100"
                        onClick={() => handleItemClick(item, selectedTable)}
                      >
                        {getItemDisplayText(
                          itemRecord,
                          selectedTable,
                          keyTableDisplayConfig
                        )}
                      </List.Item>
                    );
                  }}
                  locale={{ emptyText: "Keine Daten" }}
                />
              </CustomCard>
            </div>
          )}

          {/* Column 3: Form */}
          {selectedItem && (
            <div
              style={{
                flex: 1,
                height: adjustedHeight,
                minWidth: 0,
              }}
            >
              <CustomCard
                title={`${getItemDisplayText(
                  selectedItem.item,
                  selectedItem.tableName,
                  keyTableDisplayConfig
                )}`}
                style={{ height: "100%" }}
                extra={
                  <div className="flex items-center gap-2">
                    <CheckCircleOutlined
                      className="cursor-pointer hover:text-green-500"
                      onClick={() => formRef.current?.submit()}
                    />
                    <CloseOutlined
                      className="cursor-pointer hover:text-red-500"
                      onClick={() => setSelectedItem(null)}
                    />
                  </div>
                }
              >
                <div className="flex items-center h-full">
                  <div className="w-full p-3">
                    <KeyTableItemForm
                      key={`${selectedItem.tableName}-${selectedItem.item.id}`}
                      item={selectedItem.item}
                      tableName={selectedItem.tableName}
                      onSave={handleItemSaved}
                      onFormReady={(form) => (formRef.current = form)}
                    />
                  </div>
                </div>
              </CustomCard>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default KeyTablesPage;
