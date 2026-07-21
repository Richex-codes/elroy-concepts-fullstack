import { lazy } from "react";

// Single source of truth for every admin section: the sidebar nav, the
// topbar title/icon, and the routed page it renders all come from this one
// list, so adding a page can't leave the nav and the routing out of sync.
// Lazy-loaded so a browser landing on e.g. /admin/sales only downloads that
// section's code instead of the entire admin bundle up front.
const DashboardSummary = lazy(() => import("./component/DashboardSummary.jsx"));
const ProductList = lazy(() => import("./component/ProductList"));
const AddProduct = lazy(() => import("./component/AddProduct.jsx"));
const CategoryManager = lazy(() => import("./component/CategoryManager.jsx"));
const Inventory = lazy(() => import("./component/Inventory.jsx"));
const AddInventoryPage = lazy(() => import("./component/AddInventory.jsx"));
const Enquiries = lazy(() => import("./component/Enquiries.jsx"));
const AddSales = lazy(() => import("./component/AddSales.jsx"));
const SalesPage = lazy(() => import("./component/Sales.jsx"));
const DebtorPage = lazy(() => import("./component/Debtor.jsx"));
const AuditLog = lazy(() => import("./component/AuditLog.jsx"));
const MakeAdmin = lazy(() => import("./component/MakeAdmin.jsx"));

export const ADMIN_NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { key: "dashboard", path: "", label: "Dashboard", icon: "fa-gauge-high", Component: DashboardSummary },
    ],
  },
  {
    label: "Catalog",
    items: [
      { key: "products", path: "products", label: "Products", icon: "fa-box", disabled: true, Component: ProductList },
      { key: "add-product", path: "add-product", label: "Add Product", icon: "fa-box-open", Component: AddProduct },
      { key: "categories", path: "categories", label: "Categories", icon: "fa-layer-group", Component: CategoryManager },
      { key: "inventory", path: "inventory", label: "Inventory", icon: "fa-warehouse", Component: Inventory },
      { key: "add-inventory", path: "add-inventory", label: "Add Inventory", icon: "fa-dolly", Component: AddInventoryPage },
    ],
  },
  {
    label: "Sales",
    items: [
      { key: "sales", path: "sales", label: "Sales", icon: "fa-cash-register", Component: SalesPage },
      { key: "add-sales", path: "add-sales", label: "Add Sale", icon: "fa-receipt", Component: AddSales },
      { key: "debtor", path: "debtor", label: "Debtors", icon: "fa-file-invoice-dollar", Component: DebtorPage },
    ],
  },
  {
    label: "Other",
    items: [
      { key: "enquiries", path: "enquiries", label: "Enquiries", icon: "fa-envelope-open-text", disabled: true, Component: Enquiries },
      { key: "audit-log", path: "audit-log", label: "Audit Log", icon: "fa-shield-halved", Component: AuditLog, superAdminOnly: true },
      { key: "make-admin", path: "make-admin", label: "Make Admin", icon: "fa-user-shield", Component: MakeAdmin, superAdminOnly: true },
    ],
  },
];

export const ADMIN_NAV_ITEMS = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);
