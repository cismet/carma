import { useCallback, useEffect, useMemo, useState } from "react";
import { Form, Input, Row, Col, Table, Tag, DatePicker } from "antd";
import { useSelector, useDispatch } from "react-redux";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";
import { getFormClassName } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";
import {
  AktionModal,
  getAktionLabels,
  findAktionDefinition,
  computeAenderungen,
} from "./aktionModal";
import type { AktionDefinition, AktionFormValues } from "./aktionModal";
import PlannedTimeline from "./PlannedTimeline";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import {
  addActionToAPDraft,
  removeActionFromAPDraft,
  getAPDraftActions,
} from "../../../store/slices/arbeitsauftraegeDrafts";
import { serializeValues } from "../../../helper/draftSerialize";
import { getFachobjektOfProtocol } from "@carma-appframeworks/belis";
import { getHeaderColorFromStatus } from "../../../helper/buildApGeoJson";
import type { RootState } from "../../../store";

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

interface AenderungRow {
  key: number;
  aenderung: string;
  alt: string;
  neu: string;
}

interface ArbeitsprotokollFormFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  fachobjektType?: string;
  readOnly?: boolean;
  onFormInstance?: (form: import("antd").FormInstance) => void;
  draftValues?: Record<string, unknown>;
  onValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>
  ) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
  apId?: string;
}

const ArbeitsprotokollFormFields = ({
  data,
  fachobjektType,
  readOnly = true,
  onFormInstance,
  draftValues,
  onValuesChange,
  onOriginalValues,
  apId,
}: ArbeitsprotokollFormFieldsProps) => {
  const [form] = Form.useForm();
  const dispatch = useDispatch();
  const keyTablesData = useSelector(getKeyTablesData);
  const draftActions = useSelector((state: RootState) =>
    getAPDraftActions(state, apId)
  );

  useEffect(() => {
    onFormInstance?.(form);
  }, [form, onFormInstance]);

  useEffect(() => {
    form.resetFields();
    if (data) {
      const serverValues = {
        monteur: data.monteur ?? "",
        datum: data.datum ? dayjs(data.datum) : null,
        status: data.arbeitsprotokollstatus?.bezeichnung ?? "",
        material: data.material ?? "",
        bemerkung: data.bemerkung ?? "",
      };
      form.setFieldsValue(serverValues);
      onOriginalValues?.(form.getFieldsValue());
      if (draftValues) {
        form.setFieldsValue(draftValues);
      }
    }
  }, [data, form, draftValues, onOriginalValues]);
  const aktionen = fachobjektType ? getAktionLabels(fachobjektType) : [];

  const [selectedAktion, setSelectedAktion] = useState<AktionDefinition | null>(
    null
  );
  const [modalOpen, setModalOpen] = useState(false);

  const handleTagClick = useCallback(
    (aktionLabel: string) => {
      if (readOnly || !fachobjektType) return;
      const definition = findAktionDefinition(fachobjektType, aktionLabel);
      if (definition) {
        setSelectedAktion(definition);
        setModalOpen(true);
      }
    },
    [readOnly, fachobjektType]
  );

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    setSelectedAktion(null);
  }, []);

  const handleAktionSubmit = useCallback(
    (aktionLabel: string, fType: string, values: AktionFormValues) => {
      if (!apId || !fachobjektType) return;
      const definition = findAktionDefinition(fachobjektType, aktionLabel);
      if (!definition) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fachobjektData = (data?.[fachobjektType] as Record<string, any>) ?? null;
      const aenderungen = computeAenderungen(
        definition,
        values,
        fachobjektData,
        keyTablesData as Record<string, Record<string, unknown>[]>,
      );

      dispatch(
        addActionToAPDraft({
          id: apId,
          draftAction: {
            actionLabel: aktionLabel,
            fachobjektType: fType,
            values: serializeValues(values),
            aenderungen,
            createdAt: Date.now(),
          },
          serverData: data as Record<string, unknown>,
          meta: {
            protokollnummer: data?.protokollnummer != null
              ? String(data.protokollnummer)
              : undefined,
            fachobjektType,
            veranlassung: data?.veranlassung?.bezeichnung as string | undefined,
            headerColor: getHeaderColorFromStatus(data?.arbeitsprotokollstatus ?? null),
            datum: data?.datum
              ? new Date(data.datum as string).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })
              : undefined,
            shortname: getFachobjektOfProtocol(data)?.shortname as string | undefined ?? fachobjektType,
          },
        })
      );
    },
    [apId, fachobjektType, data, keyTablesData, dispatch]
  );

  const handleAktionRemove = useCallback(
    (index: number) => {
      if (!apId) return;
      dispatch(removeActionFromAPDraft({ id: apId, actionIndex: index }));
    },
    [apId, dispatch]
  );

  const aenderungRows: AenderungRow[] = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: Record<string, any>[] = data?.arbeitsprotokollaktionArray ?? [];
    return arr.map((entry, idx) => ({
      key: idx,
      aenderung: entry.aenderung ?? "",
      alt: entry.alt ?? "",
      neu: entry.neu ?? "",
    }));
  }, [data]);

  const aenderungColumns: ColumnsType<AenderungRow> = [
    {
      title: "Änderung",
      dataIndex: "aenderung",
      key: "aenderung",
      ellipsis: true,
    },
    {
      title: "von",
      dataIndex: "alt",
      key: "alt",
      width: 150,
      ellipsis: true,
    },
    {
      title: "zu",
      dataIndex: "neu",
      key: "neu",
      width: 150,
      ellipsis: true,
    },
  ];

  return (
    <div className="flex flex-col gap-4 pt-2">
      {/* Section A: Basic fields */}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        className={getFormClassName(readOnly)}
        onValuesChange={onValuesChange}
      >
        <Row gutter={16}>
          <Col span={12}>
            <FormItem
              name="monteur"
              label={<FormLabel>Monteur</FormLabel>}
              className="mb-4"
            >
              <Input size="large" />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem
              name="datum"
              label={<FormLabel>Datum</FormLabel>}
              className="mb-4"
            >
              <DatePicker
                size="large"
                format="DD.MM.YYYY"
                style={{ width: "100%" }}
              />
            </FormItem>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <FormItem
              name="status"
              label={<FormLabel>Status</FormLabel>}
              className="mb-4"
            >
              <Input size="large" />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem
              name="material"
              label={<FormLabel>Material</FormLabel>}
              className="mb-4"
            >
              <Input size="large" />
            </FormItem>
          </Col>
        </Row>
        <FormItem
          name="bemerkung"
          label={<FormLabel>Bemerkung</FormLabel>}
          className="mb-4"
        >
          <Input.TextArea size="large" autoSize={{ minRows: 2, maxRows: 6 }} />
        </FormItem>
      </Form>

      {/* Section B: Aktionen */}
      {aktionen.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Aktionen</div>
          <div className="flex flex-wrap gap-1">
            {aktionen.map((aktion) => (
              <Tag
                key={aktion}
                className={
                  readOnly
                    ? ""
                    : "cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors"
                }
                color={"default"}
                onClick={() => handleTagClick(aktion)}
              >
                {aktion}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {/* Section B2: Planned actions timeline */}
      <PlannedTimeline
        actions={draftActions}
        onRemove={handleAktionRemove}
        readOnly={readOnly}
      />

      {/* Section C: Änderung table */}
      <div>
        <div className="text-sm font-medium text-gray-700 mb-2">
          Änderungen ({aenderungRows.length})
        </div>
        {aenderungRows.length > 0 ? (
          <Table<AenderungRow>
            columns={aenderungColumns}
            dataSource={aenderungRows}
            size="small"
            pagination={false}
            scroll={{ y: 300 }}
          />
        ) : (
          <div className="text-sm text-gray-400">
            Keine Änderungen vorhanden
          </div>
        )}
      </div>
      <AktionModal
        aktion={selectedAktion}
        fachobjektType={fachobjektType ?? ""}
        open={modalOpen}
        onClose={handleModalClose}
        onSubmit={handleAktionSubmit}
      />
    </div>
  );
};

export default ArbeitsprotokollFormFields;
