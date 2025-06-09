import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWalletClient, useWriteContract } from "wagmi";
import {
  getSDKVersion,
  Methods,
  SignMessageParams,
} from "@safe-global/safe-apps-sdk";
import { Input } from "@/components/ui/input.tsx";
import { useChecks } from "@/hooks/use-checks";
import { getProxyContract } from "@/lib/contracts";
import { Address, erc20Abi, zeroAddress } from "viem";
import { useModalPromise } from "@/hooks/use-modal-promise";

const IFRAME_SANDBOX_ALLOWED_FEATURES =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-downloads allow-orientation-lock";

export function ImpersonatorIframe() {
  const iframeRef = useRef<any>(null);
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [url, setUrl] = useState("https://swap.cow.fi");
  const { checks } = useChecks();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { openModal } = useModalPromise();

  const sendMessageToIFrame = ({
    eventID,
    error,
    data,
  }: {
    eventID: any;
    data?: any;
    error?: any;
  }) => {
    if (iframeRef) {
      const message = {
        id: eventID,
        success: !!data,
        error,
        version: getSDKVersion(),
        data,
      };

      iframeRef.current?.contentWindow?.postMessage(message, url! || "*");
    }
  };

  useEffect(() => {
    const handleMessage = async (event: any) => {
      if (event.origin !== url) return;
      if (!walletClient) return;

      const eventID = event.data?.id;
      const params = event.data?.params;
      const method = event.data?.method;

      switch (method) {
        case Methods.getSafeInfo: {
          console.log("< < < known method:", "getSafeInfo", event);
          sendMessageToIFrame({
            eventID,
            data: {
              safeAddress: address,
              chainId,
              owners: [],
              threshold: 1,
              isReadOnly: false,
            },
          });
          return;
        }

        case Methods.rpcCall: {
          console.log("< < < known method:", "rpcCall", event);
          try {
            const data = await walletClient.request({
              method: params.call,
              params: params.params,
            });
            sendMessageToIFrame({ eventID, data });
            return;
          } catch (error) {
            console.log("event > rpcCall > error", error);

            sendMessageToIFrame({ eventID, error });
            return;
          }
        }

        case Methods.sendTransactions: {
          if (!address || !publicClient) {
            console.log("sendTransactions > no address");
            return;
          }
          console.log("< < < known method:", "sendTransactions", event);
          try {
            const data = [];

            console.log(`sendTransactions > tx length >`, params.txs);

            for (let q = 0; q < params.txs.length; q++) {
              if (params.txs[q].data.includes("095ea7b3")) {
                console.log("skip approve");
                data.push("0x")
                continue;
              }
              
              console.log(`sendTransactions > tx id ${q} >`);
              const hash = await openModal(params.txs[q]);
              console.log("hash", hash);
              data.push(hash);
            }

            sendMessageToIFrame({ eventID, data });
            return;
          } catch (error) {
            console.log("event > sendTransactions > error", error);

            sendMessageToIFrame({ eventID, error });
            return;
          }
        }

        case Methods.signTypedMessage: {
          console.log("< < < known method:", "signTypedMessage", event);
          try {
            const { message } = params as SignMessageParams;
            const data = walletClient.signMessage({
              message,
            });
            sendMessageToIFrame({ eventID, data });
            return;
          } catch (error) {
            console.log("event > signTypedMessage > error", error);

            sendMessageToIFrame({ eventID, error });
            return;
          }
        }

        case Methods.signMessage: {
          console.log("< < < known method:", "signMessage", event);
          try {
            const { message } = params as SignMessageParams;
            const data = walletClient.signMessage({
              message,
            });
            sendMessageToIFrame({ eventID, data });
            return;
          } catch (error) {
            console.log("event > signMessage > error", error);

            sendMessageToIFrame({ eventID, error });
            return;
          }
        }

        default: {
          console.log("? ? ? Unknown method:", method, event);
          break;
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [walletClient, address, url, openModal]);

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="url"
        onChange={(e) => setUrl(e.target.value)}
        value={url}
      />
      <div className="border rounded-md overflow-hidden">
        <iframe
          id={`iframe-${url}`}
          ref={iframeRef}
          src={url}
          style={{
            width: "100%",
            height: "calc(100vh - 159px)",
            border: "none",
          }}
          sandbox={IFRAME_SANDBOX_ALLOWED_FEATURES}
        />
      </div>
    </div>
  );
}
