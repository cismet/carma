import { useCallback } from "react";
import Document from "../conversations/Document";
import { Icon } from "react-fa";
import { useDropzone } from "react-dropzone";
import { useDispatch } from "react-redux";
import InternalMessage from "../conversations/InternalMessage";
import type { UnknownAction } from "redux";

interface CR20DocumentsPanelProps {
  documents?: any[];
  uploadCRDoc?:
    | ((file: File, cb: (res: string) => void) => void | undefined)
    | undefined;
  tmpAttachments?: any[];
  setTmpAttachments?: (cb: (old: any[]) => any[]) => void;
  localErrorMessages?: any[];
  addLocalErrorMessage?: (msg: any) => void;
}

const CR20DocumentsPanel = ({
  documents = [],
  uploadCRDoc,
  tmpAttachments = [],
  setTmpAttachments = (msga) => {},
  localErrorMessages = [],
  addLocalErrorMessage = () => {},
}: CR20DocumentsPanelProps) => {
  const dispatch = useDispatch();

  let readOnly = false;
  if (uploadCRDoc === undefined) {
    readOnly = true;
  }

  const removeAttachment = (fileO) => {
    setTmpAttachments((msga) => {
      const newMsgAttachments = JSON.parse(JSON.stringify(msga));
      return newMsgAttachments.filter((value) => value.nonce !== fileO.nonce);
    });
  };

  const onDrop = useCallback(
    (acceptedFiles) => {
      const addAttachment = (fileO) => {
        setTmpAttachments((msga) => {
          const newMsgAttachments = JSON.parse(JSON.stringify(msga));
          newMsgAttachments.push(fileO);
          return newMsgAttachments;
        });
      };
      const updateAttachment = (fileO) => {
        setTmpAttachments((msga) => {
          const newMsgAttachments = JSON.parse(JSON.stringify(msga));
          (newMsgAttachments || []).forEach((fo, index) => {
            if (fo.nonce === fileO.nonce) {
              newMsgAttachments[index] = fileO;
              return;
            }
          });

          return newMsgAttachments;
        });
      };

      const removeAttachment = (file0) => {
        setTmpAttachments((msga) => {
          const newMsgAttachments = JSON.parse(JSON.stringify(msga));
          const without = (newMsgAttachments || []).filter((fo) => {
            return fo.nonce !== file0.nonce;
          });
          return without;
        });
      };
      (acceptedFiles || []).forEach((file) => {
        file.nonce =
          btoa(unescape(encodeURIComponent(JSON.stringify(file)))) +
          new Date().getTime();
        addAttachment({
          name: file.name,
          nonce: file.nonce,
          inProgress: true,
        });
        if (uploadCRDoc) {
          return dispatch(
            uploadCRDoc(file, (returnedFOString) => {
              if (returnedFOString) {
                try {
                  const returnedFO = JSON.parse(returnedFOString);
                  // returnedFO.status = 412;
                  // returnedFO.message = "Parameter FILENAME nicht gesetzt";
                  if (returnedFO.status === 201) {
                    returnedFO.nonce = file.nonce;
                    returnedFO.inProgress = false;
                    updateAttachment(returnedFO);
                  } else {
                    addLocalErrorMessage({
                      typ: "LOCALERROR",
                      nachricht:
                        "Beim Hochladen der Datei hat der Server mit dem unerwarteten Status " +
                        returnedFO.status +
                        " geantwortet. (" +
                        returnedFO.message +
                        "). Bitte versuchen Sie es später noch einmal. Sollte der Fehler weiter bestehen bleiben, bitten wir Sie Ihren Ansprechpartner in der Stadtverwaltung per Mail zu kontaktieren.",
                      draft: true,
                    } as unknown as UnknownAction);
                    removeAttachment(file);
                  }
                } catch (err) {
                  addLocalErrorMessage({
                    typ: "LOCALERROR",
                    nachricht:
                      "Beim Hochladen der Datei ist ein unerwarteter Fehler passiert: (" +
                      err +
                      ")",
                    draft: true,
                  });
                  removeAttachment(file);
                }
              } else {
                removeAttachment(file);
              }
            }) as unknown as UnknownAction
          );
        }
      });
    },
    [setTmpAttachments, uploadCRDoc]
  );

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  let dndInputProps = {};
  let dndRootProps = {};

  if (readOnly === false) {
    dndInputProps = getInputProps();
    dndRootProps = getRootProps();
  }
  return (
    <div {...dndRootProps}>
      {readOnly === false && (
        <div className="pull-right" onClick={open}>
          <button
            style={{
              border: 0,
              padding: 0,
              wordWrap: "break-word",
              color: "black",
              textAlign: "left",
              outline: "none",
              background: "transparent",
            }}
            className="btn-link"
          >
            <Icon style={{ marginBottom: 3 }} name="paperclip" />
          </button>
        </div>
      )}
      {readOnly === false && <input style={{ height: 0 }} {...dndInputProps} />}
      {documents.length > 0 &&
        documents.map((doc, index) => {
          return (
            <div
              key={"Documents.div." + index}
              style={{ margin: 10, fontSize: "110%" }}
            >
              <Document fileObject={doc} background="#FFF" />
            </div>
          );
        })}

      {tmpAttachments.length > 0 &&
        tmpAttachments.map((doc, index) => {
          return (
            <div
              key={"msgAttachments.div." + index}
              style={{ margin: 10, fontSize: "110%" }}
            >
              <Document
                fileObject={doc}
                remove={() => {
                  removeAttachment(doc);
                }}
                background="#dddddd"
              />
            </div>
          );
        })}
      {documents.length === 0 && tmpAttachments.length === 0 && (
        <div style={{ color: "grey" }}>keine Datei vorhanden</div>
      )}
      {localErrorMessages.length > 0 &&
        localErrorMessages.map((msg, index) => {
          return (
            <InternalMessage
              key={"SYSTEM.LOCALERROR." + index}
              msg={msg.nachricht}
              alignment="center"
              background="#fcf0f0"
              color="#E73B2F"
              margin={5}
              padding={5}
              fontSize={0.9}
              width="80%"
            />
          );
        })}
    </div>
  );
};

export default CR20DocumentsPanel;
