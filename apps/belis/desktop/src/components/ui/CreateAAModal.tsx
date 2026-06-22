import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Button, Form, Input, Row, Col, Select, message } from "antd";
import { useSelector } from "react-redux";
import dayjs from "dayjs";
import { getLogin, getJWT } from "../../store/slices/auth";
import { getKeyTablesData } from "../../store/slices/keyTables";
import { buildNewAAFromFeatures } from "../../helper/buildNewAAFromFeatures";
import {
  executeAction,
  fetchArbeitsauftragById,
  updateDataByClassName,
} from "../../helper/apiMethods";
import type { SidebarFeature } from "./BelisSidebar";

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

interface CreateAAModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  highlights: SidebarFeature[];
}

const CreateAAModal = ({
  open,
  onClose,
  onCreated,
  highlights,
}: CreateAAModalProps) => {
  const [form] = Form.useForm();
  const login = useSelector(getLogin);
  const jwt = useSelector(getJWT);
  const keyTablesData = useSelector(getKeyTablesData);
  const [saving, setSaving] = useState(false);

  const teamOptions = useMemo(() => {
    if (!keyTablesData?.teams) return [];
    return ([...keyTablesData.teams] as { id: number; name?: string }[])
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "de"))
      .map((team) => ({
        value: team.id,
        label: team.name || "",
      }));
  }, [keyTablesData]);

  const today = dayjs().format("DD.MM.YYYY");

  useEffect(() => {
    if (open) {
    }
  }, [open, highlights]);

  const handleSubmit = useCallback(async () => {
    if (!jwt || !login) return;

    const values = form.getFieldsValue();
    const teamId = values.zugewiesen_an as number | undefined;
    const bezeichnung = (
      (values.bezeichnung as string | undefined) ?? ""
    ).trim();
    const beschreibung = (
      (values.beschreibung as string | undefined) ?? ""
    ).trim();

    const aaSaveData = buildNewAAFromFeatures({
      team: teamId ? { id: teamId } : { id: -1 },
      angelegtVon: login,
      features: highlights,
    });

    setSaving(true);

    try {
      const saveResult = (await updateDataByClassName(
        jwt as string,
        "arbeitsauftrag",
        aaSaveData
      )) as { res?: string } | null;

      const rawRes = saveResult?.res;
      const parsedRes = rawRes
        ? (JSON.parse(rawRes) as { id?: string | number })
        : null;
      const aaId = parsedRes?.id != null ? String(parsedRes.id) : undefined;

      if (!aaId) {
        throw new Error("AA gespeichert, aber keine ID in der Antwort");
      }

      if (bezeichnung || beschreibung) {
        try {
          await executeAction(
            jwt as string,
            "editVeranlassungViaAA",
            { bezeichnung, beschreibung, aaid: aaId }
          );

          // try {
          //   const aaAfter = (await fetchArbeitsauftragById(
          //     jwt as string,
          //     Number(aaId)
          //   )) as
          //     | {
          //         nummer?: string;
          //         veranlassung?: {
          //           nummer?: string;
          //           bezeichnung?: string;
          //           beschreibung?: string;
          //         };
          //         ar_protokolleArray?: {
          //           arbeitsprotokoll?: {
          //             id?: number;
          //             veranlassungsnummer?: string;
          //             veranlassung?: {
          //               nummer?: string;
          //               bezeichnung?: string;
          //               beschreibung?: string;
          //             };
          //           };
          //         }[];
          //       }
          //     | null;

          //   console.log("xxx full AA after save:", aaAfter);
          //   console.log(
          //     "xxx AA.veranlassung (AA-level) after save:",
          //     aaAfter?.veranlassung
          //   );
          //   const perProtokoll = aaAfter?.ar_protokolleArray?.map((p) => ({
          //     protokoll_id: p.arbeitsprotokoll?.id,
          //     veranlassungsnummer: p.arbeitsprotokoll?.veranlassungsnummer,
          //     veranlassung: p.arbeitsprotokoll?.veranlassung,
          //   }));
          //   console.log(
          //     "xxx protokoll.veranlassung (nested) after save:",
          //     perProtokoll
          //   );
          // } catch (verifyErr: unknown) {
          //   console.warn(
          //     "[CreateAAModal] verify fetchArbeitsauftragById failed:",
          //     verifyErr
          //   );
          // }
        } catch (err: unknown) {
          console.error("[CreateAAModal] editVeranlassungViaAA failed:", err);
          void message.error(
            "Arbeitsauftrag erstellt, aber Bezeichnung/Beschreibung konnte nicht gespeichert werden"
          );
          form.resetFields();
          onCreated?.();
          onClose();
          return;
        }
      }

      void message.success("Arbeitsauftrag erstellt");
      form.resetFields();
      onCreated?.();
      onClose();
    } catch (err: unknown) {
      console.error("[CreateAAModal] Save failed:", err);
      void message.error("Fehler beim Erstellen des Arbeitsauftrags");
    } finally {
      setSaving(false);
    }
  }, [jwt, login, highlights, form, onClose, onCreated]);

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title="Neuen Arbeitsauftrag erstellen"
      open={open}
      onCancel={handleCancel}
      centered
      width={600}
      footer={
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button onClick={handleCancel} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="primary" onClick={handleSubmit} loading={saving}>
            Erstellen
          </Button>
        </div>
      }
      styles={{
        body: { paddingTop: 16 },
        header: { borderBottom: "1px solid #f3f4f6", paddingBottom: 16 },
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Row gutter={16}>
          <Col span={12} className="cursor-not-allowed">
            <div className="pointer-events-none">
              <Form.Item
                label={<FormLabel>Auftragsnummer</FormLabel>}
                className="mb-4"
              >
                <Input
                  placeholder="Wird automatisch vergeben"
                  size="large"
                  readOnly
                />
              </Form.Item>
            </div>
          </Col>
          <Col span={12}>
            <Form.Item
              name="zugewiesen_an"
              label={<FormLabel>Zugewiesen an</FormLabel>}
              className="mb-4"
            >
              <Select
                size="large"
                placeholder="Team auswählen"
                options={teamOptions}
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
                allowClear
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="bezeichnung"
              label={<FormLabel>Bezeichnung</FormLabel>}
              className="mb-4"
            >
              <Input size="large" placeholder="Bezeichnung eingeben" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              name="beschreibung"
              label={<FormLabel>Beschreibung</FormLabel>}
              className="mb-4"
            >
              <Input.TextArea
                rows={3}
                style={{ resize: "vertical" }}
                placeholder="Beschreibung eingeben"
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12} className="cursor-not-allowed">
            <div className="pointer-events-none">
              <Form.Item
                label={<FormLabel>Angelegt von</FormLabel>}
                className="mb-4"
              >
                <Input value={login ?? ""} size="large" readOnly />
              </Form.Item>
            </div>
          </Col>
          <Col span={12} className="cursor-not-allowed">
            <div className="pointer-events-none">
              <Form.Item
                label={<FormLabel>Angelegt am</FormLabel>}
                className="mb-4"
              >
                <Input value={today} size="large" readOnly />
              </Form.Item>
            </div>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default CreateAAModal;
