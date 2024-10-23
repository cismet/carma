import { Button, Card, Input } from "antd";
import { useDispatch } from "react-redux";
import { useParams } from "react-router-dom";
import { updateTimelineValues } from "../../store/slices/application";
import { useState } from "react";
import { EditOutlined } from "@ant-design/icons";
const { TextArea } = Input;

const Request = ({ attachment, i, isInternalRequest }) => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const [requester, setRequester] = useState("");
  const [receiver, setReceiver] = useState("");

  const updateValue = (value, property) => {
    dispatch(
      updateTimelineValues({
        timelineIndex: i,
        itemValue: value,
        property: property,
        applicationId: id,
      })
    );
  };

  return (
    <div className="w-full relative pb-4 before:bg-zinc-200 before:absolute before:bottom-0 before:content-[''] before:block before:left-4 before:top-0 before:w-[2px]">
      {isInternalRequest ? (
        <>
          <Card
            size="small"
            type="inner"
            title={
              <div className="font-medium text-lg text-start">Anfrage</div>
            }
          >
            <div className="w-full flex flex-col gap-2">
              {requester ? (
                <span className="w-full text-start text-xl font-medium">
                  An: {requester}{" "}
                  <EditOutlined
                    className="cursor-pointer"
                    onClick={() => setRequester("")}
                  />
                </span>
              ) : (
                <div className="flex justify-start items-center gap-2 w-full">
                  <Button onClick={() => setRequester("104.11")}>104.11</Button>
                  <Button onClick={() => setRequester("104.23")}>104.23</Button>
                  <Button onClick={() => setRequester("GMW")}>GMW</Button>
                </div>
              )}
              {receiver ? (
                <span className="w-full text-xl text-end font-medium">
                  Von: {receiver}{" "}
                  <EditOutlined
                    className="cursor-pointer"
                    onClick={() => setReceiver("")}
                  />
                </span>
              ) : (
                <div className="flex justify-end items-center gap-2 w-full">
                  <Button onClick={() => setReceiver("104.11")}>104.11</Button>
                  <Button onClick={() => setReceiver("104.23")}>104.23</Button>
                  <Button onClick={() => setReceiver("GMW")}>GMW</Button>
                </div>
              )}
            </div>
          </Card>
        </>
      ) : (
        <>
          <Card
            size="small"
            type="inner"
            title={
              <div className="font-medium text-lg text-start">Anfrage</div>
            }
          >
            <div className="w-full flex justify-between gap-10">
              <div className="flex flex-col gap-4 text-start w-full">
                <span className="text-lg font-medium">Antragssteller</span>
                <div className="flex gap-4 w-full">
                  <div className="flex flex-col w-full gap-2">
                    <label htmlFor="requester_first_name">Vorname</label>
                    <Input
                      id="requester_first_name"
                      value={attachment.firstname}
                      onChange={(e) => updateValue(e.target.value, "firstname")}
                    />
                  </div>
                  <div className="flex flex-col w-full gap-2">
                    <label htmlFor="requester_last_name">Nachname</label>
                    <Input
                      id="requester_last_name"
                      value={attachment.lastname}
                      onChange={(e) => updateValue(e.target.value, "lastname")}
                    />
                  </div>
                </div>
                <div className="flex gap-4 w-full">
                  <div className="flex flex-col w-full gap-2">
                    <label htmlFor="requester_phone_number">
                      Telefonnummer
                    </label>
                    <Input
                      id="requester_phone_number"
                      value={attachment.phone}
                      onChange={(e) => updateValue(e.target.value, "phone")}
                    />
                  </div>
                  <div className="flex flex-col w-full gap-2">
                    <label htmlFor="reqeuster_mail">E-Mail</label>
                    <Input
                      id="reqeuster_mail"
                      value={attachment.email}
                      onChange={(e) => updateValue(e.target.value, "email")}
                    />
                  </div>
                </div>
                <div className="flex gap-4 w-full">
                  <div className="flex flex-col w-full gap-2">
                    <label htmlFor="requester_street">Straße</label>
                    <Input
                      id="requester_street"
                      value={attachment.requester_street}
                      onChange={(e) =>
                        updateValue(e.target.value, "requester_street")
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="requester_street_number">Hausnummer</label>
                    <Input
                      id="requester_street_number"
                      value={attachment.requester_street_number}
                      onChange={(e) =>
                        updateValue(e.target.value, "requester_street_number")
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-4 w-full">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="requester_zip_code">Postleitzahl</label>
                    <Input
                      id="requester_zip_code"
                      value={attachment.requester_postalcode}
                      onChange={(e) =>
                        updateValue(e.target.value, "requester_postalcode")
                      }
                    />
                  </div>
                  <div className="flex flex-col w-full gap-2">
                    <label htmlFor="requester_city">Stadt</label>
                    <Input
                      id="requester_city"
                      value={attachment.requester_city}
                      onChange={(e) =>
                        updateValue(e.target.value, "requester_city")
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4 text-start w-full">
                <span className="text-lg font-medium">Rechnungsadresse</span>
                <div className="flex gap-4 w-full">
                  <div className="flex flex-col w-full gap-2">
                    <label htmlFor="billing_street">Straße</label>
                    <Input
                      id="billing_street"
                      value={attachment.billing_street}
                      onChange={(e) =>
                        updateValue(e.target.value, "billing_street")
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="billing_street_number">Hausnummer</label>
                    <Input
                      id="billing_street_number"
                      value={attachment.billing_street_number}
                      onChange={(e) =>
                        updateValue(e.target.value, "billing_street_number")
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-4 w-full">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="billing_zip_code">Postleitzahl</label>
                    <Input
                      id="billing_zip_code"
                      value={attachment.billing_postal_code}
                      onChange={(e) =>
                        updateValue(e.target.value, "billing_postal_code")
                      }
                    />
                  </div>
                  <div className="flex flex-col w-full gap-2">
                    <label htmlFor="billing_city">Stadt</label>
                    <Input
                      id="billing_city"
                      value={attachment.billing_city}
                      onChange={(e) =>
                        updateValue(e.target.value, "billing_city")
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default Request;
