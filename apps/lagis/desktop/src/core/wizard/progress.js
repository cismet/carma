import { onRequest } from "./gqlLog";

// main phase has no countable steps; it creeps on with each server request
const MAIN_WEIGHT = 3;
const creep = (requests) => Math.min(0.9, requests / (requests + 6));

const phaseFraction = (phase) => {
  if (phase.status === "done" || phase.status === "skipped") {
    return 1;
  }
  if (phase.status === "pending") {
    return 0;
  }
  return phase.total ? phase.done / phase.total : creep(phase.requests);
};

const weightOf = (phase) =>
  phase.total === undefined ? MAIN_WEIGHT : Math.max(phase.total, 1);

export const percentOf = (phases) => {
  const total = phases.reduce((sum, phase) => sum + weightOf(phase), 0);
  const done = phases.reduce(
    (sum, phase) => sum + weightOf(phase) * phaseFraction(phase),
    0
  );
  return total ? Math.round((done / total) * 100) : 0;
};

// phases: [{ id, title, total? }]; total undefined = uncountable main phase
export const createProgress = (phases, onChange) => {
  const state = {
    phases: phases.map((phase) => ({
      ...phase,
      status: "pending",
      done: 0,
      requests: 0,
      detail: undefined,
    })),
    requests: 0,
    rollingBack: false,
    failed: false,
  };

  const emit = () =>
    onChange?.({
      ...state,
      phases: state.phases.map((phase) => ({ ...phase })),
      percent: percentOf(state.phases),
    });

  const find = (id) => state.phases.find((phase) => phase.id === id);
  const active = () => state.phases.find((phase) => phase.status === "active");

  const stopListening = onRequest(() => {
    state.requests += 1;
    const phase = active();
    if (phase) {
      phase.requests += 1;
    }
    emit();
  });

  emit();

  return {
    start(id, total) {
      const phase = find(id);
      if (total !== undefined) {
        phase.total = total;
      }
      if (phase.total === 0) {
        phase.status = "skipped";
        emit();
        return;
      }
      phase.status = "active";
      emit();
    },

    step(id, detail) {
      find(id).detail = detail;
      emit();
    },

    stepDone(id) {
      find(id).done += 1;
      emit();
    },

    finish(id) {
      const phase = find(id);
      if (phase.status === "active") {
        phase.status = "done";
        phase.detail = undefined;
      }
      emit();
    },

    fail() {
      const phase = active();
      if (phase) {
        phase.status = "error";
      }
      state.failed = true;
      state.rollingBack = true;
      emit();
    },

    rolledBack() {
      state.rollingBack = false;
      emit();
    },

    dispose: stopListening,
  };
};
