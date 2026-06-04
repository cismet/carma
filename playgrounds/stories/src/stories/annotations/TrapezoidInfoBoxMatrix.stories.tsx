import { Fragment, type CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react";

import { Cartesian3 } from "@carma-cesium";
import {
  ANNOTATION_INFO_BOX_HELP_LAYOUTS,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  AnnotationInfoBoxHelpContent,
  type AnnotationInfoBoxHelpItem,
} from "@carma-mapping/annotations/ui";
import { createAreaPlanarTrapezoidToolPlugin } from "@carma-mapping/annotations/builtin-tools";
import type {
  AnnotationToolDraftState,
  PointQueryPickResult,
} from "@carma-mapping/annotations/runtime";
import {
  geographicCoordinateFromCartesian3,
  type CesiumGeographicCoordinate,
} from "@carma-mapping/engines/cesium/core";

type MatrixLocale = "en-US" | "de-DE";

type MatrixStoryArgs = {
  locale: MatrixLocale;
};

const meta = {
  title: "Annotations/Trapezoid InfoBox Matrix",
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: false,
    },
  },
  args: {
    locale: "en-US",
  },
  argTypes: {
    locale: {
      control: "radio",
      options: ["en-US", "de-DE"],
    },
  },
} satisfies Meta<MatrixStoryArgs>;

export default meta;
type Story = StoryObj<MatrixStoryArgs>;

const plugin = createAreaPlanarTrapezoidToolPlugin({
  trapezoidHorizontalLineMaxLengthMeters: 200,
  trapezoidHorizontalPlaneToleranceMeters: 0.2,
  trapezoidThirdPointRightAngleToleranceDeg: 6.5,
});

const anchor = Cartesian3.fromDegrees(7, 51, 100);
const localUp = Cartesian3.normalize(anchor, new Cartesian3());
const localEast = Cartesian3.normalize(
  Cartesian3.cross(Cartesian3.UNIT_Z, localUp, new Cartesian3()),
  new Cartesian3()
);
const localNorth = Cartesian3.normalize(
  Cartesian3.cross(localUp, localEast, new Cartesian3()),
  new Cartesian3()
);

const localCoordinate = (
  eastMeters: number,
  northMeters: number,
  upMeters = 0
): CesiumGeographicCoordinate =>
  geographicCoordinateFromCartesian3(
    Cartesian3.add(
      anchor,
      Cartesian3.add(
        Cartesian3.multiplyByScalar(localEast, eastMeters, new Cartesian3()),
        Cartesian3.add(
          Cartesian3.multiplyByScalar(
            localNorth,
            northMeters,
            new Cartesian3()
          ),
          Cartesian3.multiplyByScalar(localUp, upMeters, new Cartesian3()),
          new Cartesian3()
        ),
        new Cartesian3()
      ),
      new Cartesian3()
    )
  );

const first = localCoordinate(0, 0);
const second = localCoordinate(10, 0);
const secondOffPlane = localCoordinate(10, 0, 1);
const secondTooLong = localCoordinate(240, 0);
const third = localCoordinate(10, 10);
const thirdWithLimiter = localCoordinate(10.5, 10);
const fourth = localCoordinate(0, 10);
const fourthWithLimiter = localCoordinate(-0.5, 10);

const draftState = (
  coordinates: readonly CesiumGeographicCoordinate[]
): AnnotationToolDraftState => ({
  coordinates,
  feedback: null,
  linkedNodeGroupIds: coordinates.map(() => null),
});

const pickResult = (
  coordinate: CesiumGeographicCoordinate,
  forceAccepted = false
): PointQueryPickResult => ({
  coordinate,
  forceAccepted,
  pointECEF: null,
  screenPosition: null,
  surfaceNormalECEF: null,
});

const resolveHelpItems = (
  coordinates: readonly CesiumGeographicCoordinate[],
  coordinate?: CesiumGeographicCoordinate,
  forceAccepted = false
) =>
  plugin.resolveHelpText?.({
    draftState: draftState(coordinates),
    pointQueryPickResult: coordinate
      ? pickResult(coordinate, forceAccepted)
      : undefined,
  }) ?? [];

type MatrixCell = {
  label: string;
  coordinates: readonly CesiumGeographicCoordinate[];
  coordinate?: CesiumGeographicCoordinate;
  forceAccepted?: boolean;
};

type MatrixRow = {
  step: string;
  cells: readonly MatrixCell[];
};

const rows: readonly MatrixRow[] = [
  {
    step: "1. Erste Ecke",
    cells: [
      {
        label: "Ohne Sample",
        coordinates: [],
      },
    ],
  },
  {
    step: "2. Basiskante",
    cells: [
      {
        label: "Ohne Sample",
        coordinates: [first],
      },
      {
        label: "Gültiger Punkt",
        coordinates: [first],
        coordinate: second,
      },
      {
        label: "Zu weit von der Hilfsscheibe",
        coordinates: [first],
        coordinate: secondOffPlane,
      },
      {
        label: "Zu lange Hilfslinie",
        coordinates: [first],
        coordinate: secondTooLong,
      },
      {
        label: "Shift erzwungen",
        coordinates: [first],
        coordinate: secondOffPlane,
        forceAccepted: true,
      },
    ],
  },
  {
    step: "3. Gegenkante",
    cells: [
      {
        label: "Ohne Sample",
        coordinates: [first, second],
      },
      {
        label: "Gültiger Punkt",
        coordinates: [first, second],
        coordinate: third,
      },
      {
        label: "Rechtwinkel-Limiter aktiv",
        coordinates: [first, second],
        coordinate: thirdWithLimiter,
      },
      {
        label: "Shift erzwungen",
        coordinates: [first, second],
        coordinate: thirdWithLimiter,
        forceAccepted: true,
      },
    ],
  },
  {
    step: "4. Symmetrisches Trapez bereit",
    cells: [
      {
        label: "Ohne Sample",
        coordinates: [first, second, third],
      },
      {
        label: "Asymmetrische vierte Ecke",
        coordinates: [first, second, third],
        coordinate: fourth,
      },
      {
        label: "Rechtwinkel-Limiter aktiv",
        coordinates: [first, second, third],
        coordinate: fourthWithLimiter,
      },
      {
        label: "Shift erzwungen",
        coordinates: [first, second, third],
        coordinate: fourthWithLimiter,
        forceAccepted: true,
      },
    ],
  },
];

const ENGLISH_TEXT_BY_GERMAN_TEXT: Readonly<Record<string, string>> = {
  "1. Erste Ecke": "1. First corner",
  "2. Basiskante": "2. Base edge",
  "3. Gegenkante": "3. Opposite edge",
  "4. Symmetrisches Trapez bereit": "4. Symmetric trapezoid ready",
  "Ohne Sample": "No sample",
  "Gültiger Punkt": "Valid point",
  "Zu weit von der Hilfsscheibe": "Too far from helper disk",
  "Zu lange Hilfslinie": "Helper line too long",
  "Shift erzwungen": "Shift forced",
  "Rechtwinkel-Limiter aktiv": "Right-angle limiter active",
  "Asymmetrische vierte Ecke": "Asymmetric fourth corner",
  "Eine Dachecke an horizontaler Dachkante anklicken.":
    "Click a roof corner on a horizontal roof edge.",
  "Zweiten Punkt auf derselben horizontalen Dachkante anklicken.":
    "Click the second point on the same horizontal roof edge.",
  "Dritten Punkt auf der parallelen Gegenkante anklicken.":
    "Click the third point on the parallel opposite edge.",
  "Das automatische Trapez ist bereit. Optional die asymmetrische vierte Ecke auf der Gegenkante anklicken, wenn die Form nicht passt.":
    "The automatic trapezoid is ready. Optionally click the asymmetric fourth corner on the opposite edge if the shape does not fit.",
  "Setzt den ersten Punkt.": "Sets the first point.",
  "Setzt die Basiskante auf der horizontalen Hilfsscheibe.":
    "Sets the base edge on the horizontal helper disk.",
  "Setzt den dritten Punkt.": "Sets the third point.",
  "Setzt den dritten Punkt mit Rechtwinkel-Limiter.":
    "Sets the third point with the right-angle limiter.",
  "Setzt optional die asymmetrische vierte Ecke und schliesst die Messung.":
    "Sets the optional asymmetric fourth corner and closes the measurement.",
  "Schliesst die Trapezfläche mit symmetrischer Form.":
    "Closes the trapezoid area with a symmetric shape.",
  "Löscht den letzten Punkt.": "Deletes the last point.",
  "Beendet das Werkzeug.": "Ends the tool.",
  "Gedrückt halten: deaktiviert die Limiter und erlaubt den aktuellen Punkt.":
    "Hold: disables the limiters and accepts the current point.",
  "Gedrückt halten: setzt den auf die Hilfsscheibe projizierten Punkt.":
    "Hold: sets the point projected onto the helper disk.",
  "Shift ist aktiv: Die Limiter werden für den aktuellen Punkt deaktiviert.":
    "Shift is active: the limiters are disabled for the current point.",
  "Shift ist aktiv: Der aktuelle Punkt wird auf die horizontale Hilfsscheibe projiziert.":
    "Shift is active: the current point is projected onto the horizontal helper disk.",
  "Der aktuelle Punkt wird nicht übernommen: Er liegt nicht auf der horizontalen Hilfsscheibe. Punkt auf der Schnittlinie von Hilfsscheibe und Gebäude/Objekt wählen oder Shift gedrückt halten, um den aktuellen Punkt auf die Hilfsscheibe zu projizieren.":
    "The current point will not be accepted: it is not on the horizontal helper disk. Pick a point on the intersection of helper disk and building/object, or hold Shift to project the current point onto the helper disk.",
  "Der aktuelle Punkt wird nicht übernommen: Die horizontale Hilfslinie wäre zu lang. Für längere Strecken bitte eine geodätische Linienmessung verwenden.":
    "The current point will not be accepted: the horizontal helper line would be too long. Use a geodetic line measurement for longer distances.",
  "Der aktuelle Punkt wird nicht übernommen: Er liegt nicht auf der horizontalen Hilfsscheibe und die horizontale Hilfslinie wäre zu lang. Punkt auf der Schnittlinie von Hilfsscheibe und Gebäude/Objekt wählen oder Shift gedrückt halten, um den aktuellen Punkt auf die Hilfsscheibe zu projizieren.":
    "The current point will not be accepted: it is not on the horizontal helper disk and the horizontal helper line would be too long. Pick a point on the intersection of helper disk and building/object, or hold Shift to project the current point onto the helper disk.",
  "Der aktuelle Punkt wird auf die rechtwinklige Ecke gesetzt, weil er innerhalb des Rechtwinkel-Toleranzbereichs liegt.":
    "The current point is set to the right-angle corner because it is within the right-angle tolerance range.",
};

type MatrixCellGroup = {
  labels: string[];
  items: readonly AnnotationInfoBoxHelpItem[];
};

const translateMatrixText = (text: string, locale: MatrixLocale): string =>
  locale === "de-DE" ? text : ENGLISH_TEXT_BY_GERMAN_TEXT[text] ?? text;

const translateHelpItems = (
  items: readonly AnnotationInfoBoxHelpItem[],
  locale: MatrixLocale
): readonly AnnotationInfoBoxHelpItem[] =>
  items.map((item) => {
    if (typeof item === "string") {
      return translateMatrixText(item, locale);
    }

    if (item.kind === ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT) {
      return {
        ...item,
        text: translateMatrixText(item.text, locale),
      };
    }

    if (item.kind === ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT) {
      return {
        ...item,
        text: translateMatrixText(item.text, locale),
        actions: item.actions?.map((action) => ({
          ...action,
          description: translateMatrixText(action.description, locale),
        })),
      };
    }

    return {
      ...item,
      description: translateMatrixText(item.description, locale),
    };
  });

const resolveCellGroups = (
  row: MatrixRow,
  locale: MatrixLocale
): MatrixCellGroup[] => {
  const groupsByOutput = new Map<string, MatrixCellGroup>();

  row.cells.forEach((cell) => {
    const items = translateHelpItems(
      resolveHelpItems(cell.coordinates, cell.coordinate, cell.forceAccepted),
      locale
    );
    const signature = JSON.stringify(items);
    const existingGroup = groupsByOutput.get(signature);
    const label = translateMatrixText(cell.label, locale);

    if (existingGroup) {
      existingGroup.labels.push(label);
      return;
    }

    groupsByOutput.set(signature, {
      labels: [label],
      items,
    });
  });

  return Array.from(groupsByOutput.values());
};

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  padding: 24,
  background: "#f3f4f6",
  color: "#111827",
  fontFamily:
    'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: "0 12px",
  tableLayout: "auto",
};

const pageTitleStyle: CSSProperties = {
  margin: "0 0 16px",
  fontSize: 18,
  fontWeight: 700,
};

const stepRowStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 6,
  background: "#e5e7eb",
  color: "#111827",
  textAlign: "left",
  fontSize: 13,
  fontWeight: 700,
};

const cellStyle: CSSProperties = {
  minWidth: 260,
  padding: "0 12px 4px 0",
  verticalAlign: "top",
};

const cellLabelStyle: CSSProperties = {
  marginBottom: 8,
  color: "#475569",
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
};

const infoBoxPreviewStyle: CSSProperties = {
  display: "inline-block",
  maxWidth: 360,
  padding: "14px 16px",
  borderRadius: 6,
  background: "rgba(255, 255, 255, 0.86)",
  boxShadow: "0 1px 6px rgba(15, 23, 42, 0.2)",
  fontSize: 12,
  lineHeight: 1.35,
};

const renderCellGroup = (cellGroup: MatrixCellGroup, locale: MatrixLocale) => (
  <td key={cellGroup.labels.join("|")} style={cellStyle}>
    <div style={cellLabelStyle}>{cellGroup.labels.join(" / ")}</div>
    <div style={infoBoxPreviewStyle}>
      <AnnotationInfoBoxHelpContent
        items={cellGroup.items}
        layout={ANNOTATION_INFO_BOX_HELP_LAYOUTS.COMPACT}
        locale={locale}
        platform="windows"
      />
    </div>
  </td>
);

const MatrixStory = ({ locale }: MatrixStoryArgs) => (
  <div style={pageStyle}>
    <h1 style={pageTitleStyle}>
      {locale === "de-DE"
        ? "Trapez-Infobox-Matrix"
        : "Trapezoid InfoBox Matrix"}
    </h1>
    <table style={tableStyle}>
      <tbody>
        {rows.map((row) => {
          const cellGroups = resolveCellGroups(row, locale);

          return (
            <Fragment key={row.step}>
              <tr key={`${row.step}-title`}>
                <th colSpan={cellGroups.length} style={stepRowStyle}>
                  {translateMatrixText(row.step, locale)}
                </th>
              </tr>
              <tr key={`${row.step}-states`}>
                {cellGroups.map((cellGroup) =>
                  renderCellGroup(cellGroup, locale)
                )}
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const Matrix: Story = {
  name: "InfoBox Matrix",
  render: (args) => <MatrixStory {...args} />,
};
