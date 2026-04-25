import { useState } from "react";
import { AdminPortal } from "./components/AdminPortal";
import { AdminErrorBoundary } from "./components/AdminErrorBoundary";
import { PatientAssessmentForm } from "./components/PatientAssessmentForm";
import type { AssessmentRecord } from "./shared/types";
import "./App.css";

type ViewMode = "patient" | "admin";

function App() {
  const [mode, setMode] = useState<ViewMode>("patient");
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [latestSavedId, setLatestSavedId] = useState<number | null>(null);

  const handleSaved = (record: AssessmentRecord): void => {
    setLatestSavedId(record.id);
    setRefreshSignal((previous) => previous + 1);
  };

  return (
    <div className="app-shell">
      <header className="top-header">
        <div>
          <h1>牙科修复术前心理与咬合知觉评估系统</h1>
          <p>Desktop Edition · React + Electron + SQLite</p>
        </div>
        <div className="tab-switch" role="tablist" aria-label="view switch">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "patient"}
            className={mode === "patient" ? "active" : ""}
            onClick={() => setMode("patient")}
          >
            患者评估
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "admin"}
            className={mode === "admin" ? "active" : ""}
            onClick={() => setMode("admin")}
          >
            管理员看板
          </button>
        </div>
      </header>

      {latestSavedId ? <div className="save-tip">最近保存记录 ID：#{latestSavedId}</div> : null}

      <main className="content-area">
        {mode === "patient" ? (
          <PatientAssessmentForm onSaved={handleSaved} />
        ) : (
          <AdminErrorBoundary>
            <AdminPortal refreshSignal={refreshSignal} />
          </AdminErrorBoundary>
        )}
      </main>
    </div>
  );
}

export default App;
