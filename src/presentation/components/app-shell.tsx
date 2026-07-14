"use client";

import { routes } from "@/lib/routes";
import { BrandMark } from "@/presentation/components/brand-mark";
import { useAuth } from "@/presentation/providers/auth-provider";
import { useBusinessData } from "@/presentation/providers/business-data-provider";
import { LoadingState } from "@/presentation/components/ui";
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
  History,
  Home,
  LayoutDashboard,
  Menu,
  Moon,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Sun,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
      ["Ongoing Projects", routes.ongoingProjects, CircleDollarSign],
      ["Invoices & Payments", routes.invoices, ReceiptText],
      ["Pending Payments", routes.pendingPayments, CircleDollarSign],
      ["Pending PO", routes.pendingPo, FileText],
    ],
  },
  {
    label: "Operations",
    items: [
      ["Projects", routes.projects, BriefcaseBusiness],
      ["Completed Projects", routes.completedProjects, CheckCircle2],
    ],
  },
  {
    label: "Insights & Data",
    items: [
      ["Income & Profit", routes.analytics, CircleDollarSign],
      ["Statements", routes.statements, FileBarChart],
      ["History", routes.history, History],
      ["Reports", routes.reports, BarChart3],
      ["Excel Import / Export", routes.excelExport, FileSpreadsheet],
      ["Trash", routes.trash, Trash2],
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
  fallback = "",
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
  if (href === routes.quotations && pathname.startsWith("/quotations"))
    return true;
  if (href === routes.invoices && pathname.startsWith("/invoices")) return true;
  if (href === routes.excelExport && pathname.startsWith("/excel-export"))
    return true;
  if (href === routes.trash && pathname.startsWith("/trash")) return true;
  return false;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const { user, logout } = useAuth();
  const { data, loading, syncState, lastError, forceSync } = useBusinessData();
  const { theme, toggleTheme } = useTheme();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [scrollSidebarHidden, setScrollSidebarHidden] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<"auto" | "hidden" | "shown">(
    "auto",
  );
  const [sidebarHoverOpen, setSidebarHoverOpen] = useState(false);
  const scrollHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigationCounts = useMemo<Record<string, number>>(() => {
    const ongoingProjects = data.projects.filter((project) => {
      const stage = project.billingStage || "ongoing";
      return (
        project.status === "in-progress" &&
        !["pending-po", "po-done", "payment-pending"].includes(stage)
      );
    }).length;
    const pendingPoProjects = data.projects.filter((project) => {
      const stage = project.billingStage || "ongoing";
      return (
        project.status !== "completed" &&
        (stage === "pending-po" || stage === "po-done")
      );
    }).length;
    const pendingInvoices = data.invoices.filter((invoice) =>
      ["pending", "partial", "overdue", "po"].includes(invoice.status),
    ).length;
    const paidInvoices = data.invoices.filter(
      (invoice) => invoice.status === "paid",
    ).length;
    const allRecords =
      data.clients.length +
      data.projects.length +
      data.quotations.length +
      data.invoices.length;

    return {
      [routes.clients]: data.clients.length,
      [routes.quotations]: data.quotations.length,
      [routes.ongoingProjects]: ongoingProjects,
      [routes.invoices]: data.invoices.length,
      [routes.pendingPayments]: pendingInvoices,
      [routes.pendingPo]: pendingPoProjects,
      [routes.projects]: data.projects.length,
      [routes.completedProjects]: data.projects.filter(
        (project) => project.status === "completed",
      ).length,
      [routes.analytics]: paidInvoices,
      [routes.statements]: paidInvoices,
      [routes.history]: allRecords,
      [routes.reports]: allRecords,
      [routes.trash]: data.trash?.length || 0,
    };
  }, [data]);

  const isDataEntryRoute =
    pathname.includes("/new") ||
    pathname.includes("/edit") ||
    pathname.includes("/quotations/invoice");

  const autoHideDesktopSidebar = isDataEntryRoute || scrollSidebarHidden;
  const baseDesktopSidebarHidden =
    isDesktop &&
    (sidebarMode === "hidden" ||
      (sidebarMode === "auto" && autoHideDesktopSidebar));
  useEffect(() => {
    function updateViewportMode() {
      const nextIsDesktop = window.innerWidth >= 1101;
      setIsDesktop(nextIsDesktop);

      if (nextIsDesktop) {
        setMobileOpen(false);
      } else {
        setScrollSidebarHidden(false);
        setSidebarHoverOpen(false);
        setSidebarMode("auto");
      }
    }

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => {
      window.removeEventListener("resize", updateViewportMode);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMobileOpen(false);
      setSearchOpen(false);
      setMobileSearchOpen(false);
      setScrollSidebarHidden(false);
      setSidebarHoverOpen(false);
      setSidebarMode("auto");
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (sidebarMode !== "auto") {
      return;
    }

    if (isDataEntryRoute) {
      const timer = window.setTimeout(() => setScrollSidebarHidden(true), 0);
      return () => window.clearTimeout(timer);
    }

    function handlePageScroll() {
      if (window.innerWidth < 1101) {
        setScrollSidebarHidden(false);
        return;
      }

      const currentScroll =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0;

      setScrollSidebarHidden(currentScroll > 36);

      if (scrollHideTimer.current) {
        clearTimeout(scrollHideTimer.current);
      }

      scrollHideTimer.current = setTimeout(() => {
        const nextScroll =
          window.scrollY ||
          document.documentElement.scrollTop ||
          document.body.scrollTop ||
          0;

        if (nextScroll <= 36) {
          setScrollSidebarHidden(false);
        }
      }, 250);
    }

    window.addEventListener("scroll", handlePageScroll, { passive: true });
    document.addEventListener("scroll", handlePageScroll, {
      passive: true,
      capture: true,
    });
    handlePageScroll();

    return () => {
      window.removeEventListener("scroll", handlePageScroll);
      document.removeEventListener("scroll", handlePageScroll, {
        capture: true,
      });

      if (scrollHideTimer.current) {
        clearTimeout(scrollHideTimer.current);
      }
    };
  }, [isDataEntryRoute, sidebarMode]);

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
          "Unnamed Client",
        );
        const city = readFirstString(record, ["city", "location"], "No city");
        const contact = readFirstString(
          record,
          ["contactPerson", "contact", "phone", "mobile"],
          "No contact",
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
        const target =
          `${item.id} ${item.title} ${item.subtitle}`.toLowerCase();
        return target.includes(query);
      })
      .slice(0, 4);

    const projects = data.projects
      .map((project) => {
        const record = asRecord(project);

        const id = readFirstString(
          record,
          ["id", "projectId"],
          crypto.randomUUID(),
        );
        const title = readFirstString(
          record,
          ["companyName", "company", "clientName", "customerName"],
          "Unnamed Project",
        );
        const location = readFirstString(
          record,
          ["location", "site", "storeBranch", "branch"],
          "No location",
        );
        const work = readFirstString(
          record,
          ["description", "workDescription", "scope", "category"],
          "No description",
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
        const target =
          `${item.id} ${item.title} ${item.subtitle}`.toLowerCase();
        return target.includes(query);
      })
      .slice(0, 4);

    const invoices = data.invoices
      .map((invoice) => {
        const record = asRecord(invoice);

        const id = readFirstString(
          record,
          ["id", "invoiceNo"],
          crypto.randomUUID(),
        );
        const title = readFirstString(
          record,
          ["companyName", "company", "clientName", "customerName"],
          "Unnamed Invoice",
        );
        const status = readFirstString(
          record,
          ["status", "paymentStatus"],
          "unknown",
        );
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
        const target =
          `${item.id} ${item.title} ${item.subtitle}`.toLowerCase();
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
    setMobileSearchOpen(false);
    setMobileOpen(false);
    router.push(href);
  }

  function closeSearch() {
    setSearchOpen(false);
    setMobileSearchOpen(false);
  }

  function toggleDesktopSidebar() {
    setSidebarHoverOpen(false);
    setSidebarMode(baseDesktopSidebarHidden ? "shown" : "hidden");
  }

  function showSidebarFromHover() {
    if (!isDesktop || !baseDesktopSidebarHidden) return;
    setSidebarHoverOpen(true);
  }

  function hideSidebarFromHover() {
    if (!isDesktop || !baseDesktopSidebarHidden) return;
    setSidebarHoverOpen(false);
  }

  return (
    <div
      className={`app-frame ${baseDesktopSidebarHidden ? "app-frame--sidebar-hidden" : ""} ${sidebarHoverOpen ? "app-frame--sidebar-hover-open" : ""}`}
    >
      <button
        className={`sidebar-backdrop ${mobileOpen ? "is-open" : ""}`}
        aria-label="Close navigation"
        onClick={() => setMobileOpen(false)}
        type="button"
      />

      {isDesktop && baseDesktopSidebarHidden ? (
        <button
          className="sidebar-hover-zone"
          aria-label="Show sidebar on hover"
          title="Hover to open sidebar"
          type="button"
          onMouseEnter={showSidebarFromHover}
          onFocus={showSidebarFromHover}
          onClick={() => setSidebarMode("shown")}
        />
      ) : null}

      <aside
        className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}
        onMouseEnter={showSidebarFromHover}
        onMouseLeave={hideSidebarFromHover}
      >
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
                const count = navigationCounts[href];

                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={isActive ? "is-active" : ""}
                  >
                    <Icon size={19} />
                    <span>{label}</span>
                    {count !== undefined ? (
                      <span className="navigation-count" aria-label={`${count} items`}>
                        {count > 999 ? "999+" : count}
                      </span>
                    ) : null}
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
        <button
          className={`sidebar-floating-toggle ${baseDesktopSidebarHidden ? "is-collapsed" : ""}`}
          type="button"
          onClick={toggleDesktopSidebar}
          aria-label={
            baseDesktopSidebarHidden ? "Show sidebar" : "Hide sidebar"
          }
          title={baseDesktopSidebarHidden ? "Show sidebar" : "Hide sidebar"}
        >
          <Menu />
          <span>{baseDesktopSidebarHidden ? "Show menu" : "Focus mode"}</span>
        </button>

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

          <div
            className={`topbar__search-wrap ${
              mobileSearchOpen ? "is-mobile-open" : ""
            }`}
          >
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
            <button
              className="topbar__mobile-search"
              aria-label="Search records"
              title="Search records"
              type="button"
              onClick={() => {
                setMobileSearchOpen(true);
                setSearchOpen(true);
              }}
            >
              <Search size={17} />
            </button>

            <Link
              className="button button--primary topbar__import"
              href={routes.excelExport}
            >
              <Upload size={14} />
              Import
            </Link>

            <Link className="button topbar__new" href={routes.newProject}>
              <Plus size={14} />
              New Project
            </Link>

            <button
              className="theme-toggle"
              aria-label={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
              title={
                theme === "dark"
                  ? "Switch to light theme"
                  : "Switch to dark theme"
              }
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

        {searchOpen && (search.trim() || mobileSearchOpen) ? (
          <button
            className="search-backdrop"
            aria-label="Close search"
            type="button"
            onClick={closeSearch}
          />
        ) : null}

        <main className="app-content">
          {/* Cached data remains usable offline while sync failures stay
              visible and retryable at the shell level. */}
          {lastError ? (
            <div className="form-message form-message--error" role="alert">
              {lastError}
              <button
                className="button"
                type="button"
                disabled={syncing}
                onClick={handleForceSync}
              >
                {syncing ? "Retrying..." : "Retry sync"}
              </button>
            </div>
          ) : null}
          {loading ? <LoadingState /> : children}
        </main>

        <nav className="mobile-bottom-nav" aria-label="Mobile quick navigation">
          {mobileBottomItems.map(([label, href, Icon]) => {
            const isActive = isActiveRoute(pathname, href);
            const count = navigationCounts[href];

            return (
              <Link
                key={href}
                href={href}
                className={isActive ? "is-active" : ""}
              >
                <Icon size={18} />
                <span>{label}</span>
                {count !== undefined ? (
                  <span className="mobile-navigation-count" aria-label={`${count} items`}>
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
