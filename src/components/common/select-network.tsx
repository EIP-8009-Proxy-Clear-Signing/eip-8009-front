import { FC } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccount, useSwitchChain } from "wagmi";

export const NetworkSelector: FC = () => {
  const { chain: activeChain } = useAccount();
  const { chains, switchChain, status, variables } = useSwitchChain();
  const isPending = status === "pending";

  return (
    <Select
      value={activeChain?.id.toString()}
      onValueChange={(val) => {
        const id = Number(val);
        switchChain({ chainId: id });
      }}
    >
      <SelectTrigger className="w-52">
        <SelectValue placeholder="Choose network" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Networks</SelectLabel>
          {chains.map((c) => (
            <SelectItem key={c.id} value={c.id.toString()}>
              {c.name}
              {isPending && variables?.chainId === c.id && " (switching…)"}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
