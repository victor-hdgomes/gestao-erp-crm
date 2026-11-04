"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { NAVIGATION } from "@/lib/navigation";
import type { PermissionKey } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type AppSidebarProps = {
  permissions: PermissionKey[];
  companyName: string;
  onNavigate?: () => void;
  /** Icons only, for when the screen is worth more than the labels. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
};

export function AppSidebar({
  permissions,
  companyName,
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: AppSidebarProps) {
  const pathname = usePathname();
  const allowed = new Set<string>(permissions);

  const groups = NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowed.has(item.permission)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-md">
          <LayoutGrid className="size-4" />
        </span>
        {collapsed ? null : (
          <>
            <span className="truncate text-sm font-semibold tracking-tight">{companyName}</span>
            {onToggleCollapsed ? (
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                aria-label="Recolher menu"
                onClick={onToggleCollapsed}
              >
                <PanelLeftClose className="size-4" />
              </Button>
            ) : null}
          </>
        )}
      </div>

      {collapsed && onToggleCollapsed ? (
        <div className="flex justify-center border-b py-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Expandir menu"
            onClick={onToggleCollapsed}
          >
            <PanelLeftOpen className="size-4" />
          </Button>
        </div>
      ) : null}

      <ScrollArea className="flex-1">
        <nav className={cn("space-y-6", collapsed ? "p-2" : "p-3")}>
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              {collapsed ? (
                <div className="bg-border mx-auto my-2 h-px w-6" aria-hidden />
              ) : (
                <p className="text-muted-foreground px-2 text-[11px] font-medium tracking-wider uppercase">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    // Sem o rótulo visível, o nome ainda precisa existir para o
                    // leitor de tela e para quem passa o mouse.
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    className={cn(
                      "flex items-center rounded-md py-2 text-sm transition-colors",
                      collapsed ? "justify-center px-2" : "gap-2.5 px-2",
                      isActive
                        ? "bg-secondary text-secondary-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {collapsed ? null : <span className="truncate">{item.label}</span>}
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
