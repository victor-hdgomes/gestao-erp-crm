import type { ReactNode } from "react";

import { PageHelpButton } from "@/components/common/page-help-button";
import { PAGE_HELP, type PageHelpKey } from "@/lib/page-help";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Shows the "i" bubble explaining what this screen is for. */
  help?: PageHelpKey;
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  help,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 pb-6 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {help ? <PageHelpButton title={title} help={PAGE_HELP[help]} /> : null}
        </div>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
