import { UploadOutlined } from "@ant-design/icons";
import {
  Button,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Typography,
  Upload,
} from "antd";
import TextArea from "antd/lib/input/TextArea";
import { useState } from "react";
import { useSelector } from "react-redux";
import {
  IMAGEUPLOAD_MAXSIDE,
  IMAGEUPLOAD_QUALITY,
} from "../../../constants/belis";

import extensions from "../../../core/helper/extensions";
import { getNonce } from "../../../core/helper/featureHelper";
import { shrinkBase64Image } from "../../../core/helper/imageHelper";
import { getJWT, getLoginFromJWT } from "../../../core/store/slices/auth";
import { getTeamsKT } from "../../../core/store/slices/keytables";
import { getTeam } from "../../../core/store/slices/team";

const { Text } = Typography;
const { Option } = Select;
export const ADD_INCIDENT_MODES = {
  VERANLASSUNG: "VERANLASSUNG",
  EINZELAUFTRAG: "EINZELAUFTRAG",
  ADD2ARBEITSAUFTRAG: "ADD2ARBEITSAUFTRAG",
};

const getBase64 = (img, callback) => {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    callback(reader.result);
  });
  reader.readAsDataURL(img);
};
const dummyRequest = ({ file, onSuccess }) => {
  setTimeout(() => {
    onSuccess("ok");
  }, 0);
};
const AddIncidentDialog = ({
  close = () => {},
  onCancel = (output) => {},
  onClose = (output) => {},
  input = {},
}) => {
  const jwt = useSelector(getJWT);
  const login = getLoginFromJWT(jwt);

  // eslint-disable-next-line no-unused-vars
  const [preferredIncidentTeam, setPreferredIncidentTeam] = useState();
  const myTeam = useSelector(getTeam);
  const [selectedTeamId, setSelectedTeamId] = useState(myTeam.id);
  const teams = useSelector(getTeamsKT) || [];

  const [imageData, setImageData] = useState({});
  const handleUploadChange = (info) => {
    if (info.file.status === "uploading") {
      return;
    }
    if (info.file.status === "done") {
      // Get this url from response in real world.
      getBase64(info.file.originFileObj, (imageUrl) => {
        //info.file.imageData=imageUrl;
        shrinkBase64Image(
          imageUrl,
          IMAGEUPLOAD_MAXSIDE,
          IMAGEUPLOAD_QUALITY,
          (shrinked) => {
            setTimeout(() => {
              setImageData((old) => {
                return {
                  ...old,
                  [info.file.uid]: {
                    uid: info.file.uid,
                    title: undefined,
                    imageUrl: shrinked,
                  },
                };
              });
            }, 100);
          }
        );
      });
    } else if (info.file.status === "removed") {
      setImageData((old) => {
        delete old[info.file.uid];
        return { ...old };
      });
    }
  };
  const [form] = Form.useForm();
  let modeinfo;
  if (input.mode === ADD_INCIDENT_MODES.VERANLASSUNG) {
    modeinfo = "(Es wird nur eine Veranlassung angelegt.)";
  } else if (input.mode === ADD_INCIDENT_MODES.EINZELAUFTRAG) {
    modeinfo = "(Ein Einzelauftrag wird angelegt.)";
  } else if (input.mode === ADD_INCIDENT_MODES.ADD2ARBEITSAUFTRAG) {
    modeinfo = "(A" + input.arbeitsauftrag.properties.nummer + " wird ergänzt)";
  }

  return (
    <Modal
      zIndex={30000001}
      title={
        <>
          <div>Störung melden {modeinfo}</div>{" "}
          <Text type="secondary">{input?.vcard?.infobox?.title}</Text>
        </>
      }
      centered
      visible={true}
      onOk={() => {
        form
          .validateFields()
          .then((values) => {
            // imageData comes from state not from values
            let mimeType, ending;

            if (imageData) {
            }
            const feature = input.feature;
            const ccnonce = getNonce();

            const images = Object.keys(imageData).map((key) => {
              mimeType = imageData[key].imageUrl.match("data:(.*);")[1];
              ending = extensions[mimeType];
              return {
                ImageData: imageData[key].imageUrl,
                ending,
                description: imageData[key].title,
                ts: Date.now(),
                prefix: "DOC-",
              };
            });
            const parameter = {
              IMAGES: images,
              objekt_id: feature.properties.id,
              objekt_typ: feature.featuretype,
              objektFeature: feature,

              bezeichnung: values.title,
              beschreibung: values.description,
              bemerkung: values.remarks,
              arbeitsauftrag: input.arbeitsauftrag?.properties?.id,
              arbeitsauftragNummer: input.arbeitsauftrag?.properties?.nummer,
              arbeitsauftragObjekt: input.arbeitsauftrag,

              aktion: input.mode,
              user: login,
              teamObject: teams.find((team) => team.id === selectedTeamId),
              ccnonce,
            };
            if (input.mode === ADD_INCIDENT_MODES.EINZELAUFTRAG) {
              parameter.ARBEITSAUFTRAG_ZUGEWIESEN_AN = selectedTeamId;
            } else if (input.mode === ADD_INCIDENT_MODES.ADD2ARBEITSAUFTRAG) {
              parameter.ARBEITSAUFTRAG_ZUGEWIESEN_AN =
                input.arbeitsauftrag?.properties?.zugewiesen_an;
            }

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
          name="title"
          label="Bezeichnung"
          rules={[
            {
              required: true,
              message: "Bitte geben Sie eine Bezeichnung an.",
            },
          ]}
        >
          <Input />
        </Form.Item>

        {input.mode === ADD_INCIDENT_MODES.EINZELAUFTRAG && (
          <Form.Item name="aa_team" label="Team">
            <Select
              defaultValue={preferredIncidentTeam?.id || myTeam?.id}
              style={{ width: "100%" }}
              onChange={(x) => {
                setSelectedTeamId(x);
              }}
            >
              {teams.map((team) => {
                return <Option value={team.id}>{team.name}</Option>;
              })}
            </Select>
          </Form.Item>
        )}
        <Form.Item name="description" label="Beschreibung">
          <TextArea />
        </Form.Item>
        <Form.Item name="remarks" label="Bemerkungen">
          <TextArea />
        </Form.Item>
        <Form.Item
          name="images"
          label="Foto aufnehmen oder schon aufgenommenes Foto auswählen"
          rules={[
            {
              required: false,
              message: "Bitte wählen Sie ein Bild aus.",
            },
          ]}
        >
          <Upload
            name="upload"
            listType="picture-card"
            // listType='picture'
            className="avatar-uploader"
            showUploadList={{ showPreviewIcon: false, showDownloadIcon: false }}
            onChange={handleUploadChange}
            customRequest={dummyRequest}
          >
            <Button style_={{ width: "100%" }} icon={<UploadOutlined />}>
              Foto
            </Button>
          </Upload>
        </Form.Item>

        <Form.Item
          key={
            "bildertitel" +
            // form.getFieldValue("images")?.fileList.length +
            JSON.stringify(imageData)
          }
          imageData={imageData}
          yname="images"
          label="Bildertitel"
        >
          {form.getFieldValue("images")?.fileList &&
            form
              .getFieldValue("images")
              .fileList.map((fileListEntry, index) => {
                return (
                  <div key={index}>
                    <Row justify="space-around" align="middle">
                      <Col align="middle" span={4}>
                        <img
                          style={{ width: "60%" }}
                          src={fileListEntry.thumbUrl}
                          alt="preview"
                        />
                      </Col>
                      <Col span={20}>
                        <div>
                          <Form.Item
                            name={"picname" + fileListEntry.uid}
                            rules={[
                              {
                                required: true,
                                message:
                                  "Bitte geben Sie eine Bezeichnung für das Bild an.",
                              },
                            ]}
                          >
                            <Input
                              onChange={(e) => {
                                setImageData((old) => {
                                  old[fileListEntry.uid].title = e.target.value;
                                  return old;
                                });
                              }}
                            />
                          </Form.Item>
                        </div>
                      </Col>
                    </Row>
                  </div>
                );
              })}
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default AddIncidentDialog;
