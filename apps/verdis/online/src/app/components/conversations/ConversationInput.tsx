// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import './input.css';
import { faArrowUp } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';

const ConversationInput = ({
  setDraft = () => {},
  maxRows = 4,
  scrollToInput = () => {},
  subText = (
    <div>
      Mit <FontAwesomeIcon icon={faArrowUp} /> können Sie Ihre letzte, noch
      nicht eingereichte Nachricht erneut editieren.
    </div>
  ),
  lastUserMessage,
  removeLastUserMessage = () => {
    console.log('remove last user message');
  },
  uploadCRDoc = () => {},
  addLocalErrorMessage = () => {},
}) => {
  const textarea = useRef();
  const [position, setPosition] = useState(0);
  const [msgTextValue, setMsgTextValue] = useState('');
  const [msgAttachments, setMsgAttachments] = useState([]);
  const [inputBackgroundColor, setInputBackgroundColor] = useState('white');
  const [errorChars, setErrorChars] = useState('');

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
  return (
    <div
      style={{
        paddingTop: '40px',
        paddingBottom: '40px',
        padding: '5px',
        margin: '0px',
        marginTop: '30px',
        background: '#f8f8f8',
        borderRadius: '5px',
        borderStyle: 'solid',
        borderWidth: '1px',
        borderColor: '#CCCCCC',
        outline: 'none',
      }}
      {...getRootProps()}
      onClick={() => {}}
      onKeyDown={() => {}}
    >
      <Documents
        style={{ paddingTop: '30px', padding: '5px', margin: '30px' }}
        docs={msgAttachments}
        setDocs={setMsgAttachments}
      />

      <FormGroup>
        <div
          style={{
            margin: 0,
            marginTop: 0,
            padding: 2,

            color: 'grey',
            XborderTop: '2px solid grey',
            fontSize: '12px',
            textAlign: 'right',
          }}
        >
          {errorChars !== '' && (
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
          <InputGroup.Addon
            style={{
              cursor: 'pointer',
              verticalAlign: 'bottom',
            }}
          >
            <div {...getRootProps()}>
              <input {...getInputProps()} />
              {isDragActive ? (
                <Icon style={{ marginBottom: 3 }} name="arrow-up" />
              ) : (
                <Icon style={{ marginBottom: 3 }} name="paperclip" />
              )}
            </div>
          </InputGroup.Addon>
          <TextareaAutosize
            ref={textarea}
            style={{
              resize: 'none',
              minHeight: '34px',
              textAlign: 'right',
              backgroundColor: inputBackgroundColor,
            }}
            className="basicSelectionColor form-control"
            value={msgTextValue}
            maxRows={12}
            onChange={(e) => {
              if (textarea && textarea.current) {
                let text = '';
                const chars = split(e.target.value);
                for (const substring of chars) {
                  // for (let i = 0, n = e.target.value.length; i < n; i++) {
                  let buf = iconv.encode(substring, 'ISO885915');
                  let str = iconv.decode(buf, 'ISO885915');
                  if (str !== substring) {
                    if (!errorChars.includes(substring)) {
                      setErrorChars((old) => old + substring);
                    }
                    setInputBackgroundColor('grey');
                    setTimeout(() => setInputBackgroundColor('white'), 200);
                  } else {
                    text = text + substring;
                  }
                }

                setMsgTextValue(text);

                if (e.target.value.trim() === '') {
                  setErrorChars('');
                }
                setPosition(textarea.current.selectionStart);
              }
            }}
            onKeyDown={(e) => {
              if (textarea && textarea.current) {
                if (e.keyCode === 13 && !e.altKey) {
                  //normal return - should send content as draft
                  send(e.target.value, e);
                } else if (e.keyCode === 13 && e.altKey) {
                  //alt-return - should not send, but insert a linebreak
                  setMsgTextValue(
                    e.target.value.substring(
                      0,
                      textarea.current.selectionStart
                    ) +
                      '\n' +
                      e.target.value.substring(textarea.current.selectionStart)
                  );
                  setPosition(textarea.current.selectionStart + 1);
                } else if (e.target.value === '' && e.keyCode === 38) {
                  // arrow up - should edit the last draft message
                  if (lastUserMessage !== undefined) {
                    removeLastUserMessage();
                    setMsgTextValue(lastUserMessage.nachricht);
                    setMsgAttachments(lastUserMessage.anhang);
                    setTimeout(() => {
                      setPosition(
                        (lastUserMessage.nachricht || []).length + 100
                      );
                    }, 10);
                  }
                }
              }
            }}
          />
          <InputGroup.Addon
            onClick={(e) => {
              if (textarea && textarea.current) {
                send(textarea.current.value, e);
              }
            }}
            style={{ cursor: 'pointer', verticalAlign: 'bottom' }}
          >
            <Icon style={{ marginBottom: 3 }} name="arrow-circle-right" />
          </InputGroup.Addon>
        </InputGroup>
        <div
          style={{
            margin: 0,
            marginTop: 0,
            padding: 2,

            color: 'grey',
            XborderTop: '2px solid grey',
            fontSize: '12px',
          }}
        >
          <div style={{ textAlign: 'right' }}>{subText}</div>
        </div>
      </FormGroup>
    </div>
  );
};

export default ConversationInput;
