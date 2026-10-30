// Where a page's rating rows go (Learning Forge D81). Forge lists each page's blocks in the
// manifest (learning_forge/ratings.py): each `##` section of a lesson and each quiz in it carry
// the index of their section; a page rated as a whole (a hands-on task, an exercise) carries none.
// A section's row goes at the end of its section, or just above its quiz when it has one, and the
// quiz's row goes under the quiz. A whole-page row goes after the page's text, above the page
// navigation. If the page doesn't show exactly the sections Forge listed, every row goes after
// the text instead, in block order, and names its block, so a row is never lost or misplaced.

export const SLOT_CLASS = 'forge-rating-slot';

// A quiz is a paragraph that opens with a bold "Check — <kind>:" label (lesson.py's format).
function isQuiz(element) {
  const label = element.firstElementChild;
  if (element.tagName !== 'P' || label?.tagName !== 'STRONG') return false;
  const text = (label.textContent || '').trim();
  return /^Check\s+—\s/.test(text) && (element.textContent || '').trim().startsWith(text);
}

// The page's `##` sections: each heading with the elements after it, up to the next heading.
function sections(content) {
  const found = [];
  for (const child of [...content.children]) {
    if (child.tagName === 'H2') found.push([child]);
    else if (found.length) found[found.length - 1].push(child);
  }
  return found;
}

function after(anchor, slot) {
  anchor.insertAdjacentElement('afterend', slot);
  return slot;
}

/** One new element per block, already in the page, in block order. */
export function ratingSlots(content, blocks, doc) {
  const slots = blocks.map((block) => {
    const slot = doc.createElement('div');
    slot.className = SLOT_CLASS;
    slot.dataset.block = block.id;
    return slot;
  });
  const found = sections(content);
  const inSections = blocks.some((block) => Number.isInteger(block.section));
  const placed = !inSections || blocks.filter((block) => block.kind === 'section').length === found.length;
  let end = content;
  blocks.forEach((block, index) => {
    if (placed && Number.isInteger(block.section)) return;
    if (!placed) slots[index].dataset.named = 'true';
    end = after(end, slots[index]);
  });
  if (!placed) return slots;
  found.forEach((elements, number) => {
    const here = blocks.map((block, index) => [block, slots[index]]).filter(([block]) => block.section === number);
    const quizzes = elements.filter(isQuiz);
    const rows = here.filter(([block]) => block.kind === 'quiz');
    const last = elements[elements.length - 1];
    if (rows.length && rows.length === quizzes.length) {
      // The section's row above its first quiz; each quiz's row under it, before the next quiz.
      for (const [block, slot] of here) {
        if (block.kind !== 'quiz') quizzes[0].insertAdjacentElement('beforebegin', slot);
      }
      rows.forEach(([, slot], index) => {
        if (index + 1 < quizzes.length) quizzes[index + 1].insertAdjacentElement('beforebegin', slot);
        else after(last, slot);
      });
      return;
    }
    let anchor = last;
    for (const [, slot] of here) anchor = after(anchor, slot);
  });
  return slots;
}

/** Take the rows back out of the page. */
export function removeSlots(slots) {
  for (const slot of slots) slot.remove();
}
