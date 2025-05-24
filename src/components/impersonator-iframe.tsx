import { useEffect, useRef } from "react";
import { useAccount, useWalletClient } from "wagmi";

const SDK_VERSION = "7.6.0";
const SITE_URL = "https://swap.cow.fi";
const IFRAME_SANDBOX_ALLOWED_FEATURES =
  "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-downloads allow-orientation-lock";

export function ImpersonatorIframe() {
  const iframeRef = useRef<any>(null);
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

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
        version: SDK_VERSION,
        data,
      };

      iframeRef.current?.contentWindow?.postMessage(message, SITE_URL! || "*");
    }
  };

  useEffect(() => {
    const handleMessage = async (event: any) => {
      if (event.origin !== SITE_URL) return;
      if (!walletClient) return;

      const eventID = event.data?.id;
      const params = event.data?.params;
      const method = event.data?.method;

      switch (method) {
        case "getSafeInfo": {
          console.log("< < < known method:", "getSafeInfo", event);
          sendMessageToIFrame({
            eventID,
            data: {
              safeAddress: address,
              chainId: 11155111,
              owners: [],
              threshold: 1,
              isReadOnly: false,
            },
          });
          return;
        }

        case "rpcCall": {
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

        case "sendTransactions": {
          console.log("< < < known method:", "sendTransactions", event);
          try {
            const tx = params.txs[0];

            const txRequest = {
              to: tx.to as `0x${string}`,
              data: tx.data as `0x${string}`,
              value: BigInt(tx.value),
              gas: BigInt(tx.gas),
            };

            const data = await walletClient.sendTransaction(txRequest);

            sendMessageToIFrame({ eventID, data });
            return;
          } catch (error) {
            console.log("event > sendTransactions > error", error);

            sendMessageToIFrame({ eventID, error });
            return;
          }
        }

        case "signTypedMessage": {
          console.log("< < < known method:", "signTypedMessage", event);
          try {
            const data = await walletClient.request({
              method: params.call,
              params: params.params,
            });
            sendMessageToIFrame({ eventID, data });
            return;
          } catch (error) {
            console.log("event > signTypedMessage > error", error);

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
  }, [walletClient, address]);

  return (
    <iframe
      id={`iframe-${SITE_URL}`}
      ref={iframeRef}
      src={SITE_URL}
      style={{ width: "100%", height: "600px", border: "none" }}
      sandbox={IFRAME_SANDBOX_ALLOWED_FEATURES}
    />
  );
}
