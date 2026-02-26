import type {
  MeasurementCollection,
  MeasurementEntry,
  MeasurementLabelAnchor,
  MeasurementLabelAppearance,
  MeasurementMode,
  PlanarPolygonGroup,
  PointDistanceRelation,
  PointLabelMetricMode,
} from "./MeasurementTypes";

export type MeasurementScriptStatePatchStrategy = "merge" | "replace";

export type MeasurementScriptSelectionPatch = {
  measurementId?: string | null;
  measurementIds?: string[];
  additive?: boolean;
  planarPolygonGroupId?: string | null;
};

export type MeasurementScriptStatePatch = {
  strategy?: MeasurementScriptStatePatchStrategy;
  measurements?: MeasurementCollection;
  distanceRelations?: PointDistanceRelation[];
  planarPolygonGroups?: PlanarPolygonGroup[];
  selection?: MeasurementScriptSelectionPatch;
};

export type MeasurementScriptMutationBase = {
  id?: string;
  name?: string;
  timestamp?: number;
  hidden?: boolean;
  locked?: boolean;
  temporary?: boolean;
  select?: boolean;
  upsertIfExists?: boolean;
};

export type MeasurementScriptNodeGeometry = {
  longitude: number;
  latitude: number;
  heightMeters?: number;
};

export type MeasurementScriptAddNodeParams = MeasurementScriptMutationBase & {
  longitude: number;
  latitude: number;
  heightMeters?: number;
  pointLabelMode?: PointLabelMetricMode;
  labelAnchor?: MeasurementLabelAnchor;
  labelAppearance?: MeasurementLabelAppearance;
};

export type MeasurementScriptAddLabelParams = MeasurementScriptMutationBase & {
  text?: string;
  anchorNodeId?: string;
  longitude?: number;
  latitude?: number;
  heightMeters?: number;
  labelAnchor?: MeasurementLabelAnchor;
  labelAppearance?: MeasurementLabelAppearance;
};

export type MeasurementScriptMeasurementPayloadByKind = {
  node: Omit<
    MeasurementScriptAddNodeParams,
    keyof MeasurementScriptMutationBase
  >;
  label: Omit<
    MeasurementScriptAddLabelParams,
    keyof MeasurementScriptMutationBase
  >;
  measurementEntry: MeasurementEntry;
  distanceRelation: PointDistanceRelation;
  planarPolygonGroup: PlanarPolygonGroup;
};

export type MeasurementScriptMeasurementKind =
  keyof MeasurementScriptMeasurementPayloadByKind;

export type MeasurementScriptMutableEntityKind = Exclude<
  MeasurementScriptMeasurementKind,
  "node" | "label"
>;

export type MeasurementScriptMeasurementPayload<
  K extends MeasurementScriptMeasurementKind = MeasurementScriptMeasurementKind
> = {
  kind: K;
  payload: MeasurementScriptMeasurementPayloadByKind[K];
};

export type MeasurementScriptAddMeasurementParams<
  K extends MeasurementScriptMeasurementKind = MeasurementScriptMeasurementKind
> = MeasurementScriptMutationBase & {
  measurement: MeasurementScriptMeasurementPayload<K>;
};

export type MeasurementScriptUpdateMeasurementPatchByKind = {
  measurementEntry: Partial<Omit<MeasurementEntry, "id">>;
  distanceRelation: Partial<Omit<PointDistanceRelation, "id">>;
  planarPolygonGroup: Partial<Omit<PlanarPolygonGroup, "id">>;
};

export type MeasurementScriptUpdateMeasurementParams<
  K extends MeasurementScriptMutableEntityKind = MeasurementScriptMutableEntityKind
> = {
  kind: K;
  id: string;
  patch: MeasurementScriptUpdateMeasurementPatchByKind[K];
  select?: boolean;
};

export type MeasurementScriptRemoveMeasurementParams = {
  kind: MeasurementScriptMutableEntityKind;
  id: string;
};

export type MeasurementScriptCommand =
  | {
      method: "measurements.getState";
      params?: undefined;
    }
  | {
      method: "measurements.clearAll";
      params?: undefined;
    }
  | {
      method: "measurements.setMode";
      params: {
        mode: MeasurementMode;
      };
    }
  | {
      method: "measurements.select";
      params: MeasurementScriptSelectionPatch;
    }
  | {
      method: "measurements.add";
      params: MeasurementScriptAddMeasurementParams;
    }
  | {
      method: "measurements.update";
      params: MeasurementScriptUpdateMeasurementParams;
    }
  | {
      method: "measurements.remove";
      params: MeasurementScriptRemoveMeasurementParams;
    }
  | {
      method: "measurements.upsertState";
      params: MeasurementScriptStatePatch;
    };

export type MeasurementScriptRpcId = string | number | null;

export type MeasurementScriptRpcRequest = {
  jsonrpc?: "2.0";
  id?: MeasurementScriptRpcId;
} & MeasurementScriptCommand;

export type MeasurementScriptRpcError = {
  code: number;
  message: string;
  data?: unknown;
};

export type MeasurementScriptRpcResponse =
  | {
      jsonrpc: "2.0";
      id: MeasurementScriptRpcId;
      result: unknown;
    }
  | {
      jsonrpc: "2.0";
      id: MeasurementScriptRpcId;
      error: MeasurementScriptRpcError;
    };

export type MeasurementScriptStateSnapshot = {
  measurementMode: MeasurementMode;
  selectedMeasurementId: string | null;
  selectedMeasurementIds: string[];
  selectedPlanarPolygonGroupId: string | null;
  measurements: MeasurementCollection;
  distanceRelations: PointDistanceRelation[];
  planarPolygonGroups: PlanarPolygonGroup[];
};

export type MeasurementScriptRequestEventDetail = {
  id?: MeasurementScriptRpcId;
  request: MeasurementScriptRpcRequest | MeasurementScriptRpcRequest[];
};

export type MeasurementScriptResponseEventDetail = {
  id: MeasurementScriptRpcId;
  response: MeasurementScriptRpcResponse | MeasurementScriptRpcResponse[];
};

export type MeasurementScriptWindowApi = {
  version: string;
  execute: (
    request: MeasurementScriptRpcRequest | MeasurementScriptRpcRequest[]
  ) =>
    | MeasurementScriptRpcResponse
    | MeasurementScriptRpcResponse[]
    | Promise<MeasurementScriptRpcResponse | MeasurementScriptRpcResponse[]>;
  getState: () => MeasurementScriptStateSnapshot;
  requestEventName: string;
  responseEventName: string;
};

export type MeasurementScriptApiOptions = {
  enabled?: boolean;
  namespace?: string;
  requestEventName?: string;
  responseEventName?: string;
};
