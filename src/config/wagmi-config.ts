import { http, createConfig } from "wagmi";
import { base, mainnet, sepolia } from "wagmi/chains";
import { injected, metaMask, safe } from "wagmi/connectors";

import { CHAINS } from "@/config/chains.ts";

export const wagmiConfig = createConfig({
  chains: CHAINS,
  connectors: [injected(), metaMask(), safe()],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [sepolia.id]: http(),
  },
});
