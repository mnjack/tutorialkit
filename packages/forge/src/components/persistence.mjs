export function editKey(digest, pathname) {
  return `forge-tutorialkit:edits:${digest}:${pathname.replace(/\/$/, '')}`;
}

export function editorSnapshot(store) {
  const snapshot = store.takeSnapshot().files;
  return Object.fromEntries(Object.entries(store.documents.get())
    .filter(([, doc]) => doc?.type === 'file' && !doc.loading && typeof doc.value === 'string')
    // Editor updates precede the asynchronous WebContainer write. Keep the latest text.
    .map(([path, doc]) => [path, typeof doc.value === 'string' ? doc.value : snapshot[path.slice(1)]]));
}

export function restoredFiles(raw, documents) {
  const saved = JSON.parse(raw || '{}');
  if (saved.version !== 1 || !saved.files || typeof saved.files !== 'object') return [];
  return Object.entries(saved.files).filter(([path, text]) =>
    documents[path]?.type === 'file' && !documents[path].loading && typeof text === 'string');
}
