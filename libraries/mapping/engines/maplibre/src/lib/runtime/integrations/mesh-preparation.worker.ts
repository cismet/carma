import {
  executeMeshPreparationTask,
  meshPreparationResultTransfers,
  type MeshPreparationRequest,
  type MeshPreparationReply,
} from "./mesh-preparation-task";

self.onmessage = async (event: MessageEvent<MeshPreparationRequest>) => {
  // Vite can emit an empty message while replacing a module worker.
  if (!event.data) return;
  const { id, task } = event.data;
  try {
    const result = await executeMeshPreparationTask(task);
    self.postMessage({ id, result } satisfies MeshPreparationReply, {
      transfer: meshPreparationResultTransfers(result),
    });
  } catch (error) {
    self.postMessage({
      id,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
    } satisfies MeshPreparationReply);
  }
};
