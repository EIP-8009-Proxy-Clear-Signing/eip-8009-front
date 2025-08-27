import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import ImpersonatorWalletConnect from "@/components/impersonator-wallet-connect.tsx";
import { ImpersonatorIframe } from "@/components/impersonator-iframe.tsx";
import { useAccount } from "wagmi";
import { useSafeApp } from "@/providers/safe-app-provider.tsx";

export const ImpersonatorPage = () => {
  const { address } = useAccount();
  const { safeInfo } = useSafeApp();
  const isInSafeContext = window.parent !== window || safeInfo;

  if (!address && !isInSafeContext) return null;

  return (
    <div className="flex flex-col gap-2">
      <Tabs defaultValue="iFrame" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="WalletConnect">WalletConnect</TabsTrigger>
          <TabsTrigger value="iFrame">iFrame</TabsTrigger>
        </TabsList>
        <TabsContent value="WalletConnect">
          <ImpersonatorWalletConnect />
        </TabsContent>
        <TabsContent value="iFrame">
          <ImpersonatorIframe />
        </TabsContent>
      </Tabs>
    </div>
  );
};
