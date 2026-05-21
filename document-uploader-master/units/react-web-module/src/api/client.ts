import { Client, cacheExchange, fetchExchange, subscriptionExchange } from "urql";
import { createClient as createWsClient } from "graphql-ws";
import type { DocuploaderClientOptions } from "../types.js";

/**
 * Construct an urql Client wired for HTTP queries/mutations and a
 * graphql-transport-ws subscription transport. The OIDC token is read on
 * every request via `getToken()` so callers can plug their host
 * application's token-refresh logic in directly.
 */
export function createDocuploaderClient(opts: DocuploaderClientOptions): Client {
  const wsClient = createWsClient({
    url: opts.graphqlWsUrl,
    connectionParams: async () => ({ authorization: `Bearer ${await opts.getToken()}` }),
    retryAttempts: 5,
  });

  return new Client({
    url: opts.graphqlUrl,
    fetchOptions: async () => ({
      headers: { authorization: `Bearer ${await opts.getToken()}` },
    }),
    exchanges: [
      cacheExchange,
      fetchExchange,
      subscriptionExchange({
        forwardSubscription: (request) => ({
          subscribe: (sink) => {
            const dispose = wsClient.subscribe(
              { ...request, query: request.query ?? "" },
              {
                next: (value) => sink.next(value),
                error: (err) => sink.error(err),
                complete: () => sink.complete(),
              },
            );
            return { unsubscribe: dispose };
          },
        }),
      }),
    ],
  });
}
