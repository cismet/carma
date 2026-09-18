import {
  bakeNightLightAtlas,
  type NightLightAtlasInput,
} from "../../core/night-light-atlas";

interface NightLightAtlasWorkerRequest {
  id: number;
  input: NightLightAtlasInput;
}

type NightLightAtlasWorkerResponse =
  | { id: number; pixels: Uint8Array }
  | { id: number; error: string };

const scope = self as unknown as {
  postMessage: (
    response: NightLightAtlasWorkerResponse,
    transfer?: Transferable[]
  ) => void;
  onmessage:
    | ((event: MessageEvent<NightLightAtlasWorkerRequest>) => void)
    | null;
};

scope.onmessage = ({ data: request }) => {
  try {
    const pixels = bakeNightLightAtlas(request.input);
    scope.postMessage({ id: request.id, pixels }, [pixels.buffer]);
  } catch (error) {
    scope.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
