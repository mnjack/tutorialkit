// A hands-on page's step saves (D73). One page turn sends its requests one at a time, in click
// order, so an older request can never land after a newer one. The boxes show what Forge last
// said it holds, with the clicks still waiting to be sent laid on top. A failed click drops out,
// so its step goes back to what Forge holds. Only the newest request may set the status line,
// so an older SAVED can't hide a newer failure, nor an older failure a newer SAVED.

/**
 * @param {object} io
 * @param {string} io.digest the task digest the page was exported with
 * @param {(stepId: string, status: string) => Promise<{task_digest: string, steps: object}>} io.send
 * @param {() => Promise<{task_digest: string, steps: object}>} io.read Forge's stored step states
 * @param {(states: Record<string, string>) => void} io.show what the boxes show
 * @param {(error: unknown | null) => void} io.report null once the newest request saved or read
 */
export function handsOnSaves({ digest, send, read, show, report }) {
  let chain = Promise.resolve();
  let newest = 0;
  let stopped = false;
  let stored = {};
  const pending = [];

  const redraw = () => {
    const shown = { ...stored };
    for (const change of pending) {
      if (change.status === 'open') delete shown[change.stepId];
      else shown[change.stepId] = change.status;
    }
    show(shown);
  };
  const hold = (reply) => {
    if (reply?.task_digest === digest) stored = { ...(reply.steps || {}) };
  };
  const enqueue = (work) => {
    chain = chain.then(() => (stopped ? undefined : work()));
    return chain;
  };
  const reread = async () => {
    try {
      const reply = await read();
      if (!stopped) hold(reply);
    } catch {
      // Forge didn't answer: the boxes keep what it last said it holds.
    }
  };

  return {
    /** Read what Forge holds, behind any request already waiting. */
    load() {
      const ticket = ++newest;
      return enqueue(async () => {
        try {
          const reply = await read();
          if (stopped) return;
          hold(reply);
          redraw();
          if (ticket === newest) report(null);
        } catch (error) {
          if (!stopped && ticket === newest) report(error);
        }
      });
    },
    /** Show the click at once; send it after every earlier one. */
    save(stepId, status) {
      const ticket = ++newest;
      const change = { stepId, status };
      pending.push(change);
      redraw();
      return enqueue(async () => {
        let failure = null;
        try {
          hold(await send(stepId, status));
        } catch (error) {
          failure = error;
        }
        if (stopped) return;
        pending.splice(pending.indexOf(change), 1);
        if (failure && ticket === newest) await reread();
        if (stopped) return;
        redraw();
        if (ticket === newest) report(failure);
      });
    },
    /** The page turned: nothing from now on touches the boxes or the line. */
    stop() {
      stopped = true;
    },
  };
}
