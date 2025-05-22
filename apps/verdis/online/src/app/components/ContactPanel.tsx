import { panelTitles } from "@carma-collab/wuppertal/verdis-online";
interface ContactProps {
  contact?: any;
}

const ContactPanel = ({ contact }: ContactProps) => {
  let _contact;
  if (!contact) {
    _contact = {
      anrede: "Frau",
      vorname: "Monja",
      nachname: "Schommers",
      telefon: "+49-202-563 4898",
      mail: "monja.schommers@stadt.wuppertal.de",
      _image: "SteinbacherD102.png",
    };
  } else {
    _contact = contact;
  }

  const image = _contact.image;
  const baseUrl = window.location.origin + window.location.pathname;

  return (
    <div
      className="gradient-bg-for-cards"
      style={{
        minHeight: 20,
        backgroundColor: "#f5f5f5",
        border: "1px solid #e3e3e3",
        padding: 9,
        borderRadius: 3,
        height: "auto",
        position: "relative",
      }}
    >
      {/* Profile Image Wrapper */}
      <div
        style={{
          width: "54px",
          height: "54px",
          position: "absolute",
          right: "10px",
          top: "15px",
          borderRadius: "50%",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundImage: image
              ? `url("${baseUrl}images/contacts/${image}")`
              : "none",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      </div>

      <h4 style={{ fontSize: "18px" }}>{panelTitles.contactTitle}</h4>
      <h5 style={{ fontSize: "14px" }}>
        {_contact.anrede} {_contact.vorname} {_contact.nachname}{" "}
      </h5>
      <h6 style={{ fontSize: "12px" }}>
        Telefon: <a href={"tel:" + _contact.telefon}>{_contact.telefon} </a>
      </h6>
      <h6
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "200px", // Adjust as needed
          display: "inline-block",
          verticalAlign: "middle",
          fontSize: "12px",
        }}
        title={_contact.mail} // Shows full email on hover
      >
        eMail: <a href={"mailto:" + _contact.mail}>{_contact.mail}</a>
      </h6>
    </div>
  );
};

export default ContactPanel;
