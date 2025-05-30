import * as React from "react";
import { Connector, useConnect } from "wagmi";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function WalletOptions() {
  const { connectors, connect } = useConnect();

  return (
    <div>
      <Dialog>
        <DialogTrigger>
          <Button>Connect Wallet</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Wallet</DialogTitle>
            <DialogDescription>
              <div className="grid grid-cols-1 gap-2">
                {connectors.map((connector) => (
                  <WalletOption
                    key={connector.uid}
                    connector={connector}
                    onClick={() => connect({ connector })}
                  />
                ))}
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WalletOption({
  connector,
  onClick,
}: {
  connector: Connector;
  onClick: () => void;
}) {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const provider = await connector.getProvider();
      setReady(!!provider);
    })();
  }, [connector]);

  return (
    <Button disabled={!ready} onClick={onClick}>
      {connector.name}
    </Button>
  );
}
