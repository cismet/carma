import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faComment } from "@fortawesome/free-solid-svg-icons";

const ContactButton = ({ emailaddress }) => {
  const contactButtonHandler = () => {
    let link = document.createElement("a");
    link.setAttribute("type", "hidden");
    const br = "\n";
    const iOS =
      !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);

    let normalMailToHref =
      "mailto:" +
      emailaddress +
      "?subject=eventueller Fehler im Geländemodell&body=" +
      encodeURI(
        `Sehr geehrte Damen und Herren,${br}${br} in der Starkregengefahrenkarte `
      ) +
      encodeURI(`auf${br}${br}`) +
      `${window.location.href.replace(/&/g, "%26").replace(/#/g, "%23")}` +
      encodeURI(
        `${br}` +
          `${br}` +
          `ist mir folgendes aufgefallen:${br}` +
          `${br}${br}${br}${br}` +
          `Mit freundlichen Grüßen${br}` +
          `${br}` +
          `${br}`
      );
    let iosMailToHref =
      "mailto:" +
      emailaddress +
      "?subject=eventueller Fehler im Geländemodell&body=" +
      encodeURI(
        `Sehr geehrte Damen und Herren, in der Starkregengefahrenkarte `
      ) +
      encodeURI(`auf `) +
      `${window.location.href.replace(/&/g, "%26").replace(/#/g, "%23")}` +
      encodeURI(` ist mir folgendes aufgefallen:`);
    document.body.appendChild(link);
    if (iOS) {
      link.href = iosMailToHref;
    } else {
      link.href = normalMailToHref;
    }

    link.click();
  };
  return (
    <ControlButtonStyler
      onClick={contactButtonHandler}
      title="Fehler im Geländemodell melden"
    >
      <FontAwesomeIcon icon={faComment} className="text-base" />
    </ControlButtonStyler>
  );
};

export default ContactButton;
