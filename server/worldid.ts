import { encodePacked, keccak256 } from "viem";

import type { ServerConfig } from "./config";

export type WorldIdVerifyRequest = {
  user: `0x${string}`;
  nullifier_hash?: `0x${string}`;
  id?: string;
  proof?: Record<string, unknown>;
  signal?: string;
};

export type WorldIdVerifyResult = {
  ok: boolean;
  nullifierHash: `0x${string}`;
  mode: string;
  detail?: unknown;
};

export async function verifyWorldId(
  config: ServerConfig,
  body: WorldIdVerifyRequest,
): Promise<WorldIdVerifyResult> {
  if (config.worldIdMode === "dev") {
    const nullifierHash =
      body.nullifier_hash ??
      keccak256(
        encodePacked(
          ["address", "string", "string"],
          [body.user, config.worldAction, body.id ?? body.user],
        ),
      );

    return { ok: true, nullifierHash, mode: "dev" };
  }

  if (!config.worldVerifyUrl || !config.worldAppId) {
    throw new Error("cloud World ID mode requires WORLD_VERIFY_URL and WORLD_APP_ID");
  }
  if (!body.proof) throw new Error("cloud World ID mode requires `proof`");

  const response = await fetch(config.worldVerifyUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      app_id: config.worldAppId,
      action: config.worldAction,
      signal: body.signal ?? body.user,
      ...body.proof,
    }),
  });
  const detail = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { ok: false, nullifierHash: "0x", mode: "cloud", detail };
  }

  const nullifierHash = (detail as { nullifier_hash?: `0x${string}` }).nullifier_hash;
  if (!nullifierHash) throw new Error("World ID response missing nullifier_hash");

  return { ok: true, nullifierHash, mode: "cloud", detail };
}
