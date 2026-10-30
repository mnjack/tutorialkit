// The text the Tutor drawer shows for one tutor reply. A citation is the quote and the plain
// words Forge's citation.cite built for its source (Learning Forge D43): never an evidence
// badge, and never a name made up here when Forge sent none.
export const WITHHELD = 'The tutor could not ground an answer in this lesson’s sources.';

function citationText(citation) {
  const source = typeof citation?.citation === 'string' ? citation.citation.trim() : '';
  return `“${citation?.quote ?? ''}”` + (source ? ` (${source})` : '');
}

export function tutorReplyText(result) {
  if (['probe', 'probe_retry', 'resolved'].includes(result?.status)) return result.display?.content || '';
  if (['validated', 'repaired'].includes(result?.status)) {
    return (result.display?.segments || []).map((segment) => [
      ...(segment.kind === 'general_knowledge' ? [segment.label] : []), segment.text,
      ...(segment.citations || []).map(citationText),
    ].join('\n')).join('\n\n');
  }
  if (result?.status === 'withheld') return WITHHELD;
  return '';
}
