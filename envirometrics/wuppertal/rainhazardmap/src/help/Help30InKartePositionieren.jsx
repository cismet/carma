import React from "react";
import GenericModalMenuSection from "react-cismap/topicmaps/menu/Section";
import Icon from "react-cismap/commons/Icon";

const Component = () => {
  return (
    <GenericModalMenuSection
      sectionKey="positionieren"
      sectionTitle="In Karte positionieren"
      sectionBsStyle="success"
      sectionContent={
        <div>
          <p>
            Um die Gefährdung durch Starkregen in einem bestimmten Bereich des
            Stadtgebietes zu erkunden, geben Sie den Anfang (mindestens zwei
            Zeichen) eines Stadtteils (Stadtbezirk oder Quartier), einer
            Adresse, eines interessanten Ortes (Point of Interest POI) oder
            eines GEP-Bereichs im Eingabefeld links unten ein. (Die Bedeutung
            der GEP-Bereiche wird am Ende dieses Abschnittes der
            Kompaktanleitung erläutert!) In der inkrementellen Auswahlliste
            werden Ihnen passende Treffer angeboten. (Wenn Sie weitere Zeichen
            eingeben, wird der Inhalt der Auswahlliste angepasst.) Durch das
            vorangestellte Symbol erkennen Sie, ob es sich dabei um einen{" "}
            <Icon name="circle" /> Stadtbezirk, ein <Icon name="pie-chart" />{" "}
            Quartier, eine <Icon name="home" /> Adresse, eine{" "}
            <Icon name="road" /> Straße ohne zugeordnete Hausnummern, einen{" "}
            <Icon name="tag" /> POI, die <Icon name="tags" /> alternative
            Bezeichnung eines POI, eine <Icon name="child" />{" "}
            Kindertageseinrichtung, eine <Icon name="graduation-cap" /> Schule
            oder einen <Icon name="code-fork" /> GEP-Bereich handelt.
          </p>
          <p>
            Nach der Auswahl eines Treffers aus der Liste wird die Karte auf die
            zugehörige Position zentriert. Bei Suchbegriffen mit Punktgeometrie
            (Adresse, Straße, POI) wird außerdem ein großer Maßstab (Zoomstufe
            18) eingestellt und ein Marker <Icon name="map-marker" /> auf der
            Zielposition platziert. Bei Suchbegriffen mit Flächengeometrie
            (Stadtbezirk, Quartier, GEP) wird der Maßstab so eingestellt, dass
            die Fläche vollständig dargestellt werden kann. Zusätzlich wird der
            Bereich außerhalb dieser Fläche abgedunkelt (Spotlight-Effekt).
          </p>
          <p>
            Durch Anklicken des Werkzeugs <Icon name="close" /> links neben dem
            Eingabefeld können Sie die Suche zurücksetzen (Entfernung von Marker
            bzw. Abdunklung, Löschen des Textes im Eingabefeld).
          </p>
          <p>
            <b>Erläuterung der GEP-Bereiche:</b> In der
            Generalentwässerungsplanung (GEP), dem langfristigen Prozess zur
            Weiterentwicklung des Wuppertaler Kanalnetzes, wird nahezu das
            gesamte Stadtgebiet in Teilbereiche (GEP-Bereiche) eingeteilt. Die
            GEP-Bereiche haben eine Nummer und einen Namen, der zumeist dem Bach
            entspricht, in den der GEP-Bereich entwässert, z. B. "GEP 09 Mirker
            Bach". Alternativ können Sie die GEP-Bereiche auch über den
            vorangestellten Namen ansprechen, also z. B. "Mirker Bach (GEP 09)".
            Zusätzlich haben wir weitere wichtige Wuppertaler Bäche, die direkt
            in die Wupper oder die Düssel einmünden, als Alias für die
            zugehörigen GEP-Bereiche angelegt. Diese werden dann in der Form
            "Burgholzbach (im GEP 27 Cronenberg-West)" angezeigt.
          </p>
        </div>
      }
    />
  );
};
export default Component;
