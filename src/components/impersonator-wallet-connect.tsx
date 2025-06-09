import { useAccount, useWalletClient } from "wagmi";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWalletConnectClient } from "@/hooks/use-wallet-connect-client.ts";

import { Address, Hex } from "viem";

import { useModalPromise } from "@/hooks/use-modal-promise";

function ImpersonatorWalletConnect() {
  const { address, chainId } = useAccount();
  const { data: client } = useWalletConnectClient();
  const [wcUrl, setWcUrl] = useState("");
  const { data: walletClient } = useWalletClient();
  const { openModal } = useModalPromise();

  useEffect(() => {
    if (!client || !address || !chainId || !walletClient) {
      console.log("not ready", client, address, chainId, walletClient);
      return;
    }

    client.on("session_proposal", async (proposal) => {
      await client.approve({
        id: proposal.id,
        namespaces: {
          eip155: {
            chains: ["eip155:11155111"],
            accounts: [`eip155:${chainId}:${address}`],
            methods: [
              "eth_sendTransaction",
              "personal_sign",
              "eth_sign",
              "eth_signTypedData",
              "eth_signTypedData_v3",
              "eth_signTypedData_v4",
              // "wallet_getCapabilities",
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

    client.on("session_event", (event) => {
      console.log("session_event", event);
    })

    client.on("session_request", async (event) => {
      const { method, params } = event.params.request;
      console.log("session_request", method, params);

      const formattedParams = params.map((p: string | object) => {
        if (typeof p === "string") {
          try {
            return JSON.parse(p);
          } catch {
            return p;
          }
        }
        return p;
      });

      try {
        if (method === "eth_sendTransaction") {
          const txRequest = formattedParams[0] as {
            to: string;
            data?: string;
            from?: string;
            value?: string;
            gas?: string;
            gasPrice?: string;
            [key: string]: any;
          };

          try {
            const hash = await openModal({
              to: txRequest.to as Address,
              data: txRequest.data as Hex,
            });

            await client.respond({
              topic: event.topic,
              response: {
                id: event.id,
                jsonrpc: "2.0",
                result: hash,
              },
            });
          } catch (err: any) {
            console.error("failed to decode:", err);
            await client.respond({
              topic: event.topic,
              response: {
                id: event.id,
                jsonrpc: "2.0",
                error: {
                  code: err.code || 4001,
                  message: err.message || "Error decoding tx",
                },
              },
            });
          }

          return;
        }
      } catch (err: any) {
        console.log(err);
      }

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
        <Button variant="secondary" onClick={handleDisconnect}>
          Disconnect
        </Button>
        <Button onClick={handleConnect}>Connect</Button>
      </div>
    </div>
  );
}

export default ImpersonatorWalletConnect;
