import type { ReactNode } from "react";

import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import type { EvmNetwork } from "@dynamic-labs/types";

import { arcTestnet } from "../lib/arcChain";
import { dynamicEnvironmentId } from "../lib/env";

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

export function DynamicProvider({ children }: { children: ReactNode }) {
  return (
    <DynamicContextProvider
      settings={{
        appName: "Lattice",
        environmentId: dynamicEnvironmentId!,
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
