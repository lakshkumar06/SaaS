import http from "node:http";
import { pathToFileURL } from "node:url";

import { configFromEnv, type ServerConfig } from "./config";
import { signPersonhoodVoucher } from "./voucher";
import { verifyWorldId, type WorldIdVerifyRequest } from "./worldid";

function send(res: http.ServerResponse, code: number, body: unknown): void {
  const payload = JSON.stringify(body, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
  res.writeHead(code, { "content-type": "application/json" });
  res.end(payload);
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

export function buildHandler(config: ServerConfig) {
  return async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    try {
      const url = req.url ?? "/";

      if (req.method === "GET" && url === "/health") {
        return send(res, 200, {
          ok: true,
          worldIdMode: config.worldIdMode,
          chainId: config.chainId,
          contract: config.contract,
        });
      }

      if (req.method === "POST" && url === "/worldid/sign") {
        return send(res, 200, {
          action: config.worldAction,
          appId: config.worldAppId,
          mode: config.worldIdMode,
        });
      }

      if (req.method === "POST" && url === "/worldid/verify") {
        const body = (await readJson(req)) as Partial<WorldIdVerifyRequest>;
        if (!body.user) return send(res, 400, { error: "missing `user`" });

        const result = await verifyWorldId(config, body as WorldIdVerifyRequest);
        if (!result.ok) {
          return send(res, 401, { error: "World ID verification failed", detail: result.detail });
        }

        const deadline = BigInt(Math.floor(Date.now() / 1000) + config.voucherTtlSeconds);
        const signature = await signPersonhoodVoucher({
          signerKey: config.worldIdSignerKey,
          chainId: config.chainId,
          verifyingContract: config.contract,
          user: body.user,
          nullifierHash: result.nullifierHash,
          deadline,
        });

        return send(res, 200, {
          user: body.user,
          nullifierHash: result.nullifierHash,
          deadline,
          signature,
          mode: result.mode,
        });
      }

      return send(res, 404, { error: "not found", path: url });
    } catch (error) {
      return send(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export async function startServer(
  config: ServerConfig,
): Promise<{ url: string; port: number; close: () => Promise<void> }> {
  const server = http.createServer(buildHandler(config));
  await new Promise<void>((resolve) => server.listen(config.port, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.loadEnvFile();
  } catch {
    // The deployment environment can provide variables directly.
  }

  const config = configFromEnv();
  startServer(config).then(({ url }) => {
    console.log(`[server] listening on ${url}`);
    console.log(`[server] worldIdMode=${config.worldIdMode} chainId=${config.chainId}`);
  });
}
