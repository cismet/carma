// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { useDispatch, useSelector } from 'react-redux';
import { getUiState, showChangeRequests } from '../../../store/slices/ui';
import ModalApplicationMenu from 'react-cismap/topicmaps/menu/ModalApplicationMenu';
import Section from 'react-cismap/topicmaps/menu/Section';
import Introduction from './CR05Introduction';
import {
  getKassenzeichen,
  getNumberOfPendingChanges,
} from '../../../store/slices/kassenzeichen';
import CRConversation from '../conversations/CRConversation';
import { useState } from 'react';
import ConversationInput from '../conversations/ConversationInput';
import CR20DocumentsPanel from './CR20DocumentsPanel';
import { Button } from 'react-bootstrap';
import Toggle from 'react-bootstrap-toggle';
import './toggle.css';

const CR00MainComponent = ({ localErrorMessages = [] }) => {
  const uiState = useSelector(getUiState);
  const kassenzeichen = useSelector(getKassenzeichen);
  const dispatch = useDispatch();
  const [hideSystemMessages, setHideSystemMessages] = useState(false);

  const draftHint = `Bitte beachten Sie, dass Änderungswünsche,
	Anmerkungen und Ihre hochgeladenen Dokumente
	erst für den Sachbearbeiter sichtbar werden,
	wenn sie die Änderungen freigegeben/entsperrt
	und eingereicht haben.`;

  const { crDraftCounter } = getNumberOfPendingChanges(
    kassenzeichen.aenderungsanfrage
  );

  const crMessages =
    (kassenzeichen.aenderungsanfrage || { nachrichten: [] }).nachrichten || [];
  const messages = [...(crMessages || []), ...(localErrorMessages || [])];
  const crEditMode = uiState.changeRequestsEditMode;

  const changerequests = kassenzeichen.aenderungsanfrage;
  const changerequestBezeichnungsArray =
    Object.keys((changerequests || { flaechen: [] }).flaechen || []) || [];

  const changerequestMessagesArray =
    (changerequests || { nachrichten: [] }).nachrichten || [];
  const sMsgs = changerequestMessagesArray;
  const documents: any = [];

  sMsgs.forEach((msg) => {
    //if a document exists, add it to the documents array
    if (msg.anhang !== undefined && msg.anhang.length > 0) {
      msg.anhang.forEach((anhang) => {
        documents.push(anhang);
      });
    }
  });

  return (
    <ModalApplicationMenu
      menuIcon={'edit'}
      menuTitle={'Änderungswünsche und Kommentare'}
      // menuFooter={<></>}
      menuIntroduction={<Introduction />}
      visible={uiState.changeRequestsMenuVisible}
      setVisible={(value) => dispatch(showChangeRequests({ visible: value }))}
      menuSections={
        crEditMode
          ? [
              <table style={{ marginTop: 15, marginBottom: 10 }} width="100%">
                <tbody>
                  <tr>
                    <td>
                      <Button
                        className="pull-left"
                        id="cmdCloseModalApplicationMenu"
                        variant="success"
                        type="submit"
                        onClick={() => {
                          // showModalMenu("anleitung");
                        }}
                        //hier gehts weiter
                        style={{ margin: 5 }}
                      >
                        Hilfe
                      </Button>
                    </td>
                    <td>
                      <div
                        style={{
                          verticalAlign: 'middle',
                          textAlign: 'right',
                        }}
                      >
                        Systemnachrichten einblenden:{' '}
                        <Toggle
                          onClick={() => {
                            setHideSystemMessages(!hideSystemMessages);
                          }}
                          on={'Ein'}
                          off={'Aus'}
                          offstyle="danger"
                          onstyle="success"
                          size={'xs'}
                          active={!hideSystemMessages}
                          style={{ padding: 10 }}
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>,
              <Section
                key="sectionKey0"
                sectionKey="sectionKey0"
                sectionTitle="Ihre Kommunikation"
                sectionBsStyle="info"
                sectionContent={
                  <>
                    <CRConversation
                      messages={messages}
                      hideSystemMessages={hideSystemMessages}
                    />
                    {/* <ConversationInput /> */}
                  </>
                }
              />,
              <Section
                key="sectionKey1"
                sectionKey="sectionKey1"
                sectionTitle={
                  'Ihre Änderungsvorschläge' +
                  (changerequestBezeichnungsArray !== undefined &&
                  changerequestBezeichnungsArray.length > 0
                    ? ' (' + changerequestBezeichnungsArray.length + ')'
                    : '')
                }
                sectionBsStyle="warning"
                sectionContent={<p>keine Änderungsvorschläge vorhanden</p>}
              />,
              <Section
                key="sectionKey2"
                sectionKey="sectionKey2"
                sectionTitle={'Ihre Anmerkungen in der Karte'}
                sectionBsStyle="success"
                sectionContent={<></>}
              />,
              <Section
                key="sectionKey2"
                sectionKey="sectionKey2"
                sectionTitle={
                  'Ihre Dokumente' +
                  (documents.length > 0 ? ' (' + documents.length + ')' : '')
                }
                sectionBsStyle="danger"
                sectionContent={<CR20DocumentsPanel documents={documents} />}
              />,
              <table
                style={{
                  width: '100%',
                }}
              >
                <tbody>
                  <tr>
                    <td
                      style={{
                        textAlign: 'left',
                        verticalAlign: 'top',
                        paddingRight: '30px',
                      }}
                    >
                      <p>
                        {crDraftCounter > 0 && <b>{draftHint}</b>}
                        {!(crDraftCounter > 0) && <span>{draftHint}</span>}
                      </p>
                      <p>
                        Sollten sich nach Abschluss der Bearbeitung Änderungen
                        gegenüber der bisherigen Gebührenerhebung ergeben,
                        erhalten Sie einen Änderungsbescheid durch das
                        Steueramt. Eine Veranlagung findet ggf. rückwirkend
                        statt. Maßgebend ist das Datum des Luftbilds, in dem die
                        Änderung feststellbar ist, aber längsten das laufende
                        und die 4 vorhergegangenen Jahre.
                      </p>
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>,
              <Section
                key="sectionKey3"
                sectionKey="sectionKey3"
                sectionTitle="eMail Benachrichtigungen aktivieren"
                sectionBsStyle="info"
                sectionContent={<></>}
              />,
            ]
          : [
              <div>
                <p style={{ textAlign: 'left' }}>
                  Wenn Sie den Änderungsmodus aktivieren, erscheinen in diesem
                  Dialog die Steuerelemente mit denen Sie Ihre Änderungen
                  anlegen können und weitere Hilfsinformationen erhalten.
                </p>
                {/* <Button
                  className="pull-left"
                  id="cmdCloseModalApplicationMenu"
                  bsStyle="success"
                  type="submit"
                  onClick={() => {
                    // showModalMenu("anleitung");
                  }}
                >
                  Hilfe
                </Button>
                <Button
                  id="cmdCloseModalApplicationMenu"
                  bsStyle="primary"
                  type="submit"
                  onClick={close}
                >
                  Ok
                </Button> */}
              </div>,
            ]
      }
    />
  );
};

export default CR00MainComponent;
