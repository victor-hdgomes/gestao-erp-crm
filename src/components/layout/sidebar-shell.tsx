"use client";

import { useState } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import type { PermissionKey } from "@/lib/auth/permissions";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { cn } from "@/lib/utils";

type SidebarShellProps = {
  permissions: PermissionKey[];
  companyName: string;
  /**
   * Read from the cookie on the server. Keeping the choice there instead of in
   * localStorage is what stops the menu from flashing open on every load.
   */
  defaultCollapsed: boolean;
};

export function SidebarShell({
  permissions,
  companyName,
  defaultCollapsed,
}: SidebarShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      className={cn(
        "bg-sidebar hidden shrink-0 border-r transition-[width] duration-200 lg:block",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="sticky top-0 h-dvh">
        <AppSidebar
          permissions={permissions}
          companyName={companyName}
          collapsed={collapsed}
          onToggleCollapsed={toggle}
        />
      </div>
    </aside>
  );
}
