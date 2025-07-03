import { useModalPromise } from "@/hooks/use-modal-promise";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Loader2, X } from "lucide-react";
import { Check, useChecks } from "@/hooks/use-checks";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import { getProxyContract } from "@/lib/contracts";
import {
  Abi,
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  ethAddress,
  parseAbi,
  parseUnits,
  PublicClient,
  zeroAddress,
} from "viem";
import { whatsabi } from "@shazow/whatsabi";
import { useEffect, useState } from "react";
import { formatBalance, formatToken, shortenAddress } from "@/lib/utils.ts";

function swapAddressInArgsTraverse<T>(
  args: T,
  from: string,
  to: string,
): unknown[] | T {
  return Array.isArray(args)
    ? args.map((arg: unknown, index: number) => {
      if (typeof arg === "string" && arg.toLowerCase().includes(from)) {
        console.log("found", index, arg, from, to);
        return arg.toLowerCase().replaceAll(from, to) as T;
      }
      if (Array.isArray(arg)) {
        return swapAddressInArgsTraverse(arg, from, to);
      }
      return arg;
    })
    : (args as T);
}

const createCheckComp =
  (title: string, target?: string) =>
    ({
      check,
      onChange,
      onRemove,
      index,
    }: {
      check: Check;
      onChange: (check: Check) => void;
      onRemove: () => void;
      index: number;
    }) => {
      const onBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        const number = Number(value);
        if (isNaN(number)) {
          return;
        }
        onChange({ ...check, balance: number });
      };

      return (
        <Card className="p-2 rounded-sm">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>
                {title} {index + 1}
              </Label>
              <Button variant="ghost" size="icon" onClick={onRemove}>
                <X />
              </Button>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Token address:</Label>
              <Input
                value={check.token}
                onChange={(e) => onChange({ ...check, token: e.target.value })}
              />
            </div>
            {!!target && (
              <div className="flex flex-col gap-1">
                <Label>{target}:</Label>
                <Input
                  value={check.target}
                  onChange={(e) => onChange({ ...check, target: e.target.value })}
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label>Minimum balance:</Label>
              <Input
                value={check.balance}
                type="number"
                onChange={onBalanceChange}
              />
            </div>
          </div>
        </Card>
      );
    };

const CheckComp = createCheckComp("Check", "Check address");
const ApprovalComp = createCheckComp("Approval");
const WithdrawalComp = createCheckComp("Withdrawal", "Where to withdraw");

const transformToMetadata = async (
  checks: Check[],
  publicClient: PublicClient,
) => {
  const filteredChecks = checks.filter((check) => check.token !== zeroAddress);
  const ether = checks.find((check) => check.token === zeroAddress);

  const checksSymbolRequests = filteredChecks.map(({ token }) => ({
    abi: erc20Abi,
    address: token as `0x${string}`,
    functionName: "symbol" as const,
    args: [],
  }));

  const checksSymbols = await publicClient.multicall({
    contracts: checksSymbolRequests,
    allowFailure: false,
  });

  const checksDecimalsRequests = filteredChecks.map(({ token }) => ({
    abi: erc20Abi,
    address: token as `0x${string}`,
    functionName: "decimals" as const,
    args: [],
  }));

  const checksDecimals = await publicClient.multicall({
    contracts: checksDecimalsRequests,
    allowFailure: false,
  });

  const result = filteredChecks.map((balance, index) => ({
    balance: {
      target: balance.target as `0x${string}`,
      token: balance.token as `0x${string}`,
      balance: parseUnits(
        balance.balance.toString().replace(",", "."),
        checksDecimals[index],
      ),
    },
    symbol: checksSymbols[index],
    decimals: checksDecimals[index],
  }));

  if (ether) {
    result.push({
      balance: {
        target: ether.target as `0x${string}`,
        token: zeroAddress,
        balance: parseUnits(ether.balance.toString().replace(",", "."), 18),
      },
      symbol: "ETH",
      decimals: 18,
    });
  }

  return result;
};

export const TxOptions = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { modalOpen, closeModal, tx, resolve, hideModal, isAdvanced, toggleAdvanced } = useModalPromise();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const {
    checks,
    createPreTransferCheck,
    changePreTransferCheck,
    removePreTransferCheck,
    createApprovalCheck,
    changeApprovalCheck,
    removeApprovalCheck,
    createWithdrawalCheck,
    changeWithdrawalCheck,
    removeWithdrawalCheck,
    createPostTransferCheck,
    changePostTransferCheck,
    removePostTransferCheck,
  } = useChecks();

  const setDataToForm = async () => {
    if (!publicClient || tx === null) return;

    const simRes = await publicClient.simulateCalls({
      traceAssetChanges: true,
      account: address,
      calls: [
        {
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: BigInt(tx.value || 0),
        },
      ],
    });

    const from = simRes.assetChanges.find((asset) => {
      if (0 > asset.value.diff) {
        return true;
      }
    });

    const to = simRes.assetChanges.find((asset) => {
      if (0 < asset.value.diff) {
        return true;
      }
    });

    console.log("FROM > TO", from, to);

    if (!checks.approvals.length) {
      createApprovalCheck();
    }

    if (!checks.withdrawals.length) {
      createWithdrawalCheck();
    }

    if (!checks.postTransfer.length) {
      createPostTransferCheck();
    }

    let appSymbol = "ETH";
    let appDecimals = 18;

    if (from?.token.address !== zeroAddress && from?.token.address !== ethAddress) {
      [appSymbol, appDecimals] = await publicClient.multicall({
        contracts: [
          {
            abi: erc20Abi,
            address: from?.token.address as `0x${string}`,
            functionName: "symbol" as const,
            args: [],
          },
          {
            abi: erc20Abi,
            address: from?.token.address as `0x${string}`,
            functionName: "decimals" as const,
            args: [],
          }
        ],
        allowFailure: false,
      });
    }

    changeApprovalCheck(0, {
      target: tx.to,
      token: formatToken(from?.token.symbol, from?.token.address),
      balance: formatBalance(from?.value.diff, from?.token.decimals),
      symbol: appSymbol,
      decimals: appDecimals,
    });

    let withSymbol = "ETH";
    let withDecimals = 18;

    if (to?.token.address !== zeroAddress && to?.token.address !== ethAddress) {

      [withSymbol, withDecimals] = await publicClient.multicall({
        contracts: [
          {
            abi: erc20Abi,
            address: to?.token.address as `0x${string}`,
            functionName: "symbol" as const,
            args: [],
          },
          {
            abi: erc20Abi,
            address: to?.token.address as `0x${string}`,
            functionName: "decimals" as const,
            args: [],
          },
        ],
        allowFailure: false,
      })
    };

    changeWithdrawalCheck(0, {
      target: String(address),
      token: formatToken(to?.token.symbol, to?.token.address),
      balance: formatBalance(to?.value.diff, to?.token.decimals),
      symbol: withSymbol,
      decimals: withDecimals,
    });

    let balance = 0n;

    try {
      balance = await publicClient.readContract({
        abi: erc20Abi,
        address: to?.token.address as `0x${string}`,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });
    } catch (error) {
      console.error(error);
    }

    const diff = to?.value.diff ?? 0n;

    changePostTransferCheck(0, {
      target: String(address),
      token: formatToken(to?.token.symbol, to?.token.address),
      balance: formatBalance(diff / 10n ** 14n * 10n ** 14n + balance, to?.token.decimals),
    });
  };

  useEffect(() => {
    setDataToForm();
  }, [tx, address]);

  const handleSave = async () => {
    setIsLoading(true);
    if (!address || !publicClient || !tx || !resolve) {
      console.error("No address or public client or tx or resolve");
      setIsLoading(false);
      return;
    }

    const proxy = getProxyContract(chainId);
    let data = tx.data;

    const selector = tx.data.slice(0, 10);
    const lookup = new whatsabi.loaders.FourByteSignatureLookup();
    const signatures: string[] = await lookup.loadFunctions(selector);

    if (signatures.length > 0) {
      const fnSignature = signatures[0];
      const fullFragment = `function ${fnSignature}`;
      console.log("fullFragment", fullFragment);
      const abi = parseAbi([fullFragment]) as Abi;

      const decoded = decodeFunctionData({
        abi,
        data: tx.data,
      });

      console.log("decoded args", decoded.args);
      console.log("decoded functionName", decoded.functionName);

      let newArgs = swapAddressInArgsTraverse(
        decoded.args || [],
        address.toLowerCase(),
        proxy.address.toLowerCase(),
      );
      newArgs = swapAddressInArgsTraverse(
        newArgs,
        address.slice(2).toLowerCase(),
        proxy.address.slice(2).toLowerCase(),
      );

      const newData = encodeFunctionData({
        abi,
        functionName: decoded.functionName,
        args: newArgs,
      });

      data = newData;
    }

    const tokenApprovals = checks.approvals.filter(
      (check) => check.token !== zeroAddress,
    );

    const value = checks.approvals.find(
      (check) => check.token === zeroAddress,
    )?.balance;

    for (const token of tokenApprovals) {
      const [allowance, decimals] = await publicClient.multicall({
        contracts: [
          {
            abi: erc20Abi,
            address: token.token as `0x${string}`,
            functionName: "allowance",
            args: [address, proxy.address],
          },
          {
            abi: erc20Abi,
            address: token.token as `0x${string}`,
            functionName: "decimals",
            args: [],
          },
        ],
        allowFailure: false,
      });

      if (
        allowance >=
        parseUnits(token.balance.toString().replace(",", "."), decimals)
      ) {
        continue;
      }

      const hash = await writeContractAsync({
        abi: erc20Abi,
        address: token.token as `0x${string}`,
        functionName: "approve",
        args: [
          proxy.address,
          parseUnits(token.balance.toString().replace(",", "."), decimals),
        ],
      });

      try {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
        });

        console.log("token approval hash", hash, receipt);
      } catch (error) {
        console.error(error);
      }
    }

    const [postTransfers, preTransfers, approvals, withdrawals] =
      await Promise.all([
        transformToMetadata(checks.postTransfer, publicClient),
        transformToMetadata(checks.preTransfer, publicClient),
        transformToMetadata(
          tokenApprovals.map((check) => ({ ...check, target: proxy.address })),
          publicClient,
        ),
        transformToMetadata(checks.withdrawals, publicClient),
      ]);

    try {
      const hash = await writeContractAsync({
        abi: proxy.abi,
        address: proxy.address,
        functionName: "proxyCallMetadataCalldata",
        args: [
          postTransfers,
          preTransfers,
          approvals,
          tx.to,
          data,
          withdrawals,
        ],
        value: value
          ? parseUnits(value.toString().replace(",", "."), 18)
          : undefined,
      });

      resolve(hash);
      hideModal();
    } catch (error) {
      console.error(error);
      closeModal();
    } finally {
      setIsLoading(false);
    }
  };

  if (!modalOpen) return null;

  return (
    <Dialog
      open={modalOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeModal();
        }
      }}
    >
      <DialogContent className="overflow-y-auto max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="flex items-center justify-between">
            <span className="text-sm">
              {tx ? `Call to ${shortenAddress(tx.to)}` : "Setup your tx options here."}
            </span>
            <Button variant="outline" onClick={toggleAdvanced}>
              {isAdvanced ? "Hide advanced" : "Show advanced"}
            </Button>
          </DialogDescription>
        </DialogHeader>
        {isAdvanced ? (
          <Accordion type="single" collapsible defaultValue="pre-transfer">
            <AccordionItem value="pre-transfer">
              <AccordionTrigger>Pre-transfer</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2">
                {checks.preTransfer.map((check, index) => (
                  <CheckComp
                    key={index}
                    check={check}
                    onChange={(check) => changePreTransferCheck(index, check)}
                    onRemove={() => removePreTransferCheck(index)}
                    index={index}
                  />
                ))}
                <Button onClick={createPreTransferCheck}>Add</Button>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="approval">
              <AccordionTrigger>Approval</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2">
                {checks.approvals.map((check, index) => (
                  <ApprovalComp
                    key={index}
                    check={check}
                    onChange={(check) => changeApprovalCheck(index, check)}
                    onRemove={() => removeApprovalCheck(index)}
                    index={index}
                  />
                ))}
                <Button onClick={createApprovalCheck}>Add</Button>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="withdrawal">
              <AccordionTrigger>Withdrawal</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2">
                {checks.withdrawals.map((check, index) => (
                  <WithdrawalComp
                    key={index}
                    check={check}
                    onChange={(check) => changeWithdrawalCheck(index, check)}
                    onRemove={() => removeWithdrawalCheck(index)}
                    index={index}
                  />
                ))}
                <Button onClick={createWithdrawalCheck}>Add</Button>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="post-transfer">
              <AccordionTrigger>Post-transfer</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2">
                {checks.postTransfer.map((check, index) => (
                  <CheckComp
                    key={index}
                    check={check}
                    onChange={(check) => changePostTransferCheck(index, check)}
                    onRemove={() => removePostTransferCheck(index)}
                    index={index}
                  />
                ))}
                <Button onClick={createPostTransferCheck}>Add</Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>You spend:</Label>
            {checks.approvals.map((check) => (<p key={check.token} className="text-lg font-bold">- {check.balance.toFixed(3)} {check.symbol}</p>))}
          </div>
          <div className="flex flex-col gap-2">
            <Label>You receive:</Label>
            {checks.withdrawals.map((check) => (<p key={check.token} className="text-lg font-bold">+ {check.balance.toFixed(3)} {check.symbol}</p>))}
          </div>
        </div>}

        <DialogFooter className="flex items-center justify-between">
          <Button variant="outline" onClick={closeModal}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading && <Loader2 className="animate-spin" />}{" "}
            {isLoading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};