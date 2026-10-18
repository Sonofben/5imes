/**
 * Next.js calls onRequestError for every error thrown while rendering a page, running a
 * server action or handling a route. We log it as one JSON line with the same digest the
 * user sees on the error page ("reference …"), so support can find it in `docker logs`.
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const { log } = await import("@/lib/log");
  const e = err as { message?: string; digest?: string; stack?: string; code?: string };
  log.error("request.error", {
    ref: e?.digest, message: e?.message, code: e?.code, stack: e?.stack,
    method: request.method, path: request.path.split("?")[0], route: context.routePath, type: context.routeType,
  });
}
