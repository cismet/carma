import { useEffect, useMemo } from "react";
import { Form, Input, Row, Col, Table, Select } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useDispatch, useSelector } from "react-redux";
import { DeleteOutlined, UndoOutlined } from "@ant-design/icons";
import { getFachobjektOfProtocol } from "@carma-appframeworks/belis";
import {
  setSelectedAPId,
  setApOpenedFrom,
  getSelectedAPId,
} from "../../../store/slices/arbeitsauftraege";
import type { AppDispatch, RootState } from "../../../store";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import {
  markAPForDeletion,
  unmarkAPForDeletion,
  getAPDeletions,
} from "../../../store/slices/arbeitsauftraegeDrafts";
import { getFormClassName } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";
import toTitleCase from "../../../helper/toTitleCase";

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const FEATURE_TYPE_LABELS: Record<string, string> = {
  tdta_leuchten: "Leuchte",
  mast: "Mast",
  standort: "Standort",
  schaltstelle: "Schaltstelle",
  mauerlasche: "Mauerlasche",
  leitung: "Leitung",
  abzweigdose: "Abzweigdose",
  geom: "Freie Geometrie",
};

function formatDate(isoDate: string): string {
  if (!isoDate) return "";
  try {
    return new Date(isoDate).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPosition(fachobjekt: Record<string, any> | undefined): string {
  if (!fachobjekt) return "";

  // For leuchten, use the standort's street
  if (fachobjekt.type === "tdta_leuchten") {
    return (
      fachobjekt.fk_standort?.fk_strassenschluessel?.strasse ??
      fachobjekt.fk_strassenschluessel?.strasse ??
      ""
    );
  }

  return fachobjekt.fk_strassenschluessel?.strasse ?? "";
}

interface ProtokolleRow {
  key: number;
  protokollnummer: number;
  herkunft: string;
  fachobjektType: string;
  kennzeichnung: string;
  bearbeiter: string;
  position: string;
  status: string;
  isDeleted: boolean;
  id: number;
}

interface ArbeitsauftragFormFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  readOnly?: boolean;
  onFormInstance?: (form: import("antd").FormInstance) => void;
  draftValues?: Record<string, unknown>;
  onValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
  aaId?: string;
}

const ArbeitsauftragFormFields = ({
  data,
  readOnly = true,
  onFormInstance,
  draftValues,
  onValuesChange,
  onOriginalValues,
  aaId,
}: ArbeitsauftragFormFieldsProps) => {
  const [form] = Form.useForm();
  const dispatch: AppDispatch = useDispatch();
  const selectedAPId = useSelector(getSelectedAPId);
  const keyTablesData = useSelector(getKeyTablesData);
  const apDeletions = useSelector((state: RootState) => getAPDeletions(state));

  const teamOptions = useMemo(
    () =>
      [...((keyTablesData.teams || []) as { id: number; name?: string }[])]
        .sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", "de", {
            sensitivity: "base",
          }),
        )
        .map((team) => ({ value: team.id, label: team.name || "" })),
    [keyTablesData.teams],
  );

  useEffect(() => {
    onFormInstance?.(form);
  }, [form, onFormInstance]);

  useEffect(() => {
    form.resetFields();
    if (data) {
      const serverValues = {
        zugewiesen_an: data.team?.id ?? null,
      };
      form.setFieldsValue(serverValues);
      onOriginalValues?.(form.getFieldsValue());
      if (draftValues) {
        form.setFieldsValue(draftValues);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, form]);

  const protokolleRows: ProtokolleRow[] = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const protokolle: Record<string, any>[] =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (
        data?.ar_protokolleArray
          ?.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (entry: Record<string, any>) => entry.arbeitsprotokoll
          )
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((p: Record<string, any> | null): p is Record<string, any> => p != null) ?? []
      ).sort(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: Record<string, any>, b: Record<string, any>) =>
          Number(a.protokollnummer) - Number(b.protokollnummer)
      );

    return protokolle.map((p) => {
      const fachobjekt = getFachobjektOfProtocol(p);
      const veranlassung = p.veranlassung;
      const herkunftParts = ["V" + (veranlassung?.nummer ?? "")];
      if (veranlassung?.fk_veranlassungsart?.schluessel) {
        herkunftParts.push(veranlassung.fk_veranlassungsart.schluessel);
      }

      let resolvedType = fachobjekt?.type ?? "";
      if (resolvedType === "tdta_standort_mast") {
        resolvedType = p.tdta_standort_mast?.fk_masttyp ? "mast" : "standort";
      }

      let kennzeichnung = "";
      switch (resolvedType) {
        case "abzweigdose":
          break;
        case "geom":
          kennzeichnung = p.geometrie?.bezeichnung ?? "";
          break;
        case "leitung":
          kennzeichnung = p.leitung?.fk_leitungstyp?.bezeichnung ?? "";
          break;
        case "tdta_leuchten": {
          const leuchtennummer = p.tdta_leuchten?.lfd_nummer ?? null;
          const leuchtentyp =
            p.tdta_leuchten?.fk_leuchttyp?.leuchtentyp ?? null;
          if (leuchtennummer != null && leuchtentyp != null) {
            kennzeichnung = leuchtennummer + ", " + leuchtentyp;
          } else if (leuchtennummer != null) {
            kennzeichnung = String(leuchtennummer);
          } else if (leuchtentyp != null) {
            kennzeichnung = String(leuchtentyp);
          }
          break;
        }
        case "mauerlasche":
          kennzeichnung =
            p.mauerlasche?.laufende_nummer != null
              ? String(p.mauerlasche.laufende_nummer)
              : "";
          break;
        case "schaltstelle":
          kennzeichnung =
            p.schaltstelle?.schaltstellen_nummer != null
              ? String(p.schaltstelle.schaltstellen_nummer)
              : "";
          break;
        case "mast":
        case "standort": {
          const masttyp = p.tdta_standort_mast?.fk_masttyp?.masttyp ?? null;
          const mastart = p.tdta_standort_mast?.fk_mastart?.mastart ?? null;
          if (masttyp != null && mastart != null) {
            kennzeichnung = masttyp + ", " + mastart;
          } else if (masttyp != null) {
            kennzeichnung = String(masttyp);
          } else if (mastart != null) {
            kennzeichnung = String(mastart);
          }
          break;
        }
      }

      return {
        key: p.id,
        id: p.id,
        protokollnummer: p.protokollnummer,
        herkunft: herkunftParts.join(" "),
        fachobjektType:
          FEATURE_TYPE_LABELS[resolvedType] ?? fachobjekt?.type ?? "Unbekannt",
        kennzeichnung,
        bearbeiter: p.monteur ?? "",
        position: toTitleCase(getPosition(fachobjekt)),
        status: p.arbeitsprotokollstatus?.bezeichnung ?? "Unbekannt",
        isDeleted: p.is_deleted === true,
      };
    });
  }, [data]);

  const columns: ColumnsType<ProtokolleRow> = [
    {
      title: "#",
      dataIndex: "protokollnummer",
      key: "protokollnummer",
      width: 50,
    },
    {
      title: "Herkunft",
      dataIndex: "herkunft",
      key: "herkunft",
      width: 100,
    },
    {
      title: "Fachobjekt",
      dataIndex: "fachobjektType",
      key: "fachobjektType",
      width: 110,
    },
    {
      title: "Kennzeichnung",
      dataIndex: "kennzeichnung",
      key: "kennzeichnung",
      ellipsis: true,
    },
    {
      title: "Bearbeiter",
      dataIndex: "bearbeiter",
      key: "bearbeiter",
      width: 100,
    },
    {
      title: "Position",
      dataIndex: "position",
      key: "position",
      ellipsis: true,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 120,
    },
    ...(!readOnly
      ? [
          {
            title: "",
            key: "actions",
            width: 50,
            render: (_: unknown, record: ProtokolleRow) => {
              const apId = String(record.id);
              const isMarked = apId in apDeletions;
              return isMarked ? (
                <UndoOutlined
                  className="text-blue-500 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch(unmarkAPForDeletion(apId));
                  }}
                />
              ) : (
                <DeleteOutlined
                  className="text-red-500 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (aaId) {
                      dispatch(markAPForDeletion({ apId, aaId }));
                    }
                  }}
                />
              );
            },
          } satisfies ColumnsType<ProtokolleRow>[number],
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4 pt-2">
      {/* Header fields */}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        className={getFormClassName(readOnly)}
        onValuesChange={onValuesChange}
      >
        <Row gutter={16}>
          <Col span={12} className="cursor-not-allowed">
            <div className="pointer-events-none">
              <Form.Item
                label={<FormLabel>Auftragsnummer</FormLabel>}
                className="mb-4"
              >
                <Input value={data.nummer ?? ""} size="large" readOnly />
              </Form.Item>
            </div>
          </Col>
          <Col span={12}>
            <FormItem
              name="zugewiesen_an"
              label={<FormLabel>Zugewiesen an</FormLabel>}
              className="mb-4"
            >
              <Select
                size="large"
                options={teamOptions}
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
                allowClear
              />
            </FormItem>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12} className="cursor-not-allowed">
            <div className="pointer-events-none">
              <Form.Item
                label={<FormLabel>Angelegt von</FormLabel>}
                className="mb-4"
              >
                <Input value={data.angelegt_von ?? ""} size="large" readOnly />
              </Form.Item>
            </div>
          </Col>
          <Col span={12} className="cursor-not-allowed">
            <div className="pointer-events-none">
              <Form.Item
                label={<FormLabel>Angelegt am</FormLabel>}
                className="mb-4"
              >
                <Input
                  value={formatDate(data.angelegt_am ?? "")}
                  size="large"
                  readOnly
                />
              </Form.Item>
            </div>
          </Col>
        </Row>
      </Form>

      {/* Protokolle table */}
      <div>
        <div className="text-sm font-medium text-gray-700 mb-2">
          Protokolle ({protokolleRows.length})
        </div>
        <Table<ProtokolleRow>
          columns={columns}
          dataSource={protokolleRows}
          size="small"
          pagination={false}
          scroll={{ y: 400 }}
          rowClassName={(record) => {
            const classes: string[] = [];
            if (record.isDeleted || String(record.id) in apDeletions)
              classes.push("line-through opacity-50");
            if (record.id === selectedAPId) classes.push("bg-blue-50");
            return classes.join(" ");
          }}
          onRow={(record) => ({
            onClick: () => {
              dispatch(setSelectedAPId(record.id));
            },
            onDoubleClick: () => {
              dispatch(setSelectedAPId(record.id));
              dispatch(setApOpenedFrom("auTable"));
            },
            style: { cursor: "pointer" },
          })}
        />
      </div>
    </div>
  );
};

export default ArbeitsauftragFormFields;
