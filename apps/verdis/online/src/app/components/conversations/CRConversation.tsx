// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import Documents from './Documents';
import Message from './InternalMessage';
import SystemMessage from './SystemMessage';
import InternalMessage from './InternalMessage';

const CRConversation = ({
  messages = [],
  userMap = {
    verdis: { name: 'VerDIS-Online', color: '#006D71' },
    SteinbacherD102: { name: 'Dirk Steinbacher', color: '#006D71' },
    citizen: {},
    system: {},
  },
  width,
  background,
  hideSystemMessages = false,
}) => {
  const sMsgs = messages.sort((a, b) => a.timestamp - b.timestamp);

  const sMsgsWithWelcomeMessage: any = [];
  sMsgsWithWelcomeMessage.push({
    typ: 'CLERK',
    timestamp: 0,
    name: 'verdis',
    nachricht:
      'Sehr geehrte*r Nutzer*in, hier haben Sie die Möglichkeit Änderungen an Ihren Flächen zu begründen und allgemeine Anmerkungen sowie Belege hinzuzufügen.',
  });
  sMsgsWithWelcomeMessage.push(...sMsgs);

  return (
    <div>
      {sMsgsWithWelcomeMessage.map((msg, index) => {
        switch (msg.typ) {
          case 'CLERK': {
            if (msg.draft === true) {
              return undefined;
            }
            let sender;
            const mappedSender = userMap[msg.name];
            if (mappedSender !== undefined) {
              sender = mappedSender.name;
            } else {
              sender = msg.name;
            }

            return (
              <Message
                key={'CLERK.Message.' + index}
                msg={msg.nachricht}
                from={sender}
              />
            );
          }
          case 'CITIZEN': {
            let background = '#FDC65399';

            if (msg.draft === true) {
              background = '#FDC65333';
            }
            return (
              <div key={'CITIZEN.div.' + index}>
                {msg.nachricht !== undefined && msg.nachricht.trim() !== '' && (
                  <Message
                    key={'CITIZEN.Message.' + index}
                    msg={msg.nachricht}
                    background={background}
                    alignment="right"
                  />
                )}

                {msg.anhang !== undefined &&
                  msg.anhang.length !== undefined &&
                  msg.anhang.length > 0 && (
                    <Message
                      key={'Attachment.Message'}
                      msg={
                        <div>
                          <Documents
                            docs={msg.anhang || []}
                            readOnly={true}
                            embedded={true}
                            margin="2px"
                          />
                        </div>
                      }
                      background={background}
                      alignment="right"
                      margin={-1}
                      padding={5}
                      width={'fit-content'}
                    />
                  )}
              </div>
            );
          }

          case 'SYSTEM':
            if (
              hideSystemMessages === false &&
              systemmessage(msg.nachrichtenParameter) !== undefined
            ) {
              return (
                <SystemMessage
                  key={'SYSTEM.SystemMessage.' + index}
                  msg={systemmessage(msg.nachrichtenParameter)}
                />
              );
            } else {
              return undefined;
            }
          case 'LOCALERROR': {
            return (
              <InternalMessage
                key={'SYSTEM.LOCALERROR.' + index}
                msg={msg.nachricht}
                alignment="center"
                background="#fcf0f0"
                color="#E73B2F"
                margin={5}
                padding={5}
                fontSize={0.9}
                width="65%"
              />
            );
          }
          default:
            break;
        }
        return <div key={'FALLBACK.pure.' + index}>{msg.nachricht}</div>;
      })}
    </div>
  );
};

const systemmessage = (sysMsgConf) => {
  if (sysMsgConf.type !== undefined) {
    switch (sysMsgConf.type) {
      case 'CHANGED':
        return `Ihr Sachbearbeiter hat die Fläche ${sysMsgConf.flaeche} geändert.`;
      case 'REJECTED':
        return `Ihr Sachbearbeiter hat Änderungen an der Fläche ${sysMsgConf.flaeche} abgelehnt.`;
      case 'NOTIFY':
        return undefined;
      case 'STATUS': {
        switch (sysMsgConf.status) {
          case 'NONE':
          case 'FINISHED':
            return 'Ihr Sachbearbeiter hat die Bearbeitung abgeschlossen.';
          case 'PROCESSING':
            return 'Ihr Sachbearbeiter hat die Bearbeitung aufgenommen.';
          case 'PENDING':
            return undefined;
          default:
            return 'unbekannter Status' + sysMsgConf.status;
        }
      }
      case 'SEEN':
        return undefined;

      default: {
        return 'Fehlerhafte Systemnachricht:' + JSON.stringify(sysMsgConf);
      }
    }
  }
};

export default CRConversation;
