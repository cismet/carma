import { describe, expect, it, vi } from "vitest";

import { Cartesian3 } from "@carma-cesium";
import type {
  AnnotationToolDraftState,
  AnnotationToolDraftStore,
  CesiumGeographicCoordinate,
} from "@carma-mapping/annotations/runtime";
import {
  ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES,
  ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  type AnnotationInfoBoxHelpItem,
} from "@carma-mapping/annotations/ui";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { geographicCoordinateFromCartesian3 } from "@carma-mapping/engines/cesium/core";

import { createAreaPlanarTrapezoidToolPlugin } from "./area-planar-tool-plugin";
import { getAreaPlanarTrapezoidSecondPointHorizontalPlaneDistanceMeters } from "./area-planar-trapezoid";

const createDraftStore = (): AnnotationToolDraftStore => {
  const drafts = new Map<string, AnnotationToolDraftState>();
  return {
    get: (toolId) =>
      drafts.get(toolId) ?? {
        coordinates: [],
        linkedNodeGroupIds: [],
        feedback: null,
      },
    set: (toolId, draft) => {
      drafts.set(toolId, draft);
    },
    clear: (toolId) => {
      drafts.delete(toolId);
    },
    subscribe: () => () => undefined,
  };
};

const geographicCoordinate = (
  longitude: number,
  latitude: number,
  altitude = 100
): CesiumGeographicCoordinate => ({
  longitude,
  latitude,
  altitude,
});

const createRightAngleLimiterTestCoordinates = () => {
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
  const coordinateAtOffset = (
    eastOffsetMeters: number,
    northOffsetMeters: number
  ): CesiumGeographicCoordinate =>
    geographicCoordinateFromCartesian3(
      Cartesian3.add(
        anchor,
        Cartesian3.add(
          Cartesian3.multiplyByScalar(
            localEast,
            eastOffsetMeters,
            new Cartesian3()
          ),
          Cartesian3.multiplyByScalar(
            localNorth,
            northOffsetMeters,
            new Cartesian3()
          ),
          new Cartesian3()
        ),
        new Cartesian3()
      )
    );

  return {
    baseStart: coordinateAtOffset(0, 0),
    baseEnd: coordinateAtOffset(10, 0),
    nearRightAngleThirdPoint: coordinateAtOffset(10.5, 10),
  };
};

type HelpTextRow = Exclude<AnnotationInfoBoxHelpItem, string>;

const readHelpRows = (
  items: readonly AnnotationInfoBoxHelpItem[]
): readonly HelpTextRow[] =>
  items.map((item) =>
    typeof item === "string"
      ? {
          kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
          text: item,
        }
      : item
  );

describe("area planar tool plugin", () => {
  it("resolves trapezoid instruction text from the active input step", () => {
    const plugin = createAreaPlanarTrapezoidToolPlugin();
    const createDraftState = (
      coordinates: readonly CesiumGeographicCoordinate[]
    ): AnnotationToolDraftState => ({
      coordinates,
      linkedNodeGroupIds: coordinates.map(() => null),
      feedback: null,
    });
    const resolveHelpRows = (
      coordinates: readonly CesiumGeographicCoordinate[],
      pointQueryPickResult?: Parameters<
        NonNullable<typeof plugin.resolveHelpText>
      >[0]["pointQueryPickResult"]
    ) =>
      readHelpRows(
        plugin.resolveHelpText?.({
          draftState: createDraftState(coordinates),
          ...(pointQueryPickResult ? { pointQueryPickResult } : {}),
        }) ?? []
      );

    expect(resolveHelpRows([])).toEqual([
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
        text: "Eine Dachecke an horizontaler Dachkante anklicken.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
        description: "Setzt den ersten Punkt.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
        description: "Beendet das Werkzeug.",
      },
    ]);

    expect(resolveHelpRows([geographicCoordinate(7, 51)])).toEqual([
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
        text: "Zweiten Punkt auf derselben horizontalen Dachkante anklicken.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
        description: "Setzt die Basiskante auf der horizontalen Hilfsscheibe.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
        description: "Löscht den letzten Punkt.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
        description: "Beendet das Werkzeug.",
      },
    ]);

    expect(
      resolveHelpRows([geographicCoordinate(7, 51)], {
        coordinate: geographicCoordinate(7.0001, 51, 101),
        forceAccepted: false,
        pointECEF: null,
        screenPosition: null,
        surfaceNormalECEF: null,
      })
    ).toEqual([
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT,
        severity: ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.WARNING,
        text: "Punkt nicht übernommen: Auf die Schnittlinie von Hilfsscheibe und Dach klicken. Shift projiziert auf die Hilfsscheibe.",
        actions: [
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.SHIFT]],
            description:
              "Gedrückt halten: setzt den auf die Hilfsscheibe projizierten Punkt.",
          },
        ],
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
        text: "Zweiten Punkt auf derselben horizontalen Dachkante anklicken.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
        description: "Löscht den letzten Punkt.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
        description: "Beendet das Werkzeug.",
      },
    ]);

    expect(
      resolveHelpRows([geographicCoordinate(7, 51)], {
        coordinate: geographicCoordinate(7.0001, 51, 101),
        forceAccepted: true,
        pointECEF: null,
        screenPosition: null,
        surfaceNormalECEF: null,
      })
    ).toEqual([
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT,
        severity: ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.INFO,
        text: "Shift ist aktiv: Der aktuelle Punkt wird auf die horizontale Hilfsscheibe projiziert.",
        actions: [
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.SHIFT]],
            description:
              "Gedrückt halten: setzt den auf die Hilfsscheibe projizierten Punkt.",
          },
        ],
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
        text: "Zweiten Punkt auf derselben horizontalen Dachkante anklicken.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
        description: "Setzt die Basiskante auf der horizontalen Hilfsscheibe.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
        description: "Löscht den letzten Punkt.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
        description: "Beendet das Werkzeug.",
      },
    ]);

    expect(
      resolveHelpRows([
        geographicCoordinate(7, 51),
        geographicCoordinate(7.0001, 51),
      ])
    ).toEqual([
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
        text: "Dritten Punkt auf der parallelen Gegenkante anklicken.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
        description: "Setzt den dritten Punkt.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
        description: "Löscht den letzten Punkt.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
        description: "Beendet das Werkzeug.",
      },
    ]);

    const { baseStart, baseEnd, nearRightAngleThirdPoint } =
      createRightAngleLimiterTestCoordinates();
    expect(
      resolveHelpRows([baseStart, baseEnd], {
        coordinate: nearRightAngleThirdPoint,
        forceAccepted: false,
        pointECEF: null,
        screenPosition: null,
        surfaceNormalECEF: null,
      })
    ).toEqual([
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT,
        severity: ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.INFO,
        text: "Der aktuelle Punkt wird auf die rechtwinklige Ecke gesetzt, weil er innerhalb des Rechtwinkel-Toleranzbereichs liegt.",
        actions: [
          {
            kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
            inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.SHIFT]],
            description:
              "Gedrückt halten: deaktiviert die Limiter und erlaubt den aktuellen Punkt.",
          },
        ],
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
        text: "Dritten Punkt auf der parallelen Gegenkante anklicken.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
        description: "Setzt den dritten Punkt mit Rechtwinkel-Limiter.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
        description: "Löscht den letzten Punkt.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
        description: "Beendet das Werkzeug.",
      },
    ]);

    expect(
      resolveHelpRows([
        geographicCoordinate(7, 51),
        geographicCoordinate(7.0001, 51),
        geographicCoordinate(7.00008, 51.00008, 103),
      ])
    ).toEqual([
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.TEXT,
        text: "Das automatische Trapez ist bereit. Optional die asymmetrische vierte Ecke auf der Gegenkante anklicken, wenn die Form nicht passt.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.CLICK]],
        description:
          "Setzt optional die asymmetrische vierte Ecke und schliesst die Messung.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [
          [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.DOUBLE_CLICK],
          [ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ENTER],
        ],
        description: "Schliesst die Trapezfläche mit symmetrischer Form.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.BACKSPACE]],
        description: "Löscht den letzten Punkt.",
      },
      {
        kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ACTION,
        inputAlternatives: [[ANNOTATION_INFO_BOX_HELP_ACTION_INPUTS.ESCAPE]],
        description: "Beendet das Werkzeug.",
      },
    ]);
  });

  it("keeps trapezoid drafts when finish is requested before the third point", () => {
    const plugin = createAreaPlanarTrapezoidToolPlugin();
    const drafts = createDraftStore();
    const addAnnotation = vi.fn();
    const session = plugin.session?.createSession({
      addAnnotation,
      dispatch: vi.fn(),
      drafts,
      getState: vi.fn(),
      setActiveToolType: vi.fn(),
    } as never);

    session?.onNodeCreated?.(geographicCoordinate(7, 51));
    session?.onNodeCreated?.(geographicCoordinate(7.0001, 51, 100.05));

    expect(session?.requestFinish()).toBe(false);
    expect(addAnnotation).not.toHaveBeenCalled();
    expect(drafts.get(plugin.id).coordinates).toHaveLength(2);
  });

  it("finishes automatic trapezoid measurements after the third point", () => {
    const plugin = createAreaPlanarTrapezoidToolPlugin();
    const drafts = createDraftStore();
    const addAnnotation = vi.fn((annotationType, coordinates) => ({
      id: "annotation-1",
      toolType: annotationType,
      coordinates,
    }));
    const session = plugin.session?.createSession({
      addAnnotation,
      dispatch: vi.fn(),
      drafts,
      getState: vi.fn(),
      setActiveToolType: vi.fn(),
    } as never);

    session?.onNodeCreated?.(geographicCoordinate(7, 51));
    session?.onNodeCreated?.(geographicCoordinate(7.0001, 51, 100.05));
    session?.onNodeCreated?.(geographicCoordinate(7.00008, 51.00008, 103));

    expect(session?.requestFinish()).toBe(true);
    expect(addAnnotation).toHaveBeenCalledTimes(1);
    expect(addAnnotation.mock.calls[0]?.[0]).toBe(ANNOTATION_TYPES.AREA_PLANAR);
    expect(addAnnotation.mock.calls[0]?.[1]).toHaveLength(4);
    expect(drafts.get(plugin.id).coordinates).toHaveLength(0);
  });

  it("finishes trapezoid measurements after the fourth click", () => {
    const plugin = createAreaPlanarTrapezoidToolPlugin();
    const drafts = createDraftStore();
    const addAnnotation = vi.fn((annotationType, coordinates) => ({
      id: "annotation-1",
      toolType: annotationType,
      coordinates,
    }));
    const session = plugin.session?.createSession({
      addAnnotation,
      dispatch: vi.fn(),
      drafts,
      getState: vi.fn(),
      setActiveToolType: vi.fn(),
    } as never);

    session?.onNodeCreated?.(geographicCoordinate(7, 51));
    session?.onNodeCreated?.(geographicCoordinate(7.0001, 51, 100.05));
    session?.onNodeCreated?.(geographicCoordinate(7.00008, 51.00008, 103));
    session?.onNodeCreated?.(geographicCoordinate(7.00002, 51.00008, 104));

    expect(addAnnotation).toHaveBeenCalledTimes(1);
    expect(addAnnotation.mock.calls[0]?.[0]).toBe(ANNOTATION_TYPES.AREA_PLANAR);
    expect(addAnnotation.mock.calls[0]?.[1]).toHaveLength(4);
    expect(drafts.get(plugin.id).coordinates).toHaveLength(0);
  });

  it("rejects trapezoid second points outside the horizontal plane tolerance", () => {
    const plugin = createAreaPlanarTrapezoidToolPlugin({
      trapezoidHorizontalPlaneToleranceMeters: 0.1,
    });
    const drafts = createDraftStore();
    const addAnnotation = vi.fn();
    const session = plugin.session?.createSession({
      addAnnotation,
      dispatch: vi.fn(),
      drafts,
      getState: vi.fn(),
      setActiveToolType: vi.fn(),
    } as never);

    session?.onNodeCreated?.(geographicCoordinate(7, 51));
    session?.onNodeCreated?.(geographicCoordinate(7.0001, 51, 101));

    const draft = drafts.get(plugin.id);
    expect(addAnnotation).not.toHaveBeenCalled();
    expect(draft.coordinates).toHaveLength(1);
    expect(draft.feedback?.kind).toBe("warning");
  });

  it("allows force accepted trapezoid second points outside the horizontal plane tolerance", () => {
    const plugin = createAreaPlanarTrapezoidToolPlugin({
      trapezoidHorizontalPlaneToleranceMeters: 0.1,
    });
    const drafts = createDraftStore();
    const addAnnotation = vi.fn();
    const session = plugin.session?.createSession({
      addAnnotation,
      dispatch: vi.fn(),
      drafts,
      getState: vi.fn(),
      setActiveToolType: vi.fn(),
    } as never);

    session?.onNodeCreated?.(geographicCoordinate(7, 51));
    session?.onNodeCreated?.(geographicCoordinate(7.0001, 51, 101), null, true);

    const draft = drafts.get(plugin.id);
    expect(addAnnotation).not.toHaveBeenCalled();
    expect(draft.coordinates).toHaveLength(2);
    expect(
      getAreaPlanarTrapezoidSecondPointHorizontalPlaneDistanceMeters({
        coordinate: draft.coordinates[1]!,
        previousCoordinates: [draft.coordinates[0]!],
      })
    ).toBeLessThan(1e-6);
    expect(draft.feedback).toBeNull();
  });

  it("allows force accepted trapezoid second points beyond the local horizontal line max length", () => {
    const createSession = () => {
      const plugin = createAreaPlanarTrapezoidToolPlugin({
        trapezoidHorizontalLineMaxLengthMeters: 5,
      });
      const drafts = createDraftStore();
      const addAnnotation = vi.fn();
      const session = plugin.session?.createSession({
        addAnnotation,
        dispatch: vi.fn(),
        drafts,
        getState: vi.fn(),
        setActiveToolType: vi.fn(),
      } as never);

      return { plugin, drafts, addAnnotation, session };
    };

    const normalClick = createSession();
    normalClick.session?.onNodeCreated?.(geographicCoordinate(7, 51));
    normalClick.session?.onNodeCreated?.(geographicCoordinate(7.0001, 51));

    const normalDraft = normalClick.drafts.get(normalClick.plugin.id);
    expect(normalClick.addAnnotation).not.toHaveBeenCalled();
    expect(normalDraft.coordinates).toHaveLength(1);
    expect(normalDraft.feedback?.message).toContain("geodätische");

    const forcedClick = createSession();
    forcedClick.session?.onNodeCreated?.(geographicCoordinate(7, 51));
    forcedClick.session?.onNodeCreated?.(
      geographicCoordinate(7.0001, 51),
      null,
      true
    );

    const forcedDraft = forcedClick.drafts.get(forcedClick.plugin.id);
    expect(forcedClick.addAnnotation).not.toHaveBeenCalled();
    expect(forcedDraft.coordinates).toHaveLength(2);
    expect(forcedDraft.feedback).toBeNull();
  });
});
