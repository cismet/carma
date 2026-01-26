import { useEffect, useState, useCallback, useRef } from "react";
import { Form, Input, Table, Button, Checkbox, message } from "antd";
import FormActionButtons from "../FormActionButtons";
import type { FormInstance } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, MinusOutlined } from "@ant-design/icons";
import { useSyncOptional } from "@carma-providers/syncing";
import {
  saveKeyTableItemWithCallback,
  TEMP_ID_THRESHOLD,
} from "../../../helper/syncHelper";
import { fetchInfobausteinTemplateById } from "../../../helper/apiMethods";

interface Infobaustein {
  id: number;
  schluessel: string;
  bezeichnung: string;
  wert: string | null;
  pflichtfeld: boolean | null;
}

interface ArBausteinItem {
  infobaustein: Infobaustein;
}

interface InfobausteinTemplateFormProps {
  item: Record<string, unknown>;
  tableName: string;
  onSave: (updatedItem: Record<string, unknown>) => void;
  onIdUpdated?: (oldId: number, newId: number, tableName: string) => void;
  onFormReady?: (form: FormInstance) => void;
  onValuesChange?: (hasChanges: boolean) => void;
  disabled?: boolean;
  jwt?: string;
  formHasChanges?: boolean;
  onReset?: () => void;
  hideButtons?: boolean;
  onSaveError?: () => void;
  onValidationChange?: (hasErrors: boolean) => void;
}

const getInitialTableData = (item: Record<string, unknown>): Infobaustein[] => {
  const arBausteineArray = item.ar_bausteineArray as
    | ArBausteinItem[]
    | undefined;
  if (arBausteineArray) {
    return arBausteineArray.map((item) => ({
      ...item.infobaustein,
      // Server sometimes returns "null" string instead of null - convert it back
      wert: item.infobaustein.wert === "null" ? null : item.infobaustein.wert,
      bezeichnung:
        item.infobaustein.bezeichnung === "null"
          ? null
          : item.infobaustein.bezeichnung,
    }));
  }
  return [];
};

const InfobausteinTemplateForm = ({
  item,
  tableName,
  onSave,
  onIdUpdated,
  onFormReady,
  onValuesChange,
  disabled = false,
  jwt,
  formHasChanges = false,
  onReset,
  hideButtons = false,
  onSaveError,
  onValidationChange,
}: InfobausteinTemplateFormProps) => {
  const [form] = Form.useForm();
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const sync = useSyncOptional();
  const [tableData, setTableData] = useState<Infobaustein[]>(() =>
    getInitialTableData(item)
  );
  const [selectedRowKey, setSelectedRowKey] = useState<number | null>(null);
  const resetTableDataRef = useRef<() => void>();

  // Reset pending state when item changes (server confirmed save)
  // This handles both new items (id changes) and updates (item data changes)
  useEffect(() => {
    setPendingConfirmation(false);
  }, [item]);

  const resetTableData = useCallback(() => {
    setTableData(getInitialTableData(item));
    setSelectedRowKey(null);
  }, [item]);

  resetTableDataRef.current = resetTableData;

  useEffect(() => {
    if (onFormReady) {
      const originalResetFields = form.resetFields.bind(form);
      const wrappedForm = {
        ...form,
        resetFields: (...args: Parameters<FormInstance["resetFields"]>) => {
          originalResetFields(...args);
          resetTableDataRef.current?.();
        },
      } as FormInstance;
      onFormReady(wrappedForm);
    }
  }, [form, onFormReady]);

  useEffect(() => {
    const arBausteineArray = item.ar_bausteineArray as
      | ArBausteinItem[]
      | undefined;
    if (arBausteineArray) {
      const data = arBausteineArray.map((item) => ({
        ...item.infobaustein,
        // Server sometimes returns "null" string instead of null - convert it back
        wert: item.infobaustein.wert === "null" ? null : item.infobaustein.wert,
        bezeichnung:
          item.infobaustein.bezeichnung === "null"
            ? null
            : item.infobaustein.bezeichnung,
      }));
      setTableData(data);
    }
  }, [item]);

  const handleValuesChange = () => {
    if (onValuesChange) {
      const currentValues = form.getFieldsValue();
      const hasChanges =
        currentValues.schluessel !== item.schluessel ||
        currentValues.bezeichnung !== item.bezeichnung;
      onValuesChange(hasChanges);
    }

    // Check for validation errors
    form
      .validateFields({ validateOnly: true })
      .then(() => onValidationChange?.(false))
      .catch((errorInfo) => {
        const hasErrors = errorInfo.errorFields?.length > 0;
        onValidationChange?.(hasErrors);
      });
  };

  // Custom handler that fetches fresh data after save and updates the item
  // Called for BOTH new items and updates (via saveKeyTableItemWithCallback)
  const handleIdUpdatedWithFetch = async (
    oldId: number,
    newId: number,
    tableName: string
  ) => {
    if (!jwt) return;

    try {
      const freshData = await fetchInfobausteinTemplateById(jwt, newId);

      // For new items, also call the original onIdUpdated to update parent ID in Redux
      if (oldId !== newId && onIdUpdated) {
        onIdUpdated(oldId, newId, tableName);
      }

      if (freshData) {
        onSave(freshData as Record<string, unknown>);
      }
    } catch (error) {
      console.error("Failed to fetch updated InfobausteinTemplate:", error);
      // Fall back for new items
      if (oldId !== newId && onIdUpdated) {
        onIdUpdated(oldId, newId, tableName);
      }
    }
  };

  const handleSave = (values: Record<string, unknown>) => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      onSaveError?.();
      return;
    }

    // Get original IDs from the item prop to identify which bausteine are truly new
    const originalBausteinIds = new Set(
      ((item.ar_bausteineArray as ArBausteinItem[] | undefined) || []).map(
        (b) => b.infobaustein.id
      )
    );

    const updatedArBausteineArray = tableData.map((baustein) => ({
      infobaustein: {
        ...baustein,
        // Only use -1 for items that don't exist in the original data (truly new items)
        // Items with temp IDs that exist in originalBausteinIds have already been saved
        id: originalBausteinIds.has(baustein.id) ? baustein.id : -1,
      },
    }));

    const itemWithTableData = {
      ...item,
      ar_bausteineArray: updatedArBausteineArray,
    };

    const result = saveKeyTableItemWithCallback({
      item: itemWithTableData,
      values: {
        ...values,
        ar_bausteineArray: updatedArBausteineArray,
      },
      tableName,
      sync,
      onIdUpdated: handleIdUpdatedWithFetch,
    });

    if (result.success) {
      message.success("Aktion zur Synchronisation hinzugefügt");

      // Always wait for handleIdUpdatedWithFetch callback (both new and updates)
      // Don't call onSave here - the callback will call it with fresh data
      setPendingConfirmation(true);

      onValuesChange?.(false);
    } else {
      message.error(result.error || "Fehler beim Speichern");
      onSaveError?.();
    }
  };

  const handleAddRow = () => {
    const newId = -Date.now();
    const newRow: Infobaustein = {
      id: newId,
      schluessel: String(tableData.length + 1),
      bezeichnung: "",
      wert: null,
      pflichtfeld: false,
    };
    setTableData([...tableData, newRow]);
    if (onValuesChange) {
      onValuesChange(true);
    }
  };

  const handleRemoveRow = () => {
    if (selectedRowKey !== null) {
      setTableData(tableData.filter((row) => row.id !== selectedRowKey));
      setSelectedRowKey(null);
      if (onValuesChange) {
        onValuesChange(true);
      }
    }
  };

  const handleCellChange = (
    id: number,
    field: keyof Infobaustein,
    value: string | boolean | null
  ) => {
    setTableData(
      tableData.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
    if (onValuesChange) {
      onValuesChange(true);
    }
  };

  const isFormDisabled = disabled || pendingConfirmation;

  const columns: ColumnsType<Infobaustein> = [
    {
      title: "Schlüssel",
      dataIndex: "schluessel",
      key: "schluessel",
      width: 120,
      render: (text: string, record: Infobaustein) => (
        <Input
          value={text}
          onChange={(e) =>
            handleCellChange(record.id, "schluessel", e.target.value)
          }
          disabled={isFormDisabled}
          size="small"
        />
      ),
    },
    {
      title: "Bezeichnung",
      dataIndex: "bezeichnung",
      key: "bezeichnung",
      render: (text: string, record: Infobaustein) => (
        <Input
          value={text}
          onChange={(e) =>
            handleCellChange(record.id, "bezeichnung", e.target.value)
          }
          disabled={isFormDisabled}
          size="small"
        />
      ),
    },
    {
      title: "Wert",
      dataIndex: "wert",
      key: "wert",
      render: (text: string | null, record: Infobaustein) => (
        <Input
          value={text || ""}
          onChange={(e) =>
            handleCellChange(record.id, "wert", e.target.value || null)
          }
          disabled={isFormDisabled}
          size="small"
        />
      ),
    },
    {
      title: "Pflichtfeld",
      dataIndex: "pflichtfeld",
      key: "pflichtfeld",
      width: 100,
      align: "center",
      render: (value: boolean | null, record: Infobaustein) => (
        <Checkbox
          checked={!!value}
          onChange={(e) =>
            handleCellChange(record.id, "pflichtfeld", e.target.checked)
          }
          disabled={isFormDisabled}
        />
      ),
    },
  ];

  return (
    <Form
      form={form}
      initialValues={item}
      onFinish={handleSave}
      onValuesChange={handleValuesChange}
      layout="vertical"
      style={{ padding: "8px 0" }}
      disabled={disabled || pendingConfirmation}
    >
      <Form.Item
        name="schluessel"
        label={
          <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
            Schlüssel
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <Input />
      </Form.Item>

      <Form.Item
        name="bezeichnung"
        label={
          <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
            Bezeichnung
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        <Input />
      </Form.Item>

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <Button
            icon={<PlusOutlined />}
            onClick={handleAddRow}
            disabled={disabled || pendingConfirmation}
            size="small"
          />
          <Button
            icon={<MinusOutlined />}
            onClick={handleRemoveRow}
            disabled={
              disabled || pendingConfirmation || selectedRowKey === null
            }
            size="small"
          />
        </div>
        <style>
          {`
            .infobaustein-table .ant-table-row.selected-row > td {
              background-color: #e6f4ff !important;
            }
            .infobaustein-table .ant-table-row {
              cursor: pointer;
            }
          `}
        </style>
        <Table
          className="infobaustein-table"
          columns={columns}
          dataSource={tableData}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ y: 800 }}
          rowClassName={(record) =>
            selectedRowKey === record.id ? "selected-row" : ""
          }
          onRow={(record) => ({
            onClick: () => setSelectedRowKey(record.id),
          })}
        />
      </div>
      {/* {!disabled && !hideButtons && (
        <FormActionButtons formHasChanges={formHasChanges} onReset={onReset} />
      )} */}
    </Form>
  );
};

export default InfobausteinTemplateForm;
