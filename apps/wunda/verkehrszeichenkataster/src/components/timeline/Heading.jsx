import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import {
  getCurrentApplication,
  updateTimelineTitle,
} from "../../store/slices/application";
import { Button, Input } from "antd";
import {
  CheckCircleOutlined,
  EditOutlined,
  FilePdfOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { Document, usePDF } from "@react-pdf/renderer";
import ExternalTemplate from "../pdf/ExternalTemplate";
import InternalTemplate from "../pdf/InternalTemplate";

const Heading = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const anordnung = useSelector(getCurrentApplication);
  const [title, setTitle] = useState(anordnung.timelineTitle);
  const [editTitle, setEditTitle] = useState(!!!anordnung.timelineTitle);
  const [instance, updateInstance] = usePDF({
    document:
      anordnung.typ === "internal" ? (
        <InternalTemplate
          timeline={anordnung?.timeline}
          title={anordnung.timelineTitle}
        />
      ) : (
        <ExternalTemplate
          timeline={anordnung?.timeline}
          title={anordnung.timelineTitle}
        />
      ),
  });

  useEffect(() => {
    setTitle(anordnung.timelineTitle);
    setEditTitle(!!!anordnung.timelineTitle);
    updateInstance(
      anordnung.typ === "internal" ? (
        <InternalTemplate
          timeline={anordnung?.timeline}
          title={anordnung.timelineTitle}
        />
      ) : (
        <ExternalTemplate
          timeline={anordnung?.timeline}
          title={anordnung.timelineTitle}
        />
      )
    );
  }, [anordnung]);

  return (
    <div className="w-3/4 mx-auto flex items-center gap-2">
      <div className="flex flex-col w-full py-4 gap-2">
        <div className="flex items-center justify-between gap-4">
          {editTitle ? (
            <>
              <Input
                className="w-full py-[4.5px]"
                size="large"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
              <Button
                onClick={() => {
                  dispatch(
                    updateTimelineTitle({
                      updatedTitle: title,
                      applicationId: id,
                    })
                  );
                  setEditTitle(false);
                }}
              >
                Speichern
              </Button>

              <Button
                type="text"
                className="text-primary font-medium"
                onClick={() => setEditTitle(false)}
              >
                Abbrechen
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 w-full">
                <h1 className="my-0 text-4xl font-normal">
                  {anordnung.timelineTitle}
                </h1>
                <span className="text-muted-foreground font-normal text-4xl">
                  #{anordnung.id}
                </span>
              </div>
              <Button
                onClick={() => setEditTitle(true)}
                icon={<EditOutlined />}
              >
                Bearbeiten
              </Button>
              <Button
                href={instance.url}
                download="Anordnung.pdf"
                icon={<FilePdfOutlined />}
              >
                PDF Drucken
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`${
              anordnung.timelineStatus === "Offen"
                ? "bg-green-700"
                : "bg-purple-700"
            } py-1 px-3 w-fit rounded-3xl text-lg font-medium text-white flex gap-2 items-center justify-center`}
          >
            {anordnung.timelineStatus === "Offen" ? (
              <InfoCircleOutlined />
            ) : (
              <CheckCircleOutlined />
            )}
            <span>{anordnung.timelineStatus}</span>
          </div>
          <span className="text-muted-foreground font-normal">
            Max Mustermann hat letzte Woche diese Anordnung erstellt ·{" "}
            {anordnung?.timeline?.length} Baustein
            {(anordnung?.timeline?.length === 0 ||
              anordnung?.timeline?.length > 1) &&
              "e"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Heading;
