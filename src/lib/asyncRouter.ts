import express from 'express';

// Express 4 doesn't catch rejected promises from async route handlers on its
// own — an unhandled rejection there crashes the whole process instead of
// producing a clean error response. Wrapping every route-registration method
// once here means no individual route needs its own try/catch.
//
// `router.get` is also (confusingly) shared with Express's internal settings
// lookup pattern on `app` — a single-argument call with no handler. Only wrap
// calls that look like an actual `(path, singleHandler)` route registration
// and pass everything else straight through untouched.
const routeMethods = ['get', 'post', 'patch', 'delete', 'put'] as const;

export function createAsyncRouter(): express.Router {
  const router = express.Router();
  for (const method of routeMethods) {
    const original = router[method].bind(router);
    router[method] = ((...args: unknown[]) => {
      const [path, handler] = args;
      if (args.length !== 2 || typeof path !== 'string' || typeof handler !== 'function') {
        return (original as (...args: unknown[]) => unknown)(...args);
      }
      return original(path, ((req, res, next) => {
        Promise.resolve((handler as express.RequestHandler)(req, res, next)).catch(next);
      }) as express.RequestHandler);
    }) as typeof router[typeof method];
  }
  return router;
}
