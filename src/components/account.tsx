import { useAccount, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button.tsx";
import { EthAddress } from "@/components/common/eth-address.tsx";
import { Identicon } from "@polkadot/react-identicon";
import { LogOut } from "lucide-react";

export function Account() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();

  return (
    <div className="flex gap-2">
      <Identicon
        value={address}
        size={32}
        theme="ethereum"
        className="identicon rounded-full overflow-hidden size-[32px]"
      />
      <EthAddress address={address} />
      <Button variant="destructive" onClick={() => disconnect()}>
        <LogOut />
      </Button>
    </div>
  );
}
