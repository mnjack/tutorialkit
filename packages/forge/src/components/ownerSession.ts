import { establishOwnerSession } from '@forge/bootstrap';

// One owner session with Forge for the whole page (the tutor drawer, hands-on boxes and rating
// rows share it). A failed attempt is forgotten, so the next request tries again.
let ownerSession: ReturnType<typeof establishOwnerSession> | undefined;

/** Resolves once Forge's owner session is ready; throws when Forge isn't available. */
export async function connected() {
  ownerSession ||= establishOwnerSession();
  if ((await ownerSession).kind !== 'ready') {
    ownerSession = undefined;
    throw new Error('Forge is not available');
  }
}
