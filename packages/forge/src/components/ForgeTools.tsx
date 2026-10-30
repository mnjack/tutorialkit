import { useEffect, useRef, useState } from 'react';
import { sendMentorTurnStream } from '@forge/api';
import { establishOwnerSession } from '@forge/bootstrap';
import { tutorialStore } from '@tutorialkit-webcontainer';
import { followLessonPages } from './drawerSession.mjs';
import { tutorReplyText } from './tutorReply.mjs';

type Binding = { course_slug: string; lesson_id: string; title: string; assigned_evidence?: { mentor_anchor: string; evidence_ref: { corpus_slug?: string } }[] };
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
  // True when this page may belong to a course whose metadata could not be bound.
  const [unavailable, setUnavailable] = useState(false);
  const [probe, setProbe] = useState<{ id: string; request: any; retry: boolean } | null>(null);
  const activeRoute = useRef('');

  useEffect(() => followLessonPages({
    store: tutorialStore, page: document, view: window, fetcher: fetch,
    ui: {
      reset(pathname: string) {
        activeRoute.current = pathname;
        setBinding(null);
        setTurns([]);
        setProbe(null);
        setError('');
        setSaveStatus('');
        setUnavailable(false);
      },
      bind: setBinding,
      status: setSaveStatus,
      unavailable: () => setUnavailable(true),
    },
  }), []);

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
        throw new Error('Open Forge locally to reconnect the tutor.');
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
      const text = tutorReplyText(result);
      if (!text) throw new Error('The tutor returned no validated response.');
      setTurns((rows) => [...rows, { role: 'Tutor', text }]);
      const { probe_id: _id, probe_result: _result, ...baseRequest } = request;
      setProbe(result.probe ? { id: result.probe.id, request: baseRequest, retry: result.status !== 'probe' } : null);
      setMessage('');
    } catch (cause) {
      if (activeRoute.current === sentRoute && route() === sentRoute) setError(cause instanceof Error ? cause.message : 'Tutor unavailable');
    } finally { setBusy(false); }
  }

  return <>
    <a href={`${__FORGE_URL__.replace(/\/$/, '')}/create`} className="forge-create-link">Create / import in Forge</a>
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="forge-tutor">Tutor</button>
    {open && <aside id="forge-tutor" className="forge-tutor" aria-label="Lesson tutor">
      <div className="forge-tutor-heading"><strong>{binding?.title || 'Lesson tutor'}</strong><button onClick={() => setOpen(false)} aria-label="Close tutor">×</button></div>
      <p role="status" aria-live="polite">{saveStatus}</p>
      <p>Edits and conversations are not grades or proof of mastery.</p>
      {!binding?.course_slug ? !unavailable && <p>This page isn't part of a Forge course. Create or import a course in Forge to ask its source-grounded tutor.</p> : <>
        <div className="forge-tutor-turns" aria-live="polite">{turns.map((turn, index) => <p key={index}><strong>{turn.role}</strong><br />{turn.text}</p>)}</div>
        {error && <p role="alert">{error}</p>}
        {probe ? <div className="forge-probe-actions">
          <button disabled={busy} onClick={() => send({ ...probe.request, probe_id: probe.id, probe_result: 'resolved' })}>Resolved</button>
          <button disabled={busy} onClick={() => send({ ...probe.request, probe_id: probe.id, probe_result: 'failed' })}>{probe.retry ? 'Retry tutor' : 'Still failing'}</button>
        </div> : <form onSubmit={(event) => { event.preventDefault(); if (message.trim()) send({ lesson: { id: binding.lesson_id, title: binding.title, check_open: false }, learner_msg: message.trim(), assigned_evidence: binding.assigned_evidence || [] }, message.trim()); }}>
          <label htmlFor="forge-tutor-message">Ask about this lesson</label>
          <textarea id="forge-tutor-message" value={message} onChange={(event) => setMessage(event.target.value)} disabled={busy} />
          <button disabled={busy || !message.trim()}>{busy ? 'Thinking…' : 'Send'}</button>
        </form>}
      </>}
    </aside>}
  </>;
}
