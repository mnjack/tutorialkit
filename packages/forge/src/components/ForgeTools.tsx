import { useEffect, useRef, useState } from 'react';
import { sendMentorTurnStream } from '@forge/api';
import { establishOwnerSession } from '@forge/bootstrap';
import { tutorialStore } from '@tutorialkit-webcontainer';
import { editKey, editorSnapshot, restoredFiles } from './persistence.mjs';
import { manifestForRoute, lessonAt } from './manifest.mjs';

type Binding = { course_slug: string; lesson_id: string; title: string; assigned_evidence?: { mentor_anchor: string; evidence_ref: { corpus_slug?: string } }[] };
type Manifest = { course_digest: string; lessons: Record<string, Binding> };
let ownerSession: ReturnType<typeof establishOwnerSession> | undefined;
const route = () => window.location.pathname.replace(/\/$/, '') || '/';

export default function ForgeTools() {
  const [binding, setBinding] = useState<Binding | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [turns, setTurns] = useState<{ role: string; text: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [probe, setProbe] = useState<{ id: string; request: any; retry: boolean } | null>(null);
  const activeRoute = useRef('');

  useEffect(() => {
    let disposed = false;
    let manifest: Manifest | null = null;
    let manifestRoute = "";
    let loadSequence = 0;
    let unsubscribeDocuments = () => {};
    let flush = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let currentKey = '';

    const stopSaving = () => {
      clearTimeout(timer);
      unsubscribeDocuments();
      unsubscribeDocuments = () => {};
      flush();
      flush = () => {};
    };
    const activate = () => {
      if (!manifest || manifestRoute !== route() || disposed || !tutorialStore.lessonFullyLoaded.get()) return;
      const pathname = route();
      const lesson = lessonAt(manifest, pathname);
      const key = editKey(manifest.course_digest, pathname);
      if (currentKey === key) return;
      stopSaving();
      currentKey = key;
      activeRoute.current = pathname;
      setBinding(lesson || null);
      setTurns([]);
      setProbe(null);
      setError('');
      if (!lesson) return;
      try {
        for (const [path, text] of restoredFiles(localStorage.getItem(key), tutorialStore.documents.get())) {
          tutorialStore.updateFile(path, text);
        }
        localStorage.setItem(`forge-tutorialkit:resume:${manifest.course_digest}`, pathname);
        setSaveStatus('Edits saved in this browser');
      } catch {
        setSaveStatus('Browser storage unavailable; edits will not survive reopening');
      }
      // Capture each edit synchronously; unload must not read a different lesson's store.
      let saved = editorSnapshot(tutorialStore);
      flush = () => {
        try {
          localStorage.setItem(key, JSON.stringify({ version: 1, files: saved }));
        } catch {
          if (!disposed) setSaveStatus('Browser storage unavailable; edits will not survive reopening');
        }
      };
      unsubscribeDocuments = tutorialStore.documents.subscribe(() => {
        if (!tutorialStore.lessonFullyLoaded.get()) return;
        saved = editorSnapshot(tutorialStore);
        clearTimeout(timer);
        timer = setTimeout(flush, 300);
      });
    };
    const changed = async () => {
      const pathname = route();
      const sequence = ++loadSequence;
      stopSaving();
      currentKey = '';
      manifest = null;
      manifestRoute = '';
      activeRoute.current = pathname;
      setBinding(null);
      setTurns([]);
      setProbe(null);
      setSaveStatus('');
      try {
        const loaded = await manifestForRoute(pathname);
        if (disposed || sequence !== loadSequence || pathname !== route()) return;
        manifest = loaded;
        manifestRoute = pathname;
        activate();
      } catch {
        if (!disposed && sequence === loadSequence) setSaveStatus('Course metadata unavailable; saved edits and mentor are disconnected');
      }
    };
    const unsubscribeLoaded = tutorialStore.lessonFullyLoaded.subscribe((loaded) => {
      if (loaded) activate();
      else { stopSaving(); currentKey = ''; }
    });
    changed();
    document.addEventListener('astro:page-load', changed);
    window.addEventListener('pagehide', stopSaving);
    return () => {
      disposed = true;
      stopSaving();
      unsubscribeLoaded();
      document.removeEventListener('astro:page-load', changed);
      window.removeEventListener('pagehide', stopSaving);
    };
  }, []);

  async function send(request: any, ownerText?: string) {
    if (!binding || busy) return;
    const sentRoute = activeRoute.current;
    setBusy(true);
    setError('');
    if (ownerText) setTurns((rows) => [...rows, { role: 'You', text: ownerText }]);
    try {
      ownerSession ||= establishOwnerSession();
      if ((await ownerSession).kind !== 'ready') {
        ownerSession = undefined;
        throw new Error('Open Forge locally to reconnect the mentor.');
      }
      let result;
      try {
        result = await sendMentorTurnStream(binding.course_slug, request, () => {});
      } catch (cause) {
        if (!request.probe_id) throw cause;
        // A lost response may have rotated the server token. Restore its current
        // observation without submitting that stale result a second time.
        const { probe_id: _id, probe_result: _result, ...baseRequest } = request;
        result = await sendMentorTurnStream(binding.course_slug, baseRequest, () => {});
      }
      if (activeRoute.current !== sentRoute || route() !== sentRoute) return;
      let text = '';
      if (['probe', 'probe_retry', 'resolved'].includes(result.status)) text = result.display?.content || '';
      else if (['validated', 'repaired'].includes(result.status)) {
        text = (result.display?.segments || []).map((segment: any) => [segment.text,
          ...(segment.citations || []).map((citation: any) => {
            const source = binding.assigned_evidence?.find((item) => item.mentor_anchor === citation.anchor)?.evidence_ref?.corpus_slug;
            const label = citation.source_course_label || source?.replaceAll('-', ' ') || 'Course source passage';
            const evidence = ['OK', 'REVIEW', 'GAP'].includes(citation.evidence_status)
              ? ` — ${citation.evidence_label || citation.evidence_status}` : '';
            return `“${citation.quote}” (${label}${evidence})`;
          })].join('\n')).join('\n\n');
      } else if (result.status === 'withheld') text = 'The mentor could not ground an answer in this lesson’s sources.';
      if (!text) throw new Error('The mentor returned no validated response.');
      setTurns((rows) => [...rows, { role: 'Mentor', text }]);
      const { probe_id: _id, probe_result: _result, ...baseRequest } = request;
      setProbe(result.probe ? { id: result.probe.id, request: baseRequest, retry: result.status !== 'probe' } : null);
      setMessage('');
    } catch (cause) {
      if (activeRoute.current === sentRoute && route() === sentRoute) setError(cause instanceof Error ? cause.message : 'Mentor unavailable');
    } finally { setBusy(false); }
  }

  return <>
    <a href={`${__FORGE_URL__.replace(/\/$/, '')}/create`} className="forge-create-link">Create / import in Forge</a>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="forge-mentor">Mentor</button>
    {open && <aside id="forge-mentor" className="forge-mentor" aria-label="Lesson mentor">
      <div className="forge-mentor-heading"><strong>{binding?.title || 'Lesson mentor'}</strong><button onClick={() => setOpen(false)} aria-label="Close mentor">×</button></div>
      <p>{saveStatus}</p>
      <p>Edits and conversations are not grades or proof of mastery.</p>
      {!binding?.course_slug ? <p>This example is not connected to a Forge course. Create or import a course to use its source-grounded mentor.</p> : <>
        <div className="forge-mentor-turns" aria-live="polite">{turns.map((turn, index) => <p key={index}><strong>{turn.role}</strong><br />{turn.text}</p>)}</div>
        {error && <p role="alert">{error}</p>}
        {probe ? <div className="forge-probe-actions">
          <button disabled={busy} onClick={() => send({ ...probe.request, probe_id: probe.id, probe_result: 'resolved' })}>Resolved</button>
          <button disabled={busy} onClick={() => send({ ...probe.request, probe_id: probe.id, probe_result: 'failed' })}>{probe.retry ? 'Retry mentor' : 'Still failing'}</button>
        </div> : <form onSubmit={(event) => { event.preventDefault(); if (message.trim()) send({ lesson: { id: binding.lesson_id, title: binding.title, check_open: false }, learner_msg: message.trim(), assigned_evidence: binding.assigned_evidence || [] }, message.trim()); }}>
          <label htmlFor="forge-mentor-message">Ask about this lesson</label>
          <textarea id="forge-mentor-message" value={message} onChange={(event) => setMessage(event.target.value)} disabled={busy} />
          <button disabled={busy || !message.trim()}>{busy ? 'Thinking…' : 'Send'}</button>
        </form>}
      </>}
    </aside>}
  </>;
}
