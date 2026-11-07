import { http, createConfig, type CreateConnectorFn } from "wagmi";
import { base, mainnet, sepolia } from "wagmi/chains";
import { injected, metaMask, safe } from "wagmi/connectors";

import { CHAINS } from "@/config/chains.ts";
import { ledgerSpeculos, ledgerUsb } from "@/ledger/connector";

const SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

const connectors: CreateConnectorFn[] = [injected(), metaMask(), safe()];

if (import.meta.env.VITE_LEDGER === "1") {
  const broadcast = import.meta.env.VITE_LEDGER_BROADCAST === "1";
  connectors.push(ledgerUsb({ rpcUrl: SEPOLIA_RPC_URL, broadcast }));
  if (import.meta.env.VITE_LEDGER_SPECULOS_URL) {
    connectors.push(
      ledgerSpeculos({
        url: import.meta.env.VITE_LEDGER_SPECULOS_URL,
        rpcUrl: SEPOLIA_RPC_URL,
        broadcast,
      }),
    );
  }
}

export const wagmiConfig = createConfig({
  chains: CHAINS,
  connectors,
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [sepolia.id]: http(SEPOLIA_RPC_URL),
  },
});
