"use client";

import { Eye, Info, MousePointerClick } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PageHelp } from "@/lib/page-help";

/**
 * The "i" next to a screen title: says what the screen is, what it shows and what
 * can be done here, so nobody has to guess the difference between two modules.
 */
export function PageHelpButton({ title, help }: { title: string; help: PageHelp }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`O que é a tela ${title}`}
            className="text-muted-foreground hover:text-foreground"
          >
            <Info className="size-4" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <ScrollArea className="max-h-[70dvh]">
          <div className="space-y-3 p-4">
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-muted-foreground mt-1 text-sm">{help.summary}</p>
            </div>

            <HelpList icon={<Eye className="size-3.5" />} label="Você vê aqui" items={help.see} />
            <HelpList
              icon={<MousePointerClick className="size-3.5" />}
              label="Você faz aqui"
              items={help.doIt}
            />

            {help.notice ? (
              <p className="bg-muted/60 text-muted-foreground rounded-md border p-2 text-xs">
                {help.notice}
              </p>
            ) : null}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function HelpList({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  items: readonly string[];
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </p>
      <ul className="space-y-1 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="bg-muted-foreground/50 mt-1.5 size-1 shrink-0 rounded-full" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
