import { Account } from "@/components/account.tsx";
import { WalletOptions } from "@/components/wallet-options.tsx";
import { useAccount } from "wagmi";
import { NetworkSelector } from "@/components/common/select-network.tsx";
import { Waypoints } from "lucide-react";
import { useModalPromise } from "@/hooks/use-modal-promise";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useSafeApp } from "@/providers/safe-app-provider";
import { noop } from "@tanstack/react-query";

export const Header = () => {
  const { isConnected } = useAccount();
  const { usePermitRouter, setUsePermitRouter } = useModalPromise();
  const { safeInfo } = useSafeApp();

  return (
    <div className="bg-card text-card-foreground border gap-2 p-2 mb-2 flex items-center">
      <div className="grow flex gap-2 items-center">
        <Waypoints />
        PROXY-DAPP
      </div>

      {isConnected && safeInfo !== null && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="permit-router"
                  checked={false}
                  onCheckedChange={noop}
                  disabled
                />
                <Label htmlFor="permit-router" className="cursor-pointer text-sm">
                  Use Permit (EIP-2612) if available
                </Label>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              You cannot use Permit (EIP-2612) if you are using a Safe.
            </TooltipContent>
        </Tooltip>
        
        </TooltipProvider>
      )}
      {isConnected && safeInfo === null && (
        <div className="flex items-center gap-2">
        <Checkbox
          id="permit-router"
          checked={usePermitRouter}
          onCheckedChange={setUsePermitRouter}
        />
        <Label htmlFor="permit-router" className="cursor-pointer text-sm">
          Use Permit (EIP-2612) if available
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
