import { useModalPromise } from "@/hooks/use-modal-promise";
import { Dialog, DialogTitle, DialogContent, DialogHeader, DialogDescription, DialogFooter } from "./ui/dialog";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Loader2, X } from "lucide-react";
import { Check, useChecks } from "@/hooks/use-checks";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { getProxyContract } from "@/lib/contracts";
import { Abi, decodeFunctionData, encodeFunctionData, parseAbi, zeroAddress } from "viem";
import { whatsabi } from "@shazow/whatsabi";
import { useState } from "react";

function swapAddressInArgsTraverse<T>(args: T, from: string, to: string): T {
  // @ts-expect-error unknown is not typed
  return Array.isArray(args) ? args.map((arg: unknown, index: number) => {
    if (typeof arg === "string" && arg.toLowerCase().includes(from)) {
      console.log("found", index, arg, from, to);
      return arg.toLowerCase().replaceAll(from, to) as T;
    }
    if (Array.isArray(arg)) {
      return swapAddressInArgsTraverse(arg, from, to);
    }
    return arg;
  }) : args as T;
}

const createCheckComp = (title: string, target: string) => ({ check, onChange, onRemove, index }: { check: Check, onChange: (check: Check) => void, onRemove: () => void, index: number }) => {
    return (
        <Card className="p-2 rounded-sm">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                <Label>{title} {index + 1}</Label>
                <Button variant="ghost" size="icon" onClick={onRemove}><X /></Button>
                </div>
                <div className="flex flex-col gap-1">
                <Label>Token address:</Label>
                <Input value={check.token} onChange={(e) => onChange({ ...check, token: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                <Label>{target}:</Label>
                <Input value={check.target} onChange={(e) => onChange({ ...check, target: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                <Label>Minimum balance:</Label>
                <Input value={check.balance} onChange={(e) => onChange({ ...check, balance: e.target.value })} />
                </div>
            </div>
        </Card>
    )
}
  
const CheckComp = createCheckComp("Check", "Check address");
const ApprovalComp = createCheckComp("Approval", "Where to approve");
const WithdrawalComp = createCheckComp("Withdrawal", "Where to withdraw");

export const TxOptions = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { modalOpen, closeModal, tx, resolve, hideModal } = useModalPromise();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { checks, createPreTransferCheck, changePreTransferCheck, removePreTransferCheck, createApprovalCheck, changeApprovalCheck, removeApprovalCheck, createWithdrawalCheck, changeWithdrawalCheck, removeWithdrawalCheck, createPostTransferCheck, changePostTransferCheck, removePostTransferCheck } = useChecks();


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

      let newArgs = swapAddressInArgsTraverse(decoded.args || [], address.toLowerCase(), proxy.address.toLowerCase());
      newArgs = swapAddressInArgsTraverse(newArgs, address.slice(2).toLowerCase(), proxy.address.slice(2).toLowerCase());

      const newData = encodeFunctionData({
        abi,
        functionName: decoded.functionName,
        args: newArgs,
      });

      data = newData;
    }
    
    const tokenApprovals = checks.approvals.filter((check) => check.token !== zeroAddress);

    const value = checks.approvals.find((check) => check.token === zeroAddress)?.balance;
    
    try {
      const hash = await writeContractAsync({
        abi: proxy.abi,
        address: proxy.address,
        functionName: "proxyCallCalldata",
        // @ts-expect-error Address is not typed
        args: [checks.postTransfer, checks.preTransfer, tokenApprovals.map((check) => ({...check, target: address})), tx.to, data, checks.withdrawals],
        value: value ? BigInt(value) : undefined,
      });
  
      resolve(hash);
      hideModal();
    } catch (error) {
      console.error(error);
      closeModal();
    } finally {
      setIsLoading(false);
    } 
  }

  console.log("modalOpen", modalOpen);

  if (!modalOpen) return null;

  return (
    <Dialog open={modalOpen} onOpenChange={(open) => {
        if (!open) {
            closeModal();
        }
    }}>
      <DialogContent className="overflow-y-auto max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
              {tx ? `Call to ${tx.to}` : "Setup your tx options here."}
          </DialogDescription>
        </DialogHeader>
        <Accordion type="single" collapsible defaultValue="pre-transfer">
            <AccordionItem value="pre-transfer">
                <AccordionTrigger>Pre-transfer</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-2">
                    {checks.preTransfer.map((check, index) => (
                        <CheckComp key={index} check={check} onChange={(check) => changePreTransferCheck(index, check)} onRemove={() => removePreTransferCheck(index)} index={index} />
                    ))}
                    <Button onClick={createPreTransferCheck}>Add</Button>
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="approval">
                <AccordionTrigger>Approval</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-2">
                    {checks.approvals.map((check, index) => (
                        <ApprovalComp key={index} check={check} onChange={(check) => changeApprovalCheck(index, check)} onRemove={() => removeApprovalCheck(index)} index={index} />
                    ))}
                    <Button onClick={createApprovalCheck}>Add</Button>
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="withdrawal">
                <AccordionTrigger>Withdrawal</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-2">
                    {checks.withdrawals.map((check, index) => (
                        <WithdrawalComp key={index} check={check} onChange={(check) => changeWithdrawalCheck(index, check)} onRemove={() => removeWithdrawalCheck(index)} index={index} />
                    ))}
                    <Button onClick={createWithdrawalCheck}>Add</Button>
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="post-transfer">
                <AccordionTrigger>Post-transfer</AccordionTrigger>
                <AccordionContent className="flex flex-col gap-2">
                    {checks.postTransfer.map((check, index) => (
                        <CheckComp key={index} check={check} onChange={(check) => changePostTransferCheck(index, check)} onRemove={() => removePostTransferCheck(index)} index={index} />
                    ))}
                    <Button onClick={createPostTransferCheck}>Add</Button>
                </AccordionContent>
            </AccordionItem>
        </Accordion>
        <DialogFooter className="flex items-center justify-between">
            <Button variant="outline" onClick={closeModal}>Close</Button>
            <Button onClick={handleSave} disabled={isLoading}>{isLoading && <Loader2 className="animate-spin" />} {isLoading ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};