import { Card, Dropdown, Input } from "antd";
import { EllipsisOutlined } from "@ant-design/icons";
import { useDispatch } from "react-redux";
import {
  deleteTimelineObject,
  updateName,
} from "../../store/slices/application";
import { useParams } from "react-router-dom";
import { getDataTypeFromBase64 } from "../../tools/helper";
import PdfViewer from "../pdfviewer/PdfViewer";

const File = ({ attachment, i }) => {
  const { id: applicationId } = useParams();
  const url = attachment?.file;
  const dispatch = useDispatch();

  const items = [
    {
      label: (
        <div
          onClick={() => {
            dispatch(
              deleteTimelineObject({
                timelineIndex: i,
                applicationId: applicationId,
              })
            );
          }}
        >
          Löschen
        </div>
      ),
      key: "0",
    },
  ];

  return (
    <div className="w-full relative py-4 before:bg-zinc-200 before:absolute before:bottom-0 before:content-[''] before:block before:left-4 before:top-0 before:w-[2px]">
      <Card
        size="small"
        type="inner"
        title={
          <div className="w-full flex">
            <Input
              onChange={(e) => {
                dispatch(
                  updateName({
                    timelineIndex: i,
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
        {getDataTypeFromBase64(url) === "image" && (
          <div className="w-full rounded-lg">
            <img
              key={i}
              alt={attachment?.name}
              className="w-full rounded-lg"
              src={url}
            />
          </div>
        )}
        {getDataTypeFromBase64(url) === "pdf" && (
          <div className="w-full rounded-lg">
            <PdfViewer filePdf={url} />
          </div>
        )}
        {getDataTypeFromBase64(url) === "other" && (
          <div className="w-full rounded-lg h-64 flex items-center justify-center border-solid border-zinc-200">
            Vorschau für den Dateitypen konnte nicht erstellt werden
          </div>
        )}
      </Card>
    </div>
  );
};

export default File;
