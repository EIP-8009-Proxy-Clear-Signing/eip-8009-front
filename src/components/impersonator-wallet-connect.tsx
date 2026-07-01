import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWalletConnectClient } from "@/hooks/use-wallet-connect-client.ts";
import { useSafeApp } from "@/providers/safe-app-provider";

import { Address, Hex, isAddressEqual } from "viem";

import { useModalPromise } from "@/hooks/use-modal-promise";
import { getContract } from "@/lib/contracts";
import {
  decodeSafeExecTransaction,
  validateSafeRouterSetup,
} from "@/lib/safe-utils";
import { shortenAddress } from "@/lib/utils";

type WalletConnectAccountMode = "wallet" | "safeRouter";

const signingMethods = new Set([
  "personal_sign",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
]);

const toQuantity = (value: bigint) => `0x${value.toString(16)}`;

type SessionPeer = {
  name?: string;
  url?: string;
  icons?: string[];
};

type SignClientLike = {
  session: { getAll: () => { peer?: { metadata?: SessionPeer } }[] };
};

const getActivePeer = (client: SignClientLike): SessionPeer | null =>
  client.session.getAll()[0]?.peer?.metadata ?? null;

function ImpersonatorWalletConnect() {
  const { address, chainId } = useAccount();
  const { data: client } = useWalletConnectClient();
  const [wcUrl, setWcUrl] = useState("");
  const [sessionPeer, setSessionPeer] = useState<SessionPeer | null>(null);
  const hasActiveSession = sessionPeer !== null;
  const [accountMode, setAccountMode] =
    useState<WalletConnectAccountMode>("safeRouter");
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { openModal } = useModalPromise();
  const { safeInfo, safe } = useSafeApp();

  const safeRouterAddress = useMemo(() => {
    if (!chainId) return undefined;

    try {
      return getContract("safeRouter", chainId).address;
    } catch {
      return undefined;
    }
  }, [chainId]);

  const walletConnectAddress =
    accountMode === "safeRouter" && safeRouterAddress
      ? safeRouterAddress
      : address;
  const walletConnectAccount =
    chainId && walletConnectAddress
      ? `eip155:${chainId}:${walletConnectAddress}`
      : undefined;
  const walletConnectChain = chainId ? `eip155:${chainId}` : undefined;

  useEffect(() => {
    if (!client) return;
    setSessionPeer(getActivePeer(client));
  }, [client]);

  useEffect(() => {
    if (
      !client ||
      !address ||
      !chainId ||
      !walletClient ||
      !publicClient ||
      !walletConnectAddress ||
      !walletConnectAccount ||
      !walletConnectChain
    ) {
      console.log(
        "not ready",
        client,
        address,
        chainId,
        walletClient,
        publicClient,
        walletConnectAddress,
      );
      return;
    }

    client.on("session_proposal", async (proposal) => {
      await client.approve({
        id: proposal.id,
        namespaces: {
          eip155: {
            chains: [walletConnectChain],
            accounts: [walletConnectAccount],
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
      setSessionPeer(
        proposal.params.proposer.metadata ?? getActivePeer(client),
      );
    });

    client.on("session_event", (event) => {
      console.log("session_event", event);
    });

    client.on("session_delete", () => {
      setSessionPeer(getActivePeer(client));
    });

    client.on("session_request", async (event) => {
      const { method, params } = event.params.request;
      console.log("session_request", method, params);

      const formattedParams = Array.isArray(params)
        ? params.map((p: string | object) => {
            if (typeof p === "string") {
              try {
                return JSON.parse(p);
              } catch {
                return p;
              }
            }
            return p;
          })
        : [];

      if (method === "eth_accounts" || method === "eth_requestAccounts") {
        await client.respond({
          topic: event.topic,
          response: {
            id: event.id,
            jsonrpc: "2.0",
            result: [walletConnectAddress],
          },
        });
        return;
      }

      if (accountMode === "safeRouter") {
        if (method === "eth_getBalance") {
          const requestedAddress = formattedParams[0] as Address | undefined;

          if (
            requestedAddress &&
            walletConnectAddress &&
            isAddressEqual(requestedAddress, walletConnectAddress)
          ) {
            const balance = await publicClient.getBalance({ address });

            await client.respond({
              topic: event.topic,
              response: {
                id: event.id,
                jsonrpc: "2.0",
                result: toQuantity(balance),
              },
            });
            return;
          }
        }

        if (method === "eth_estimateGas") {
          const txRequest = formattedParams[0] as
            | {
                to?: string;
                data?: string;
                from?: string;
                value?: string;
                [key: string]: unknown;
              }
            | undefined;

          if (
            txRequest?.from &&
            walletConnectAddress &&
            isAddressEqual(txRequest.from as Address, walletConnectAddress)
          ) {
            await client.respond({
              topic: event.topic,
              response: {
                id: event.id,
                jsonrpc: "2.0",
                result: toQuantity(5_000_000n),
              },
            });
            return;
          }
        }
      }

      if (accountMode === "safeRouter" && signingMethods.has(method)) {
        await client.respond({
          topic: event.topic,
          response: {
            id: event.id,
            jsonrpc: "2.0",
            error: {
              code: 4001,
              message: "SafeRouter account cannot sign messages directly",
            },
          },
        });
        return;
      }

      try {
        if (method === "eth_sendTransaction") {
          const txRequest = formattedParams[0] as {
            to: string;
            data?: string;
            from?: string;
            value?: string;
            gas?: string;
            gasPrice?: string;
            [key: string]: unknown;
          };

          try {
            let hash: string;
            const requestData = (txRequest.data ?? "0x") as Hex;
            const safeExecution = decodeSafeExecTransaction(
              txRequest.to as Address,
              requestData,
            );

            if (safeExecution) {
              const safeRouter = getContract("safeRouter", chainId);

              await validateSafeRouterSetup({
                publicClient,
                safe: safeExecution.safe,
                safeRouter: safeRouter.address,
                executor: address,
              });

              hash = await openModal({
                to: safeExecution.safeTx.to,
                data: safeExecution.safeTx.data,
                value: 0n,
                safeContext: safeExecution,
              });
            } else if (safe && safeInfo) {
              try {
                const result = await safe.txs.send({
                  txs: [
                    {
                      to: txRequest.to as Address,
                      data: requestData,
                      value: String(
                        txRequest.value ? BigInt(txRequest.value) : 0n,
                      ),
                    },
                  ],
                });
                hash = result.safeTxHash;
              } catch (error) {
                console.error("Safe transaction failed:", error);
                throw error;
              }
            } else {
              hash = await openModal({
                to: txRequest.to as Address,
                data: requestData,
                value: txRequest.value,
              });
            }

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
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          method,
          params: formattedParams as never,
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
  }, [
    client,
    address,
    chainId,
    walletClient,
    publicClient,
    openModal,
    safe,
    safeInfo,
    walletConnectAddress,
    walletConnectAccount,
    walletConnectChain,
    accountMode,
  ]);

  async function handleConnect() {
    if (!client || !walletConnectAddress) return;
    await client.pair({ uri: wcUrl });
    setWcUrl("");
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
    setSessionPeer(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2">
        <Label>Connect as</Label>
        <Tabs
          value={accountMode}
          onValueChange={(value) =>
            setAccountMode(value as WalletConnectAccountMode)
          }
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="wallet">Wallet</TabsTrigger>
            <TabsTrigger value="safeRouter" disabled={!safeRouterAddress}>
              SafeRouter
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {walletConnectAddress && (
          <p className="text-xs text-muted-foreground">
            {shortenAddress(walletConnectAddress)}
          </p>
        )}
      </div>
      {hasActiveSession ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          {sessionPeer?.icons?.[0] && (
            <img
              src={sessionPeer.icons[0]}
              alt=""
              className="h-5 w-5 shrink-0 rounded-sm"
            />
          )}
          <div className="min-w-0 flex flex-col">
            <span className="text-sm font-medium leading-tight">
              {sessionPeer?.name || "Connected"}
            </span>
            {sessionPeer?.url && (
              <span className="truncate text-xs text-muted-foreground leading-tight">
                {sessionPeer.url.replace(/^https?:\/\//, "")}
              </span>
            )}
          </div>
        </div>
      ) : (
        <Input
          placeholder="wc:"
          onChange={(e) => setWcUrl(e.target.value)}
          value={wcUrl}
        />
      )}
      <div className="grid grid-cols-1 gap-2">
        {hasActiveSession ? (
          <Button variant="secondary" onClick={handleDisconnect}>
            Disconnect
          </Button>
        ) : (
          <Button onClick={handleConnect} disabled={!walletConnectAddress}>
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}

export default ImpersonatorWalletConnect;
