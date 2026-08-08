import { useState } from "react";
import { Sidebar, type ViewKey, viewTitle } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { IconClose } from "@/components/icons";
import type { Env } from "@/data/lattice";

import Overview from "@/views/Overview";
import EvaluationRuns from "@/views/EvaluationRuns";
import Dispositions from "@/views/Dispositions";
import ContextContracts from "@/views/ContextContracts";
import Outliers from "@/views/Outliers";
import Identities from "@/views/Identities";
import NewEval from "@/views/NewEval";

type ExtendedViewKey = ViewKey | "neweval";

export default function App() {
  const [view, setView] = useState<ExtendedViewKey>("overview");
  const [query, setQuery] = useState("");
  const [env, setEnv] = useState<Env>("Production");
  const [mobileOpen, setMobileOpen] = useState(false);

  const select = (v: ViewKey | "neweval") => {
    setView(v);
    setMobileOpen(false);
  };

  const viewProps = { query, env, onNavigate: select };

  const renderView = () => {
    switch (view) {
      case "overview":
        return <Overview {...viewProps} />;
      case "runs":
        return <EvaluationRuns {...viewProps} />;
      case "dispositions":
        return <Dispositions {...viewProps} />;
      case "contracts":
        return <ContextContracts {...viewProps} />;
      case "outliers":
        return <Outliers {...viewProps} />;
      case "identities":
        return <Identities {...viewProps} />;
      case "neweval":
        return <NewEval onNavigate={select} />;
    }
  };

  const title = view === "neweval" ? "New Evaluation" : viewTitle(view as ViewKey);

  return (
    <div className="flex h-screen overflow-hidden bg-ink-950 text-fg">
      {/* desktop sidebar */}
      <div className="hidden shrink-0 lg:block">
        <Sidebar active={view === "neweval" ? "runs" : (view as ViewKey)} onSelect={select} />
      </div>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="anim-in absolute left-0 top-0 h-full">
            <Sidebar active={view === "neweval" ? "runs" : (view as ViewKey)} onSelect={select} onClose={() => setMobileOpen(false)} />
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="absolute right-4 top-4 rounded-lg bg-white/[0.06] p-2 text-fg"
            aria-label="Close menu"
          >
            <IconClose size={18} />
          </button>
        </div>
      )}

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={title}
          query={query}
          onQuery={setQuery}
          env={env}
          onEnv={setEnv}
          onMenu={() => setMobileOpen(true)}
          onNewEval={() => setView("neweval")}
        />

        <main className="app-grid relative flex-1 overflow-y-auto bg-fixed">
          <div className="mx-auto w-full max-w-[1440px] p-4 md:p-6">
            <div key={view} className="anim-in">
              {renderView()}
            </div>
            <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5 text-[11px] text-faint">
              <span>
                <span className="font-semibold text-muted">Lattice</span> · Context Governance Control
                Plane
              </span>
              <span className="mono">compiler v4.2.1 · region us-east-1 · build 0f3a7c</span>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
