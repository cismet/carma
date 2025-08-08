import { useState } from "react";
import {
  Checkbox,
  Form,
  Modal,
  Input,
  Button,
  Typography,
  Tooltip,
  type TooltipProps,
} from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComment } from "@fortawesome/free-solid-svg-icons";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";

// Shared copy to keep preview and email body in sync
const greetText = "Sehr geehrte Damen und Herren,";
const introPrefix = "zu den ";
const introSuffix = " möchte ich Folgendes mitteilen:";
const ownerText =
  "Ich bin Eigentümer des unten angegebenen Grundstückes und fühle mich in meinen Rechten verletzt. Ich bitte daher um Überprüfung der datenschutzrechtlichen Zulässigkeit und ggf. Unkenntlichmachung.";
const otherLabel = "Sonstige Mitteilungen";
const otherPlaceholder = "(bitte Text eingeben)";
const consentText =
  "Zum Nachweis meines berechtigten Interesses teile ich Ihnen hiermit meinen Namen und meine Adresse mit und stimme der Überprüfung der Eigentumsverhältnisse im Amtlichen Liegenschaftskataster Informationssystem ALKIS zu:";
const nameLabel = "Name:";
const propertyLabel = "Straße und Hausnr. des Grundstücks:";
const propertyPlaceholder = "(bitte zu prüfendes Grundstück angeben)";
const altAddressCheckboxLabel = "abweichende Anschrift";
const addressLabel = "Anschrift:";
const addressPlaceholder = "(bitte abweichende Kontaktdaten angeben)";
const kindRegards = "Mit freundlichen Grüßen";

interface ContactMailButtonProps {
  emailAddress: string;
  subjectPrefix: string;
  productName: string;
  portalName: string;
  width?: string;
  imageId?: string;
  imageUri?: string;
  tooltip?: TooltipProps;
}

interface ContactMailFormFields {
  // checkboxes
  isOwner?: boolean;
  other?: boolean;
  hasAltAddress?: boolean;
  // text inputs
  name?: string;
  property?: string; // Straße und Hausnr. (zu prüfendes Grundstück)
  address?: string; // abweichende Anschrift
  otherText?: string; // text for Sonstiges
}

export const ContactMailButton = ({
  emailAddress,
  subjectPrefix,
  productName,
  portalName,
  width,
  imageId,
  imageUri,
  tooltip,
}: ContactMailButtonProps) => {
  const [visible, setVisible] = useState(false);
  const [form] = Form.useForm<ContactMailFormFields>();

  const handleClick = () => {
    setVisible(true);
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    const url = window?.location?.href ?? "";
    const body = `${greetText}

${introPrefix}${productName} im ${portalName}${introSuffix}
[${values.isOwner ? "x" : " "}] ${ownerText}
[${values.other ? "x" : " "}] ${otherLabel}${
      values.otherText ? `\n${values.otherText}` : ""
    }

${consentText}
${nameLabel} ${values.name || "keine Angabe"}
${propertyLabel} ${values.property || propertyPlaceholder}
${values.hasAltAddress ? `[x] ${altAddressCheckboxLabel}` : ""}
${
  values.hasAltAddress
    ? `${addressLabel} ${values.address || addressPlaceholder}`
    : ""
}

${kindRegards}
${values.name || ""}

---
Technische Informationen:
Bild-ID: ${imageId}
Bild-Link: ${imageUri}
Ansicht: ${url}
`;

    const to = encodeURIComponent(emailAddress);
    const encodedSubject = encodeURIComponent(subjectPrefix);
    const encodedBody = encodeURIComponent(body);
    const mailtoAnchor = document.createElement("a");
    mailtoAnchor.href = `mailto:${to}?subject=${encodedSubject}&body=${encodedBody}`;
    mailtoAnchor.click();

    setVisible(false);
    //form.resetFields();
  };

  const handleCancel = () => {
    setVisible(false);
    //form.resetFields();
  };

  const button = (
    <ControlButtonStyler onClick={handleClick} width={width}>
      <span className="flex items-center text-base">
        <FontAwesomeIcon icon={faComment} className="mr-2" />
        Rückmeldung
      </span>
    </ControlButtonStyler>
  );

  return (
    <>
      {tooltip ? (
        <Tooltip title={tooltip.title} placement={tooltip.placement}>
          {button}
        </Tooltip>
      ) : (
        button
      )}
      <Modal
        title={subjectPrefix}
        open={visible}
        onCancel={handleCancel}
        footer={
          <div className="space-y-2">
            <div className="text-right">
              <Button onClick={handleCancel}>Abbrechen</Button>
              <Button type="primary" onClick={handleOk} className="ml-2">
                E-Mail erstellen
              </Button>
            </div>
            <div className="text-xs text-gray-500">
              Zum Absenden verwenden Sie bitte die Senden-Funktionalität in
              ihrer E-Mail-Anwendung.
            </div>
          </div>
        }
      >
        <Form form={form} layout="vertical" size="small">
          {/* Interaktive Vorschau der E-Mail */}
          <Typography.Paragraph>{greetText}</Typography.Paragraph>
          <Typography.Paragraph>
            {introPrefix}
            {productName} im {portalName}
            {introSuffix}
          </Typography.Paragraph>

          <Form.Item name="isOwner" valuePropName="checked">
            <Checkbox>{ownerText}</Checkbox>
          </Form.Item>

          <Form.Item name="other" valuePropName="checked">
            <Checkbox>{otherLabel}</Checkbox>
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) =>
              getFieldValue("other") ? (
                <Form.Item name="otherText">
                  <Input.TextArea rows={3} placeholder={otherPlaceholder} />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Typography.Paragraph>{consentText}</Typography.Paragraph>
          <Form.Item name="name" label={nameLabel}>
            <Input />
          </Form.Item>
          <Form.Item name="property" label={propertyLabel}>
            <Input placeholder={propertyPlaceholder} />
          </Form.Item>

          <Form.Item name="hasAltAddress" valuePropName="checked">
            <Checkbox>{altAddressCheckboxLabel}</Checkbox>
          </Form.Item>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) =>
              getFieldValue("hasAltAddress") ? (
                <Form.Item name="address" label={addressLabel}>
                  <Input placeholder={addressPlaceholder} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Typography.Paragraph>{kindRegards}</Typography.Paragraph>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => (
              <div className="min-h-[20px]">{getFieldValue("name") || ""}</div>
            )}
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
