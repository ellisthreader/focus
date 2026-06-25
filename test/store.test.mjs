import test from "node:test";
import assert from "node:assert/strict";

import { createStore } from "../src/core/store.mjs";

test("setState shallow-merges without mutating the current state", () => {
  const initial = { count: 1, profile: { name: "Ellis" } };
  const store = createStore(initial);

  const next = store.setState((state) => ({ count: state.count + 1 }));

  assert.deepEqual(next, { count: 2, profile: initial.profile });
  assert.notStrictEqual(next, initial);
  assert.deepEqual(initial, { count: 1, profile: { name: "Ellis" } });
  assert.strictEqual(store.getState(), next);
});

test("setState skips no-op patches", () => {
  const initial = { count: 1 };
  const store = createStore(initial);
  let calls = 0;
  store.subscribe(() => {
    calls += 1;
  });

  assert.strictEqual(store.setState({ count: 1 }), initial);
  assert.strictEqual(store.setState(null), initial);
  assert.equal(calls, 0);
});

test("subscribe receives state transitions and can unsubscribe", () => {
  const store = createStore({ count: 0 });
  const changes = [];
  const unsubscribe = store.subscribe((state, previousState) => {
    changes.push([state.count, previousState.count]);
  });

  store.setState({ count: 1 });
  assert.equal(unsubscribe(), true);
  assert.equal(unsubscribe(), false);
  store.setState({ count: 2 });

  assert.deepEqual(changes, [[1, 0]]);
});

test("dispatch applies an injected reducer and returns the action", () => {
  const reducer = (state, action) => (
    action.type === "increment"
      ? { ...state, count: state.count + (action.by ?? 1) }
      : state
  );
  const store = createStore({ count: 0 }, { reducer });
  const action = { type: "increment", by: 3 };

  assert.strictEqual(store.dispatch(action), action);
  assert.deepEqual(store.getState(), { count: 3 });
});

test("dispatch is a no-op when no reducer is configured", () => {
  const store = createStore({ count: 0 });
  const action = { type: "increment" };

  assert.strictEqual(store.dispatch(action), action);
  assert.deepEqual(store.getState(), { count: 0 });
});

test("replaceState swaps the complete state", () => {
  const store = createStore({ count: 1, stale: true });

  const next = store.replaceState((state) => ({ count: state.count + 1 }));

  assert.deepEqual(next, { count: 2 });
  assert.strictEqual(store.getState(), next);
});

test("nested transactions batch notifications and persistence callbacks", () => {
  const persisted = [];
  const observed = [];
  const store = createStore(
    { count: 0, label: "start" },
    {
      onChange: (state, previousState) => {
        persisted.push([state.count, previousState.count]);
      }
    }
  );
  store.subscribe((state, previousState) => {
    observed.push([state.count, state.label, previousState.count]);
  });

  const result = store.transaction(({ setState, transaction }) => {
    setState({ count: 1 });
    transaction(() => {
      setState({ count: 2 });
      setState({ label: "done" });
    });
    return "result";
  });

  assert.equal(result, "result");
  assert.deepEqual(store.getState(), { count: 2, label: "done" });
  assert.deepEqual(observed, [[2, "done", 0]]);
  assert.deepEqual(persisted, [[2, 0]]);
});

test("a throwing transaction still publishes committed changes once", () => {
  const store = createStore({ count: 0 });
  const observed = [];
  store.subscribe((state, previousState) => {
    observed.push([state.count, previousState.count]);
  });

  assert.throws(
    () => store.transaction(() => {
      store.setState({ count: 1 });
      throw new Error("stop");
    }),
    /stop/
  );

  assert.deepEqual(store.getState(), { count: 1 });
  assert.deepEqual(observed, [[1, 0]]);
});

test("persistence callback runs once per non-batched change", () => {
  const changes = [];
  const store = createStore(
    { count: 0 },
    { onChange: (state, previousState) => changes.push([state.count, previousState.count]) }
  );

  store.setState({ count: 1 });
  store.replaceState({ count: 2 });

  assert.deepEqual(changes, [[1, 0], [2, 1]]);
});
