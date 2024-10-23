import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "./input.css";
import {
  faArrowUp,
  faArrowCircleRight,
  faPaperclip,
} from "@fortawesome/free-solid-svg-icons";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { Documents } from "./Documents";
import { FormGroup, InputGroup } from "react-bootstrap";
import { useDropzone } from "react-dropzone";
import { split } from "lodash";
import slugify from "@sindresorhus/slugify"
import iconv from "iconv-lite";

type MessageAttachment = {
  name?: string;
  type?: string;
  uuid?: string;
  nonce?: string;
  inProgress?: boolean;
};

const ConversationInput = ({
  setDraft = (a, b) => { },
  maxRows = 4,
  scrollToInput = () => { },
  subText = (
    <div>
      Mit <FontAwesomeIcon icon={faArrowUp} /> können Sie Ihre letzte, noch
      nicht eingereichte Nachricht erneut editieren.
    </div>
  ),
  lastUserMessage,
  removeLastUserMessage = () => {
    console.log("remove last user message");
  },
  uploadCRDoc = (a, b) => { },
  addLocalErrorMessage = (m) => { },
}) => {
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const [position, setPosition] = useState(0);
  const [msgTextValue, setMsgTextValue] = useState("");
  const [msgAttachments, setMsgAttachments] = useState<MessageAttachment[]>([]);
  const [inputBackgroundColor, setInputBackgroundColor] = useState("white");
  const [errorChars, setErrorChars] = useState("");

  const onDrop = useCallback(
    acceptedFiles => {
      (acceptedFiles || []).forEach(file => {
        file.nonce =
          btoa(unescape(encodeURIComponent(JSON.stringify(file)))) + new Date().getTime();
        addAttachment({
          name: slugify(file.name),
          nonce: file.nonce,
          inProgress: true
        });
        return uploadCRDoc(file, returnedFOString => {
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
                  draft: true
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
                draft: true
              });
              removeAttachment(file);
            }
          } else {
            removeAttachment(file);
          }
        });
      });
    },
    [uploadCRDoc]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  useEffect(() => {
    if (textarea && textarea.current) {
      textarea.current.selectionStart = position;
      textarea.current.selectionEnd = position;
    }
  }, []);

  useEffect(() => {
    setTimeout(() => {
      scrollToInput();
    }, 500);
  }, [scrollToInput]);

  const addAttachment = fileO => {
    setMsgAttachments(msga => {
      const newMsgAttachments = JSON.parse(JSON.stringify(msga));
      newMsgAttachments.push(fileO);
      return newMsgAttachments;
    });
  };

  const removeAttachment = file0 => {
    setMsgAttachments(msga => {
      const newMsgAttachments = JSON.parse(JSON.stringify(msga));
      const without = (newMsgAttachments || []).filter(fo => {
        return fo.nonce !== file0.nonce;
      });
      return without;
    });
  };

  const updateAttachment = fileO => {
    setMsgAttachments(msga => {
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



  const send = (draft, event) => {
    setMsgTextValue("");
    const notready: MessageAttachment[] = [];

    const newMsgAttachments: MessageAttachment[] = [];
    (msgAttachments || []).forEach((fo: MessageAttachment) => {
      if (fo.uuid !== undefined) {
        fo.nonce = undefined;
        fo.inProgress = undefined;
        newMsgAttachments.push(fo);
      } else {
        notready.push(fo);
      }
    });

    setDraft(draft, newMsgAttachments);

    setMsgAttachments(notready);

    event.preventDefault();
    scrollToInput();
  };

  return (
    <div
      style={{
        paddingTop: "40px",
        paddingBottom: "40px",
        padding: "5px",
        margin: "0px",
        marginTop: "30px",
        background: "#f8f8f8",
        borderRadius: "5px",
        borderStyle: "solid",
        borderWidth: "1px",
        borderColor: "#CCCCCC",
        outline: "none",
      }}
      {...getRootProps()}
      onClick={() => { }}
      onKeyDown={() => { }}
    >
      <Documents
        //style={{ paddingTop: "30px", padding: "5px", margin: "30px" }}
        docs={msgAttachments}
        setDocs={setMsgAttachments}
      />

      <FormGroup>
        <div
          style={{
            margin: 0,
            marginTop: 0,
            padding: 2,

            color: "grey",
            borderTop: "2px solid grey",
            fontSize: "12px",
            textAlign: "right",
          }}
        >
          {errorChars !== "" && (
            <div>
              Sie haben in Ihrem Text Unicode Zeichen eingegeben, die wir in
              unserem System noch nicht verarbeiten können ({errorChars}),
              deshalb haben wir diese Zeichen bei der Eingabe ignoriert.
              <br />
              <br />
            </div>
          )}
        </div>
        <InputGroup>
          <InputGroup.Prepend>
            <InputGroup.Text
              style={{
                cursor: "pointer",
                verticalAlign: "bottom",
              }}
            >
              <div {...getRootProps()}>
                <input {...getInputProps()} />
                {isDragActive ? (
                  <FontAwesomeIcon
                    style={{ marginBottom: 3 }}
                    icon={faArrowUp}
                  />
                ) : (
                  <FontAwesomeIcon
                    style={{ marginBottom: 3 }}
                    icon={faPaperclip}
                  />
                )}
              </div>
            </InputGroup.Text>
          </InputGroup.Prepend>

          <TextareaAutosize
            ref={textarea}
            style={{
              resize: "none",
              minHeight: "34px",
              textAlign: "right",
              backgroundColor: inputBackgroundColor,
            } as any}
            className="basicSelectionColor form-control"
            value={msgTextValue}
            maxRows={12}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
              if (textarea && textarea.current) {
                let text = "";
                const chars = split(e.target.value);
                for (const substring of chars) {
                  // for (let i = 0, n = e.target.value.length; i < n; i++) {
                  let buf = iconv.encode(substring, "ISO885915");
                  let str = iconv.decode(buf, "ISO885915");
                  if (str !== substring) {
                    if (!errorChars.includes(substring)) {
                      setErrorChars((old) => old + substring);
                    }
                    setInputBackgroundColor("grey");
                    setTimeout(() => setInputBackgroundColor("white"), 200);
                  } else {
                    text = text + substring;
                  }
                }

                setMsgTextValue(text);

                if (e.target.value.trim() === "") {
                  setErrorChars("");
                }
                setPosition(textarea.current.selectionStart);
              }
            }}
            onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
              if (textarea && textarea.current) {
                if (e.keyCode === 13 && !e.altKey) {
                  //normal return - should send content as draft
                  send(e.currentTarget.value, e);
                } else if (e.keyCode === 13 && e.altKey) {
                  //alt-return - should not send, but insert a linebreak
                  setMsgTextValue(
                    e.currentTarget.value.substring(
                      0,
                      textarea.current.selectionStart,
                    ) +
                    "\n" +
                    e.currentTarget.value.substring(textarea.current.selectionStart),
                  );
                  setPosition(textarea.current.selectionStart + 1);
                } else if (e.currentTarget.value === "" && e.keyCode === 38) {
                  // arrow up - should edit the last draft message
                  if (lastUserMessage !== undefined) {
                    removeLastUserMessage();
                    setMsgTextValue(lastUserMessage.nachricht);
                    setMsgAttachments(lastUserMessage.anhang);
                    setTimeout(() => {
                      setPosition(
                        (lastUserMessage.nachricht || []).length + 100,
                      );
                    }, 10);
                  }
                }
              }
            }}
          />
          <InputGroup.Append>
            <InputGroup.Text
              onClick={(e) => {
                if (textarea && textarea.current) {
                  send(textarea.current.value, e);
                }
              }}
              style={{ cursor: "pointer", verticalAlign: "bottom" }}
            >
              <FontAwesomeIcon
                style={{ marginBottom: 3 }}
                icon={faArrowCircleRight}
              />
            </InputGroup.Text>
          </InputGroup.Append>
        </InputGroup>
        <div
          style={{
            margin: 0,
            marginTop: 0,
            padding: 2,

            color: "grey",
            borderTop: "2px solid grey",
            fontSize: "12px",
          }}
        >
          <div style={{ textAlign: "right" }}>{subText}</div>
        </div>
      </FormGroup>
    </div>
  );
};

export default ConversationInput;
