import { isAddress, type Address } from "viem";

const defaultApiBase = "http://127.0.0.1:8788";
const defaultStakeAndAdvanceAddress = "0xAe632832f9a588DeCe304B1f1cCb946B3cEd79e1";

function normalizeOptionalEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBackendBase(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/$/, "") : defaultApiBase;
}

function parseAddress(value: string, envVarName: string) {
  if (!isAddress(value)) {
    throw new Error(`${envVarName} must be a valid EVM address. Received: ${value}`);
  }

  return value as Address;
}

export const backendBase = normalizeBackendBase(import.meta.env.VITE_API_BASE_URL);
export const dynamicEnvironmentId = normalizeOptionalEnv(
  import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID,
);
export const stakeAndAdvanceAddress = parseAddress(
  normalizeOptionalEnv(import.meta.env.VITE_STAKE_AND_ADVANCE_ADDRESS) ??
    defaultStakeAndAdvanceAddress,
  "VITE_STAKE_AND_ADVANCE_ADDRESS",
);

export const frontendWarnings = [
  ...(dynamicEnvironmentId
    ? []
    : [
        "Wallet connect is disabled until VITE_DYNAMIC_ENVIRONMENT_ID is set. The dashboard is running in read-only mode.",
      ]),
];
