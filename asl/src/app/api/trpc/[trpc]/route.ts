import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { log } from "~/server/log";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    // Server faults are errors; refusals the caller caused (bad input, not signed in, rate limited, ...) are
    // warnings, and plain "not found" is just information.
    onError: ({ path, error }) => {
      const fields = { path: path ?? "<no-path>", code: error.code, message: error.message };
      if (error.code === "INTERNAL_SERVER_ERROR") log.error("trpc failure", { ...fields, cause: error.cause });
      else if (error.code === "NOT_FOUND") log.info("trpc not found", fields);
      else log.warn("trpc refused", fields);
    },
  });

export { handler as GET, handler as POST };
