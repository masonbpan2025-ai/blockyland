const SIGNAL_PATH = '/ws/share';
const RENDEZVOUS_ID = 'all-shared-world-rooms';

export async function onRequest({ request, env, next }) {
  const { pathname } = new URL(request.url);

  if (pathname === SIGNAL_PATH) {
    const id = env.SHARE_ROOMS.idFromName(RENDEZVOUS_ID);
    return env.SHARE_ROOMS.get(id).fetch(request);
  }

  // The browser uses this only to show helpful status and same-network links.
  // A Pages deployment has no private LAN interfaces to advertise.
  if (pathname === '/api/share/health') {
    return Response.json({ ok: true, path: SIGNAL_PATH });
  }
  if (pathname === '/api/share/info') {
    return Response.json({ path: SIGNAL_PATH, lan: [] });
  }

  return next();
}
