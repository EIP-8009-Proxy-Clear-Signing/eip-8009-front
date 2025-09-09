import { useAccount, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button.tsx";
import { EthAddress } from "@/components/common/eth-address.tsx";
import { Identicon } from "@polkadot/react-identicon";
import { LogOut } from "lucide-react";
import { useSafeApp } from "@/providers/safe-app-provider";

export function Account() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { safeInfo } = useSafeApp();
  const isInSafeContext = window.parent !== window || safeInfo;

  const uiAddress = isInSafeContext ? safeInfo?.safeAddress : address;

  return (
    <div className="flex gap-2">
      <Identicon
        value={uiAddress}
        size={32}
        theme="ethereum"
        className="identicon rounded-full overflow-hidden size-[32px]"
      />
      <EthAddress address={uiAddress} />
      <Button variant="destructive" onClick={() => disconnect()}>
        <LogOut />
      </Button>
    </div>
  );
}
