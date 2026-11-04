import {
  BarChart3,
  Building2,
  FileText,
  FolderOpen,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: PermissionKey;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAVIGATION: NavGroup[] = [
  {
    label: "Principal",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        permission: PERMISSIONS.DASHBOARD_VIEW,
      },
      {
        label: "Financeiro",
        href: "/financeiro",
        icon: Wallet,
        permission: PERMISSIONS.FINANCE_VIEW,
      },
      {
        label: "Transações",
        href: "/transacoes",
        icon: Receipt,
        permission: PERMISSIONS.FINANCE_VIEW,
      },
      {
        label: "Vendas",
        href: "/vendas",
        icon: ShoppingCart,
        permission: PERMISSIONS.SALE_VIEW,
      },
      {
        label: "Serviços",
        href: "/servicos",
        icon: Package,
        permission: PERMISSIONS.CATALOG_VIEW,
      },
    ],
  },
  {
    label: "Relacionamento",
    items: [
      {
        label: "Clientes",
        href: "/clientes",
        icon: Users,
        permission: PERMISSIONS.CUSTOMER_VIEW,
      },
      {
        label: "CRM / Kanban",
        href: "/crm",
        icon: KanbanSquare,
        permission: PERMISSIONS.CRM_VIEW,
      },
      {
        label: "Contratos",
        href: "/contratos",
        icon: FileText,
        permission: PERMISSIONS.CONTRACT_VIEW,
      },
      {
        label: "Documentos",
        href: "/documentos",
        icon: FolderOpen,
        permission: PERMISSIONS.DOCUMENT_VIEW,
      },
    ],
  },
  {
    label: "Administração",
    items: [
      {
        label: "Relatórios",
        href: "/relatorios",
        icon: BarChart3,
        permission: PERMISSIONS.REPORT_VIEW,
      },
      {
        label: "Usuários",
        href: "/usuarios",
        icon: Building2,
        permission: PERMISSIONS.USER_VIEW,
      },
      {
        label: "Cadastros",
        href: "/cadastros",
        icon: ListChecks,
        permission: PERMISSIONS.SETTINGS_VIEW,
      },
      {
        label: "Configurações",
        href: "/configuracoes",
        icon: Settings,
        permission: PERMISSIONS.SETTINGS_VIEW,
      },
    ],
  },
];
