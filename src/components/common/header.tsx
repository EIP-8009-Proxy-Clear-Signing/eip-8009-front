import { Account } from "@/components/account.tsx";
import { WalletOptions } from "@/components/wallet-options.tsx";
import { useAccount } from "wagmi";
import { NetworkSelector } from "@/components/common/select-network.tsx";
import { Waypoints } from "lucide-react";
import { useModalPromise } from "@/hooks/use-modal-promise";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const Header = () => {
  const { isConnected } = useAccount();
  const { usePermitRouter, setUsePermitRouter } = useModalPromise();

  return (
    <div className="bg-card text-card-foreground border gap-2 p-2 mb-2 flex items-center">
      <div className="grow flex gap-2 items-center">
        <Waypoints />
        PROXY-DAPP
      </div>

      {isConnected && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="permit-router"
            checked={usePermitRouter}
            onCheckedChange={setUsePermitRouter}
          />
          <Label htmlFor="permit-router" className="cursor-pointer text-sm">
            Use Permit (EIP-2612)
          </Label>
        </div>
      )}

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
