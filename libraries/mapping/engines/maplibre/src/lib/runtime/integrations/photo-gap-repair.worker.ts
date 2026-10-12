import {
  repairPhotoGapsNearest,
  type PhotoGapRepairReply,
  type PhotoGapRepairRequest,
} from "../../core/photo-gap-repair-nearest";

self.onmessage = (event: MessageEvent<PhotoGapRepairRequest>) => {
  if (!event.data) return;
  const { id, input } = event.data;
  try {
    const result = repairPhotoGapsNearest(input);
    self.postMessage({ id, result } satisfies PhotoGapRepairReply, {
      transfer: [
        result.donorCoordinates.buffer as ArrayBuffer,
        result.surfaceAndDonorPositions.buffer as ArrayBuffer,
        result.donorIndices.buffer as ArrayBuffer,
      ],
    });
  } catch (error) {
    self.postMessage({
      id,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
    } satisfies PhotoGapRepairReply);
  }
};
