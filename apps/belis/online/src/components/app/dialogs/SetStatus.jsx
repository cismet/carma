import { DatePicker, Form, Input, Modal, Radio, Typography } from "antd";
import TextArea from "antd/lib/input/TextArea";
import moment from "moment";
import { useSelector } from "react-redux";

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
}) => {
  const selectedFeaturesForAllModes = useSelector(
    getSelectedFeaturesForAllModes
  );
  const arbeitsauftrag =
    selectedFeaturesForAllModes[MODES.TASKLISTS].properties;
  const [form] = Form.useForm();

  return (
    <Modal
      zIndex={30000001}
      title={
        <>
          <div>Status</div>{" "}
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
            // const example = {
            //   DATUM: "1655159255157",
            //   STATUS: "1",
            //   BEMERKUNG: "Neue Testbemerkung",
            //   MATERIAL: "Neues Testmaterial",
            //   PROTOKOLL_ID: "85031",
            //   MONTEUR: "Cismet",
            // };

            const momentDate =
              values.date ||
              (input.feature?.properties?.datum
                ? moment(input.feature?.properties?.datum)
                : undefined);
            let d;
            if (momentDate) {
              d = momentDate?.valueOf();
            }

            const parameter = {
              actionname: "protokollStatusAenderung",
              protokoll_id: feature.properties.id,
              status:
                values.status ||
                input.feature?.properties?.arbeitsprotokollstatus?.id,
              material: values.material || input.feature?.properties?.material,
              bemerkung: values.remarks || input.feature?.properties?.bemerkung,
              monteur: values.monteur || input.feature?.properties?.monteur,
              datum: d,
              objekt_typ: "arbeitsprotokoll",
              object_name:
                input?.vcard?.infobox?.title +
                " (A" +
                arbeitsauftrag.nummer +
                ")",
            };

            form.resetFields();

            onClose(parameter);

            close();
          })
          .catch((info) => {
            console.log("Validate Failed:", info);
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
          name="date"
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

        <Form.Item name="remarks" label="Bemerkungen">
          <TextArea defaultValue={input.feature?.properties?.bemerkung} />
        </Form.Item>
        <Form.Item name="material" label="Material">
          <TextArea defaultValue={input.feature?.properties?.material} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default SetStatusDialog;
