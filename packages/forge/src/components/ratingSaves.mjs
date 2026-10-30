// A page's rating saves (Learning Forge D81). A press shows at once and is sent after every
// earlier press on the page, one request at a time, so an older save can never land after a
// newer one. Each request carries the block's whole rating (thumb, chips, note), so the latest
// press is what Forge keeps. Only a block's newest press may set that block's status line.
// Chips and a note need a thumb first: before one, they send nothing.

const EMPTY = { vote: null, reasons: [], note: '' };

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
 * @param {(blockId: string, rating: {vote: string, reasons: string[], note: string}) => Promise<unknown>} io.send
 * @param {(ratings: Record<string, object>) => void} io.show what the rows show
 * @param {(blockId: string, error: unknown | null) => void} io.report null once the block's newest press saved
 */
export function ratingSaves({ send, show, report }) {
  let chain = Promise.resolve();
  let stopped = false;
  const ratings = {};
  const newest = {};

  return {
    /** What Forge already holds for this page's blocks. */
    hold(saved) {
      for (const [blockId, rating] of Object.entries(saved || {})) {
        if (!newest[blockId]) ratings[blockId] = { ...EMPTY, ...rating };
      }
      show({ ...ratings });
    },
    /** Show the press at once; send it after every earlier one. */
    press(blockId, press) {
      const next = applyPress(ratings[blockId] || EMPTY, press);
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
    },
    /** The page turned: nothing from now on touches the rows. */
    stop() {
      stopped = true;
    },
  };
}
