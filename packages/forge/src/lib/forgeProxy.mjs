const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Trust the accepted socket, never Host or forwarded headers, to identify this dev origin. */
export function forgeOriginGate(forgeUrl) {
  const target = new URL(forgeUrl);
  if (target.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(target.hostname) || target.username || target.password) {
    throw new Error('Forge API proxy requires an HTTP loopback target');
  }
  return (req, res, next) => {
    if (!/^\/api(?:\/|\?|$)/.test(req.url || '') || safeMethods.has(req.method)) return next();
    const address = req.socket.localAddress;
    const host = address === '127.0.0.1' || address === '::ffff:127.0.0.1' ? '127.0.0.1' : address === '::1' ? '[::1]' : null;
    const port = req.socket.localPort;
    const authority = host && Number.isInteger(port) && port > 0 ? `${host}${port === 80 ? '' : `:${port}`}` : null;
    if (!authority || req.socket.encrypted || req.headers.host !== authority || req.headers.origin !== `http://${authority}`) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ detail: 'Forge commands require the exact native app loopback origin.' }));
      return;
    }
    // Only the validated same-origin browser request crosses the dev proxy trust boundary.
    // Keep cookies and anti-CSRF tokens intact for Forge's independent checks.
    req.headers.origin = target.origin;
    next();
  };
}

export function forgeOwnerProxy(forgeUrl) {
  const gate = forgeOriginGate(forgeUrl);
  return {
    name: 'forge-native-owner-origin',
    configureServer(server) { server.middlewares.use(gate); },
  };
}
