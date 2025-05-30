import { Account } from "@/components/account.tsx";
import { WalletOptions } from "@/components/wallet-options.tsx";
import { useAccount } from "wagmi";
import { NetworkSelector } from "@/components/common/select-network.tsx";
import { Waypoints } from "lucide-react";

export const Header = () => {
  const { isConnected } = useAccount();

  return (
    <div className="bg-card text-card-foreground border gap-2 p-2 mb-2 flex items-center">
      <div className="grow flex gap-2 items-center">
        <Waypoints />
        PROXY-DAPP
      </div>

      {isConnected ? (
        <>
          <NetworkSelector /> <Account />
        </>
      ) : (
        <WalletOptions />
      )}
    </div>
  );
};
