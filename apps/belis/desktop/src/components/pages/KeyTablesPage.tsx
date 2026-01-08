import { useEffect, useState } from "react";
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
import { Spin, Alert } from "antd";
import KeyTableDataGroups from "../ui/KeyTableDataGroups";
import KeyTableDataGroupsList from "../ui/KeyTableDataGroupsList";
import FormWrapper from "../ui/FormWrapper";
import { keyTableDisplayConfig } from "../../config/keyTableDisplayConfig";

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

  const adjustedHeight = "calc(100vh - 65px)";

  useEffect(() => {
    if (fetched) return;

    const fetchData = async () => {
      if (!storedJWT) return;

      dispatch(setKeyTablesLoading(true));
      try {
        const { data, errors } = await fetchAllKeyTables(storedJWT);
        dispatch(setKeyTablesData(data));
        dispatch(setKeyTablesErrors(errors));
      } catch (error) {
        console.error("Failed to fetch key tables:", error);
      } finally {
        dispatch(setKeyTablesLoading(false));
      }
    };
    fetchData();
  }, []);

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

    // Just show the form for the new item (don't add to list yet)
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
        <div className="flex gap-4">
          {/* Column 1: Key Table Names */}
          <div
            style={{
              width: "20%",
              flexShrink: 0,
              height: adjustedHeight,
            }}
          >
            <KeyTableDataGroups
              data={data}
              selectedTable={selectedTable}
              onTableSelect={handleTableClick}
            />
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
              <KeyTableDataGroupsList
                tableName={selectedTable}
                items={selectedTableItems}
                selectedItem={selectedItem}
                onItemSelect={handleItemClick}
                onAddItem={handleAddItem}
                onRemoveItem={handleRemoveItem}
                sortMode={keyTableDisplayConfig[selectedTable]?.sortMode}
              />
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
              <FormWrapper
                selectedItem={selectedItem}
                onSave={handleItemSaved}
                readOnly={
                  keyTableDisplayConfig[selectedItem.tableName]?.readOnly
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default KeyTablesPage;
