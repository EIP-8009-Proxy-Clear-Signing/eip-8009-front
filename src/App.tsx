import { ImpersonatorPage } from "@/pages/impersonator.tsx";
import { Header } from "@/components/common/header.tsx";
import { TxOptions } from "@/components/tx-options.tsx";

function App() {
  return (
    <div>
      <Header />
      <div className="container mx-auto">
        <TxOptions />
        <ImpersonatorPage />
      </div>
    </div>
  );
}

export default App;
