function resolveUpdate(update, state) {
  return typeof update === "function" ? update(state) : update;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeState(state, patch) {
  if (!isObject(state) || !isObject(patch)) {
    throw new TypeError("setState requires an object state and object patch");
  }

  const keys = Object.keys(patch);
  const changed = keys.some((key) => !Object.is(state[key], patch[key]));
  return changed ? { ...state, ...patch } : state;
}

export function createStore(initialState, options = {}) {
  if (typeof options === "function") options = { reducer: options };

  const reducer = options.reducer;
  const onChange = options.onChange;

  if (reducer !== undefined && typeof reducer !== "function") {
    throw new TypeError("options.reducer must be a function");
  }
  if (onChange !== undefined && typeof onChange !== "function") {
    throw new TypeError("options.onChange must be a function");
  }

  let state = initialState;
  let transactionDepth = 0;
  let transactionStart;
  let transactionChanged = false;
  let notifying = false;
  const listeners = new Set();
  const notificationQueue = [];

  function flushNotifications() {
    if (notifying) return;
    notifying = true;

    try {
      while (notificationQueue.length > 0) {
        const change = notificationQueue.shift();
        onChange?.(change.state, change.previousState);

        for (const listener of [...listeners]) {
          listener(change.state, change.previousState);
        }
      }
    } finally {
      notifying = false;
    }
  }

  function queueNotification(nextState, previousState) {
    notificationQueue.push({ state: nextState, previousState });
    flushNotifications();
  }

  function commit(nextState) {
    if (Object.is(nextState, state)) return state;

    const previousState = state;
    state = nextState;

    if (transactionDepth > 0) {
      if (!transactionChanged) transactionStart = previousState;
      transactionChanged = true;
    } else {
      queueNotification(state, previousState);
    }

    return state;
  }

  function getState() {
    return state;
  }

  function setState(update) {
    const patch = resolveUpdate(update, state);
    if (patch === undefined || patch === null) return state;
    return commit(mergeState(state, patch));
  }

  function replaceState(update) {
    const nextState = resolveUpdate(update, state);
    if (nextState === undefined) {
      throw new TypeError("replaceState update must return a state value");
    }
    return commit(nextState);
  }

  function dispatch(action) {
    if (!reducer) return action;

    const nextState = reducer(state, action);
    if (nextState === undefined) {
      throw new TypeError("reducer must return a state value");
    }
    commit(nextState);
    return action;
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("subscribe requires a function");
    }

    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function transaction(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("transaction requires a function");
    }

    transactionDepth += 1;
    try {
      return callback(api);
    } finally {
      transactionDepth -= 1;
      if (transactionDepth === 0 && transactionChanged) {
        const previousState = transactionStart;
        transactionStart = undefined;
        transactionChanged = false;
        queueNotification(state, previousState);
      }
    }
  }

  const api = {
    getState,
    setState,
    dispatch,
    subscribe,
    replaceState,
    transaction
  };

  return api;
}
