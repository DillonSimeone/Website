# Issue/Bug Report: CPU-Starvation & Busy-Wait rendering loop in `renderUntilSettled()`

## Summary
There is a busy-wait rendering loop bug inside `@tscircuit/core`'s `renderUntilSettled()` method. When asynchronous effects (such as the local capacity-autorouter solver or Spice simulations) are running in the background, the engine spins in a tight loop repeatedly calling `this.render()`. 

Because a single `render()` invocation performs heavy React reconciliation and database operations, this busy-wait loop consumes 100% of the CPU thread. This starves the background asynchronous solvers, causing extreme UI lag, slow compilation (increasing from ~1 second to 30+ seconds), and eventual timeouts.

---

## How It Was Discovered
We were building a highly parametric LED strip visualizer using `@tscircuit/core`. When placing 80+ components, page load times and parameter updates took a flat 30 seconds to settle, even when autorouting was disabled. 

By instrumenting granular performance profiling around `renderUntilSettled()`, we found that the method was taking 30,000ms+ to finish:
```
[Circuit Profiling] new Circuit() took 0.1ms
[Circuit Profiling] Building board element ... took 0.1ms
[Circuit Profiling] circuit.add() took 41.6ms
[Circuit Profiling] renderUntilSettled() took 30651.0ms
```

---

## Behavior of the Framework (Before the Patch)
The stock implementation of `renderUntilSettled()` is defined as:
```javascript
async renderUntilSettled() {
  for (
    this.db.source_project_metadata.list()?.[0] || 
    this.db.source_project_metadata.insert({
      software_used_string: `@tscircuit/core@${this.getCoreVersion()}`,
      ...this.projectUrl ? { project_url: this.projectUrl } : {}
    }), 
    this.render(); 
    !this.isDoneRendering();
  ) {
    await new Promise(t => setTimeout(t, 100));
    this.render();
  }
  this.emit("renderComplete");
}
```

### The Problem:
1. **Unnecessary rendering overhead**: Even if a compilation is completely synchronous (e.g. `skipRouting` or `routingDisabled` is active), this method introduces a minimum **100ms lag** on the main thread because it yields to the event loop via `setTimeout(t, 100)` before checking `isDoneRendering()`.
2. **The CPU Starvation Loop**: When an async effect (like the local solver) begins, `isDoneRendering()` returns `false` until the effect completes and sets its state. Because it returns `false`, this loop keeps executing. If developers attempt to reduce latency by setting a shorter timeout (like `setTimeout(t, 0)`), the loop busy-waits, calling `this.render()` (which takes ~50ms) hundreds of times per second. This locks up the browser main thread and deprives the asynchronous solver of execution time.

---

## Proposed Fix: Promise-Awaiting Loop (After the Patch)
Instead of polling and busy-waiting with timer delays, the engine should inspect the component tree for any pending asynchronous effect promises and **await them directly** using `Promise.all` before rendering again.

### The Patch Code:
```javascript
async renderUntilSettled() {
  this.db.source_project_metadata.list()?.[0] || 
  this.db.source_project_metadata.insert({
    software_used_string: `@tscircuit/core@${this.getCoreVersion()}`,
    ...this.projectUrl ? { project_url: this.projectUrl } : {}
  });
  
  // Recursively collect all active (incomplete) async promises from the component tree
  function getActivePromises(node) {
    if (!node) return [];
    let promises = [];
    if (node._asyncEffects) {
      for (const effect of node._asyncEffects) {
        if (!effect.complete && effect.promise) {
          promises.push(effect.promise);
        }
      }
    }
    if (node.children) {
      for (const child of node.children) {
        promises.push(...getActivePromises(child));
      }
    }
    return promises;
  }

  this.render();
  while (!this.isDoneRendering()) {
    // Gather promises from the root children
    let promises = getActivePromises(this.firstChild || this);
    if (promises.length > 0) {
      // Cleanly yield the execution thread until the async effects complete
      await Promise.all(promises);
    } else {
      // Yield to the microtask queue to check updates on the next tick
      await Promise.resolve();
    }
    this.render();
  }
  this.emit("renderComplete");
}
```

### Why this works:
1. **Zero Busy-Waiting**: When the autorouter starts running, `getActivePromises` gathers the solver's promise. The thread yields cleanly via `await Promise.all(promises)` and does **not** call `this.render()` again until the solver has fully finished. This frees up 100% of the CPU for the solver thread.
2. **Instant Sync Renders**: For synchronous renderings with no async effects, the loop detects `promises.length === 0`, yields once to a microtask (`Promise.resolve()`), checks `isDoneRendering()` (which immediately returns `true`), and exits in **less than 1ms** instead of sleeping for 100ms.
