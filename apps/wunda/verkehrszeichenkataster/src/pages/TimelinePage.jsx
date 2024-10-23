import { Card, Upload } from "antd";
import Timeline from "../components/application/Timeline";
import Request from "../components/timeline/Request";
import Text from "../components/timeline/Text";
import Decision from "../components/timeline/Decision";

import "./dragger.css";
import { useDispatch, useSelector } from "react-redux";
import {
  getCurrentApplication,
  storeTimeline,
  updateTimelineStatus,
} from "../store/slices/application";
import File from "../components/timeline/File";
import { useParams } from "react-router-dom";
import SubmitCard from "../components/timeline/SubmitCard";
import Heading from "../components/timeline/Heading";
import TagList from "../components/timeline/TagList";
import DrawingCard from "../components/timeline/DrawingCard";
import {
  CloseOutlined,
  HistoryOutlined,
  LockOutlined,
  UnlockOutlined,
} from "@ant-design/icons";

const { Dragger } = Upload;

const getBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });

const TimelinePage = () => {
  const { id } = useParams();
  const anordnung = useSelector(getCurrentApplication);
  const currentTimeline = anordnung.timeline;
  const isInternalRequest =
    useSelector(getCurrentApplication).typ === "internal";

  const dispatch = useDispatch();

  const changeTimeline = (item) => {
    dispatch(storeTimeline({ id: id, timeline: [...currentTimeline, item] }));
    setTimeout(() => {
      document
        .getElementById(currentTimeline.length.toString())
        ?.scrollIntoView({ behavior: "smooth" });
    }, 5);
  };

  const handleDrop = async (file) => {
    if (!file.url && !file.preview) {
      file.preview = await getBase64(file);
    }

    changeTimeline({
      typ: "file",
      name: file.name.replace(/\.[^/.]+$/, ""),
      file: file.url || file.preview,
      description: "",
    });
  };

  return (
    <Card
      bodyStyle={{
        overflowY: "auto",
        overflowX: "clip",
        maxHeight: "91%",
        height: "100%",
        marginTop: "2px",
      }}
      className="h-full w-full"
      title={<Heading />}
    >
      {/* <Dragger
          openFileDialogOnClick={false}
          className="h-full w-full"
          beforeUpload={(file) => {
            handleDrop(file);
          }}
          fileList={[]}
        > */}
      <div className="h-full w-3/4 mx-auto flex gap-4 justify-between">
        <div className="flex flex-col w-full">
          {currentTimeline?.map((attachment, i) => {
            switch (attachment.typ) {
              case "request":
                return (
                  <Request
                    attachment={attachment}
                    key={i}
                    i={i}
                    isInternalRequest={isInternalRequest}
                  />
                );
              case "text":
                return <Text attachment={attachment} id={i} key={i} />;
              case "decision":
                return <Decision key={i} id={i} attachment={attachment} />;
              case "file":
                return <File key={i} attachment={attachment} i={i} />;
              case "drawing":
                return <DrawingCard key={i} attachment={attachment} id={i} />;
            }
          })}
          <hr className="w-full border-t-[1px] border-solid border-zinc-200 my-0" />
          <SubmitCard changeTimeline={changeTimeline} handleDrop={handleDrop} />
        </div>

        <div className="w-[370px]">
          <div className="flex flex-col w-full items-start">
            <span className="font-semibold text-muted-foreground pb-2">
              Zeitlicher Verlauf
            </span>
            <Timeline dataIn={currentTimeline} />
            <hr className="w-full border-t-[1px] border-solid border-zinc-200 my-4" />
            <TagList changeTimeline={changeTimeline} />
            <hr className="w-full border-t-[1px] border-solid border-zinc-200 my-4" />
            <span className="font-semibold text-muted-foreground pb-2">
              Bearbeitung
            </span>
            <div
              role="button"
              className="hover:text-primary flex gap-1 cursor-pointer font-medium"
              onClick={() =>
                dispatch(
                  updateTimelineStatus({
                    updatedStatus:
                      anordnung.timelineStatus === "Offen"
                        ? "Geschlossen"
                        : "Offen",
                    applicationId: id,
                  })
                )
              }
            >
              {anordnung.timelineStatus === "Offen" ? (
                <LockOutlined />
              ) : (
                <UnlockOutlined />
              )}
              <span>
                {anordnung.timelineStatus === "Offen"
                  ? "Abschließen"
                  : "Wieder eröffnen"}
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* </Dragger> */}
    </Card>
  );
};

export default TimelinePage;
