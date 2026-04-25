import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { AssessmentRecord, DashboardStats, FollowupStatus, RiskLevel } from "../shared/types";

interface AdminPortalProps {
  refreshSignal: number;
}

const followupOptions: FollowupStatus[] = ["待跟进", "已沟通", "治疗中", "已完成"];
const riskFilterOptions: Array<RiskLevel | "全部"> = ["全部", "低风险", "中风险", "高风险", "极高风险"];
const pageSizeOptions = [10, 20, 50, 100];

const emptyDashboard: DashboardStats = {
  totalCount: 0,
  riskDistribution: [
    { level: "低风险", count: 0 },
    { level: "中风险", count: 0 },
    { level: "高风险", count: 0 },
    { level: "极高风险", count: 0 },
  ],
  averageScores: {
    anxiety: 0,
    occlusalPerception: 0,
    psychosocial: 0,
    expectation: 0,
    totalScore: 0,
  },
  trendByDate: [],
  topHabits: [],
  dissatisfaction: [],
  recentHighRisk: [],
};

const percentile = (sorted: number[], ratio: number): number => {
  if (sorted.length === 0) {
    return 0;
  }
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const fiveNumberSummary = (values: number[]): [number, number, number, number, number] => {
  if (values.length === 0) {
    return [0, 0, 0, 0, 0];
  }
  const sorted = [...values].sort((left, right) => left - right);
  return [
    sorted[0],
    Number(percentile(sorted, 0.25).toFixed(2)),
    Number(percentile(sorted, 0.5).toFixed(2)),
    Number(percentile(sorted, 0.75).toFixed(2)),
    sorted[sorted.length - 1],
  ];
};

const escapeCsvCell = (value: unknown): string => {
  const raw = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
};

export const AdminPortal = ({ refreshSignal }: AdminPortalProps) => {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [records, setRecords] = useState<AssessmentRecord[]>([]);
  const [dashboard, setDashboard] = useState<DashboardStats>(emptyDashboard);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "全部">("全部");
  const [isLoading, setIsLoading] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [editForm, setEditForm] = useState({
    patientName: "",
    gender: "",
    age: "",
    assessmentDate: "",
    notes: "",
    followupStatus: "待跟进" as FollowupStatus,
  });

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId],
  );

  const totalPages = useMemo(() => Math.max(1, Math.ceil(records.length / pageSize)), [records.length, pageSize]);

  const pagedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return records.slice(start, start + pageSize);
  }, [records, currentPage, pageSize]);

  const loadData = async (): Promise<void> => {
    setIsLoading(true);
    setUpdateError("");
    try {
      const [list, board] = await Promise.all([
        window.assessmentApi.listAssessments({
          keyword: searchKeyword.trim() || undefined,
          riskLevel: riskFilter,
        }),
        window.assessmentApi.getDashboard(),
      ]);
      setRecords(list);
      setDashboard(board);
      setCurrentPage(1);
      if (list.length > 0 && (selectedId === null || !list.some((item) => item.id === selectedId))) {
        setSelectedId(list[0].id);
      }
      if (list.length === 0) {
        setSelectedId(null);
      }
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "加载失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!unlocked) {
      return;
    }
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, refreshSignal]);

  useEffect(() => {
    if (!selectedRecord) {
      return;
    }
    setEditForm({
      patientName: selectedRecord.patientName,
      gender: selectedRecord.gender,
      age: selectedRecord.age === null ? "" : String(selectedRecord.age),
      assessmentDate: selectedRecord.assessmentDate,
      notes: selectedRecord.notes,
      followupStatus: selectedRecord.followupStatus,
    });
  }, [selectedRecord]);

  const handleUnlock = async (): Promise<void> => {
    setAuthError("");
    try {
      const passed = await window.assessmentApi.verifyAdminPassword(password);
      if (!passed) {
        setAuthError("密码错误，请重试。默认密码：Dental@2026");
        return;
      }
      setUnlocked(true);
      setPassword("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "管理员验证失败。");
    }
  };

  const handleDelete = async (id: number): Promise<void> => {
    if (!window.confirm(`确定删除记录 #${id} 吗？此操作不可撤销。`)) {
      return;
    }
    try {
      await window.assessmentApi.deleteAssessment(id);
      await loadData();
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "删除失败。");
    }
  };

  const handleSave = async (): Promise<void> => {
    if (!selectedRecord) {
      return;
    }
    setIsSaving(true);
    setUpdateError("");
    try {
      await window.assessmentApi.updateAssessment(selectedRecord.id, {
        patientName: editForm.patientName.trim(),
        gender: editForm.gender.trim(),
        age: editForm.age ? Number(editForm.age) : null,
        assessmentDate: editForm.assessmentDate,
        notes: editForm.notes,
        followupStatus: editForm.followupStatus,
      });
      await loadData();
    } catch (error) {
      setUpdateError(error instanceof Error ? error.message : "更新失败。");
    } finally {
      setIsSaving(false);
    }
  };

  const riskPieOption = {
    tooltip: { trigger: "item" },
    legend: { bottom: 0, left: "center" },
    series: [
      {
        name: "风险分层",
        type: "pie",
        radius: ["45%", "72%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: "#fff",
          borderWidth: 2,
        },
        data: dashboard.riskDistribution.map((item) => ({ name: item.level, value: item.count })),
      },
    ],
  };

  const avgBarOption = {
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: ["焦虑", "咬合知觉", "心理状态", "期望管理", "总分"],
      axisLabel: { interval: 0 },
    },
    yAxis: { type: "value", name: "平均分" },
    series: [
      {
        type: "bar",
        data: [
          dashboard.averageScores.anxiety,
          dashboard.averageScores.occlusalPerception,
          dashboard.averageScores.psychosocial,
          dashboard.averageScores.expectation,
          dashboard.averageScores.totalScore,
        ],
        itemStyle: { color: "#d48f4e" },
        barMaxWidth: 44,
      },
    ],
  };

  const trendOption = {
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: dashboard.trendByDate.map((item) => item.date),
      boundaryGap: false,
    },
    yAxis: { type: "value", name: "平均总分" },
    series: [
      {
        name: "平均总分",
        type: "line",
        smooth: true,
        data: dashboard.trendByDate.map((item) => item.avgTotalScore),
        areaStyle: {
          color: "rgba(212, 143, 78, 0.2)",
        },
        lineStyle: { color: "#a95f1f", width: 2 },
      },
    ],
  };

  const habitBarOption = {
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: dashboard.topHabits.map((item) => item.name),
      axisLabel: { interval: 0, rotate: 20 },
    },
    yAxis: { type: "value", name: "人数" },
    series: [
      {
        type: "bar",
        data: dashboard.topHabits.map((item) => item.value),
        itemStyle: { color: "#7f9770" },
        barMaxWidth: 42,
      },
    ],
  };

  const boxplotOption = useMemo(() => {
    const categories = ["低风险", "中风险", "高风险", "极高风险"];
    const available = categories
      .map((level) => {
        const values = records.filter((record) => record.riskLevel === level).map((record) => record.totalScore);
        return { level, values };
      })
      .filter((item) => item.values.length > 0);

    return {
      tooltip: { trigger: "item" },
      xAxis: {
        type: "category",
        data: available.map((item) => item.level),
      },
      yAxis: { type: "value", name: "总分分布" },
      series: [
        {
          type: "boxplot",
          data: available.map((item) => fiveNumberSummary(item.values)),
          itemStyle: { color: "#93b6a1", borderColor: "#4f6d56" },
        },
      ],
    };
  }, [records]);

  const exportCsv = (): void => {
    if (records.length === 0) {
      return;
    }
    const headers = [
      "ID",
      "姓名",
      "性别",
      "年龄",
      "评估日期",
      "总分",
      "风险等级",
      "跟进状态",
      "焦虑分",
      "咬合知觉分",
      "心理状态分",
      "期望管理分",
      "风险标记",
      "备注",
      "创建时间",
    ];

    const lines = records.map((record) =>
      [
        record.id,
        record.patientName,
        record.gender,
        record.age ?? "",
        record.assessmentDate,
        record.totalScore,
        record.riskLevel,
        record.followupStatus,
        record.score.breakdown.anxiety,
        record.score.breakdown.occlusalPerception,
        record.score.breakdown.psychosocial,
        record.score.breakdown.expectation,
        record.score.flags.join("；"),
        record.notes,
        record.createdAt,
      ]
        .map(escapeCsvCell)
        .join(","),
    );

    const csv = [headers.map(escapeCsvCell).join(","), ...lines].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    anchor.href = url;
    anchor.download = `dental-assessments-${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  if (!unlocked) {
    return (
      <section className="panel-card admin-lock">
        <h2>管理员入口</h2>
        <p>请输入管理员密码以查看数据库和图表看板。</p>
        <div className="inline-auth">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="管理员密码"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleUnlock();
              }
            }}
          />
          <button type="button" onClick={() => void handleUnlock()}>
            进入管理端
          </button>
        </div>
        {authError ? <p className="error-text">{authError}</p> : null}
      </section>
    );
  }

  return (
    <div className="panel-stack">
      <section className="panel-card">
        <header className="panel-header compact">
          <div>
            <h2>管理员看板</h2>
            <p>SQLite 实时数据统计，支持查询、修改、删除和图表分析。</p>
          </div>
          <div className="toolbar">
            <input
              placeholder="按姓名或备注搜索"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
            <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as RiskLevel | "全部")}>
              {riskFilterOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void loadData()}>
              {isLoading ? "刷新中..." : "刷新"}
            </button>
            <button type="button" onClick={exportCsv} disabled={records.length === 0}>
              导出CSV
            </button>
          </div>
        </header>
        {updateError ? <p className="error-text">{updateError}</p> : null}

        <div className="kpi-grid">
          <article>
            <h4>累计评估</h4>
            <strong>{dashboard.totalCount}</strong>
          </article>
          <article>
            <h4>平均总分</h4>
            <strong>{dashboard.averageScores.totalScore}</strong>
          </article>
          <article>
            <h4>高风险+极高风险</h4>
            <strong>
              {dashboard.riskDistribution
                .filter((item) => item.level === "高风险" || item.level === "极高风险")
                .reduce((sum, item) => sum + item.count, 0)}
            </strong>
          </article>
          <article>
            <h4>近期高风险提醒</h4>
            <strong>{dashboard.recentHighRisk.length}</strong>
          </article>
        </div>

        <div className="chart-grid">
          <div className="chart-card">
            <h4>风险等级分布</h4>
            <ReactECharts option={riskPieOption} style={{ height: 300 }} />
          </div>
          <div className="chart-card">
            <h4>评分维度均值</h4>
            <ReactECharts option={avgBarOption} style={{ height: 300 }} />
          </div>
          <div className="chart-card chart-span">
            <h4>近 30 日评分趋势</h4>
            <ReactECharts option={trendOption} style={{ height: 320 }} />
          </div>
          <div className="chart-card chart-span">
            <h4>风险等级总分箱线图</h4>
            <ReactECharts option={boxplotOption} style={{ height: 320 }} />
          </div>
          <div className="chart-card">
            <h4>口腔习惯分布</h4>
            <ReactECharts option={habitBarOption} style={{ height: 280 }} />
          </div>
          <div className="chart-card">
            <h4>修复不满意原因</h4>
            <ul className="mini-list">
              {dashboard.dissatisfaction.map((item) => (
                <li key={item.name}>
                  <span>{item.name}</span>
                  <strong>{item.value}</strong>
                </li>
              ))}
              {dashboard.dissatisfaction.length === 0 ? <li>暂无数据</li> : null}
            </ul>
          </div>
        </div>
      </section>

      <section className="panel-card">
        <h3>数据库记录（CRUD）</h3>
        <p style={{ margin: "6px 0 12px", color: "var(--text-secondary)" }}>
          当前筛选共 {records.length} 条，当前第 {currentPage}/{totalPages} 页。
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>姓名</th>
                <th>日期</th>
                <th>风险</th>
                <th>总分</th>
                <th>跟进状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedRecords.map((record) => (
                <tr key={record.id} className={record.id === selectedId ? "active-row" : ""}>
                  <td>{record.id}</td>
                  <td>{record.patientName}</td>
                  <td>{record.assessmentDate}</td>
                  <td>{record.riskLevel}</td>
                  <td>{record.totalScore}</td>
                  <td>{record.followupStatus}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" onClick={() => setSelectedId(record.id)}>
                        查看
                      </button>
                      <button type="button" className="danger" onClick={() => void handleDelete(record.id)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {records.length === 0 ? (
                <tr>
                  <td colSpan={7}>暂无记录</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="actions-row" style={{ marginTop: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>每页</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setCurrentPage(1);
              }}
              style={{ width: 88 }}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>条</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => page - 1)}>
              上一页
            </button>
            <span style={{ minWidth: 92, textAlign: "center", fontSize: 13 }}>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((page) => page + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </section>

      {selectedRecord ? (
        <section className="panel-card">
          <h3>记录编辑与详情</h3>
          <div className="edit-grid">
            <label>
              姓名
              <input
                value={editForm.patientName}
                onChange={(event) => setEditForm((prev) => ({ ...prev, patientName: event.target.value }))}
              />
            </label>
            <label>
              性别
              <input
                value={editForm.gender}
                onChange={(event) => setEditForm((prev) => ({ ...prev, gender: event.target.value }))}
              />
            </label>
            <label>
              年龄
              <input
                type="number"
                value={editForm.age}
                onChange={(event) => setEditForm((prev) => ({ ...prev, age: event.target.value }))}
              />
            </label>
            <label>
              日期
              <input
                type="date"
                value={editForm.assessmentDate}
                onChange={(event) => setEditForm((prev) => ({ ...prev, assessmentDate: event.target.value }))}
              />
            </label>
            <label>
              跟进状态
              <select
                value={editForm.followupStatus}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, followupStatus: event.target.value as FollowupStatus }))
                }
              >
                {followupOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="full-width">
            备注
            <textarea
              rows={4}
              value={editForm.notes}
              onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>
          <div className="actions-row">
            <button type="button" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存修改"}
            </button>
          </div>
          <div className="detail-summary">
            <p>风险等级：{selectedRecord.riskLevel}</p>
            <p>总分：{selectedRecord.totalScore}</p>
            <p>风险标记：{selectedRecord.score.flags.join("；") || "无"}</p>
          </div>
        </section>
      ) : null}
    </div>
  );
};
