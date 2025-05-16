import SignClient from "@walletconnect/sign-client";
import { Button } from "@/components/ui/button.tsx";

import { useState } from "react";
import { Input } from "@/components/ui/input.tsx";
import { env } from "@/env.ts";

function ImpersonatorWalletConnect() {
  const [address, setAddress] = useState<string>(
    "0x044159C76E5AC088d836B98b683f31D32AbDdBec",
  );

  const [wcUrl, setWcUrl] = useState<string>("");

  async function handleConnect() {
    const client = await SignClient.init({
      projectId: env.VITE_WALLET_CONNECT_PROJECT_ID,
    });

    await client.pair({ uri: wcUrl });

    client.on("session_proposal", async (proposal) => {
      await client.approve({
        id: proposal.id,
        namespaces: {
          eip155: {
            accounts: [`eip155:1:${address}`],
            methods: [
              "eth_sendTransaction",
              "personal_sign",
              "eth_signTypedData",
            ],
            events: ["accountsChanged", "chainChanged"],
          },
        },
      });

      console.log("Connected with address:", address);
    });

    client.on("session_request", async (event) => {
      console.log("Incoming request:", event);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="address"
        onChange={(e) => setAddress(e.target.value)}
        value={address}
      />
      <Input
        placeholder="wc:"
        onChange={(e) => setWcUrl(e.target.value)}
        value={wcUrl}
      />
      <Button onClick={handleConnect}>Connect</Button>
    </div>
  );
}

export default ImpersonatorWalletConnect;
