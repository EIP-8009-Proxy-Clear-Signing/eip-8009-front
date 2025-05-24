import { useAccount } from "wagmi";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { CHAINS } from "@/config/chains.ts";
import { useWalletClient } from "wagmi";

import { useWalletConnectClient } from "@/hooks/use-wallet-connect-client.ts";

function ImpersonatorWalletConnect() {
  const { address } = useAccount();
  const { data: client } = useWalletConnectClient();
  const [wcUrl, setWcUrl] = useState("");
  const [selectedChainId, setSelectedChainId] = useState(String(CHAINS[2].id));
  const { data: walletClient } = useWalletClient();

  useEffect(() => {
    if (!client || !address || !selectedChainId || !walletClient) return;

    client.on("session_proposal", async (proposal) => {
      await client.approve({
        id: proposal.id,
        namespaces: {
          eip155: {
            accounts: [`eip155:${selectedChainId}:${address}`],
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
  }, [client, address, selectedChainId, walletClient]);

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

  if (!address) return null;

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="wc:"
        onChange={(e) => setWcUrl(e.target.value)}
        value={wcUrl}
      />
      <Select value={selectedChainId} onValueChange={setSelectedChainId}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select network" />
        </SelectTrigger>
        <SelectContent>
          {CHAINS.map((chain) => (
            <SelectItem key={chain.id} value={String(chain.id)}>
              {chain.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" onClick={handleDisconnect}>
        Disconnect
      </Button>
      <Button onClick={handleConnect}>Connect</Button>
    </div>
  );
}

export default ImpersonatorWalletConnect;
