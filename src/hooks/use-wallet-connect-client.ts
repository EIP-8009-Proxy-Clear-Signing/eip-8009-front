import { useQuery } from "@tanstack/react-query";
import { env } from "@/env.ts";
import { SignClient } from "@walletconnect/sign-client";

export function useWalletConnectClient() {
  return useQuery({
    queryKey: ["walletConnectClient"],
    queryFn: async () =>
      await SignClient.init({
        projectId: env.VITE_WALLET_CONNECT_PROJECT_ID,
      }),
    staleTime: Infinity,
  });
}
