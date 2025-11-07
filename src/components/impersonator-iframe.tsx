import { useEffect, useRef, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useWalletClient,
} from 'wagmi';
import {
  getSDKVersion,
  Methods,
  SignMessageParams,
} from '@safe-global/safe-apps-sdk';
import { Input } from '@/components/ui/input.tsx';
import { useModalPromise } from '@/hooks/use-modal-promise';
import { useDebounce } from 'use-debounce';
import { useSafeApp } from '@/providers/safe-app-provider';
import { Button } from './ui/button';
import { RotateCcw } from 'lucide-react';

const IFRAME_SANDBOX_ALLOWED_FEATURES =
  'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-downloads allow-orientation-lock';

export function ImpersonatorIframe() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [iframeKey, setIframeKey] = useState(0);
  // const [url, setUrl] = useState('https://uniswap-eip.ilya-kubariev.workers.dev/#/swap');
  const [url, setUrl] = useState('https://app.uniswap.org/swap');
  // const [url, setUrl] = useState('http://localhost:3000/swap');
  const [deferredUrl] = useDebounce(url, 500);
  const publicClient = usePublicClient();
  const { openModal } = useModalPromise();
  const { sendTransactionAsync } = useSendTransaction();
  const { safeInfo, safe } = useSafeApp();

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

      iframeRef.current?.contentWindow?.postMessage(
        message,
        deferredUrl! || '*'
      );
    }
  };

  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;
    if (!address) return;

    const payload = {
      type: 'WALLET_UPDATE',
      payload: {
        address,
        chainId,
      },
    };

    iframeRef.current.contentWindow.postMessage(
      payload,
      new URL(deferredUrl).origin
    );

    console.log('[Parent] sent message to iframe:', payload);
  }, [address, chainId, deferredUrl]);

  useEffect(() => {
    const handleMessage = async (event: any) => {
      if (event.origin !== new URL(deferredUrl).origin) return;
      if (!walletClient) return;

      // Handle debug messages from Uniswap
      if (event.data?.type === 'UNISWAP_DEBUG') {
        const { debugType, data, timestamp } = event.data;
        const time = new Date(timestamp).toLocaleTimeString();

        console.group(`🔍 [${time}] Uniswap Debug: ${debugType}`);
        console.log(data);
        console.groupEnd();
        return;
      }

      const eventID = event.data?.id;
      const params = event.data?.params;
      const method = event.data?.method;

      switch (method) {
        case Methods.getSafeInfo: {
          console.log('< < < known method:', 'getSafeInfo', event);

          if (safeInfo) {
            sendMessageToIFrame({
              eventID,
              data: safeInfo,
            });
          } else {
            sendMessageToIFrame({
              eventID,
              data: {
                safeAddress: address,
                chainId,
                owners: [address],
                threshold: 1,
                isReadOnly: false,
              },
            });
          }
          return;
        }

        case Methods.rpcCall: {
          console.log('< < < known method:', 'rpcCall', event);
          try {
            const data = await walletClient.request({
              method: params.call,
              params: params.params,
            });
            sendMessageToIFrame({ eventID, data });
            return;
          } catch (error) {
            console.log('event > rpcCall > error', error);

            sendMessageToIFrame({ eventID, error });
            return;
          }
        }

        case Methods.sendTransactions: {
          if (!address || !publicClient) {
            console.log('sendTransactions > no address');
            return;
          }
          console.log('< < < known method:', 'sendTransactions', event);
          try {
            const data = [];

            console.log(`sendTransactions > tx length >`, params.txs);

            for (let q = 0; q < params.txs.length; q++) {
              const tx = params.txs[q];

              if (safe && safeInfo) {
                try {
                  const result = await safe.txs.send({
                    txs: [tx],
                  });
                  data.push(result.safeTxHash);
                } catch (error) {
                  console.error('Safe transaction failed:', error);
                  throw error;
                }
              } else {
                if (tx.data.includes('095ea7b3')) {
                  const hash = await sendTransactionAsync({
                    to: tx.to as `0x${string}`,
                    value: BigInt(tx.value),
                    data: tx.data,
                  });
                  data.push(hash);
                  try {
                    await publicClient.waitForTransactionReceipt({
                      hash,
                    });
                  } catch (error) {
                    console.error(error);
                  }
                  continue;
                }

                console.log(`sendTransactions > tx id ${q} >`);
                const hash = await openModal(tx);
                data.push(hash);
              }
            }

            sendMessageToIFrame({ eventID, data: data[0] });
            return;
          } catch (error) {
            console.log('event > sendTransactions > error', error);

            sendMessageToIFrame({ eventID, error });
            return;
          }
        }

        case Methods.signTypedMessage: {
          console.log('< < < known method:', 'signTypedMessage', event);

          try {
            console.log('signTypedMessage > ', params);
            const { typedData } = params as any;
            const data = {
              signature: await walletClient.signTypedData(typedData),
            };
            console.log('signTypedMessage > data', data);
            sendMessageToIFrame({ eventID, data });
            return;
          } catch (error) {
            console.log('event > signTypedMessage > error', error);

            sendMessageToIFrame({ eventID, error });
            return;
          }
        }

        case Methods.signMessage: {
          console.log('< < < known method:', 'signMessage', event);
          try {
            const { message } = params as SignMessageParams;
            const data = walletClient.signMessage({
              message,
            });
            sendMessageToIFrame({ eventID, data });
            return;
          } catch (error) {
            console.log('event > signMessage > error', error);

            sendMessageToIFrame({ eventID, error });
            return;
          }
        }

        default: {
          console.log('? ? ? Unknown method:', method, event);
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [
    walletClient,
    address,
    deferredUrl,
    openModal,
    chainId,
    publicClient,
    safe,
    safeInfo,
  ]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row gap-2">
        <Input
          placeholder="url"
          onChange={(e) => setUrl(e.target.value)}
          value={url}
        />
        <Button
          onClick={() => {
            if (iframeRef.current) {
              setIframeKey(iframeKey + 1);
            }
          }}
        >
          <RotateCcw />
        </Button>
      </div>
      <div className="border rounded-md overflow-hidden">
        <iframe
          key={iframeKey}
          id={`iframe-${url}`}
          ref={iframeRef}
          src={deferredUrl}
          style={{
            width: '100%',
            height: 'calc(100vh - 159px)',
            border: 'none',
          }}
          sandbox={IFRAME_SANDBOX_ALLOWED_FEATURES}
        />
      </div>
    </div>
  );
}
