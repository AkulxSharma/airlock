"use client";

import { ChevronLeft, Crosshair, LayoutDashboard, Moon, ScrollText, Sun, Wallet } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

export type View = "console" | "log" | "targets" | "wallets";
const NAV: { id: View; name: string; icon: typeof LayoutDashboard }[] = [
  { id: "console", name: "Console", icon: LayoutDashboard },
  { id: "log", name: "Event log", icon: ScrollText },
  { id: "targets", name: "Demo targets", icon: Crosshair },
  { id: "wallets", name: "Wallets", icon: Wallet },
];

// The theme lives on <html class="dark">. Subscribe to it so the label always matches the page.
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const useDark = () => useSyncExternalStore(subscribeTheme, () => document.documentElement.classList.contains("dark"), () => false);

const cx = (...c: (string | false)[]) => c.filter(Boolean).join(" ");

export function Sidebar({ view, onView, online }: { view: View; onView: (v: View) => void; online: boolean | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const dark = useDark();

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch { /* private window */ }
  };

  return (
    <aside className={cx("relative z-10 flex h-full flex-col border-r border-border bg-sidebar/80 backdrop-blur transition-all duration-300 ease-in-out", collapsed ? "w-16" : "w-64")}>
      <div className={cx("flex items-center border-b border-border p-4", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && <h1 className="text-xl font-semibold tracking-tight">Airlock</h1>}
        <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="rounded-md p-1 transition-colors hover:bg-accent">
          <ChevronLeft className={cx("h-4 w-4 text-muted-foreground transition-transform duration-300", collapsed && "rotate-180")} />
        </button>
      </div>

      <div className={cx("flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground", collapsed && "justify-center px-0")} title={online ? "Server online" : "Server offline"}>
        <span className={cx("h-2 w-2 shrink-0 rounded-full", online === null ? "bg-muted-foreground" : online ? "bg-low" : "bg-high")} />
        {!collapsed && <span>{online === null ? "Checking server" : online ? "Server online" : "Server offline"}</span>}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ id, name, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onView(id)}
            title={collapsed ? name : undefined}
            className={cx(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
              collapsed && "justify-center px-0",
              view === id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{name}</span>}
          </button>
        ))}
      </nav>

      <div className="space-y-2 border-t border-border p-4">
        <button
          onClick={toggleTheme}
          title={collapsed ? (dark ? "Light Mode" : "Dark Mode") : undefined}
          className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent/50 hover:text-foreground", collapsed && "justify-center px-0")}
        >
          {dark ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
          {!collapsed && <span>{dark ? "Light Mode" : "Dark Mode"}</span>}
        </button>
        {!collapsed && <p className="px-3 text-[11px] leading-relaxed text-muted-foreground">Testnet only. A risk signal, not a guarantee.</p>}
      </div>
    </aside>
  );
}
