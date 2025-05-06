// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// import GenericModalMenuSection from "../commons/GenericModalMenuSection";
import FAQLink from "./Menu50FAQEntryLink";
import FAQEntry from "./Menu50FAQEntry";
import slugify from "slugify";

const faqEntriesFactory = (showOnSeperatePage, entryDescriptionArray = []) => {
  let linkArray = [];
  let entryArray = [];
  for (const entryDescription of entryDescriptionArray) {
    entryDescription.showOnSeperatePage = showOnSeperatePage;
    if (entryDescription.id === undefined) {
      entryDescription.id = slugify(entryDescription.title);
    }
    linkArray.push(
      <FAQLink key={"FAQLink." + entryDescription.id} {...entryDescription} />
    );
    entryArray.push(
      <FAQEntry
        key={"FAQEntryLink." + entryDescription.id}
        {...entryDescription}
      />
    );
  }
  return { linkArray, entryArray };
};

const Component = ({
  applicationMenuActiveKey,
  setApplicationMenuActiveKey,
  showOnSeperatePage,
}) => {
  const { linkArray, entryArray } = faqEntriesFactory(showOnSeperatePage, [
    {
      title: "Hintergrund",
      bsStyle: "default",
      content: (
        <p>
          Die Ermittlung der Dach- und versiegelten Flächen dient zur Verteilung
          der Kosten, die durch das Kanalsystem und alle damit zusammenhängenden
          Anlagen und Tätigkeiten entstehen. Rechtliche Bedenken bei der
          Gebührengerechtigkeit machten 2003 eine Umstellung von der
          Heranziehung ausschließlich bebauter Flächen auf die Heranziehung von
          Dach- und versiegelten Flächen erforderlich. Auf Grund der
          topographischen Lage Wuppertals, des alten Kanalsystems und des
          erforderlichen Trennsystems (Trennung von Schmutz- und
          Niederschlagswasser) ist ein erheblicher Aufwand zu betreiben, um eine
          geregelte Abwasserentsorgung zu gewährleisten und Überschwemmungen in
          Wuppertal zu vermeiden. Die durchschnittliche jährliche
          Niederschlagsmenge beträgt ca. 1200 Liter/m². Von dem anfallenden
          Niederschlagswasser müssen 60 Mio. m³ Regenwasser behandelt werden.
          Maßgebend ist die Satzung über die Abwasserbeseitigung in der Stadt
          Wuppertal.
        </p>
      ),
    },
    {
      title: "Kriterien für die Beurteilung von Flächen",
      bsStyle: "success",
      content: (
        <p>
          Art der Fläche, ihre Beschaffenheit und Abgrenzung. Ist ein Kanal,
          verrohrter Bach oder Privatkanal der in einen öffentlichen Kanal
          gelangt, vorhanden und liegt eine Anschluss- und Benutzungspflicht
          vor? Wie entwässert die Fläche bei Starkregen (so genannter
          Jahrhundertregen)? Gelangt Wasser von dieser Fläche direkt oder
          indirekt in die Kanalisation (nicht die Menge ist entscheidend,
          sondern die Tatsache an sich)? Liegt eine Befreiung von der Anschluss-
          und Benutzungspflicht vor oder gibt es eine Entwässerungserlaubnis zur
          Versickerung bzw. Einleitung in ein offenes Gewässer? Die Flächen
          werden aus dem neuesten, dem Liegenschaftskataster vorliegenden,
          Luftbild erfasst. Da eine Beurteilung der Flächen aus dem Luftbild
          nicht immer einwandfrei möglich ist, wird der jeweilige
          Eigentümer/Verwalter bei dem Verfahren beteiligt.
        </p>
      ),
    },
    {
      title: "Eigentumsanteil an Flächen",
      bsStyle: "success",
      content: (
        <div>
          <p>
            Bei Grundbüchern, die nach dem Wohnungseigentumsgesetzt (WEG)
            gebildet wurden kann keine Aufteilung von Flächen vorgenommen
            werden. Eine Aufteilung muss hier durch eine/n Verwalter*in oder
            eine/n Miteigentümer*in vorgenommen werden.
          </p>
          <ol>
            <li>
              Der Anteil an Gemeinschaftsflächen, die nicht nach dem WEG
              gebildet wurden, wird im Grundbuch auf zwei unterschiedliche Arten
              geführt und wird dadurch bedingt auch bei der Gebührenerhebung
              unterschiedlich gehandhabt.
            </li>
            <li>
              Der Anteil der Gemeinschaftsfläche ist auf dem gleichen
              Grundbuchblatt wie des Hausgrundstück eingetragen. In diesem Fall
              wird der jeweilige Anteil dem Eigentümer des Hausgrundstückes
              unter dem gleichen Kassenzeichen zugeteilt. Aufgeführt sind das
              Flächenmaß der Gesamtfläche und der jeweilige Anteil des
              Eigentümers. Die Gemeinschaftsfläche ist auf einem separaten
              Grundbuchblatt eingetragen. In diesem Fall wurden bisher die
              jeweiligen Flächenanteile durch die Verwaltung gemäß
              Grundbucheintrag auf die einzelnen Eigentümer aufgeteilt und für
              jeden mit einem separaten Kassenzeichen geführt. Ob diese
              Vorgehensweise für die Zukunft aufrechterhalten werden kann oder
              ob die Umlage der Gebühren von den Eigentümern selbst vorgenommen
              werden muss, ist zurzeit unklar. Aus rechtlicher Sicht ist jeder
              Eigentümer gesamtschuldnerisch haftbar.
            </li>
          </ol>
        </div>
      ),
    },
    {
      title: "Was bedeutet versiegelt?",
      bsStyle: "primary",
      content: (
        <p>
          Alle Flächen, die keine natürliche Oberfläche aufweisen, gelten als
          versiegelt. Auch Flächen mit Kies, Split, Rasengittersteinen,
          Holzterrassen usw. sind versiegelte Flächen. Sie werden nach ihrer Art
          und durch ihre Abflusswirksamkeit unterschieden.
        </p>
      ),
    },
    {
      title: 'Was bedeutet "in den Kanal entwässernd"?',
      bsStyle: "primary",
      content: (
        <p>
          Als "in den Kanal entwässernd" werden Flächen eingestuft, von denen
          bei einem Starkregen (Jahrhundertregen) Wasser in einen vorhandenen
          Kanal gelangen kann. Hierbei spielt es keine Rolle, ob die Fläche eine
          eigene Entwässerung hat oder ob das Regenwasser über eine benachbarte
          Fläche in einen Kanal abläuft. Verrohrte Bäche werden wie
          Regenwasserkanäle angesehen.
        </p>
      ),
    },
    {
      title: "Wann ist eine Fläche versickernd?",
      bsStyle: "primary",
      content: (
        <p>
          Wenn von ihr kein Regenwasser in den Kanal gelangen kann. Entweder
          wird das Wasser auf angrenzenden, unversiegelten Flächen oder in einer
          speziellen Anlage zur Versickerung gebracht. Bei größeren Flächen ist
          eine wasserrechtliche Erlaubnis erforderlich. Ansprechpartner ist hier
          die untere Wasserbehörde{" "}
          <a
            target="_more"
            href="https://www.wuppertal.de/vv/produkte/106/versickerung.php#tab-infos"
          >
            (weiterführende Information)
          </a>
          . Liegt ein Regenwasserkanal in der Straße und Flächen sollen
          versickern, wird eine Befreiung vom Anschluss- und Benutzungszwang
          benötigt, die formlos beim Eigenbetrieb Wasser und Abwasser Wuppertal
          beantragt werden kann{" "}
          <a
            target="_more"
            href="https://www.wuppertal.de/vv/oe/waw/102370100000497495.php#tab-infos"
          >
            (weiterführende Information)
          </a>
          .
        </p>
      ),
    },
    {
      title: 'Was ist eine "Direkteinleitung in Gewässer"?',
      bsStyle: "primary",
      content: (
        <p>
          Das Niederschlagswasser von Flächen wird in einen Bach, Fluss oder
          anderes Gewässer geleitet. Eine Gebührenbefreiung findet aber nur
          statt, wenn es sich um ein offenes Gewässer handelt und auf dem Weg zu
          dem offenen Gewässer zu keiner Zeit ein städtischer Kanal in Anspruch
          genommen wird. Verrohrte Gewässer gehören mit zum Kanalnetz und haben
          keine reduzierende Auswirkung auf die Gebührenerhebung. Es wird in
          jedem Fall eine Einleiterlaubnis benötigt, die bei der Unteren
          Wasserbehörde im Ressort Umweltschutz beantragt werden kann
          (gebührenpflichtig).
        </p>
      ),
    },
    {
      title: "Muss man in einen Kanal entwässern?",
      bsStyle: "primary",
      content: (
        <p>
          Ja. Wenn in der Straße ein Kanal anschlussfähig verlegt ist müssen die
          Dach- und versiegelten Flächen angeschlossen werden. In Wuppertal gilt
          der Anschluss- und Benutzungszwang. In Ausnahmefällen, wenn die Kosten
          einer Anschlussherstellung unzumutbar sind, kann eine Befreiung von
          dieser Pflicht ausgesprochen werden. Hierfür ist ein Antrag
          erforderlich, der formlos beim Eigenbetrieb Wasser und Abwasser
          Wuppertal{" "}
          <a
            target="_more"
            href="https://www.wuppertal.de/vv/oe/waw/102370100000497495.php#tab-infos"
          >
            (weiterführende Information)
          </a>{" "}
          gestellt werden kann (gebührenpflichtig).
        </p>
      ),
    },
    {
      title: "Was bedeutet Abflusswirksamkeit?",
      bsStyle: "primary",
      content: (
        <p>
          Unter Abflusswirksamkeit wird hier verstanden, in welchem Maße eine
          Fläche Wasser von der Einleitung in den Kanal abhält. Je nach
          Beschaffenheit von Flächen wird angenommen, dass nicht das komplette
          Regenwasser abgeführt werden muss, sondern nur ein Prozentsatz. Bei
          der Aufstellung der Satzung wurden folgende Sätze festgelegt:
          Vollversiegelte Flächen sind mit 100% zu bewerten, leicht versiegelte
          Flächen mit 70%, Gründächer und Versickerungsanlagen mit Notüberlauf
          bis zum 31.12.2022 mit jeweils 50 % und ab dem 01.01.2023 mit 40 % .
          Mit dem 01.01.2023 wurde eine Kombination von Gründächern und
          Versickerungsanlagen mit Notüberlauf eingeführt die mit 30 % bewertet
          wird. Unversiegelte Fläche (naturbelassen und kein Fels) werden als
          vollständig versickernd betrachtet. In gleichem Maße werden die
          Flächen bei der Gebührenerhebung berücksichtigt, wenn sie in den Kanal
          entwässern. Hier werden Werte nicht miteinander aufgerechnet, sondern
          immer der für den Gebührenzahler günstigere Wert berücksichtigt. Bei
          der Festlegung dieser Werte spielten 2 Gesichtspunkte eine wichtige
          Rolle: Zum einen galt es den Aufwand für die Feststellung von
          Abflusswirksamkeiten in einem vertretbaren Rahmen zu halten, da dieser
          Aufwand auf den Gebührenzahler umgelegt werden muss. Zum anderen wurde
          die Dauerhaftigkeit betrachtet. Beispiel: Eine leicht versiegelte
          Fläche entwässert nach der Erstellung fast vollständig. Sie setzt sich
          aber innerhalb von einigen Jahren immer mehr zu und verdichtet sich
          so, dass später kaum noch Versickerung stattfindet. Sind Flächen
          festgestellt worden und sie entwässern nicht zu 100% in den Kanal, ist
          immer ein Nachweis erforderlich.
        </p>
      ),
    },
    {
      title: "Was ist eine Dachfläche?",
      bsStyle: "primary",
      content: (
        <p>
          Als Dachflächen werden alle Flächen bewertet, unter denen man sich
          aufhalten kann. Es gehören auch Balkone, Vordächer, Carports,
          Wintergärten usw. dazu. Auch bei unterirdischen Gebäuden handelt es
          sich um Dachflächen. Hier ist aber die Überdeckung maßgebend. Ist über
          dem Gebäude eine Grünfläche, wird sie als Gründach angesehen. Bei der
          Größenbestimmung von Dachflächen wird immer die horizontale Fläche
          (Ansicht von oben) berechnet und nicht die schräg liegende Fläche.
        </p>
      ),
    },
    {
      title: "Was ist ein Gründach?",
      bsStyle: "primary",
      content: (
        <p>
          Um Gründächer handelt es sich, wenn Dächer aktiv mit exzessiver
          Begrünung versehen wurden. Bei einer Kiesbedeckung aus der Unkraut
          hervorgeht, handelt es sich "nicht" um eine Dachbegrünung. Da auch
          Gründächer mit einer Drainage versehen werden und bei Starkregen Teile
          des Regenwassers in den Kanal entwässern, wird die Fläche für die
          Gebührenerhebung bis zum 31.12.2022 auf 50% und ab dem 01.01.2023 auf
          40 % ihrer Größe reduziert. Entwässert ein Gründach zusätzlich über
          eine Versickerungsanlage mit Notüberlauf findet eine Reduzierung der
          Fläche auf 30 % ihrer Größe statt. Tiefgaragen werden wie Gründächer
          betrachtet, wenn sich auf ihnen keine versiegelte Fläche befindet. Für
          die Anerkennung von Gründächern sind entsprechende Nachweise
          erforderlich.
        </p>
      ),
    },
    {
      title: " Was ist eine versiegelte Fläche?",
      bsStyle: "primary",
      content: (
        <p>
          Jede ebenerdige nicht naturbelassene Fläche ist eine versiegelte
          Fläche. Als vollständig versiegelt gelten Flächen, die asphaltiert,
          betoniert, mit Platten oder mit Pflastersteinen versehen sind.
        </p>
      ),
    },
    {
      title: "Was ist eine leicht versiegelte Fläche?",
      bsStyle: "primary",
      content: (
        <p>
          Flächen können als leicht versiegelte Flächen eingestuft werden, wenn
          sie unter Verwendung von nachweislich versickerungsfördernden
          Materialien angelegt sind. Zu leicht versiegelten Flächen zählen z.B.:
          Rasengittersteine, offenporige Pflastersteine (Ökopflaster), Schotter,
          Kies u.ä.. Nicht als leicht versiegelt gelten z.B.: brüchige Asphalt-
          und Betonflächen, brüchige Plattenbeläge u.a.. Sollen Flächen als
          "leicht versiegelt" geltend gemacht werden, ist immer ein Nachweis
          erforderlich. Das Vorhandensein von Fugen macht aus einer versiegelten
          Fläche nicht eine leicht versiegelte Fläche.
        </p>
      ),
    },
    {
      title: "Welche Auswirkung haben Fugen?",
      bsStyle: "primary",
      content: (
        <p>
          Grundsätzlich haben Fugen keine Auswirkung auf die Gebührenrelevanz
          von Flächen. Fugen sind als Versickerungsmerkmal in der Satzung nicht
          vorgesehen und im Rahmen einer Gebührengerechtigkeit kaum
          kontrollierbar. Neue Materialien und spezielle Unterbauten ermöglichen
          heute eine teilweise Versickerung. Sollen solche Flächen als leicht
          versiegelte Flächen anerkannt werden, ist immer eine
          grundstücksbezogene unterschriebene Unternehmerbescheinigung
          erforderlich. Die Bescheinigung muss die fachgerechte Ausführung des
          Unterbaus und der Fugen sowie die Möglichkeit einer teilweise und
          dauerhaften Versickerung des Niederschlagswasser bestätigen. Prospekte
          oder im Internet kursierende Gutachten sind in diesen Fällen nicht
          ausreichend.
        </p>
      ),
    },
    {
      title: "Welche Nachweise werden anerkannt?",
      bsStyle: "primary",
      content: (
        <p>
          Als Nachweis wird eine entsprechende Unternehmerbescheinigung, eine
          Rechnung, ein Gutachten oder Fotos, welche die Örtlichkeit
          entsprechend wiedergeben, anerkannt. Rechnungsbelege aus Baumärkten
          werden anerkannt, wenn sie auf den Namen des Grundstückseigentümers
          ausgestellt sind. Bei der Verwendung von Fotos als Nachweis sollte
          darauf geachtet werden, dass immer eine Gesamtansicht der Fläche und
          wenn nötig eine Nahaufnahme eingereicht wird. Es sollte erkennbar
          sein, dass Regenwasser keine Möglichkeit hat in den Kanal zu
          entwässern bzw. welche Struktur die Oberfläche hat.
        </p>
      ),
    },
    {
      title: "Wann müssen Nachweise eingereicht werden?",
      bsStyle: "primary",
      content: (
        <p>
          Nachweise werden immer dann benötigt, wenn Flächen nicht vollständig
          in den Kanal einleiten bzw. mit einer Oberfläche versehen sind, bei
          der die Gebühr nur teilweise abgerechnet wird (Gründächer, leicht
          versiegelte Flächen usw.). Auch wenn eine Fläche im
          Flächenerfassungsbogen abgebildet, aber tatsächlich nicht vorhanden
          ist, sollte das belegt werden.
        </p>
      ),
    },
    {
      title: "Was ist eine Versickerungsanlage?",
      bsStyle: "primary",
      content: (
        <p>
          Einrichtungen, die der Versickerung von Wasser dienen. Hierzu gehören
          Rigolen, Mulden, Sickerschächte usw. . Sollen Flächen neu zur
          Versickerung gebracht werden, ist vorher eine Befreiung vom Anschluss-
          und Benutzungszwang bzw. eine wasserrechtliche Erlaubnis erforderlich{" "}
          <a
            target="_more"
            href="https://www.wuppertal.de/vv/produkte/106/versickerung.php#tab-unterlagen"
          >
            (weiterführende Information)
          </a>
          . Versickerungsanlagen werden unterschieden zwischen vollständiger
          Versickerung und einer Versickerung mit Notüberlauf. Notüberläufe
          werden bei Versickerungsanlagen benötigt, wenn die
          Versickerungsfähigkeit des Bodens nicht ausreicht, um das Regenwasser
          bei Starkregen vollständig aufzunehmen und das überschüssige Wasser in
          den Kanal abgeleitet wird. Bei Notüberläufen werden bis zum 31.12.2022
          50 % und ab dem 01.01.2023 40 % der Fläche zur Gebührenerhebung
          herangezogen.{" "}
          <strong>
            Soll eine Versickerungsanlage (mit oder ohne Notüberlauf) geltend
            gemacht werden, ist ein entsprechender Nachweis erforderlich.
          </strong>
        </p>
      ),
    },
    {
      title: "Welche Auswirkungen haben Regentonnen?",
      bsStyle: "primary",
      content: (
        <p>
          Regentonnen oder Regenwassertanks haben keine Auswirkung auf die
          Gebührenerhebung. In Wuppertal fallen ca. 1.200 Liter
          Niederschlagswasser je m² und Jahr, so dass es kaum möglich ist,
          Regenwasser vollständig in Tonnen oder Tanks aufzufangen. Für die
          Gebührenerhebung ist nicht die Menge des eingeleiteten Wassers
          maßgeblich, sondern die Tatsache der Entwässerung an sich. Tonnen und
          Tanks, die zum Beispiel zur Gartenbewässerung genutzt werden,
          verringern die Trinkwassernutzung und sorgen hier für eine
          Gebührenreduzierung.
        </p>
      ),
    },
    {
      title: "Wie kann ich Einwände gegen die Flächenerhebung vorbringen?",
      bsStyle: "primary",
      content: (
        <p>
          Sie haben hier die Möglichkeit, Änderungswünsche zu den Flächen oder
          an den Flächen selbst einzutragen. Es besteht auch die Möglichkeit
          über den hier angegebenen Ansprechpartner Kontakt aufzunehmen. Ebenso
          können Sie den Flächenerfassungsbogen und Nachweise per Mail oder Post
          übersenden. Änderungen werden aber nur vorgenommen, wenn die in den
          Satzungen gemachten Festlegungen eingehalten werden. Ein Widerspruch
          gegen die Flächenerhebung selbst ist nicht möglich, da es sich hier
          nicht um einen Verwaltungsakt sondern um die Beteiligung der
          Eigentümer*in handelt. Ein Widerspruch und ggf. ein Klageverfahren
          kann erst gegen den Gebührenbescheid, der mit einem entsprechenden
          Rechtsbehelf versehen ist, einlegt werden.
        </p>
      ),
    },
    {
      title: "Regenwasser als Brauchwasser",
      bsStyle: "warning",
      content: (
        <p>
          Vermehrt wird Regenwasser als Brauchwasser für Toiletten,
          Waschmaschinen usw. genutzt. Das führt allerdings nicht zu einer
          Berücksichtigung bei der Erhebung der Abwasserbeseitigungsgebühr
          Niederschlagswasser. Der Spareffekt für den Nutzer ergibt sich aus der
          Reduzierung des Trinkwasserverbrauchs und dadurch einer geringeren
          Trinkwassergebühr und daraus, dass sich die Schmutzwassergebühr nach
          dem Verbrauch des Trinkwassers berechnet wird obwohl das aufgefangene
          Regenwasser hier zum Schmutzwasser wird. Da hier das städtische
          Kanalsystem in Anspruch genommen wird, bleibt die
          Niederschlagswassergebühr unberührt.
        </p>
      ),
    },
    {
      title: "Wasserrechtliche Erlaubnis / Anzeigen einer Flächenversickerung",
      bsStyle: "warning",
      content: (
        <p>
          Sollen Flächen, ggf. mit Hilfe einer Versickerungsanlage, zur
          Versickerung gebracht werden ist für sie eine wasserrechtliche
          Erlaubnis (Versickerungsgenehmigung) erforderlich. Eine Versickerung
          auf der eigenen Grundstücksfläche ist anzuzeigen. Grundvoraussetzung
          ist, dass das Wasser unbelastet ist und ohne Beeinträchtigung der
          Natur und anderer Nachbarn versickern kann{" "}
          <a
            target="_more"
            href="https://www.wuppertal.de/vv/produkte/106/versickerung.php#tab-links"
          >
            (weiterführende Information)
          </a>
          .
          <br />
          Die Erteilung einer wasserrechtlichen Erlaubnis ist gebührenpflichtig.
          Anträge können auch über das Serviceportal gestellt werden. Die Links
          zum Serviceportal und zum Download von Anträgen finden Sie{" "}
          <a
            target="_more"
            href="https://www.wuppertal.de/vv/produkte/106/versickerung.php"
          >
            hier
          </a>
          .
        </p>
      ),
    },
    {
      title: "Anschluss- und Benutzungszwang / Gebührengerechtigkeit",
      bsStyle: "warning",
      content: (
        <p>
          Um das von der Stadt dauerhaft und leistungsfähig vorzuhaltende
          Entwässerungssystem auf breiter, stabiler und gerechter Grundlage zu
          finanzieren, gibt es den so genannten Anschluss- und Benutzungszwang:
          Grundstückseigentümer/innen haben somit die Pflicht, aber auch das
          Recht, bebaute bzw. versiegelte Flächen an die öffentliche
          Kanalisation anzuschließen. Zu den bebauten Flächen gehören auch
          eventuell vorhandene Dachüberstände. Befreiungen von dieser
          Anschlusspflicht sind nur in begründeten Ausnahmefällen möglich.
          Dadurch werden die Kosten im Sinne einer Solidargemeinschaft auf viele
          verteilt und für die einzelnen Grundstückseigentümer/innen möglichst
          gering gehalten. Eine vollständige Abkopplung von Flächen vom
          städtischen Kanalnetz, verbunden mit einer vollständigen
          Gebührenabsetzung schwächt diese Solidargemeinschaft und ist deshalb
          nicht möglich. Dem Anschluss- und Benutzungszwang unterliegen alle
          Grundstücke, die an einer Straße liegen in der ein Kanal
          anschlussfähig verlegt ist. Liegen größere Flächen nicht an einer
          Straße, in der ein Kanal verlegt ist, wird eine wasserrechtliche
          Erlaubnis benötigt.
        </p>
      ),
    },
    {
      title: "Mitwirkungspflicht",
      bsStyle: "warning",
      content: (
        <p>
          Grundstückseigentümer/innen sind nach der Satzung verpflichtet größere
          Änderungen mitzuteilen und auf Anforderung Auskünfte und Nachweise
          über Ihre Flächen zu erbringen. Werden Flächenänderungen vom Ressort
          Vermessung, Katasteramt und Geodaten oder vom Steueramt festgestellt,
          kann das Steueramt die Gebühr des laufenden und der 4 vorhergehenden
          Jahre nachfordern.
        </p>
      ),
    },
    {
      title: "Kann ich eingetragene Änderungen zurücknehmen?",
      bsStyle: "danger",
      content: (
        <p>
          Änderungen in der Kommunikation können nur erneut bearbeitet oder
          zurückgenommen werden, wenn Sie noch nicht entsperrt und eingereicht
          wurden. Um Änderungen im Bereich "Ihre Kommunikation" vorzunehmen,
          klicken sie in das grau gekennzeichnete Eingabefeld und drücken die
          "Pfeil nach oben" Taste. Sie können dann Texte bearbeiten oder Uploads
          löschen. Um eine Fläche zu ändern, rufen sie diese Fläche erneut auf.
        </p>
      ),
    },
  ]);

  return (
    <GenericModalMenuSection
      applicationMenuActiveKey={applicationMenuActiveKey}
      setApplicationMenuActiveKey={setApplicationMenuActiveKey}
      sectionKey="faq"
      sectionTitle="Häufig gestellte Fragen"
      sectionBsStyle="success"
      showOnSeperatePage={showOnSeperatePage}
      sectionContent={
        <div name="help">
          <font size="3">{linkArray}</font>
          {entryArray}
        </div>
      }
    />
  );
};
export default Component;
