import { Card, Dropdown, Input, Button } from "antd";
import { useDispatch } from "react-redux";
import {
  deleteTimelineObject,
  updateName,
  updateTimelineValues,
} from "../../store/slices/application";
import { useParams } from "react-router-dom";
import {
  CloseOutlined,
  EllipsisOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import MdRedactor, { mdParser } from "../mdredactor/MdRedactor";

const { TextArea } = Input;

const Text = ({ attachment, id }) => {
  const { id: applicationId } = useParams();
  const [isEdit, setIsEdit] = useState(false);
  const [text, setText] = useState(attachment.text);
  const dispatch = useDispatch();

  const items = [
    {
      label: (
        <div
          onClick={() => {
            setIsEdit(true);
          }}
        >
          Bearbeiten
        </div>
      ),
      key: "0",
    },
    {
      label: (
        <div
          onClick={() => {
            dispatch(
              deleteTimelineObject({
                timelineIndex: id,
                applicationId: applicationId,
              })
            );
          }}
        >
          Entfernen
        </div>
      ),
      key: "1",
    },
  ];

  const getColor = (name) => {
    switch (name) {
      case "Ort":
        return "#f0fdf4";
      case "Sachverhalt":
        return "#f0fdfa";
      case "Erforderliche Maßnahmen":
        return "#f0f9ff";
      case "Widerrufsvorbehalt":
        return "#eef2ff";
      case "Mit freundlichen Grüßen":
        return "#faf5ff";
    }
  };

  return (
    <div className="w-full relative py-4 before:bg-zinc-200 before:absolute before:bottom-0 before:content-[''] before:block before:left-4 before:top-0 before:w-[2px]">
      <Card
        size="small"
        type="inner"
        headStyle={{
          background: getColor(attachment.name),
        }}
        title={
          <div className="w-full flex">
            <Input
              onChange={(e) => {
                dispatch(
                  updateName({
                    timelineIndex: id,
                    updatedName: e.target.value,
                    applicationId: applicationId,
                  })
                );
              }}
              value={attachment.name}
              className="w-full font-medium text-lg pl-0"
              bordered={false}
            />
            <Dropdown
              trigger={["click"]}
              menu={{ items }}
              placement="bottomRight"
            >
              <div className="p-1 flex items-center justify-center hover:bg-zinc-100 rounded-lg cursor-pointer">
                <EllipsisOutlined className="text-2xl" />
              </div>
            </Dropdown>
          </div>
        }
      >
        {isEdit ? (
          <div className="flex flex-col gap-2">
            <MdRedactor
              mdDoc={attachment.text}
              getDocument={(text) => setText(text)}
            />
            <div className="w-full flex items-center gap-2 justify-end">
              <Button icon={<CloseOutlined />} onClick={() => setIsEdit(false)}>
                Abbrechen
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  dispatch(
                    updateTimelineValues({
                      timelineIndex: id,
                      itemValue: text,
                      property: "text",
                      applicationId: applicationId,
                    })
                  );
                  setIsEdit(false);
                }}
              >
                Text bearbeiten
              </Button>
            </div>
          </div>
        ) : (
          <div
            dangerouslySetInnerHTML={{
              __html: mdParser.render(attachment.text),
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default Text;
