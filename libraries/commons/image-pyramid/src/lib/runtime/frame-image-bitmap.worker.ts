/// <reference lib="webworker" />

type ConvertMessage = {
  id: number;
  frame: VideoFrame;
  options?: ImageBitmapOptions;
};
type CancelMessage = { id: number; cancel: true };

const cancelled = new Set<number>();
const inFlight = new Set<number>();
const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (
  event: MessageEvent<ConvertMessage | CancelMessage>
) => {
  const message = event.data;
  if ("cancel" in message) {
    if (inFlight.has(message.id)) cancelled.add(message.id);
    return;
  }
  inFlight.add(message.id);
  void (async () => {
    let bitmap: ImageBitmap | undefined;
    try {
      bitmap = await createImageBitmap(message.frame, message.options);
      if (cancelled.has(message.id)) {
        bitmap.close();
        bitmap = undefined;
        workerScope.postMessage({ id: message.id, cancelled: true });
        return;
      }
      workerScope.postMessage({ id: message.id, bitmap }, [bitmap]);
      bitmap = undefined;
    } catch (error) {
      if (cancelled.has(message.id))
        workerScope.postMessage({ id: message.id, cancelled: true });
      else
        workerScope.postMessage({
          id: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
    } finally {
      bitmap?.close();
      message.frame.close();
      cancelled.delete(message.id);
      inFlight.delete(message.id);
    }
  })();
};

export {};
