import { useCallback } from "react";
import Document from "../conversations/Document";
import { Icon } from "react-fa";

const CR20DocumentsPanel = ({
  documents = [],
  uploadCRDoc,
  setTmpAttachments = (msga) => {},
  localErrorMessages = [],
  addLocalErrorMessage = () => {},
}) => {
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
        return uploadCRDoc(file, (returnedFOString) => {
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
                });
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
        });
      });
    },
    [setTmpAttachments, uploadCRDoc]
  );
  return (
    <div>
      {readOnly === false && (
        <div className="pull-right">
          <button
            style={{
              border: 0,
              padding: 0,
              wordWrap: "break-word",
              color: "black",
              textAlign: "left",
              outline: "none", //
            }}
            className="btn-link"
          >
            <Icon style={{ marginBottom: 3 }} name="paperclip" />
          </button>
        </div>
      )}
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
    </div>
  );
};

export default CR20DocumentsPanel;
