import * as React from "react";
import { Connector, useConnect } from "wagmi";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";

export function WalletOptions() {
  const { connectors, connect } = useConnect();

  return (
    <Card>
      <CardContent className="gap-2 flex justify-center">
        {connectors.map((connector) => (
          <WalletOption
            key={connector.uid}
            connector={connector}
            onClick={() => connect({ connector })}
          />
        ))}
      </CardContent>
    </Card>
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
