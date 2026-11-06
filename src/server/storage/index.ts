import "server-only";
import { appUrl, getEnv } from "@/lib/env";
import { LocalStorage } from "./local";
import { R2Storage } from "./r2";
import type { ObjectStorage } from "./types";

let instance: ObjectStorage | undefined;

export function getStorage(): ObjectStorage {
  if (instance) return instance;
  const env = getEnv();
  if (env.STORAGE_DRIVER === "local") {
    instance = new LocalStorage(env.LOCAL_STORAGE_DIR, `${env.TOKEN_HASH_SECRET}:local-storage`, appUrl());
  } else {
    instance = new R2Storage({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      bucket: env.R2_BUCKET!,
      endpoint: env.R2_ENDPOINT,
    });
  }
  return instance;
}

export type { ObjectStorage } from "./types";
