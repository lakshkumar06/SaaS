import type { ReactNode } from "react";

import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import type { EvmNetwork } from "@dynamic-labs/types";

import { arcTestnet } from "../lib/arcChain";

const arcDynamicNetwork: EvmNetwork = {
  blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
  chainId: arcTestnet.id,
  iconUrls: [],
  isTestnet: true,
  name: arcTestnet.name,
  nativeCurrency: {
    decimals: arcTestnet.nativeCurrency.decimals,
    name: arcTestnet.nativeCurrency.name,
    symbol: arcTestnet.nativeCurrency.symbol,
  },
  networkId: arcTestnet.id,
  rpcUrls: [...arcTestnet.rpcUrls.default.http],
  vanityName: arcTestnet.name,
};

const environmentId =
  import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID || "missing-dynamic-environment-id";

export function DynamicProvider({ children }: { children: ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        appName: "Stake & Advance",
        environmentId,
        initialAuthenticationMode: "connect-only",
        overrides: {
          evmNetworks: [arcDynamicNetwork],
        },
        walletConnectors: [EthereumWalletConnectors],
      }}
    >
      {children}
    </DynamicContextProvider>
  );
}
