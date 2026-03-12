import {
  SELECT_TOOL_TYPE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

export const ANNOTATION_TOOLBAR_HELP_TEXT: Partial<
  Record<AnnotationToolType, readonly string[]>
> = {
  [SELECT_TOOL_TYPE]: [
    "Messungen anklicken, um sie ohne Modus-Nebeneffekte zu selektieren.",
    "Optional: Rechteckmodus aktivieren und aufziehen, um Punkte live im Bildausschnitt zu selektieren.",
    'Shift oder "Additiv" erweitert die Auswahl.',
    "Ausgewählte Messungen können ein-/ausgeblendet, gesperrt und gelöscht werden.",
  ],
  [ANNOTATION_TYPE_DISTANCE]: [
    "Erster Klick setzt den Startpunkt, zweiter Klick setzt den Zielpunkt.",
    "Doppelklick auf einen Punkt setzt die Referenzhöhe.",
    'Mit "An Referenzpunkt starten" beginnen Folgemessungen am Referenzpunkt.',
    "Distanzmodus schaltet zwischen Direktlinie, Komponenten oder beidem um.",
  ],
  [ANNOTATION_TYPE_POINT]: [
    "Für Punktmessungen auf das Stadtmodell klicken. Die erste Messung definiert die Referenzhöhe.",
    "Klicken um Höhenmessung zu setzen.",
    "Doppelklick auf Punkt setzt Referenzhöhe.",
    "Langer Klick startet Editiermodus.",
    "Rückstelltaste löscht den letzten Punkt.",
  ],
  [ANNOTATION_TYPE_LABEL]: [
    "Im Anmerkungsmodus setzt ein Klick eine Beschriftung am Punkt.",
    "Die Beschriftung kann danach in der Infobox bearbeitet werden.",
    "Über den Auswahlmodus lassen sich Anmerkungen gemeinsam ein-/ausblenden, sperren und löschen.",
  ],
  [ANNOTATION_TYPE_POLYLINE]: [
    "Klicken setzt Stützpunkte des Polygonzugs.",
    "Doppelklick beendet den aktuellen Polygonzug.",
    "Vertikalversatz verschiebt die Darstellung entlang der lokalen Up-Achse.",
    "Segmentdarstellung wechselt zwischen Direktlinie und Komponenten.",
  ],
  [ANNOTATION_TYPE_AREA_GROUND]: [
    "Grundriss: Jeder Klick setzt einen Bodenpunkt; die Vorschau folgt dem Cursor auf dem Gelände.",
    "Klick auf Startpunkt oder Doppelklick schließt die Fläche.",
  ],
  [ANNOTATION_TYPE_AREA_VERTICAL]: [
    "Fassade: Der 1. Punkt startet die Fläche, der 2. Punkt erzeugt eine rechteckige Fassade mit Auto-Ecken.",
    "Klick auf Startpunkt oder Doppelklick schließt die Fläche.",
  ],
  [ANNOTATION_TYPE_AREA_PLANAR]: [
    "Dach: 1.+2. Punkt definieren eine horizontale Kante, der 3. Punkt spannt die Dach-Ebene auf; weitere Punkte werden auf diese Ebene projiziert.",
    "Klick auf Startpunkt oder Doppelklick schließt die Fläche.",
  ],
};
