import { ImpersonatorPage } from "@/pages/impersonator.tsx";
import { Header } from "@/components/common/header.tsx";

function App() {
  return (
    <div>
      <Header />
      <div className="container mx-auto">
        <ImpersonatorPage />
      </div>
    </div>
  );
}

export default App;
