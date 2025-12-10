import React, { createContext, useContext, useEffect, useState } from "react";
import SafeAppsSDK from "@safe-global/safe-apps-sdk";

interface SafeInfo {
  safeAddress: string;
  chainId: number;
  owners: string[];
  threshold: number;
  isReadOnly: boolean;
}

interface SafeAppContextType {
  safe: SafeAppsSDK | null;
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
  const [safe, setSafe] = useState<SafeAppsSDK | null>(null);
  const [safeInfo, setSafeInfo] = useState<SafeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initSafeApp = async () => {
      try {
        // console.log('[SafeApp] Initializing Safe App Provider');
        // console.log('[SafeApp] window.parent !== window:', window.parent !== window);
        
        if (window.parent !== window) {
          // console.log('[SafeApp] Running in iframe context - initializing Safe Apps SDK');
          
          // Use the official Safe Apps SDK
          const sdk = new SafeAppsSDK();
          // console.log('[SafeApp] Safe Apps SDK instance created');
          
          setSafe(sdk);
          
          try {
            // console.log('[SafeApp] Fetching Safe info via SDK...');
            const info = await sdk.safe.getInfo();
            // console.log('[SafeApp] Safe info received via SDK:', info);
            setSafeInfo(info);
          } catch (err) {
            console.error('[SafeApp] Failed to get Safe info via SDK:', err);
            setError(err instanceof Error ? err.message : 'Failed to get Safe info');
          }

          setIsLoading(false);
        } else {
          // console.log('[SafeApp] Not running in iframe - skipping Safe setup');
          setIsLoading(false);
        }
      } catch (err) {
        console.error("[SafeApp] Failed to initialize:", err);
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
