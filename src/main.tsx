import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { SafeInjectProvider } from "./contexts/impersonator-iframe-context.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SafeInjectProvider>
        <App />
      </SafeInjectProvider>
    </QueryClientProvider>
  </StrictMode>,
);
