import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import ImpersonatorWalletConnect from "@/components/impersonator-wallet-connect.tsx";
import { ImpersonatorIframe } from "@/components/impersonator-iframe.tsx";
import { useAccount } from "wagmi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { Check, useChecks } from "@/hooks/use-checks";

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
          <Input value={check.tokenAddress} onChange={(e) => onChange({ ...check, tokenAddress: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>{target}:</Label>
          <Input value={check.target} onChange={(e) => onChange({ ...check, target: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Minimum balance:</Label>
          <Input value={check.minimumBalance} onChange={(e) => onChange({ ...check, minimumBalance: e.target.value })} />
        </div>
      </div>
    </Card>
  )
}

const CheckComp = createCheckComp("Check", "Check address");
const ApprovalComp = createCheckComp("Approval", "Where to approve");
const WithdrawalComp = createCheckComp("Withdrawal", "Where to withdraw");

export const ImpersonatorPage = () => {
  const { address } = useAccount();
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
    removePostTransferCheck 
  } = useChecks();

  if (!address) return null;

  return (
    <div className="grid grid-cols-4 gap-2">
      <Card className="col-span-1 h-fit">
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Make your balances' checks and token transfers to proxy contract.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple">
            <AccordionItem value="item-1">
              <AccordionTrigger>Pre-transfer checks</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2">
                {checks.preTransfer.map((check, index) => <CheckComp key={index} check={check} onChange={(check) => changePreTransferCheck(index, check)} onRemove={() => removePreTransferCheck(index)} index={index} />)}
                <Button onClick={createPreTransferCheck}><Plus /></Button>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger>Approvals</AccordionTrigger>
              <AccordionContent  className="flex flex-col gap-2">
                {checks.approvals.map((check, index) => <ApprovalComp key={index} check={check} onChange={(check) => changeApprovalCheck(index, check)} onRemove={() => removeApprovalCheck(index)} index={index} />)}
                <Button onClick={createApprovalCheck}><Plus /></Button>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger>Withdrawals</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2">
                {checks.withdrawals.map((check, index) => <WithdrawalComp key={index} check={check} onChange={(check) => changeWithdrawalCheck(index, check)} onRemove={() => removeWithdrawalCheck(index)} index={index} />)}
                <Button onClick={createWithdrawalCheck}><Plus /></Button>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger>Post-transfer checks</AccordionTrigger>
              <AccordionContent className="flex flex-col gap-2">
                {checks.postTransfer.map((check, index) => <CheckComp key={index} check={check} onChange={(check) => changePostTransferCheck(index, check)} onRemove={() => removePostTransferCheck(index)} index={index} />)}
                <Button onClick={createPostTransferCheck}><Plus /></Button>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
      <Tabs defaultValue="WalletConnect" className="w-full col-span-3">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="WalletConnect">WalletConnect</TabsTrigger>
          <TabsTrigger value="iFrame">iFrame</TabsTrigger>
        </TabsList>
        <TabsContent value="WalletConnect">
          <ImpersonatorWalletConnect />
        </TabsContent>
        <TabsContent value="iFrame">
          <ImpersonatorIframe />
        </TabsContent>
      </Tabs>
    </div>
  );
};
