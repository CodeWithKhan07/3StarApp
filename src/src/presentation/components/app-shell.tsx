"use client";

import { routes } from "@/lib/routes";
import { BrandMark } from "@/presentation/components/brand-mark";
import { useAuth } from "@/presentation/providers/auth-provider";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { useTheme } from "@/presentation/providers/theme-provider";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  Home,
  LayoutDashboard,
  Menu,
  Moon,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Sun,
  Upload,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

const navGroups = [
  {
    label: "Overview",
    items: [["Dashboard", routes.dashboard, LayoutDashboard]],
  },
  {
    label: "Sales",
    items: [
      ["Clients", routes.clients, Users],
      ["Quotations", routes.quotations, FileText],
      ["Invoices & Payments", routes.invoices, ReceiptText],
      ["Pending Payments", routes.pendingPayments, CircleDollarSign],
    ],
  },
  {
    label: "Operations",
    items: [
      ["Projects", routes.projects, BriefcaseBusiness],
      ["Ongoing Projects", routes.ongoingProjects, CircleDollarSign],
      ["Completed Projects", routes.completedProjects, CheckCircle2],
    ],
  },
  {
    label: "Insights & Data",
    items: [
      ["Statements", routes.statements, FileBarChart],
      ["Reports", routes.reports, BarChart3],
      ["Excel Import / Export", routes.excelExport, FileSpreadsheet],
    ],
  },
] as const;

const mobileBottomItems = [
  ["Home", routes.dashboard, Home],
  ["Projects", routes.projects, BriefcaseBusiness],
  ["Invoices", routes.invoices, ReceiptText],
  ["Import", routes.excelExport, Upload],
] as const;


type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  type: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readFirstString(
  record: Record<string, unknown>,
  keys: string[],
  fallback = ""
) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return fallback;
}

function isActiveRoute(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === routes.projects && pathname.startsWith("/projects")) return true;
  if (href === routes.clients && pathname.startsWith("/clients")) return true;
  if (href === routes.quotations && pathname.startsWith("/quotations")) return true;
  if (href === routes.invoices && pathname.startsWith("/invoices")) return true;
  if (href === routes.excelExport && pathname.startsWith("/excel-export")) return true;
  return false;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const { user, logout } = useAuth();
  const { data, syncState, forceSync } = useBusinessData();
  const { theme, toggleTheme } = useTheme();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const searchResults = useMemo<SearchResult[]>(() => {
    const query = search.trim().toLowerCase();

    if (!query) return [];

    const clients = data.clients
      .map((client) => {
        const record = asRecord(client);

        const id = readFirstString(record, ["id"], crypto.randomUUID());
        const title = readFirstString(
          record,
          ["companyName", "company", "name", "clientName", "customerName"],
          "Unnamed Client"
        );
        const city = readFirstString(record, ["city", "location"], "No city");
        const contact = readFirstString(
          record,
          ["contactPerson", "contact", "phone", "mobile"],
          "No contact"
        );

        return {
          id,
          title,
          subtitle: `${city} • ${contact}`,
          href: routes.clients,
          type: "Client",
        };
      })
      .filter((item) => {
        const target = `${item.id} ${item.title} ${item.subtitle}`.toLowerCase();
        return target.includes(query);
      })
      .slice(0, 4);

    const projects = data.projects
      .map((project) => {
        const record = asRecord(project);

        const id = readFirstString(record, ["id", "projectId"], crypto.randomUUID());
        const title = readFirstString(
          record,
          ["companyName", "company", "clientName", "customerName"],
          "Unnamed Project"
        );
        const location = readFirstString(
          record,
          ["location", "site", "storeBranch", "branch"],
          "No location"
        );
        const work = readFirstString(
          record,
          ["description", "workDescription", "scope", "category"],
          "No description"
        );

        return {
          id,
          title,
          subtitle: `${id} • ${location} • ${work}`,
          href: routes.projects,
          type: "Project",
        };
      })
      .filter((item) => {
        const target = `${item.id} ${item.title} ${item.subtitle}`.toLowerCase();
        return target.includes(query);
      })
      .slice(0, 4);

    const invoices = data.invoices
      .map((invoice) => {
        const record = asRecord(invoice);

        const id = readFirstString(record, ["id", "invoiceNo"], crypto.randomUUID());
        const title = readFirstString(
          record,
          ["companyName", "company", "clientName", "customerName"],
          "Unnamed Invoice"
        );
        const status = readFirstString(record, ["status", "paymentStatus"], "unknown");
        const amount = readNumber(record.amount ?? record.invoiceAmount, 0);

        return {
          id,
          title,
          subtitle: `${id} • ${status} • ${amount}`,
          href: routes.invoices,
          type: "Invoice",
        };
      })
      .filter((item) => {
        const target = `${item.id} ${item.title} ${item.subtitle}`.toLowerCase();
        return target.includes(query);
      })
      .slice(0, 4);

    return [...clients, ...projects, ...invoices].slice(0, 8);
  }, [data.clients, data.invoices, data.projects, search]);

  async function handleSignOut() {
    await logout();
    router.replace(routes.login);
  }

  async function handleForceSync() {
    if (syncing) return;

    setSyncing(true);

    try {
      await forceSync();
    } finally {
      setSyncing(false);
    }
  }

  function handleResultClick(href: string) {
    setSearch("");
    setSearchOpen(false);
    setMobileOpen(false);
    router.push(href);
  }

  return (
    <div className="app-frame">
      <button
        className={`sidebar-backdrop ${mobileOpen ? "is-open" : ""}`}
        aria-label="Close navigation"
        onClick={() => setMobileOpen(false)}
        type="button"
      />

      <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar__brand">
          <BrandMark inverse />

          <button
            className="sidebar__close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            type="button"
          >
            <X />
          </button>
        </div>

        <div className="sidebar__quick-actions">
          <Link
            className="sidebar__primary"
            href={routes.excelExport}
            onClick={() => setMobileOpen(false)}
          >
            <Upload size={16} />
            Import
          </Link>

          <Link
            className="sidebar__primary sidebar__primary--ghost"
            href={routes.newProject}
            onClick={() => setMobileOpen(false)}
          >
            <Plus size={16} />
            New Project
          </Link>
        </div>

        <nav className="sidebar__nav" aria-label="Main navigation">
          {navGroups.map((group) => (
            <div className="sidebar__group" key={group.label}>
              <span className="sidebar__group-label">{group.label}</span>

              {group.items.map(([label, href, Icon]) => {
                const isActive = isActiveRoute(pathname, href);

                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={isActive ? "is-active" : ""}
                  >
                    <Icon size={19} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar__footer">
          <button
            className={`sync-pill sync-pill--${syncState}`}
            type="button"
            onClick={handleForceSync}
            disabled={syncing}
            title="Force cloud sync"
          >
            <span />
            {syncing ? "Syncing..." : syncState}
          </button>

          <Link
            className={`sidebar__settings ${
              pathname === routes.settings ? "is-active" : ""
            }`}
            href={routes.settings}
            onClick={() => setMobileOpen(false)}
          >
            <Settings size={17} />
            <span>Settings</span>
          </Link>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__left">
            <button
              className="mobile-menu"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              type="button"
            >
              <Menu />
            </button>

            <strong>3Star Business Suite</strong>
          </div>

          <div className="topbar__search-wrap">
            <label className="topbar__search">
              <Search size={15} />
              <input
                placeholder="Search clients, projects, invoices..."
                aria-label="Global search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
              />
            </label>

            {searchOpen && search.trim() ? (
              <div className="global-search-menu">
                {searchResults.length ? (
                  searchResults.map((item, index) => (
                    <button
                      key={`${item.type}-${item.id}-${index}`}
                      type="button"
                      onClick={() => handleResultClick(item.href)}
                    >
                      <span>{item.type}</span>
                      <strong>{item.title}</strong>
                      <small>{item.subtitle}</small>
                    </button>
                  ))
                ) : (
                  <div className="global-search-empty">No records found.</div>
                )}
              </div>
            ) : null}
          </div>

          <div className="topbar__actions">
            <Link className="button button--primary topbar__import" href={routes.excelExport}>
              <Upload size={14} />
              Import
            </Link>

            <Link className="button topbar__new" href={routes.newProject}>
              <Plus size={14} />
              New Project
            </Link>

            <button
              className="theme-toggle"
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              onClick={toggleTheme}
              type="button"
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <button aria-label="Notifications" type="button">
              <Bell size={17} />
            </button>

            <button
              className="profile-button"
              onClick={handleSignOut}
              title="Sign out"
              type="button"
            >
              <span>{user?.email?.slice(0, 1).toUpperCase() || "U"}</span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>

        {searchOpen && search.trim() ? (
          <button
            className="search-backdrop"
            aria-label="Close search"
            type="button"
            onClick={() => setSearchOpen(false)}
          />
        ) : null}

        <main className="app-content">{children}</main>

        <nav className="mobile-bottom-nav" aria-label="Mobile quick navigation">
          {mobileBottomItems.map(([label, href, Icon]) => {
            const isActive = isActiveRoute(pathname, href);

            return (
              <Link key={href} href={href} className={isActive ? "is-active" : ""}>
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
