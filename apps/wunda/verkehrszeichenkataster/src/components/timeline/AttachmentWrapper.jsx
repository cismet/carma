import { DeleteOutlined } from "@ant-design/icons";
import { useDispatch } from "react-redux";
import {
  deleteTimelineObject,
  updateName,
} from "../../store/slices/application";
import { Input } from "antd";
import { useParams } from "react-router-dom";

export const AttachmentRow = ({
  attachment,
  index,
  name,
  alignTop,
  children,
}) => {
  const { id } = useParams();
  const dispatch = useDispatch();

  return (
    <div className="w-full flex items-center gap-2 h-full">
      <div
        className={`w-[22%] flex justify-end ${
          alignTop ? "items-start" : "items-center"
        } h-full`}
      >
        {name ? (
          <span className="w-max text-end px-2 py-1">{name}</span>
        ) : (
          <Input
            bordered={false}
            value={attachment.name}
            className="w-full text-end"
            onChange={(e) => {
              dispatch(
                updateName({
                  timelineIndex: index,
                  updatedName: e.target.value,
                  applicationId: id,
                })
              );
            }}
          />
        )}
        <span className={alignTop && "pt-1"}>:</span>
      </div>
      {children}
    </div>
  );
};

const AttachmentWrapper = ({ children, index }) => {
  const { id } = useParams();
  const dispatch = useDispatch();

  return (
    <div className="flex w-full gap-2 items-center pb-6">
      <div className="h-full border-[1px] border-solid border-black" />
      <div className="flex flex-col w-2/3 gap-4 h-full">{children}</div>
      {index && (
        <DeleteOutlined
          className="text-lg p-2 hover:bg-zinc-100 cursor-pointer rounded-lg"
          onClick={() => {
            dispatch(
              deleteTimelineObject({ timelineIndex: index, applicationId: id })
            );
          }}
        />
      )}
    </div>
  );
};

export default AttachmentWrapper;
