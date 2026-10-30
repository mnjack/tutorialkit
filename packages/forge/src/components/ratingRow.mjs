// One block's rating row (Learning Forge D71, D81): a quiet line of two thumbs under the block.
// After a press, the reason chips and an optional note appear inline; nothing pops up. Every
// press is saved by the caller (ratingSaves.mjs); a typed note is saved by "Save note" or when
// the box loses focus (so pressing a chip or thumb saves the note first). The note box clears
// anything shaped like a key or token the moment it arrives (the hands-on key guard, passed in
// as `guard`), so a key is never kept or sent.
import { createElement as h, useEffect, useState } from 'react';

export const NOTE_LIMIT = 2000;
export const NOTE_REFUSED = 'This looks like an API key or token, so it wasn’t kept. Take the key out and write the note again.';
const LABELS = {
  section: 'Rate this section', quiz: 'Rate this quiz', 'hands-on': 'Rate this task',
  exercise: 'Rate this exercise', page: 'Rate this page',
};

/** What the note box holds after an edit: a key-shaped note is cleared, with a message. */
export function noteChange(value, guard) {
  return guard(value) ? { draft: '', message: NOTE_REFUSED } : { draft: value, message: '' };
}

function Note({ block, note, guard, onNote }) {
  const [draft, setDraft] = useState(note);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(Boolean(note));
  useEffect(() => setDraft(note), [note]);
  const id = `forge-rating-note-${block.id}`;
  // Closed, the note is one small button, so a press leaves the row quiet.
  if (!open && !note) {
    return h('button', { type: 'button', className: 'forge-rating-chip forge-rating-add-note', onClick: () => setOpen(true) }, 'Add a note');
  }
  return h('div', { className: 'forge-rating-note' },
    h('label', { htmlFor: id }, 'Note (optional)'),
    h('textarea', {
      // Focus moves into the box right after "Add a note"; a saved note shown on load never takes it.
      id, value: draft, rows: 2, maxLength: NOTE_LIMIT, autoFocus: open && !note,
      autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'off', spellCheck: false, 'data-gramm': 'false',
      onChange: (event) => {
        const next = noteChange(event.target.value, guard);
        setDraft(next.draft);
        setMessage(next.message);
      },
      // Leaving the box saves the note, so a chip or thumb pressed next can't strand it. A note
      // the key guard just cleared is left for "Save note", so it never erases a saved note.
      onBlur: () => { if (draft !== note && !message) onNote(draft); },
    }),
    h('button', { type: 'button', disabled: draft === note, onClick: () => onNote(draft) }, 'Save note'),
    message ? h('p', { role: 'alert', className: 'forge-rating-refused' }, message) : null);
}

export function RatingRow({ block, reasons, rating, line, named, guard, onVote, onReason, onNote }) {
  const vote = rating?.vote || null;
  const thumb = (value, symbol, words) => h('button', {
    type: 'button', className: 'forge-rating-thumb', 'aria-label': `${words}: ${block.name}`,
    'aria-pressed': vote === value, onClick: () => onVote(value),
  }, symbol);
  return h('div', { className: 'forge-rating', 'data-vote': vote || 'none' },
    h('div', { className: 'forge-rating-bar' },
      h('span', { className: 'forge-rating-label' }, named ? `Rate “${block.name}”` : (LABELS[block.kind] || LABELS.page)),
      thumb('up', '👍', 'Thumbs up'),
      thumb('down', '👎', 'Thumbs down'),
      h('span', { className: 'forge-rating-line', role: 'status', 'aria-live': 'polite' }, line)),
    vote ? h('div', { className: 'forge-rating-reasons', role: 'group', 'aria-label': `Why? Optional reasons for ${block.name}` },
      ...reasons.map((reason) => h('button', {
        key: reason.id, type: 'button', className: 'forge-rating-chip',
        'aria-pressed': (rating.reasons || []).includes(reason.id), onClick: () => onReason(reason.id),
      }, reason.label)),
      h(Note, { block, note: rating.note || '', guard, onNote })) : null);
}
