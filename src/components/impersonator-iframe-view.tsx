import { useState } from "react";
import { Input } from "@/components/ui/input.tsx";
import { useSafeInject } from "@/contexts/impersonator-iframe-context.tsx";
import { ImpersonatorIframe } from "@/components/impersonator-iframe.tsx";

function ImpersonatorIframeView() {
  const [address, setAddress] = useState<string>(
    "0x044159C76E5AC088d836B98b683f31D32AbDdBec",
  );

  const [siteUrl, setSiteUrl] = useState<string>(
    "https://www.sushi.com/ethereum/swap",
  );

  const { latestTransaction } = useSafeInject();

  console.log(latestTransaction);

  return (
    <div className="flex flex-col gap-2">
      <Input
        placeholder="address"
        onChange={(e) => setAddress(e.target.value)}
        value={address}
      />
      <Input
        placeholder="site url"
        onChange={(e) => setSiteUrl(e.target.value)}
        value={siteUrl}
      />

      <ImpersonatorIframe
        width="100%"
        height="700px"
        src={siteUrl}
        address={address}
        rpcUrl="https://eth.llamarpc.com"
      />
    </div>
  );
}

export default ImpersonatorIframeView;
