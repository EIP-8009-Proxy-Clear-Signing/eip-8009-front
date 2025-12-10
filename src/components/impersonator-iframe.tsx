import { useCallback, useEffect, useRef, useState } from 'react';
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

  const sendMessageToIFrame = useCallback(({
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

      // console.log('[ImpersonatorIframe] sendMessageToIFrame called:', {
      //   eventID,
      //   hasData: !!data,
      //   hasError: !!error,
      //   message,
      //   targetOrigin: deferredUrl || '*',
      //   hasContentWindow: !!iframeRef.current?.contentWindow,
      // });

      try {
        iframeRef.current?.contentWindow?.postMessage(
          message,
          deferredUrl! || '*'
        );
        // console.log('[ImpersonatorIframe] Message posted successfully');
      } catch (err) {
        console.error('[ImpersonatorIframe] Failed to post message:', err);
      }
    } else {
      console.error('[ImpersonatorIframe] Cannot send message - no iframeRef');
    }
  }, [deferredUrl]);

  const originIsUniswap = (origin: string) => {
    const uniswapOrigins = [
      'https://app.uniswap.org',
      'https://uniswap-eip.ilya-kubariev.workers.dev',
    ];
    return uniswapOrigins.includes(origin);
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

      // console.log('[ImpersonatorIframe] Received message:', {
      //   eventID,
      //   method,
      //   hasParams: !!params,
      //   origin: event.origin,
      // });

      switch (method) {
        case Methods.getSafeInfo: {
          // console.log('[ImpersonatorIframe] getSafeInfo request received');
          // console.log('[ImpersonatorIframe] Current safeInfo:', safeInfo);
          // console.log('[ImpersonatorIframe] Current address:', address);
          // console.log('[ImpersonatorIframe] Current chainId:', chainId);

          if (safeInfo) {
            // console.log('[ImpersonatorIframe] Sending actual safeInfo');
            sendMessageToIFrame({
              eventID,
              data: safeInfo,
            });
          } else {
            // console.log('[ImpersonatorIframe] Sending fallback safeInfo');
            const fallbackInfo = {
              safeAddress: address,
              chainId,
              owners: [address],
              threshold: 1,
              isReadOnly: false,
            };
            // console.log('[ImpersonatorIframe] Fallback data:', fallbackInfo);
            sendMessageToIFrame({
              eventID,
              data: fallbackInfo,
            });
          }
          return;
        }

        case Methods.rpcCall: {
          // console.log('< < < known method:', 'rpcCall', event);
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
          console.log('sendTransactions > safe mode:', !!safe, 'safeInfo:', !!safeInfo);
          console.log('sendTransactions > origin:', event.origin, 'isUniswap:', originIsUniswap(event.origin));
          
          try {
            const data = [];

            console.log(`sendTransactions > tx length >`, params.txs.length);

            for (let q = 0; q < params.txs.length; q++) {
              const tx = params.txs[q];
              console.log(`sendTransactions > processing tx ${q}:`, {
                to: tx.to,
                value: tx.value,
                dataLength: tx.data?.length,
                isApproval: tx.data?.includes('095ea7b3'),
              });

              // Handle approvals directly without going through the modal
              const isApproval = tx.data.includes('095ea7b3');
              
              if (isApproval) {
                console.log(`sendTransactions > Direct approval tx ${q} (bypassing modal)`);
                
                if (safe && safeInfo) {
                  // Safe mode: Send approval to Safe for multi-sig
                  console.log(`sendTransactions > Sending approval to Safe`);
                  try {
                    const result = await safe.txs.send({
                      txs: [tx],
                    });
                    console.log(`sendTransactions > Safe approval result:`, result);
                    
                    if (!result.safeTxHash) {
                      console.error(`sendTransactions > No safeTxHash returned for approval`);
                      throw new Error('No safeTxHash returned from Safe');
                    }
                    
                    data.push(result.safeTxHash);
                    console.log(`sendTransactions > Added approval safeTxHash:`, result.safeTxHash);
                  } catch (error) {
                    console.error(`sendTransactions > Safe approval failed:`, error);
                    throw error;
                  }
                } else {
                  // Regular wallet: Send approval directly
                  console.log(`sendTransactions > Sending approval via regular wallet`);
                  const hash = await sendTransactionAsync({
                    to: tx.to as `0x${string}`,
                    value: BigInt(tx.value),
                    data: tx.data,
                  });
                  console.log(`sendTransactions > Approval hash:`, hash);
                  data.push(hash);
                  try {
                    await publicClient.waitForTransactionReceipt({
                      hash,
                    });
                    console.log(`sendTransactions > Approval confirmed`);
                  } catch (error) {
                    console.error(`sendTransactions > Approval wait failed:`, error);
                  }
                }
                continue;
              }

              // All non-approval transactions go through the modal
              // The modal will handle Safe vs regular wallet logic
              console.log(`sendTransactions > Opening modal for tx ${q}`);
              const hash = await openModal(tx);
              console.log(`sendTransactions > Modal returned hash:`, hash);
              data.push(hash);
            }

            console.log(`sendTransactions > All txs processed. Data array:`, data);
            console.log(`sendTransactions > Preparing response for origin:`, event.origin);

            if (originIsUniswap(event.origin)) {
              const responseData = { safeTxHash: data[0] };
              console.log(`sendTransactions > Sending Uniswap-format response:`, responseData);
              sendMessageToIFrame({
                eventID,
                data: responseData,
              });

              return;
            }

            console.log(`sendTransactions > Sending standard response:`, data[0]);
            sendMessageToIFrame({
              eventID,
              data: data[0],
            });
            return;
          } catch (error) {
            console.error('sendTransactions > CAUGHT ERROR:', error);
            console.error('sendTransactions > Error type:', error?.constructor?.name);
            console.error('sendTransactions > Error message:', error instanceof Error ? error.message : 'Unknown');

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
    sendMessageToIFrame,
    sendTransactionAsync,
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
