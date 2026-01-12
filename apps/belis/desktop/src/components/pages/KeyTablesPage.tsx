import { useEffect, useState, useRef } from "react";
import {
  fetchAllKeyTables,
  // deleteDataByClassName,
  removeDataByClassName,
} from "../../helper/apiMethods";
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
import { Spin, Alert, Modal, message } from "antd";
import KeyTableDataGroups from "../ui/KeyTableDataGroups";
import KeyTableDataGroupsList from "../ui/KeyTableDataGroupsList";
import FormWrapper from "../ui/FormWrapper";
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

  // Keep refs to current data and selectedItem to avoid stale closure in Modal.confirm callback
  // Update synchronously during render (not in useEffect which runs after)
  const dataRef = useRef(data);
  dataRef.current = data;
  const selectedItemRef = useRef(selectedItem);
  selectedItemRef.current = selectedItem;

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

  // Select first item when table changes (apply sorting to match displayed order)
  useEffect(() => {
    if (selectedTable && data[selectedTable]) {
      const tableItems = data[selectedTable] as Record<string, unknown>[];
      if (Array.isArray(tableItems) && tableItems.length > 0) {
        const sortMode = keyTableDisplayConfig[selectedTable]?.sortMode;
        let sortedItems = [...tableItems];

        if (sortMode && sortMode !== "none") {
          sortedItems.sort((a, b) => {
            const aText = getItemDisplayText(
              a,
              selectedTable,
              keyTableDisplayConfig
            );
            const bText = getItemDisplayText(
              b,
              selectedTable,
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
        }

        setSelectedItem({
          item: sortedItems[0],
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
    // Use ref to get fresh selectedItem value
    const currentSelectedItem = selectedItemRef.current;
    if (!currentSelectedItem) return;

    const newData = { ...dataRef.current };
    const tableData = [...(newData[currentSelectedItem.tableName] as unknown[])];

    // Check if this is a temporary unsaved item (created with -Date.now())
    // Temporary IDs are very large negative numbers (like -1736441234567)
    const isNewItem = (currentSelectedItem.item.id as number) < -1000000000;

    if (isNewItem) {
      // New item - add to the list
      tableData.unshift(updatedItem);
    } else {
      // Existing item - update in place
      const index = tableData.findIndex(
        (i: unknown) => (i as Record<string, unknown>).id === updatedItem.id
      );
      if (index !== -1) {
        tableData[index] = updatedItem;
      }
    }

    newData[currentSelectedItem.tableName] = tableData;
    dispatch(setKeyTablesData(newData));

    // Select the saved item (with the new real ID)
    setSelectedItem({ item: updatedItem, tableName: currentSelectedItem.tableName });
  };

  const handleAddItem = () => {
    if (!selectedTable) return;
    const tableItems = dataRef.current[selectedTable] as Record<string, unknown>[];
    const templateItem = tableItems[0] || {};

    // Create new item with same shape, empty values, and temporary negative id
    const newItem: Record<string, unknown> = {};
    Object.keys(templateItem).forEach((key) => {
      newItem[key] = key === "id" ? -Date.now() : "";
    });

    // Don't add to list yet - just select the new item to show empty form
    // The item will be added to the list when saved via handleItemSaved
    setSelectedItem({ item: newItem, tableName: selectedTable });
  };

  const handleRemoveItem = () => {
    if (!selectedItem || !storedJWT) return;

    const itemId = selectedItem.item.id as number;
    // Check if this is a temporary unsaved item (created with -Date.now())
    // Temporary IDs are very large negative numbers (like -1736441234567)
    // Small negative numbers like -1 could be valid database IDs
    const isTemporaryUnsavedItem = itemId < -1000000000;
    if (isTemporaryUnsavedItem) {
      // New unsaved item - select first item in the list instead
      const tableData = dataRef.current[selectedItem.tableName] as Record<string, unknown>[];
      if (tableData && tableData.length > 0) {
        // Apply sorting to match displayed order
        const sortMode = keyTableDisplayConfig[selectedItem.tableName]?.sortMode;
        let sortedItems = [...tableData];
        if (sortMode && sortMode !== "none") {
          sortedItems.sort((a, b) => {
            const aText = getItemDisplayText(a, selectedItem.tableName, keyTableDisplayConfig);
            const bText = getItemDisplayText(b, selectedItem.tableName, keyTableDisplayConfig);
            if (sortMode === "alphabetical") {
              return aText.localeCompare(bText, "de", { sensitivity: "base" });
            }
            if (sortMode === "numeric") {
              return aText.localeCompare(bText, "de", { numeric: true });
            }
            return 0;
          });
        }
        setSelectedItem({ item: sortedItems[0], tableName: selectedItem.tableName });
      } else {
        setSelectedItem(null);
      }
      return;
    }

    Modal.confirm({
      title: "Eintrag löschen",
      content: "Möchten Sie diesen Eintrag wirklich löschen?",
      okText: "Löschen",
      okType: "danger",
      cancelText: "Abbrechen",
      onOk: async () => {
        // Use refs to get fresh values, not stale closure
        const currentSelectedItem = selectedItemRef.current;
        if (!currentSelectedItem) return;

        try {
          const apiClassName =
            keyTableDisplayConfig[currentSelectedItem.tableName]?.apiClassName ||
            currentSelectedItem.tableName;
          await removeDataByClassName(
            storedJWT,
            apiClassName,
            currentSelectedItem.item
          );
          message.success("Gelöscht");

          // Remove from Redux state - use dataRef to get fresh data
          const currentItemId = currentSelectedItem.item.id as number;
          const newData = { ...dataRef.current };
          const tableData = (
            newData[currentSelectedItem.tableName] as unknown[]
          ).filter(
            (i: unknown) => (i as Record<string, unknown>).id !== currentItemId
          );
          newData[currentSelectedItem.tableName] = tableData;
          dispatch(setKeyTablesData(newData));

          // Select first SORTED item after delete (to match displayed order)
          if (tableData.length > 0) {
            const sortMode =
              keyTableDisplayConfig[currentSelectedItem.tableName]?.sortMode;
            let sortedItems = [...tableData] as Record<string, unknown>[];

            if (sortMode && sortMode !== "none") {
              sortedItems.sort((a, b) => {
                const aText = getItemDisplayText(
                  a,
                  currentSelectedItem.tableName,
                  keyTableDisplayConfig
                );
                const bText = getItemDisplayText(
                  b,
                  currentSelectedItem.tableName,
                  keyTableDisplayConfig
                );
                if (sortMode === "alphabetical") {
                  return aText.localeCompare(bText, "de", {
                    sensitivity: "base",
                  });
                }
                if (sortMode === "numeric") {
                  return aText.localeCompare(bText, "de", { numeric: true });
                }
                return 0;
              });
            }

            setSelectedItem({
              item: sortedItems[0],
              tableName: currentSelectedItem.tableName,
            });
          } else {
            setSelectedItem(null);
          }
        } catch (error) {
          console.error("Delete error:", error);
          message.error("Fehler beim Löschen");
        }
      },
    });
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
                key={`${selectedTable}-${selectedTableItems.length}`}
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
