import { Link } from "react-scroll";
import slugify from "slugify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload } from "@fortawesome/free-solid-svg-icons";

const AnmeldungUndOfflineBenutzung = () => {
  return (
    <div>
      <p>
        Die interaktive Kartenanwendung &quot;Umweltalarm Wuppertal&quot; ist für die sehr
        spezifische Nutzergruppe der potenziell im Fall eines Umweltalarms Diensthabenden entwickelt
        worden. Sie ist daher nicht uneingeschränkt öffentlich zugänglich, sondern erfordert eine
        Anmeldung mit Benutzername und Passwort. Die Zugangssteuerung erfolgt dabei über die
        Nutzerverwaltung des Wuppertaler Navigations- und Datenmanagementsystems WuNDa. Zugangsdaten
        können bei der WuNDa-Administration (
        <a href='mailto:wunda@stadt.wuppertal.de'>wunda@stadt.wuppertal.de</a>) beantragt werden.{" "}
      </p>
      <p>
        Nach der Anmeldung beim Umweltalarm wird Ihr Nutzername im Titelbereich zusammen mit der
        letzten Aktualisierung des Cache-Speichers der Kartenanwendung in der Form &quot;
        <strong>Umweltalarm</strong> (Nutzername, Datum der letzten Cache-Aktualisierung, Uhrzeit
        der letzten Cache-Aktualisierung)&quot; angezeigt. Hier finden Sie auch den Hyperlink{" "}
        <u style={{ color: "rgb(51, 122, 183)" }}>abmelden</u>, mit dem Sie die Anwendung in den
        Offline-Modus versetzen können. Es erscheint dann zunächst wieder der Login-Dialog. Wenn Sie
        hier auf &quot;Offline arbeiten&quot; klicken, greift die Anwendung nicht mehr via Internet
        auf die servergespeicherten Fachdaten und Kartendienste zu, sondern auf deren im
        Anwendungscache gespeicherte Kopien. Das Arbeiten im Offline-Modus ist sinnvoll, wenn sich
        Ihr Einsatzort in einem Bereich mit schwacher oder unzuverlässiger Mobilfunknetzabdeckung
        befindet (&quot;Funklöcher&quot;). Wichtig: im Offline-Modus müssen Sie im Abschnitt
        &quot;Einstellungen&quot; des Anwendungsmenüs eine Vektor-{" "}
        <Link
          class='renderAsLink'
          to={slugify("Hintergrundkarte")}
          containerId={"myMenu"}
          activeClass='active'
        >
          Hintergrundkarte
        </Link>{" "}
        auswählen, deren Daten auf Ihr Endgerät heruntergeladen werden können. Sie erkennen diese
        Karten an dem Download-Symbol <FontAwesomeIcon icon={faDownload} /> neben der
        Kartenbezeichnung. Im Offline-Modus wird im Titelbereich anstelle Ihres Nutzernamens der
        Text &quot;Daten aus dem Cache&quot; zusammen mit Datum und Uhrzeit der letzten
        Aktualisierung des Cache angezeigt. Der in diesem Zustand angebotene Hyperlink{" "}
        <u style={{ color: "rgb(51, 122, 183)" }}>anmelden und Daten aktualisieren</u> öffnet
        wiederum den Login-Dialog. Hier können Sie sich wieder mit Nutzername und Passwort anmelden,
        wenn Sie das Funkloch verlassen haben.{" "}
      </p>
    </div>
  );
};
export default AnmeldungUndOfflineBenutzung;
