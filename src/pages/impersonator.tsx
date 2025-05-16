import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import ImpersonatorWalletConnect from "@/components/impersonator-wallet-connect.tsx";
import ImpersonatorIframeView from "@/components/impersonator-iframe-view.tsx";

export const ImpersonatorPage = () => {
  return (
    <div className="flex flex-col gap-2">
      <Tabs defaultValue="WalletConnect" className="w-full container mx-auto">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="WalletConnect">WalletConnect</TabsTrigger>
          <TabsTrigger value="iFrame">iFrame</TabsTrigger>
        </TabsList>
        <TabsContent value="WalletConnect">
          <ImpersonatorWalletConnect />
        </TabsContent>
        <TabsContent value="iFrame">
          <ImpersonatorIframeView />
        </TabsContent>
      </Tabs>
    </div>
  );
};
