import { useAccount, useDisconnect, useEnsAvatar, useEnsName } from "wagmi";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";

export function Account() {
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address });
  const { data: ensAvatar } = useEnsAvatar({ name: ensName! });

  return (
    <Card>
      <CardContent className="flex justify-center gap-2 items-center">
        {ensAvatar && <img alt="ENS Avatar" src={ensAvatar} />}
        {address && <div>{ensName ? `${ensName} (${address})` : address}</div>}
        <Button onClick={() => disconnect()}>Disconnect</Button>
      </CardContent>
    </Card>
  );
}
