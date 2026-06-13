export type WorldIdMode = "dev" | "cloud";

export type ServerConfig = {
  port: number;
  chainId: number;
  contract: `0x${string}`;
  worldIdSignerKey: `0x${string}`;
  worldIdMode: WorldIdMode;
  worldAction: string;
  worldAppId: string | undefined;
  worldVerifyUrl: string | undefined;
  voucherTtlSeconds: number;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function hexPrivateKey(name: string): `0x${string}` {
  const value = required(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 0x-prefixed 32-byte hex private key`);
  }
  return value as `0x${string}`;
}

function contractAddress(name: string): `0x${string}` {
  const value = required(name);
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${name} must be a 0x-prefixed EVM address`);
  }
  return value as `0x${string}`;
}

export function configFromEnv(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: Number(process.env.PORT ?? 8788),
    chainId: Number(process.env.ARC_CHAIN_ID ?? process.env.CHAIN_ID ?? 5042002),
    contract: contractAddress("STAKE_AND_ADVANCE_ADDRESS"),
    worldIdSignerKey: hexPrivateKey("WORLD_ID_SIGNER_PRIVATE_KEY"),
    worldIdMode: (process.env.WORLD_ID_MODE as WorldIdMode | undefined) ?? "dev",
    worldAction: process.env.WORLD_ACTION ?? "claim-free-subscription",
    worldAppId: process.env.WORLD_APP_ID,
    worldVerifyUrl: process.env.WORLD_VERIFY_URL,
    voucherTtlSeconds: Number(process.env.VOUCHER_TTL_SECONDS ?? 900),
    ...overrides,
  };
}
