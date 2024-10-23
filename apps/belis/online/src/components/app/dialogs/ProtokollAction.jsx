import {
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Switch,
  Typography,
} from "antd";
import TextArea from "antd/lib/input/TextArea";
import moment from "moment";
import { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";

import { getJWT } from "../../../core/store/slices/auth";
import { renewCache } from "../../../core/store/slices/cacheControl";
import { getWorker } from "../../../core/store/slices/dexie";
import {
  getSelectedFeaturesForAllModes,
  MODES,
} from "../../../core/store/slices/featureCollection";

const { Text } = Typography;

const SetStatusDialog = ({
  close = () => {},
  onCancel = (output) => {},
  onClose = (output) => {},
  input = {},
  actionname,
  actionkey,
  title = "",
}) => {
  const selectedFeaturesForAllModes = useSelector(
    getSelectedFeaturesForAllModes
  );
  const arbeitsauftrag =
    selectedFeaturesForAllModes[MODES.TASKLISTS].properties;

  const [form] = Form.useForm();
  const dexieW = useSelector(getWorker);
  const jwt = useSelector(getJWT);

  const [leuchtentypen, setLeuchtentypen] = useState([]);

  // eslint-disable-next-line no-unused-vars
  const [preferredLeuchtentyp, setPreferredLeuchtentyp] = useState();

  const [leuchtmittel, setLeuchtmittel] = useState([]);

  // eslint-disable-next-line no-unused-vars
  const [prefferredLeuchtmittel, setPrefferredLeuchtmittel] = useState([]);

  const [rundsteuerempfaenger, setRundsteuerempfaenger] = useState([]);

  // eslint-disable-next-line no-unused-vars
  const [preferredRundsteuerempfaenger, setPreferredRundsteuerempfaenger] =
    useState();
  const dispatch = useDispatch();

  useEffect(() => {
    //async block
    (async () => {
      if (actionkey === "leuchtenerneuerung") {
        try {
          const lts = await dexieW.getAll("tkey_leuchtentyp");
          if (lts && lts.length > 0) {
            setLeuchtentypen(lts);
          } else {
            dispatch(renewCache("tkey_leuchtentyp", jwt));
          }
        } catch (e) {
          console.log("Error in fetching teams", e);
        }
      }
      if (
        actionkey === "leuchtmittelwechsel" ||
        actionkey === "leuchtmittelwechselEP"
      ) {
        try {
          const lm = await dexieW.getAll("leuchtmittel");
          if (lm && lm.length > 0) {
            setLeuchtmittel(lm);
          } else {
            dispatch(renewCache("leuchtmittel", jwt));
          }
        } catch (e) {
          console.log("Error in fetching teams", e);
        }
      }
      if (actionkey === "rundsteuerempfaengerwechsel") {
        try {
          const rse = await dexieW.getAll("rundsteuerempfaenger");
          if (rse && rse.length > 0) {
            setRundsteuerempfaenger(rse);
          } else {
            dispatch(renewCache("rundsteuerempfaenger", jwt));
          }
        } catch (e) {
          console.log("Error in fetching teams", e);
        }
      }
    })();
  }, []);
  return (
    <Modal
      zIndex={30000001}
      title={
        <>
          <div>{title}</div>{" "}
          <Text type="secondary">{input?.vcard?.infobox?.title}</Text>
        </>
      }
      centered
      visible={true}
      onOk={() => {
        form
          .validateFields()
          .then((values) => {
            const feature = input.feature;
            const momentStatusDate =
              values.statusdate ||
              (input.feature?.properties?.datum
                ? moment(input.feature?.properties?.datum)
                : undefined);
            let statusD;
            if (momentStatusDate) {
              statusD = momentStatusDate?.valueOf();
            }

            const inbetriebnahmeD = values.inbetriebnahme?.valueOf();
            const pruefdatumD = values.pruefdatum?.valueOf();
            const wechseldatumD = values.wechseldatum?.valueOf();
            const einbaudatumD = values.einbaudatum?.valueOf();
            const sonderturnusdatumD = values.sonderturnusdatum?.valueOf();
            const mastanstrichD = values.mastanstrich?.valueOf();
            const revisionD = values.revisionsdatum?.valueOf();
            const naechstes_pruefdatumD =
              values.naechstes_pruefdatum?.valueOf();

            const parameter = {
              //leuchtenerneuerung
              inbetriebnahmedatum: inbetriebnahmeD,
              leuchtentyp: values.leuchtentyp,

              //leuchtmittelwechselEP
              pruefdatum: pruefdatumD,
              erdung_in_ordnung: values.erdung === true ? "ja" : "nein",
              erdung: values.erdung,
              //leuchtmittelwechselEP && leuchtmittelwechsel
              leuchtmittel: values.leuchtmittel,
              wechseldatum: wechseldatumD,
              lebensdauer: values.lebensdauer,

              //rundsteuerempfaengerwechsel
              einbaudatum: einbaudatumD,
              rundsteuerempfaenger: values.rundsteuerempfaenger,

              //sonderturnus
              sonderturnusdatum: sonderturnusdatumD,

              //vorschaltgeraetewechsel
              vorschaltgeraet: values.vorschaltgeraet,
              //wechseldatum: wechseldatumD, //wird weiter oben schon gesetzt

              //mastanstricharbeiten
              anstrichdatum: mastanstrichD,
              anstrichfarbe: values.anstrichfarbe,

              //elektrischepruefung
              // pruefdatum: pruefdatumD,  //wird weiter oben schon gesetzt
              // erdung_in_ordnung: values.erdung === true ? "ja" : "nein", //wird weiter oben schon gesetzt

              //masterneuerung
              // inbetriebnahmedatum: inbetriebnahmeD, //wird weiter oben schon gesetzt
              montagefirma: values.montagefirma,

              //standortrevision
              revisionsdatum: revisionD,

              //standsicherheitspruefung
              // pruefdatum: pruefdatumD, //wird weiter oben schon gesetzt
              verfahren: values.verfahren,
              naechstes_pruefdatum: naechstes_pruefdatumD,

              //schaltstellerevision
              // pruefdatum: pruefdatumD, //wird weiter oben schon gesetzt

              //sonstiges
              bemerkung: values.infos,

              //statussection
              status:
                values.status ||
                input.feature?.properties?.arbeitsprotokollstatus?.id,
              protokoll_id: feature.properties.id,
              monteur: values.monteur || input.feature?.properties?.monteur,
              datum: statusD,

              //pruefung
              // pruefdatum: pruefdatumD, //wird weiter oben schon gesetzt

              //metainformation
              actionname,
              objekt_typ: "arbeitsprotokoll",
              object_name:
                input?.vcard?.infobox?.title +
                " (A" +
                arbeitsauftrag.nummer +
                ")",
            };
            Object.keys(parameter).forEach((key) =>
              parameter[key] === undefined ? delete parameter[key] : {}
            );
            form.resetFields();

            onClose(parameter);

            close();
          })
          .catch((info) => {
            console.log("Validation Failed:", info);
          });
      }}
      onCancel={() => {
        onCancel();
        close();
      }}
      okButtonProps={{ disabled: false }}
      cancelButtonProps={{ disabled: false }}
    >
      <Form
        form={form}
        layout="vertical"
        name="form_in_modal"
        initialValues={{
          modifier: "public",
        }}
      >
        {/* Different input fields for different actions */}

        {actionkey === "leuchtenerneuerung" && (
          <>
            <Form.Item name="inbetriebnahme" label="Inbetriebnahme">
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="leuchtentyp" label="Leuchtentyp">
              <Select
                showSearch
                defaultValue={preferredLeuchtentyp?.id}
                style={{ width: "100%" }}
                filterOption={(input, option) => {
                  const testChilds = option.children.map((child) =>
                    child.toLowerCase().trim()
                  );
                  return (
                    testChilds.join(" ").search(input.toLowerCase().trim()) >= 0
                  );
                }}
                optionFilterProp="children"
                filterSort={(optionA, optionB) =>
                  optionA.children
                    .join(" ")
                    .toLowerCase()
                    .localeCompare(optionB.children.join(" ").toLowerCase())
                }
                // onChange={(x) => {
                //   setSelectedTeamId(x);
                // }}
              >
                {leuchtentypen.map((typ) => {
                  return (
                    <Select.Option value={typ.id}>
                      {typ.leuchtentyp} - {typ.fabrikat}
                    </Select.Option>
                  );
                })}
              </Select>
            </Form.Item>
          </>
        )}

        {actionkey === "leuchtmittelwechselEP" && (
          <>
            <Form.Item
              name="pruefdatum"
              label="Elektrische Prüfung am Mast"
              rules={[
                {
                  required: true,
                  message: "Bitte ein Datum auswählen.",
                },
              ]}
            >
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="Erdung in Ordnung" name="erdung">
              <Switch />
            </Form.Item>
          </>
        )}
        {(actionkey === "leuchtmittelwechsel" ||
          actionkey === "leuchtmittelwechselEP") && (
          <>
            <Form.Item name="wechseldatum" label="Wechseldatum">
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="leuchtmittel" label="eingesetztes Leuchtmittel">
              <Select
                showSearch
                defaultValue={prefferredLeuchtmittel?.id}
                style={{ width: "100%" }}
                filterOption={(input, option) => {
                  const testChilds = option.children.map((child) =>
                    child.toLowerCase().trim()
                  );
                  return (
                    testChilds.join(" ").search(input.toLowerCase().trim()) >= 0
                  );
                }}
                optionFilterProp="children"
                filterSort={(optionA, optionB) =>
                  optionA.children
                    .join(" ")
                    .toLowerCase()
                    .localeCompare(optionB.children.join(" ").toLowerCase())
                }
                // onChange={(x) => {
                //   setSelectedTeamId(x);
                // }}
              >
                {leuchtmittel.map((leuchtmittel) => {
                  return (
                    <Select.Option value={leuchtmittel.id}>
                      {leuchtmittel.hersteller} - {leuchtmittel.lichtfarbe}
                    </Select.Option>
                  );
                })}
              </Select>
            </Form.Item>
            <Form.Item name="lebensdauer" label="Lebensdauer des Leuchtmittels">
              <InputNumber placeholder="in Monaten" style={{ width: "100%" }} />
            </Form.Item>
          </>
        )}
        {actionkey === "rundsteuerempfaengerwechsel" && (
          <>
            <Form.Item name="einbaudatum" label="Einbaudatum">
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="rundsteuerempfaenger" label="Rundsteuerempfänger">
              <Select
                showSearch
                defaultValue={preferredRundsteuerempfaenger?.id}
                style={{ width: "100%" }}
                filterOption={(input, option) => {
                  const testChilds = option.children.map((child) =>
                    child.toLowerCase().trim()
                  );
                  return (
                    testChilds.join(" ").search(input.toLowerCase().trim()) >= 0
                  );
                }}
                optionFilterProp="children"
                filterSort={(optionA, optionB) =>
                  optionA.children
                    .join(" ")
                    .toLowerCase()
                    .localeCompare(optionB.children.join(" ").toLowerCase())
                }
                // onChange={(x) => {
                //   setSelectedTeamId(x);
                // }}
              >
                {rundsteuerempfaenger.map((rs) => {
                  return (
                    <Select.Option value={rs.id}>
                      {rs.herrsteller_rs || "ohne Hersteller"} - {rs.rs_typ}
                    </Select.Option>
                  );
                })}
              </Select>
            </Form.Item>
          </>
        )}

        {actionkey === "sonderturnus" && (
          <>
            <Form.Item
              name="sonderturnusdatum"
              label="Sonderturnus"
              rules={[
                {
                  required: true,
                  message: "Bitte ein Datum auswählen.",
                },
              ]}
            >
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
          </>
        )}

        {actionkey === "vorschaltgeraetewechsel" && (
          <>
            <Form.Item name="wechseldatum" label="Einbaudatum">
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="vorschaltgeraet" label="Vorschaltgerät">
              <Input />
            </Form.Item>
          </>
        )}

        {actionkey === "anstricharbeiten" && (
          <>
            <Form.Item
              name="mastanstrich"
              label="Mastanstrich"
              rules={[
                {
                  required: true,
                  message: "Bitte ein Datum auswählen.",
                },
              ]}
            >
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="anstrichfarbe" label="Anstrichfarbe">
              <Input />
            </Form.Item>
          </>
        )}

        {actionkey === "ep" && (
          <>
            <Form.Item
              name="pruefdatum"
              label="Elektrische Prüfung am Mast"
              rules={[
                {
                  required: true,
                  message: "Bitte ein Datum auswählen.",
                },
              ]}
            >
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="erdung" label="Erdung in Ordnung">
              <Switch />
            </Form.Item>
          </>
        )}

        {actionkey === "masterneuerung" && (
          <>
            <Form.Item
              name="inbetriebnahme"
              label="Inbetriebnahme"
              rules={[
                {
                  required: true,
                  message: "Bitte ein Datum auswählen.",
                },
              ]}
            >
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="montagefirma" label="Montagefirma">
              <Input />
            </Form.Item>
          </>
        )}
        {actionkey === "standortrevision" && (
          <>
            <Form.Item
              name="revisionsdatum"
              label="Revision"
              rules={[
                {
                  required: true,
                  message: "Bitte ein Datum auswählen.",
                },
              ]}
            >
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
          </>
        )}
        {actionkey === "standsicherheitspruefung" && (
          <>
            <Form.Item
              name="pruefdatum"
              label="Standsicherheitsprüfung"
              rules={[
                {
                  required: true,
                  message: "Bitte ein Datum auswählen.",
                },
              ]}
            >
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item name="verfahren" label="Verfahren">
              <Input />
            </Form.Item>
            <Form.Item name="naechstes_pruefdatum" label="Nächstes Prüfdatum">
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
          </>
        )}

        {(actionkey === "schaltstellerevision" || actionkey === "pruefung") && (
          <>
            <Form.Item
              name="pruefdatum"
              label="Prüfdatum"
              rules={[
                {
                  required: true,
                  message: "Bitte ein Datum auswählen.",
                },
              ]}
            >
              <DatePicker defaultValue={undefined} style={{ width: "100%" }} />
            </Form.Item>
          </>
        )}

        {actionkey === "sonstiges" && (
          <Form.Item
            name="infos"
            rules={[
              {
                required: true,
                message: "Bitte geben Sie hier die Informationen an.",
              },
            ]}
            label="Informationen zu Ihrer durchgeführten Tätigkeit"
          >
            <TextArea rows={4} />
          </Form.Item>
        )}

        {/* For every ProtocolAction the same */}
        {/* <div className="ant-col ant-form-item-label">
          <label for="form_in_modal_date">Status</label>
        </div> */}
        <Form.Item
          name="status"
          _noStyle={true}
          label="Status"
          rules={[
            {
              required:
                input.feature?.properties?.arbeitsprotokollstatus?.id ===
                  undefined ||
                input.feature?.properties?.arbeitsprotokollstatus?.id === null,
              message: "Bitte einen Status auswählen.",
            },
          ]}
        >
          <Radio.Group
            style={{ width: "100%", marginBottom: 15 }}
            defaultValue={input.feature?.properties?.arbeitsprotokollstatus?.id}
            buttonStyle="solid"
          >
            <Radio.Button
              style={{ width: "33%", textAlign: "center", fontSize: 12 }}
              value={1}
            >
              in Bearbeitung
            </Radio.Button>
            <Radio.Button
              style={{ width: "33%", textAlign: "center", fontSize: 12 }}
              value={2}
            >
              erledigt
            </Radio.Button>
            <Radio.Button
              style={{ width: "33%", textAlign: "center", fontSize: 12 }}
              value={3}
            >
              Fehlmeldung
            </Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item
          name="monteur"
          label="Monteur"
          rules={[
            {
              required:
                input.feature?.properties?.monteur === undefined ||
                input.feature?.properties?.monteur === null,
              message: "Bitte geben den Namen des Monteurs an.",
            },
          ]}
        >
          <Input defaultValue={input.feature?.properties?.monteur} />
        </Form.Item>

        <Form.Item
          name="statusdate"
          label="Datum"
          rules={[
            {
              required:
                input.feature?.properties?.datum === undefined ||
                input.feature?.properties?.datum === null,
              message: "Bitte ein Datum auswählen.",
            },
          ]}
        >
          <DatePicker
            defaultValue={
              input.feature?.properties?.datum
                ? moment(input.feature?.properties?.datum)
                : undefined
            }
            style={{ width: "100%" }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default SetStatusDialog;
