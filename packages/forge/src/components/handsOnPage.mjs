// Where a hands-on lesson's paste boxes go. Forge exports each step under a heading that reads
// "Step N: ..." (learning_forge/hands_on.py render_markdown); a step's box goes after the last
// element of its section, before the next step's heading. If the page doesn't show exactly
// those headings, every box goes at the end of the lesson instead, in step order, so a box is
// never lost.

export const SLOT_CLASS = 'forge-hands-on-slot';

function sectionEnd(heading) {
  let last = heading;
  while (last.nextElementSibling && last.nextElementSibling.tagName !== 'H2') last = last.nextElementSibling;
  return last;
}

/** One new element per step, already in the page, in step order. */
export function mountPoints(content, steps, doc) {
  const headings = [...content.querySelectorAll('h2')].filter((heading) => heading.parentElement === content);
  const found = steps.map((step) => headings.find((heading) => (heading.textContent || '').trim().startsWith(`Step ${step.number}:`)));
  const placed = found.every(Boolean) && new Set(found).size === steps.length;
  return steps.map((step, index) => {
    const slot = doc.createElement('div');
    slot.className = SLOT_CLASS;
    slot.dataset.step = step.id;
    if (placed) sectionEnd(found[index]).insertAdjacentElement('afterend', slot);
    else content.appendChild(slot);
    return slot;
  });
}

/** Take the boxes back out of the page. */
export function removeMountPoints(slots) {
  for (const slot of slots) slot.remove();
}
