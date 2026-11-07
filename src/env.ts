import { createEnv } from "@t3-oss/env-core";
import z from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_WALLET_CONNECT_PROJECT_ID: z.string(),
    VITE_LEDGER: z.string().optional(),
    VITE_LEDGER_SPECULOS_URL: z.string().optional(),
    VITE_LEDGER_BROADCAST: z.string().optional(),
  },
  runtimeEnv: import.meta.env,
});
