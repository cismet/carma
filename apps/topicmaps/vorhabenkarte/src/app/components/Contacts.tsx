import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faPhone } from "@fortawesome/free-solid-svg-icons";

interface ContactsProps {
  phone: string | null;
  email: string | null;
}

const Contacts = ({ phone, email }: ContactsProps) => {
  return (
    <div className="py-[12px]">
      <b className="text-[16px] mb-6">Kontakt:</b>
      <div className="flex gap-5 mt-2">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="flex flex-wrap items-center gap-2 text-inherit"
          >
            <FontAwesomeIcon icon={faPhone} /> {phone}
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="flex items-center gap-2 text-inherit"
          >
            <FontAwesomeIcon icon={faEnvelope} /> <span>{email}</span>
          </a>
        )}
      </div>
    </div>
  );
};

export default Contacts;
