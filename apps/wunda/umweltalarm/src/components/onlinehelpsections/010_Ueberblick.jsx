const Ueberblick = () => {
  return (
    <div>
      <p>
        Die Stadt Wuppertal betreibt beim Ressort 106 Umweltschutz einen Bereitschaftsdienst
        "Umweltalarm". Wenn bei Unfällen oder anderen Ereignissen umwelt- oder
        gesundheitsgefährdende Stoffe freigesetzt werden, die von der Feuerwehr nicht aufgefangen
        oder zurückgehalten werden können, wird der Bereitschaftsdienst durch die Einsatzkräfte
        alarmiert. Der bzw. die Diensthabende begibt sich dann i. d. R. unmittelbar zu dem Ort, an
        dem der Umweltschaden aufgetreten ist, um dort sachgerechte Maßnahmen zur Eindämmung von
        Umweltgefahren und zum Schutz von Menschen, Tieren, Pflanzen, Boden, Wasser, Atmosphäre und
        sonstigen Sachgütern anzuordnen und durchzuführen.
      </p>
      <p>
        Die interaktive Kartenanwendung "Umweltalarm Wuppertal" unterstützt die Diensthabende / den
        Diensthabenden hierbei durch die Bereitstellung der für die Schadensbeurteilung und die
        Maßnahmenanordnung relevanten Geodaten. Zusätzlich bietet sie die Möglichkeit, sofort mit
        anderen zuständigen Behörden Kontakt aufzunehmen. Daten mit Liniennetzgeometrien (Gewässer-
        und Kanalnetz) oder Punktgeometrien (Trinkwasserbrunnen) werden flächendeckend als optionale
        Überlagerungen der Basiskarte angeboten. Für die Themen mit Flächengeometrien (Schutzkreise
        von Trinkwasserbrunnen, BImschG-Anlagen, Wasserschutzgebiete, Störfallbetriebe, städtische
        Flurstücke, Landschafts- und Naturschutzgebiete sowie zuständiger Wasserverband, zuständige
        Straßenmeisterei und zuständige Autobahnmeisterei) führt die Anwendung nach jeder
        Verschiebung der Karte automatisch eine themenübergreifende Abfrage für den Mittelpunkt des
        Kartenfensters durch, der dauerhaft mit einem Fadenkreuz gekennzeichnet ist ("thematischer
        Durchstich"). In der Info-Box (unten rechts) werden stets diejenigen Kategorien betont
        dargestellt, zu denen sich unter dem Fadenkreuz ein Objekt befindet. Ausgenommen sind hier
        die Kategorien Wasserverband, Straßenmeisterei und Autobahnmeisterei, zu denen es immer
        einen Treffer gibt. Durch Anklicken oder Antippen der Infobox öffnet man eine
        Datenblattansicht mit Detailinformationen zu diesen Objekten. Hier finden sich auch Telefon-
        und E-Mail-Verknüpfungen zu den zuständigen Behörden bzw. Ansprechpartnern.
      </p>
    </div>
  );
};
export default Ueberblick;
