import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { looksLikeSecret } from '@forge/lib/handsOn.js';
import { getRatings, saveRating } from '@forge/api';
import { lessonAt, manifestForRoute, normalizeRoute } from './manifest.mjs';
import { connected } from './ownerSession';
import { RatingRow } from './ratingRow.mjs';
import { notSaved, ratingSaves, SAVED } from './ratingSaves.mjs';
import { ratingSlots, removeSlots } from './ratingsPage.mjs';

// Rating buttons (Learning Forge D71, D81): a quiet row of thumbs under each block Forge listed
// for this page in the course manifest (a lesson's sections and quizzes, a hands-on task, an
// exercise). One press saves with the course in Forge; the reason chips and an optional note
// then update the same rating. Nothing pops up, and a note shaped like a key is never kept.

type Block = { id: string; kind: string; name: string; section?: number };
type Rating = { vote: string | null; reasons: string[]; note: string };
type Reason = { id: string; label: string };

export default function Ratings() {
  const [page, setPage] = useState<{ blocks: Block[]; slots: HTMLElement[]; reasons: Reason[] } | null>(null);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [lines, setLines] = useState<Record<string, string>>({});
  const sequence = useRef(0);
  const saves = useRef<ReturnType<typeof ratingSaves> | null>(null);

  useEffect(() => {
    let disposed = false;
    let mounted: HTMLElement[] = [];
    const clear = () => {
      saves.current?.stop();
      saves.current = null;
      removeSlots(mounted);
      mounted = [];
      setPage(null);
      setRatings({});
      setLines({});
    };
    const load = async () => {
      const turn = ++sequence.current;
      clear();
      const path = window.location.pathname;
      let manifest: any = null;
      let lesson: any = null;
      try {
        manifest = await manifestForRoute(path, fetch);
        lesson = manifest ? lessonAt(manifest, path) : null;
      } catch { return; }
      if (disposed || turn !== sequence.current || !lesson?.course_slug || !Array.isArray(lesson.blocks) || !lesson.blocks.length) return;
      const slug = lesson.course_slug;
      const route = normalizeRoute(path);
      const version = manifest.course_digest;
      const queue = ratingSaves({
        load: async () => {
          await connected();
          return (await getRatings(slug, route)).ratings;
        },
        send: async (block_id, rating) => {
          await connected();
          return saveRating(slug, { route, block_id, vote: rating.vote, reasons: rating.reasons, note: rating.note, course_version: version });
        },
        show: setRatings,
        report: (blockId, error) => setLines((current) => ({ ...current, [blockId]: error === null ? SAVED : notSaved(error) })),
      });
      saves.current = queue;
      // The rows appear once Forge has said what it holds for the page, so they open showing the
      // saved thumbs, chips and notes. If it couldn't say, they still appear: a press reads them
      // again before it sends anything, and says so on its row when Forge still can't answer.
      await queue.loaded().catch(() => {});
      if (disposed || saves.current !== queue) return;
      const content = document.querySelector('.markdown-content');
      if (!content) return;
      const slots = ratingSlots(content, lesson.blocks, document);
      mounted = slots;
      setPage({ blocks: lesson.blocks, slots, reasons: Array.isArray(manifest.rating_reasons) ? manifest.rating_reasons : [] });
    };
    load();
    document.addEventListener('astro:page-load', load);
    return () => {
      disposed = true;
      document.removeEventListener('astro:page-load', load);
      saves.current?.stop();
      removeSlots(mounted);
    };
  }, []);

  if (!page) return null;
  const press = (blockId: string, change: object) => {
    setLines((current) => ({ ...current, [blockId]: '' }));
    saves.current?.press(blockId, change);
  };
  return <>
    {page.blocks.map((block, index) => createPortal(
      <RatingRow block={block} reasons={page.reasons} rating={ratings[block.id]} line={lines[block.id] || ''}
        named={page.slots[index].dataset.named === 'true'} guard={looksLikeSecret}
        onVote={(vote: string) => press(block.id, { vote })}
        onReason={(reason: string) => press(block.id, { reason })}
        onNote={(note: string) => press(block.id, { note })} />,
      page.slots[index], block.id))}
  </>;
}
