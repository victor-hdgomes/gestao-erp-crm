/**
 * Permission keys are `<resource>.<action>`. The backend is the only place that
 * enforces them; the UI merely hides what the user cannot reach.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",

  CUSTOMER_VIEW: "customer.view",
  CUSTOMER_MANAGE: "customer.manage",

  CATALOG_VIEW: "catalog.view",
  CATALOG_MANAGE: "catalog.manage",

  SALE_VIEW: "sale.view",
  SALE_MANAGE: "sale.manage",

  FINANCE_VIEW: "finance.view",
  FINANCE_MANAGE: "finance.manage",

  CONTRACT_VIEW: "contract.view",
  CONTRACT_MANAGE: "contract.manage",

  CRM_VIEW: "crm.view",
  CRM_MANAGE: "crm.manage",

  DOCUMENT_VIEW: "document.view",
  DOCUMENT_MANAGE: "document.manage",

  REPORT_VIEW: "report.view",

  USER_VIEW: "user.view",
  USER_MANAGE: "user.manage",

  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE: "settings.manage",

  INTEGRATION_VIEW: "integration.view",
  INTEGRATION_MANAGE: "integration.manage",

  AUDIT_VIEW: "audit.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export const ROLE_KEYS = {
  ADMIN: "admin",
  FINANCE: "finance",
  OPERATIONS: "operations",
} as const;

export type RoleKey = (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];

export const ROLE_DEFINITIONS: Record<
  RoleKey,
  { name: string; description: string; permissions: PermissionKey[] }
> = {
  [ROLE_KEYS.ADMIN]: {
    name: "Administrador",
    description: "Acesso completo ao sistema, incluindo configurações e integrações.",
    permissions: ALL_PERMISSIONS,
  },
  [ROLE_KEYS.FINANCE]: {
    name: "Financeiro",
    description: "Vendas, transações, recebimentos, despesas e relatórios financeiros.",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CUSTOMER_VIEW,
      PERMISSIONS.CATALOG_VIEW,
      PERMISSIONS.SALE_VIEW,
      PERMISSIONS.SALE_MANAGE,
      PERMISSIONS.FINANCE_VIEW,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.CONTRACT_VIEW,
      PERMISSIONS.CONTRACT_MANAGE,
      PERMISSIONS.DOCUMENT_VIEW,
      PERMISSIONS.REPORT_VIEW,
    ],
  },
  [ROLE_KEYS.OPERATIONS]: {
    name: "Operacional",
    description: "Clientes, CRM, Kanban, contratos e documentos.",
    permissions: [
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.CUSTOMER_VIEW,
      PERMISSIONS.CUSTOMER_MANAGE,
      PERMISSIONS.CATALOG_VIEW,
      PERMISSIONS.SALE_VIEW,
      PERMISSIONS.CONTRACT_VIEW,
      PERMISSIONS.CRM_VIEW,
      PERMISSIONS.CRM_MANAGE,
      PERMISSIONS.DOCUMENT_VIEW,
      PERMISSIONS.DOCUMENT_MANAGE,
    ],
  },
};
