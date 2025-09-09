import React, { createContext, useContext, useEffect, useState } from "react";
import { Methods } from "@safe-global/safe-apps-sdk";

interface SafeInfo {
  safeAddress: string;
  chainId: number;
  owners: string[];
  threshold: number;
  isReadOnly: boolean;
}

interface SafeAppContextType {
  safe: any | null;
  safeInfo: SafeInfo | null;
  isLoading: boolean;
  error: string | null;
}

const SafeAppContext = createContext<SafeAppContextType>({
  safe: null,
  safeInfo: null,
  isLoading: true,
  error: null,
});

export const useSafeApp = () => useContext(SafeAppContext);

interface SafeAppProviderProps {
  children: React.ReactNode;
}

export const SafeAppProvider: React.FC<SafeAppProviderProps> = ({
  children,
}) => {
  const [safe, setSafe] = useState<any | null>(null);
  const [safeInfo, setSafeInfo] = useState<SafeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initSafeApp = async () => {
      try {
        if (window.parent !== window) {
          const safeAppInterface = {
            safe: {
              getInfo: async (): Promise<SafeInfo> => {
                return new Promise((resolve) => {
                  const messageId = Date.now();

                  const handleMessage = (event: MessageEvent) => {
                    if (
                      event.data?.id === messageId &&
                      event.data?.method === Methods.getSafeInfo
                    ) {
                      window.removeEventListener("message", handleMessage);
                      resolve(event.data.data);
                    }
                  };

                  window.addEventListener("message", handleMessage);
                  window.parent.postMessage(
                    {
                      id: messageId,
                      method: Methods.getSafeInfo,
                      params: {},
                    },
                    "*",
                  );
                });
              },
            },
            txs: {
              send: async (params: any) => {
                return new Promise((resolve, reject) => {
                  const messageId = Date.now();

                  const handleMessage = (event: MessageEvent) => {
                    if (
                      event.data?.id === messageId &&
                      event.data?.method === Methods.sendTransactions
                    ) {
                      window.removeEventListener("message", handleMessage);
                      if (event.data.success) {
                        resolve(event.data.data);
                      } else {
                        reject(new Error(event.data.error));
                      }
                    }
                  };

                  window.addEventListener("message", handleMessage);

                  window.parent.postMessage(
                    {
                      id: messageId,
                      method: Methods.sendTransactions,
                      params,
                    },
                    "*",
                  );
                });
              },
            },
            wallet: {
              signMessage: async (params: any) => {
                return new Promise((resolve, reject) => {
                  const messageId = Date.now();

                  const handleMessage = (event: MessageEvent) => {
                    if (
                      event.data?.id === messageId &&
                      event.data?.method === Methods.signMessage
                    ) {
                      window.removeEventListener("message", handleMessage);
                      if (event.data.success) {
                        resolve(event.data.data);
                      } else {
                        reject(new Error(event.data.error));
                      }
                    }
                  };

                  window.addEventListener("message", handleMessage);

                  window.parent.postMessage(
                    {
                      id: messageId,
                      method: Methods.signMessage,
                      params,
                    },
                    "*",
                  );
                });
              },
            },
          };

          setSafe(safeAppInterface);
          try {
            const info = await safeAppInterface.safe.getInfo();
            setSafeInfo(info);
          } catch (err) {
            console.log(err);
          }

          setIsLoading(false);
        } else {
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Failed to initialize:", err);
        setError(err instanceof Error ? err.message : "Failed to initialize");
        setIsLoading(false);
      }
    };

    initSafeApp();
  }, []);

  return (
    <SafeAppContext.Provider value={{ safe, safeInfo, isLoading, error }}>
      {children}
    </SafeAppContext.Provider>
  );
};
