import { ImpersonatorPage } from "@/pages/impersonator.tsx";
import { Account } from "@/components/account.tsx";
import { WalletOptions } from "@/components/wallet-options.tsx";
import { useAccount } from "wagmi";

function App() {
  const { isConnected } = useAccount();
  return (
    <div>
      {isConnected ? <Account /> : <WalletOptions />}
      <ImpersonatorPage />
    </div>
  );
}

export default App;
