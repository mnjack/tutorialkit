// A page's rating saves (Learning Forge D81). Each request carries the block's whole rating
// (thumb, chips, note), so a press must stand on what Forge already holds for the page: until
// those saved ratings have loaded, a press sends nothing. A press on a page whose ratings
// couldn't load tries the load again first; if that fails too, the row says it wasn't saved and
// nothing is sent, so a saved note or chips are never overwritten with empty ones. Once loaded,
// a press shows at once and is sent after every earlier press on the page, one request at a
// time, so an older save can never land after a newer one and the latest press is what Forge
// keeps. Only a block's newest press may set that block's status line. Chips and a note need a
// thumb first: before one, they send nothing.

const EMPTY = { vote: null, reasons: [], note: '' };

export const SAVED = 'Saved.';
export const NOT_SAVED = 'Not saved: open Forge to save ratings.';
export const NOT_SAVED_NOW = 'Forge couldn’t save this just now. Try again in a moment.';
// The statuses the rating route refuses a press with, in words written for the learner (a note
// shaped like a key, a part of the page the course no longer has). Any other refusal (the course
// is being rebuilt or fails its checks, a stale session) carries Forge's internal wording.
const PLAIN_REFUSALS = new Set([404, 422]);

/** The row's line when a save fails: Forge's plain refusal, else "try again", else "open Forge". */
export function notSaved(error) {
  const status = error?.status;
  if (PLAIN_REFUSALS.has(status) && error.message) return error.message;
  return Number.isInteger(status) ? NOT_SAVED_NOW : NOT_SAVED;
}

/** The block's rating after one press: a thumb, a chip (on or off) or the note. */
export function applyPress(rating, press) {
  if (press.vote) return { ...rating, vote: press.vote };
  if (press.reason) {
    const on = rating.reasons.includes(press.reason);
    return { ...rating, reasons: on ? rating.reasons.filter((reason) => reason !== press.reason) : [...rating.reasons, press.reason] };
  }
  if (typeof press.note === 'string') return { ...rating, note: press.note };
  return rating;
}

/**
 * @param {object} io
 * @param {() => Promise<Record<string, object>>} io.load what Forge holds for this page's blocks
 * @param {(blockId: string, rating: {vote: string, reasons: string[], note: string}) => Promise<unknown>} io.send
 * @param {(ratings: Record<string, object>) => void} io.show what the rows show
 * @param {(blockId: string, error: unknown | null) => void} io.report null once the block's newest press saved
 */
export function ratingSaves({ load, send, show, report }) {
  let chain = Promise.resolve();
  let stopped = false;
  let loading = null;
  let held = false;
  const ratings = {};
  const newest = {};

  /** Forge's saved ratings for the page, read once; a failed read is tried again next time. */
  function loaded() {
    if (held) return Promise.resolve();
    loading ||= load().then((saved) => {
      if (stopped || held) return;
      for (const [blockId, rating] of Object.entries(saved || {})) ratings[blockId] = { ...EMPTY, ...rating };
      held = true;
      show({ ...ratings });
    }, (error) => {
      loading = null;
      throw error;
    });
    return loading;
  }

  function press(blockId, change) {
    if (stopped) return chain;
    if (!held) {
      return loaded().then(() => press(blockId, change), (error) => {
        if (!stopped) report(blockId, error);
      });
    }
    const next = applyPress(ratings[blockId] || EMPTY, change);
    if (!next.vote) return chain;
    ratings[blockId] = next;
    show({ ...ratings });
    const ticket = (newest[blockId] = (newest[blockId] || 0) + 1);
    chain = chain.then(async () => {
      if (stopped) return;
      let failure = null;
      try {
        await send(blockId, next);
      } catch (error) {
        failure = error;
      }
      if (!stopped && ticket === newest[blockId]) report(blockId, failure);
    });
    return chain;
  }

  return {
    /** Read what Forge holds for the page's blocks; it rejects when Forge couldn't answer. */
    loaded,
    /** Show the press at once and send it after every earlier one, on top of the saved ratings. */
    press,
    /** The page turned: nothing from now on touches the rows. */
    stop() {
      stopped = true;
    },
  };
}
