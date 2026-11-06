import type { NextApiRequest, NextApiResponse } from "next";
import { appUrl } from "@/lib/env";
import { publicRouteError } from "@/server/http";
import { toWebRequest, sendWebResponse } from "@/server/node-bridge";
import { getPublicContext } from "@/server/public/context";
import { handleAudioRequest } from "@/server/public/handlers";

/**
 * Stable enclosure endpoint, publicly reachable as /audio/:guid/:token(.ext)
 * via a rewrite in next.config.ts. See handleAudioRequest for semantics.
 */
export const config = {
  api: { bodyParser: false, responseLimit: false },
  maxDuration: 300,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }
  const guid = typeof req.query.guid === "string" ? req.query.guid : "";
  const token = typeof req.query.token === "string" ? req.query.token : "";
  let response: Response;
  try {
    response = await handleAudioRequest(toWebRequest(req, appUrl()), guid, token, getPublicContext());
  } catch (error) {
    response = publicRouteError(error);
  }
  await sendWebResponse(response, res, method);
}
