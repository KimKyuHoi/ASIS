import { handleRequest, parseBaseline, type StatsDb } from './handler';

/** wrangler.toml 의 [[d1_databases]] binding = "DB", [vars] INSTALLS_BASELINE. */
type Env = { DB: StatsDb; INSTALLS_BASELINE?: string };

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env.DB, new Date(), parseBaseline(env.INSTALLS_BASELINE));
  },
};
