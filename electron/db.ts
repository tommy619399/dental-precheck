import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { app } from "electron";
import dayjs from "dayjs";
import initSqlJs, { type BindParams, type Database, type SqlJsStatic, type SqlValue } from "sql.js";
import { computeScore, normalizeAnswers, normalizeFollowupStatus, normalizePatientInfo, validateCreateInput } from "../src/shared/scoring.js";
import { dissatisfactionLabels, habitLabels, QUESTIONNAIRE_VERSION } from "../src/shared/questionnaire.js";
import type {
  AssessmentCreateInput,
  AssessmentRecord,
  AssessmentUpdateInput,
  DashboardMetric,
  DashboardStats,
  FollowupStatus,
  RiskLevel,
} from "../src/shared/types.js";

interface StoredRow {
  id: number;
  questionnaire_version: string;
  patient_name: string;
  gender: string;
  age: number | null;
  assessment_date: string;
  answers_json: string;
  score_json: string;
  total_score: number;
  risk_level: RiskLevel;
  notes: string;
  followup_status: FollowupStatus;
  created_at: string;
  updated_at: string;
}

export interface AssessmentListFilters {
  keyword?: string;
  riskLevel?: RiskLevel | "全部";
  limit?: number;
}

const require = createRequire(import.meta.url);

export class AssessmentDatabase {
  private sql: SqlJsStatic | null = null;
  private db: Database | null = null;
  private dbPath = "";

  async init(): Promise<void> {
    if (this.db) {
      return;
    }
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    this.sql = await initSqlJs({
      locateFile: () => wasmPath,
    });
    const dataDir = path.join(app.getPath("userData"), "data");
    fs.mkdirSync(dataDir, { recursive: true });
    this.dbPath = path.join(dataDir, "dental_precheck.sqlite");
    if (fs.existsSync(this.dbPath)) {
      const fileData = fs.readFileSync(this.dbPath);
      this.db = new this.sql.Database(new Uint8Array(fileData));
    } else {
      this.db = new this.sql.Database();
    }
    this.runMigrations();
    this.persist();
  }

  private assertDb(): Database {
    if (!this.db) {
      throw new Error("数据库尚未初始化。");
    }
    return this.db;
  }

  private runMigrations(): void {
    const db = this.assertDb();
    db.run(`
      CREATE TABLE IF NOT EXISTS assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        questionnaire_version TEXT NOT NULL,
        patient_name TEXT NOT NULL,
        gender TEXT NOT NULL,
        age INTEGER,
        assessment_date TEXT NOT NULL,
        answers_json TEXT NOT NULL,
        score_json TEXT NOT NULL,
        total_score REAL NOT NULL,
        risk_level TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        followup_status TEXT NOT NULL DEFAULT '待跟进',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_assessment_date ON assessments(assessment_date);
      CREATE INDEX IF NOT EXISTS idx_risk_level ON assessments(risk_level);
      CREATE INDEX IF NOT EXISTS idx_created_at ON assessments(created_at);
    `);
  }

  private persist(): void {
    const db = this.assertDb();
    const exported = db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(exported));
  }

  private query<T>(sql: string, params: SqlValue[] = []): T[] {
    const db = this.assertDb();
    const stmt = db.prepare(sql);
    stmt.bind(params as BindParams);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  }

  private queryOne<T>(sql: string, params: SqlValue[] = []): T | null {
    const rows = this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  private toRecord(row: StoredRow): AssessmentRecord {
    return {
      id: Number(row.id),
      questionnaireVersion: row.questionnaire_version,
      patientName: row.patient_name,
      gender: row.gender,
      age: row.age === null ? null : Number(row.age),
      assessmentDate: row.assessment_date,
      answers: JSON.parse(row.answers_json),
      score: JSON.parse(row.score_json),
      totalScore: Number(row.total_score),
      riskLevel: row.risk_level,
      notes: row.notes ?? "",
      followupStatus: row.followup_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private getAssessmentOrThrow(id: number): AssessmentRecord {
    const found = this.getAssessment(id);
    if (!found) {
      throw new Error(`未找到记录 ID=${id}`);
    }
    return found;
  }

  createAssessment(payload: AssessmentCreateInput): AssessmentRecord {
    const errors = validateCreateInput(payload);
    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
    const patientInfo = normalizePatientInfo(payload.patientInfo);
    const answers = normalizeAnswers(payload.answers);
    const score = computeScore(answers);
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const db = this.assertDb();
    const stmt = db.prepare(`
      INSERT INTO assessments (
        questionnaire_version,
        patient_name,
        gender,
        age,
        assessment_date,
        answers_json,
        score_json,
        total_score,
        risk_level,
        notes,
        followup_status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      QUESTIONNAIRE_VERSION,
      patientInfo.patientName,
      patientInfo.gender,
      patientInfo.age,
      patientInfo.assessmentDate,
      JSON.stringify(answers),
      JSON.stringify(score),
      score.totalScore,
      score.riskLevel,
      payload.notes?.trim() ?? "",
      "待跟进",
      now,
      now,
    ]);
    stmt.free();
    this.persist();
    const idRow = this.queryOne<{ id: number }>("SELECT last_insert_rowid() AS id");
    if (!idRow) {
      throw new Error("写入成功但无法读取新记录 ID。");
    }
    return this.getAssessmentOrThrow(Number(idRow.id));
  }

  listAssessments(filters?: AssessmentListFilters): AssessmentRecord[] {
    const whereParts: string[] = [];
    const values: SqlValue[] = [];
    if (filters?.riskLevel && filters.riskLevel !== "全部") {
      whereParts.push("risk_level = ?");
      values.push(filters.riskLevel);
    }
    if (filters?.keyword) {
      whereParts.push("(patient_name LIKE ? OR notes LIKE ?)");
      values.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
    }
    let sql = "SELECT * FROM assessments";
    if (whereParts.length > 0) {
      sql += ` WHERE ${whereParts.join(" AND ")}`;
    }
    sql += " ORDER BY created_at DESC";
    if (filters?.limit && filters.limit > 0) {
      sql += " LIMIT ?";
      values.push(filters.limit);
    }
    const rows = this.query<StoredRow>(sql, values);
    return rows.map((row) => this.toRecord(row));
  }

  getAssessment(id: number): AssessmentRecord | null {
    const row = this.queryOne<StoredRow>("SELECT * FROM assessments WHERE id = ?", [id]);
    return row ? this.toRecord(row) : null;
  }

  updateAssessment(id: number, updates: AssessmentUpdateInput): AssessmentRecord {
    const existing = this.getAssessmentOrThrow(id);
    const nextAnswers = updates.answers ? normalizeAnswers(updates.answers) : existing.answers;
    const nextScore = updates.answers ? computeScore(nextAnswers) : existing.score;
    const nextPatient = normalizePatientInfo({
      patientName: updates.patientName ?? existing.patientName,
      gender: updates.gender ?? existing.gender,
      age: updates.age ?? existing.age,
      assessmentDate: updates.assessmentDate ?? existing.assessmentDate,
    });
    if (!nextPatient.patientName) {
      throw new Error("患者姓名不能为空。");
    }
    if (!nextPatient.gender) {
      throw new Error("性别不能为空。");
    }
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const db = this.assertDb();
    const stmt = db.prepare(`
      UPDATE assessments
      SET patient_name = ?,
          gender = ?,
          age = ?,
          assessment_date = ?,
          answers_json = ?,
          score_json = ?,
          total_score = ?,
          risk_level = ?,
          notes = ?,
          followup_status = ?,
          updated_at = ?
      WHERE id = ?
    `);
    stmt.run([
      nextPatient.patientName,
      nextPatient.gender,
      nextPatient.age,
      nextPatient.assessmentDate,
      JSON.stringify(nextAnswers),
      JSON.stringify(nextScore),
      nextScore.totalScore,
      nextScore.riskLevel,
      updates.notes !== undefined ? updates.notes.trim() : existing.notes,
      updates.followupStatus !== undefined
        ? normalizeFollowupStatus(updates.followupStatus)
        : existing.followupStatus,
      now,
      id,
    ]);
    stmt.free();
    this.persist();
    return this.getAssessmentOrThrow(id);
  }

  deleteAssessment(id: number): void {
    const db = this.assertDb();
    const stmt = db.prepare("DELETE FROM assessments WHERE id = ?");
    stmt.run([id]);
    stmt.free();
    this.persist();
  }

  getDashboard(): DashboardStats {
    const rows = this.listAssessments({ limit: 5000 });
    const totalCount = rows.length;
    const riskLevels: RiskLevel[] = ["低风险", "中风险", "高风险", "极高风险"];
    const riskDistribution = riskLevels.map((level) => ({
      level,
      count: rows.filter((item) => item.riskLevel === level).length,
    }));

    const sum = rows.reduce(
      (acc, item) => {
        acc.anxiety += item.score.breakdown.anxiety;
        acc.occlusalPerception += item.score.breakdown.occlusalPerception;
        acc.psychosocial += item.score.breakdown.psychosocial;
        acc.expectation += item.score.breakdown.expectation;
        acc.totalScore += item.totalScore;
        return acc;
      },
      { anxiety: 0, occlusalPerception: 0, psychosocial: 0, expectation: 0, totalScore: 0 },
    );

    const denominator = totalCount || 1;
    const averageScores = {
      anxiety: Number((sum.anxiety / denominator).toFixed(2)),
      occlusalPerception: Number((sum.occlusalPerception / denominator).toFixed(2)),
      psychosocial: Number((sum.psychosocial / denominator).toFixed(2)),
      expectation: Number((sum.expectation / denominator).toFixed(2)),
      totalScore: Number((sum.totalScore / denominator).toFixed(2)),
    };

    const trendMap = new Map<string, { total: number; count: number }>();
    rows.forEach((row) => {
      const key = row.assessmentDate;
      const item = trendMap.get(key) ?? { total: 0, count: 0 };
      item.total += row.totalScore;
      item.count += 1;
      trendMap.set(key, item);
    });
    const trendByDate = [...trendMap.entries()]
      .map(([date, value]) => ({
        date,
        avgTotalScore: Number((value.total / value.count).toFixed(2)),
        count: value.count,
      }))
      .sort((left, right) => left.date.localeCompare(right.date))
      .slice(-30);

    const topHabits = this.countMetric(rows, "B5", habitLabels, 5);
    const dissatisfaction = this.countMetric(rows, "B6", dissatisfactionLabels, 5);
    const recentHighRisk = rows
      .filter((item) => item.riskLevel === "高风险" || item.riskLevel === "极高风险")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 8);

    return {
      totalCount,
      riskDistribution,
      averageScores,
      trendByDate,
      topHabits,
      dissatisfaction,
      recentHighRisk,
    };
  }

  private countMetric(
    rows: AssessmentRecord[],
    questionId: string,
    labels: Record<string, string>,
    limit: number,
  ): DashboardMetric[] {
    const counter = new Map<string, number>();
    rows.forEach((row) => {
      const answer = row.answers[questionId];
      if (Array.isArray(answer)) {
        answer.forEach((item) => {
          const key = String(item);
          counter.set(key, (counter.get(key) ?? 0) + 1);
        });
      } else if (answer !== undefined && answer !== null && answer !== "") {
        const key = String(answer);
        counter.set(key, (counter.get(key) ?? 0) + 1);
      }
    });
    return [...counter.entries()]
      .map(([key, value]) => ({ name: labels[key] ?? key, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, limit);
  }
}
