import { Modal, Accordion } from "react-bootstrap";
import { Descriptions, Timeline } from "antd";
import { faBullseye, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Panel from "react-cismap/commons/Panel";

interface Action {
  id: number;
  status: string;
  payload?: {
    user?: string;
    pic?: string;
    picbefore?: string;
    picafter?: string;
  };
  action_time: string;
  status_reason?: string;
  actionDefinition?: {
    id: number;
    key: string;
    description: string;
  };
}

interface FeatureType {
  properties?: {
    baumart_botanisch?: string;
    standort_nr?: string;
    zusatz?: string;
    lfd_nr_str?: string;
    ortlicher_bezug?: string;
    pflanzjahr?: number;
    standalter_jahr?: number;
    hoehe_m?: number;
    stammumfang_cm?: number;
    actions?: string | Action[];
    latestActionStatus?: string;
    actionCount?: number;
    info?: {
      foto?: string;
      fotos?: string[];
      fotoCaptions?: string[];
      headerColor?: string;
      header?: string;
    };
    [key: string]: any;
  };
  [key: string]: any;
}

const getDateTime = (dateString: string) => {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return (
      date.toLocaleDateString("de-DE") +
      " " +
      date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return dateString;
  }
};

const getStatusEmoji = (status: string) => {
  switch (status) {
    case "done":
      return "✅";
    case "open":
      return "▶️";
    case "exception":
      return "⚠️";
    default:
      return "";
  }
};

const getStatusName = (status: string) => {
  switch (status) {
    case "done":
      return "Abgeschlossen";
    case "open":
      return "Gestartet";
    case "exception":
      return "Ausnahme";
    default:
      return "";
  }
};

const parseActions = (actions?: string | Action[]): Action[] => {
  if (!actions) return [];
  if (Array.isArray(actions)) {
    return actions;
  }
  if (typeof actions === "string") {
    try {
      return JSON.parse(actions);
    } catch {
      return [];
    }
  }
  return [];
};

const groupActionsByKey = (actions: Action[]) => {
  const grouped: { [key: string]: Action[] } = {};

  actions.forEach((action) => {
    const key = action.actionDefinition?.key || "unknown";
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(action);
  });

  // Sort actions within each group by time
  Object.keys(grouped).forEach((key) => {
    grouped[key].sort((a, b) => {
      return (
        new Date(a.action_time).getTime() - new Date(b.action_time).getTime()
      );
    });
  });

  return grouped;
};

const getTimelineForActions = (
  actions: Action[],
  baseUrl?: string,
  allPhotos?: string[],
  lightBoxDispatchContext?: any,
  setOpen?: (open: boolean) => void
) => {
  if (actions.length === 0) return null;

  const groupedActions = groupActionsByKey(actions);

  return (
    <>
      {Object.entries(groupedActions).map(([key, actionsInGroup]) => {
        // Use the description from the first action in the group
        const groupDescription =
          actionsInGroup[0]?.actionDefinition?.description || key;

        return (
          <div key={key} style={{ marginBottom: "24px" }}>
            <h4
              style={{
                marginBottom: "12px",
                fontSize: "14px",
                fontWeight: "bold",
                textAlign: "center",
              }}
            >
              {groupDescription}
            </h4>
            <Timeline style={{ paddingTop: 10 }} mode="left">
              {actionsInGroup.map((action) => {
                let color;
                if (action.status === "done") {
                  color = "green";
                } else if (action.status === "open") {
                  color = "blue";
                } else if (action.status === "exception") {
                  color = "red";
                }

                // Get the action-specific image from payload
                const actionImage = action.payload?.pic
                  ? (baseUrl ||
                      window.location.origin + window.location.pathname) +
                    action.payload.pic
                  : null;

                // Find the index of this image in the allPhotos array
                const photoIndex =
                  allPhotos?.findIndex((photo) => photo === actionImage) ?? -1;

                return (
                  <Timeline.Item
                    key={action.id}
                    color={color}
                    dot={
                      <span style={{ fontSize: "16px" }}>
                        {getStatusEmoji(action.status)}
                      </span>
                    }
                    label={getDateTime(action.action_time)}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        alignItems: "flex-start",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: "600",
                            marginBottom: "4px",
                          }}
                        >
                          {getStatusName(action.status)}
                        </div>
                        {action.payload?.user && (
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: "500",
                              marginBottom: "2px",
                            }}
                          >
                            {action.payload.user}
                          </div>
                        )}
                        {action.status_reason && (
                          <div style={{ fontSize: "12px", color: "#666" }}>
                            {action.status_reason}
                          </div>
                        )}
                      </div>
                      {actionImage && (
                        <img
                          src={actionImage}
                          alt="Aktion"
                          onClick={() => {
                            if (
                              lightBoxDispatchContext &&
                              photoIndex >= 0 &&
                              setOpen
                            ) {
                              setOpen(false);
                              lightBoxDispatchContext.setIndex(photoIndex);
                              lightBoxDispatchContext.setVisible(true);
                            }
                          }}
                          style={{
                            width: "50px",
                            height: "50px",
                            objectFit: "cover",
                            borderRadius: "4px",
                            flexShrink: 0,
                            marginRight: "8px",
                            cursor: lightBoxDispatchContext
                              ? "pointer"
                              : "default",
                          }}
                        />
                      )}
                    </div>
                  </Timeline.Item>
                );
              })}
              {/* Add "heute" (today) marker at the end */}
              <Timeline.Item
                color="green"
                dot={<FontAwesomeIcon icon={faBullseye} />}
                label={getDateTime(new Date().toISOString())}
              >
                heute
              </Timeline.Item>
            </Timeline>
          </div>
        );
      })}
    </>
  );
};

const SecondaryInfoModal = ({
  feature = {},
  setOpen = () => {},
  versionString = "???",
  Footer,
  lightBoxDispatchContext,
}: {
  feature?: FeatureType;
  setOpen?: (open: boolean) => void;
  versionString?: string;
  Footer?: React.ComponentType<any>;
  lightBoxDispatchContext?: any;
}) => {
  const close = () => {
    setOpen(false);
  };

  const p = feature.properties || {};
  const actions = parseActions(p.actions);

  // Extract baseUrl from the foto path
  const fotoUrl = p.info?.foto || "";
  const baseUrl = fotoUrl
    ? fotoUrl.substring(0, fotoUrl.lastIndexOf("/demo/"))
    : "";

  const title = `${p.baumart_botanisch || "Baum"} (${p.standort_nr || ""}.${
    p.zusatz || ""
  }.${p.lfd_nr_str || ""})`;
  const header = p.info?.header || "Baumbewirtschaftung";
  const latestStatus = p.latestActionStatus || "none";
  const statusEmoji = getStatusEmoji(latestStatus);

  // Get all photos from info
  const allPhotos = p.info?.fotos || [];

  const treeDetails = [
    p.pflanzjahr && (
      <Descriptions.Item key="pflanzjahr" label="Pflanzjahr">
        {p.pflanzjahr}
      </Descriptions.Item>
    ),
    p.standalter_jahr && (
      <Descriptions.Item key="standalter" label="Standalter">
        {p.standalter_jahr} Jahre
      </Descriptions.Item>
    ),
    p.hoehe_m && (
      <Descriptions.Item key="hoehe" label="Höhe">
        {p.hoehe_m} m
      </Descriptions.Item>
    ),
    p.stammumfang_cm && (
      <Descriptions.Item key="stammumfang" label="Stammumfang">
        {p.stammumfang_cm} cm
      </Descriptions.Item>
    ),
  ].filter(Boolean);

  return (
    <Modal
      style={{
        zIndex: 2900000000,
      }}
      height="100%"
      size="lg"
      show={true}
      onHide={close}
      keyboard={false}
      dialogClassName="modal-dialog-scrollable"
    >
      <Modal.Header
        style={{
          backgroundColor: "#fafafa",
          borderBottom: "1px solid #e0e0e0",
          padding: "12px 20px",
        }}
      >
        <Modal.Title
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            margin: 0,
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FontAwesomeIcon icon={faInfoCircle} style={{ fontSize: "18px" }} />
            <span>{header}</span>
          </div>
          {statusEmoji && (
            <span style={{ fontSize: "32px" }}>{statusEmoji}</span>
          )}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body id="myMenu" key={"tree.secondaryInfo"}>
        <div style={{ marginBottom: 20 }}>
          <div>
            <h2 style={{ marginTop: 0 }}>{title}</h2>
          </div>
          <div style={{ fontSize: "16px", color: "#666" }}>
            {p.ortlicher_bezug}
          </div>
        </div>

        <Accordion style={{ marginBottom: 6 }}>
          <Panel header={"Baumdaten"} eventKey="0" bsStyle="success">
            <Descriptions column={1} layout="horizontal" bordered size="small">
              {treeDetails}
            </Descriptions>
          </Panel>
        </Accordion>

        <Accordion style={{ marginBottom: 6 }} defaultActiveKey={"1"}>
          <Panel header={"Verlauf"} eventKey="1" bsStyle="info">
            {actions.length > 0 ? (
              <div style={{ marginTop: "8px" }}>
                {getTimelineForActions(
                  actions,
                  baseUrl,
                  allPhotos,
                  lightBoxDispatchContext,
                  setOpen
                )}
              </div>
            ) : (
              <div
                style={{ padding: "20px", color: "#999", textAlign: "center" }}
              >
                Keine Aktionen vorhanden
              </div>
            )}
          </Panel>
        </Accordion>
      </Modal.Body>
      <Modal.Footer>
        {Footer && <Footer close={close} version={versionString} />}
      </Modal.Footer>
    </Modal>
  );
};

export default SecondaryInfoModal;
