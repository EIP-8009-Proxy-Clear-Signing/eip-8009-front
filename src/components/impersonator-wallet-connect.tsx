import { useAccount } from "wagmi";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWalletClient } from "wagmi";
import { useWalletConnectClient } from "@/hooks/use-wallet-connect-client.ts";

function ImpersonatorWalletConnect() {
  const { address, chainId } = useAccount();
  const { data: client } = useWalletConnectClient();
  const [wcUrl, setWcUrl] = useState("");
  const { data: walletClient } = useWalletClient();

  useEffect(() => {
    if (!client || !address || !chainId || !walletClient) return;

    client.on("session_proposal", async (proposal) => {
      await client.approve({
        id: proposal.id,
        namespaces: {
          eip155: {
            accounts: [`eip155:${chainId}:${address}`],
            methods: [
              "eth_sendTransaction",
              "personal_sign",
              "eth_sign",
              "eth_signTypedData",
              "eth_signTypedData_v3",
              "eth_signTypedData_v4",
              "wallet_getCapabilities",
              "eth_accounts",
              "eth_requestAccounts",
              "wallet_addEthereumChain",
              "wallet_switchEthereumChain",
              "wallet_watchAsset",
              "eth_getPermitNonce",
              "permitNonce",
            ],
            events: ["accountsChanged", "chainChanged"],
          },
        },
      });
    });

    client.on("session_request", async (event) => {
      const { method, params } = event.params.request;

      const formattedParams = params?.map((param: string) => {
        try {
          return JSON.parse(param);
        } catch (e) {
          return param;
        }
      });

      try {
        const result = await walletClient.request({
          // @ts-ignore
          method,
          params: formattedParams,
        });

        await client.respond({
          topic: event.topic,
          response: {
            id: event.id,
            jsonrpc: "2.0",
            result,
          },
        });
      } catch (error: any) {
        console.log("error method", method, error);
        await client.respond({
          topic: event.topic,
          response: {
            id: event.id,
            jsonrpc: "2.0",
            error: {
              code: error.code || 4001,
              message: error.message || "Request error",
            },
          },
        });
      }
    });

    return () => {
      if (client) {
        client.removeAllListeners("session_proposal");
        client.removeAllListeners("session_request");
        client.removeAllListeners("session_connect");
        client.removeAllListeners("session_delete");
      }
    };
  }, [client, address, chainId, walletClient]);

  async function handleConnect() {
    if (!client) return;
    await client.pair({ uri: wcUrl });
  }

  async function handleDisconnect() {
    if (!client) return;
    const sessions = client.session.getAll();
    await Promise.all(
      sessions.map((session) =>
        client.disconnect({
          topic: session.topic,
          reason: {
            code: 6000,
            message: "User disconnected",
          },
        }),
      ),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="wc:"
        onChange={(e) => setWcUrl(e.target.value)}
        value={wcUrl}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="bg-red-100"
          variant="secondary"
          onClick={handleDisconnect}
        >
          Disconnect
        </Button>
        <Button
          variant="secondary"
          className="bg-green-100"
          onClick={handleConnect}
        >
          Connect
        </Button>
      </div>
    </div>
  );
}

export default ImpersonatorWalletConnect;
