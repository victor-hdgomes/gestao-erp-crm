"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";

import { NAVIGATION } from "@/lib/navigation";
import type { PermissionKey } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

type AppSidebarProps = {
  permissions: PermissionKey[];
  companyName: string;
  onNavigate?: () => void;
};

export function AppSidebar({ permissions, companyName, onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const allowed = new Set<string>(permissions);

  const groups = NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
          <LayoutGrid className="size-4" />
        </span>
        <span className="truncate text-sm font-semibold tracking-tight">{companyName}</span>
      </div>

      <ScrollArea className="flex-1">
        <nav className="space-y-6 p-3">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="text-muted-foreground px-2 text-[11px] font-medium tracking-wider uppercase">
                {group.label}
              </p>
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-secondary text-secondary-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </ScrollArea>
    </div>
  );
}
