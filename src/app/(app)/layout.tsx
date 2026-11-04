import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { SidebarShell } from "@/components/layout/sidebar-shell";
import { getCurrentUser } from "@/lib/auth/session";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { getGeneralSettings } from "@/server/settings/settings-service";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const settings = await getGeneralSettings();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <div className="flex min-h-dvh">
      <SidebarShell
        permissions={user.permissions}
        companyName={settings.companyName}
        defaultCollapsed={collapsed}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          user={{ name: user.name, email: user.email, roles: user.roles }}
          permissions={user.permissions}
          companyName={settings.companyName}
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
