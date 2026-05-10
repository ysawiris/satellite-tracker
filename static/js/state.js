// Tiny pub/sub state container. Subscribers are called on every change.

export function createStore(initial) {
  let state = { ...initial };
  const listeners = new Set();

  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...patch };
      listeners.forEach((fn) => fn(state));
    },
    subscribe: (fn) => {
      listeners.add(fn);
      fn(state);
      return () => listeners.delete(fn);
    },
  };
}
