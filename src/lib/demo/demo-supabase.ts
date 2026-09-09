/**
 * A no-op stand-in for the browser Supabase client, used only in demo mode.
 *
 * The screens that matter get their data from fixtures in the query modules,
 * but plenty of incidental reads still go through this client (rate cards,
 * checklists, contract versions). Without a stub those hit the real project
 * with a fake partner id and come back 400, which litters the console and
 * paints error states mid-presentation. Here they resolve to "nothing found".
 *
 * Every builder method returns the same thenable, so any chain length works and
 * awaiting at any point yields `{ data, error: null }`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type Result = { data: unknown; error: null; count: number | null; status: number; statusText: string };

function result(data: unknown): Result {
  return { data, error: null, count: 0, status: 200, statusText: "OK" };
}

/** Chain terminators that yield one row rather than a list. */
const SINGLE = new Set(["single", "maybeSingle"]);

function makeBuilder(single: boolean): unknown {
  const settle = () => Promise.resolve(result(single ? null : []));

  const target = function () {} as unknown as Record<string | symbol, unknown>;

  return new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        // Awaiting the builder resolves the query.
        return (onFulfilled: (v: Result) => unknown, onRejected?: (e: unknown) => unknown) =>
          settle().then(onFulfilled, onRejected);
      }
      if (prop === "catch") return (fn: (e: unknown) => unknown) => settle().catch(fn);
      if (prop === "finally") return (fn: () => void) => settle().finally(fn);
      if (typeof prop === "symbol") return undefined;
      // Any builder method (select/eq/order/limit/insert/update/…) chains on.
      return () => makeBuilder(single || SINGLE.has(prop));
    },
  });
}

export function createDemoSupabaseClient(): SupabaseClient {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
    unsubscribe: () => Promise.resolve("ok"),
  };

  const client = {
    from: () => makeBuilder(false),
    rpc: () => makeBuilder(false),
    channel: () => channel,
    removeChannel: () => Promise.resolve("ok"),
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        remove: async () => ({ data: null, error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: "" }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
  };

  return client as unknown as SupabaseClient;
}
