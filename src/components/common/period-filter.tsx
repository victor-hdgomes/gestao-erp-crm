"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { CalendarRange } from "lucide-react";

import { PERIOD_LABELS, type PeriodPreset } from "@/lib/period";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRESETS: PeriodPreset[] = [
  "today",
  "last7",
  "last30",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "custom",
];

export function PeriodFilter({
  from,
  to,
  preset,
}: {
  from: string;
  to: string;
  /** Resolved by the page, so the control never disagrees with the data shown. */
  preset: PeriodPreset;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(next: Record<string, string | null>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    startTransition(() => router.replace(`${pathname}?${search.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-pending={isPending}>
      <Select value={preset} onValueChange={(value) => update({ preset: value })}>
        <SelectTrigger className="w-[190px]">
          <CalendarRange className="size-4" />
          <SelectValue>{PERIOD_LABELS[preset]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map((item) => (
            <SelectItem key={item} value={item}>
              {PERIOD_LABELS[item]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {preset === "custom" ? (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            className="w-[150px]"
            onChange={(event) => update({ from: event.target.value })}
          />
          <span className="text-muted-foreground text-sm">até</span>
          <Input
            type="date"
            value={to}
            className="w-[150px]"
            onChange={(event) => update({ to: event.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}
