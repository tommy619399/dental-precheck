use std::collections::{BTreeMap, HashMap};
use std::env;
use std::fs;
use std::path::PathBuf;

use chrono::Local;
use rusqlite::types::Value as SqlValue;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{Manager, State};

const QUESTIONNAIRE_VERSION: &str = "2026.04-patient-v1";
const ADMIN_PASSWORD: &str = "Dental@2026";

#[derive(Clone)]
struct AppState {
  db_path: PathBuf,
  admin_password_hash: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct ScoreBreakdown {
  anxiety: f64,
  occlusal_perception: f64,
  psychosocial: f64,
  expectation: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct ScoreResult {
  total_score: f64,
  risk_level: String,
  breakdown: ScoreBreakdown,
  flags: Vec<String>,
  recommendations: Vec<String>,
  summary: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PatientInfo {
  patient_name: String,
  gender: String,
  age: Option<i64>,
  assessment_date: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateAssessmentPayload {
  patient_info: PatientInfo,
  answers: Value,
  score: ScoreResult,
  notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateAssessmentPayload {
  patient_name: Option<String>,
  gender: Option<String>,
  age: Option<i64>,
  assessment_date: Option<String>,
  notes: Option<String>,
  followup_status: Option<String>,
  answers: Option<Value>,
  score: Option<ScoreResult>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListFilters {
  keyword: Option<String>,
  risk_level: Option<String>,
  limit: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AssessmentRecord {
  id: i64,
  questionnaire_version: String,
  patient_name: String,
  gender: String,
  age: Option<i64>,
  assessment_date: String,
  answers: Value,
  score: ScoreResult,
  total_score: f64,
  risk_level: String,
  notes: String,
  followup_status: String,
  created_at: String,
  updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RiskDistribution {
  level: String,
  count: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TrendByDate {
  date: String,
  avg_total_score: f64,
  count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DashboardMetric {
  name: String,
  value: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DashboardStats {
  total_count: i64,
  risk_distribution: Vec<RiskDistribution>,
  average_scores: AverageScores,
  trend_by_date: Vec<TrendByDate>,
  top_habits: Vec<DashboardMetric>,
  dissatisfaction: Vec<DashboardMetric>,
  recent_high_risk: Vec<AssessmentRecord>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AverageScores {
  anxiety: f64,
  occlusal_perception: f64,
  psychosocial: f64,
  expectation: f64,
  total_score: f64,
}

fn hash_text(input: &str) -> String {
  let mut hasher = Sha256::new();
  hasher.update(input.as_bytes());
  format!("{:x}", hasher.finalize())
}

fn now_timestamp() -> String {
  Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

fn sanitize_text(input: Option<String>) -> String {
  input.unwrap_or_default().trim().to_string()
}

fn sanitize_followup_status(input: Option<String>, fallback: &str) -> String {
  let normalized = input.unwrap_or_else(|| fallback.to_string());
  if normalized == "已沟通" || normalized == "治疗中" || normalized == "已完成" || normalized == "待跟进" {
    normalized
  } else {
    "待跟进".to_string()
  }
}

fn ensure_db_ready(state: &AppState) -> Result<(), String> {
  if let Some(parent) = state.db_path.parent() {
    fs::create_dir_all(parent).map_err(|error| format!("创建数据目录失败: {error}"))?;
  }

  // One-time migration from the previous Electron path.
  if !state.db_path.exists() {
    if let Ok(appdata_dir) = env::var("APPDATA") {
      let legacy_db = PathBuf::from(appdata_dir)
        .join("dental-precheck-desktop")
        .join("data")
        .join("dental_precheck.sqlite");
      if legacy_db.exists() {
        let _ = fs::copy(&legacy_db, &state.db_path);
      }
    }
  }

  let conn = Connection::open(&state.db_path).map_err(|error| format!("打开数据库失败: {error}"))?;
  conn
    .execute_batch(
      r#"
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
      "#,
    )
    .map_err(|error| format!("初始化数据库结构失败: {error}"))?;
  Ok(())
}

fn open_conn(state: &State<AppState>) -> Result<Connection, String> {
  Connection::open(&state.db_path).map_err(|error| format!("连接数据库失败: {error}"))
}

fn row_to_assessment(row: &Row<'_>) -> rusqlite::Result<AssessmentRecord> {
  let answers_json: String = row.get("answers_json")?;
  let score_json: String = row.get("score_json")?;
  let answers = serde_json::from_str(&answers_json).unwrap_or_else(|_| json!({}));
  let score = serde_json::from_str(&score_json).unwrap_or_default();
  Ok(AssessmentRecord {
    id: row.get("id")?,
    questionnaire_version: row.get("questionnaire_version")?,
    patient_name: row.get("patient_name")?,
    gender: row.get("gender")?,
    age: row.get("age")?,
    assessment_date: row.get("assessment_date")?,
    answers,
    score,
    total_score: row.get("total_score")?,
    risk_level: row.get("risk_level")?,
    notes: row.get("notes")?,
    followup_status: row.get("followup_status")?,
    created_at: row.get("created_at")?,
    updated_at: row.get("updated_at")?,
  })
}

fn get_assessment_by_id(conn: &Connection, id: i64) -> Result<Option<AssessmentRecord>, String> {
  conn
    .query_row(
      "SELECT * FROM assessments WHERE id = ?1",
      params![id],
      row_to_assessment,
    )
    .optional()
    .map_err(|error| format!("读取记录失败: {error}"))
}

fn list_assessments_internal(conn: &Connection, filters: Option<ListFilters>) -> Result<Vec<AssessmentRecord>, String> {
  let mut sql = String::from("SELECT * FROM assessments");
  let mut where_clauses: Vec<String> = Vec::new();
  let mut values: Vec<SqlValue> = Vec::new();
  let mut has_limit = false;

  if let Some(active_filters) = filters {
    if let Some(risk_level) = active_filters.risk_level {
      let trimmed = risk_level.trim().to_string();
      if !trimmed.is_empty() && trimmed != "全部" {
        where_clauses.push("risk_level = ?".to_string());
        values.push(SqlValue::Text(trimmed));
      }
    }

    if let Some(keyword) = active_filters.keyword {
      let trimmed = keyword.trim().to_string();
      if !trimmed.is_empty() {
        where_clauses.push("(patient_name LIKE ? OR notes LIKE ?)".to_string());
        let like_keyword = format!("%{trimmed}%");
        values.push(SqlValue::Text(like_keyword.clone()));
        values.push(SqlValue::Text(like_keyword));
      }
    }

    if let Some(limit) = active_filters.limit {
      let bounded_limit = limit.clamp(1, 5000);
      if bounded_limit > 0 {
        has_limit = true;
        values.push(SqlValue::Integer(bounded_limit));
      }
    }
  }

  if !where_clauses.is_empty() {
    sql.push_str(" WHERE ");
    sql.push_str(&where_clauses.join(" AND "));
  }

  sql.push_str(" ORDER BY created_at DESC");
  if has_limit {
    sql.push_str(" LIMIT ?");
  }

  let mut stmt = conn.prepare(&sql).map_err(|error| format!("创建查询失败: {error}"))?;
  let mapped = stmt
    .query_map(params_from_iter(values.iter()), row_to_assessment)
    .map_err(|error| format!("执行查询失败: {error}"))?;

  let mut records: Vec<AssessmentRecord> = Vec::new();
  for item in mapped {
    records.push(item.map_err(|error| format!("解析查询结果失败: {error}"))?);
  }
  Ok(records)
}

#[tauri::command]
fn create_assessment(state: State<AppState>, payload: CreateAssessmentPayload) -> Result<AssessmentRecord, String> {
  let patient_name = payload.patient_info.patient_name.trim().to_string();
  let gender = payload.patient_info.gender.trim().to_string();
  if patient_name.is_empty() {
    return Err("请填写患者姓名。".to_string());
  }
  if gender.is_empty() {
    return Err("请选择性别。".to_string());
  }

  let assessment_date = payload.patient_info.assessment_date.trim().to_string();
  if assessment_date.is_empty() {
    return Err("评估日期不能为空。".to_string());
  }

  let conn = open_conn(&state)?;
  let notes = sanitize_text(payload.notes);
  let now = now_timestamp();

  conn
    .execute(
      r#"
      INSERT INTO assessments (
        questionnaire_version, patient_name, gender, age, assessment_date,
        answers_json, score_json, total_score, risk_level, notes, followup_status,
        created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
      "#,
      params![
        QUESTIONNAIRE_VERSION,
        patient_name,
        gender,
        payload.patient_info.age,
        assessment_date,
        serde_json::to_string(&payload.answers).map_err(|error| format!("序列化答案失败: {error}"))?,
        serde_json::to_string(&payload.score).map_err(|error| format!("序列化评分失败: {error}"))?,
        payload.score.total_score,
        payload.score.risk_level,
        notes,
        "待跟进",
        now,
        now
      ],
    )
    .map_err(|error| format!("写入记录失败: {error}"))?;

  let id = conn.last_insert_rowid();
  get_assessment_by_id(&conn, id)?.ok_or_else(|| "记录写入成功但读取失败。".to_string())
}

#[tauri::command]
fn list_assessments(state: State<AppState>, filters: Option<ListFilters>) -> Result<Vec<AssessmentRecord>, String> {
  let conn = open_conn(&state)?;
  list_assessments_internal(&conn, filters)
}

#[tauri::command]
fn get_assessment(state: State<AppState>, id: i64) -> Result<Option<AssessmentRecord>, String> {
  let conn = open_conn(&state)?;
  get_assessment_by_id(&conn, id)
}

#[tauri::command]
fn update_assessment(
  state: State<AppState>,
  id: i64,
  payload: UpdateAssessmentPayload,
) -> Result<AssessmentRecord, String> {
  let conn = open_conn(&state)?;
  let existing = get_assessment_by_id(&conn, id)?.ok_or_else(|| format!("未找到记录 ID={id}"))?;

  if payload.answers.is_some() && payload.score.is_none() {
    return Err("更新答案时必须同时提供评分结果。".to_string());
  }

  let patient_name = payload
    .patient_name
    .unwrap_or(existing.patient_name.clone())
    .trim()
    .to_string();
  if patient_name.is_empty() {
    return Err("患者姓名不能为空。".to_string());
  }

  let gender = payload
    .gender
    .unwrap_or(existing.gender.clone())
    .trim()
    .to_string();
  if gender.is_empty() {
    return Err("性别不能为空。".to_string());
  }

  let assessment_date = payload
    .assessment_date
    .unwrap_or(existing.assessment_date.clone())
    .trim()
    .to_string();
  if assessment_date.is_empty() {
    return Err("评估日期不能为空。".to_string());
  }

  let answers = payload.answers.unwrap_or(existing.answers.clone());
  let score = payload.score.unwrap_or(existing.score.clone());
  let notes = payload.notes.unwrap_or(existing.notes.clone());
  let followup_status = sanitize_followup_status(payload.followup_status, &existing.followup_status);
  let updated_at = now_timestamp();

  conn
    .execute(
      r#"
      UPDATE assessments
      SET patient_name = ?1,
          gender = ?2,
          age = ?3,
          assessment_date = ?4,
          answers_json = ?5,
          score_json = ?6,
          total_score = ?7,
          risk_level = ?8,
          notes = ?9,
          followup_status = ?10,
          updated_at = ?11
      WHERE id = ?12
      "#,
      params![
        patient_name,
        gender,
        payload.age.or(existing.age),
        assessment_date,
        serde_json::to_string(&answers).map_err(|error| format!("序列化答案失败: {error}"))?,
        serde_json::to_string(&score).map_err(|error| format!("序列化评分失败: {error}"))?,
        score.total_score,
        score.risk_level,
        notes.trim().to_string(),
        followup_status,
        updated_at,
        id
      ],
    )
    .map_err(|error| format!("更新记录失败: {error}"))?;

  get_assessment_by_id(&conn, id)?.ok_or_else(|| format!("更新后读取记录失败 ID={id}"))
}

#[tauri::command]
fn delete_assessment(state: State<AppState>, id: i64) -> Result<bool, String> {
  let conn = open_conn(&state)?;
  conn
    .execute("DELETE FROM assessments WHERE id = ?1", params![id])
    .map_err(|error| format!("删除记录失败: {error}"))?;
  Ok(true)
}

fn label_for_habit(value: &str) -> String {
  match value {
    "A" => "夜磨牙".to_string(),
    "B" => "紧咬牙".to_string(),
    "C" => "咀嚼肌酸痛".to_string(),
    "D" => "喜食硬物".to_string(),
    "E" => "无".to_string(),
    _ => value.to_string(),
  }
}

fn label_for_dissatisfaction(value: &str) -> String {
  match value {
    "A" => "颜色".to_string(),
    "B" => "易碎裂".to_string(),
    "C" => "咬合不适".to_string(),
    "D" => "价格".to_string(),
    "E" => "其他".to_string(),
    _ => value.to_string(),
  }
}

fn collect_metrics(
  records: &[AssessmentRecord],
  question_id: &str,
  label_mapper: fn(&str) -> String,
  limit: usize,
) -> Vec<DashboardMetric> {
  let mut counter: HashMap<String, i64> = HashMap::new();
  for record in records {
    let Some(answer_value) = record.answers.get(question_id) else {
      continue;
    };
    match answer_value {
      Value::Array(items) => {
        for item in items {
          if let Some(raw) = item.as_str() {
            *counter.entry(raw.to_string()).or_insert(0) += 1;
          }
        }
      }
      Value::String(raw) => {
        *counter.entry(raw.to_string()).or_insert(0) += 1;
      }
      _ => {}
    }
  }

  let mut metrics: Vec<DashboardMetric> = counter
    .into_iter()
    .map(|(name, value)| DashboardMetric {
      name: label_mapper(&name),
      value,
    })
    .collect();
  metrics.sort_by(|left, right| right.value.cmp(&left.value));
  metrics.truncate(limit);
  metrics
}

#[tauri::command]
fn get_dashboard(state: State<AppState>) -> Result<DashboardStats, String> {
  let conn = open_conn(&state)?;
  let records = list_assessments_internal(
    &conn,
    Some(ListFilters {
      keyword: None,
      risk_level: None,
      limit: Some(5000),
    }),
  )?;

  let total_count = records.len() as i64;
  let levels = vec!["低风险", "中风险", "高风险", "极高风险"];
  let risk_distribution = levels
    .iter()
    .map(|level| RiskDistribution {
      level: level.to_string(),
      count: records.iter().filter(|record| record.risk_level == *level).count() as i64,
    })
    .collect::<Vec<RiskDistribution>>();

  let denominator = if total_count > 0 { total_count as f64 } else { 1.0 };
  let anxiety_sum: f64 = records.iter().map(|record| record.score.breakdown.anxiety).sum();
  let occlusal_sum: f64 = records
    .iter()
    .map(|record| record.score.breakdown.occlusal_perception)
    .sum();
  let psychosocial_sum: f64 = records
    .iter()
    .map(|record| record.score.breakdown.psychosocial)
    .sum();
  let expectation_sum: f64 = records
    .iter()
    .map(|record| record.score.breakdown.expectation)
    .sum();
  let total_score_sum: f64 = records.iter().map(|record| record.total_score).sum();

  let average_scores = AverageScores {
    anxiety: (anxiety_sum / denominator * 100.0).round() / 100.0,
    occlusal_perception: (occlusal_sum / denominator * 100.0).round() / 100.0,
    psychosocial: (psychosocial_sum / denominator * 100.0).round() / 100.0,
    expectation: (expectation_sum / denominator * 100.0).round() / 100.0,
    total_score: (total_score_sum / denominator * 100.0).round() / 100.0,
  };

  let mut trend_counter: BTreeMap<String, (f64, i64)> = BTreeMap::new();
  for record in &records {
    let entry = trend_counter
      .entry(record.assessment_date.clone())
      .or_insert((0.0_f64, 0_i64));
    entry.0 += record.total_score;
    entry.1 += 1;
  }

  let mut trend_by_date: Vec<TrendByDate> = trend_counter
    .into_iter()
    .map(|(date, (sum, count))| TrendByDate {
      date,
      avg_total_score: ((sum / count as f64) * 100.0).round() / 100.0,
      count,
    })
    .collect();
  if trend_by_date.len() > 30 {
    trend_by_date = trend_by_date.split_off(trend_by_date.len() - 30);
  }

  let top_habits = collect_metrics(&records, "B5", label_for_habit, 5);
  let dissatisfaction = collect_metrics(&records, "B6", label_for_dissatisfaction, 5);

  let mut high_risk_records: Vec<AssessmentRecord> = records
    .into_iter()
    .filter(|record| record.risk_level == "高风险" || record.risk_level == "极高风险")
    .collect();
  high_risk_records.sort_by(|left, right| right.created_at.cmp(&left.created_at));
  high_risk_records.truncate(8);

  Ok(DashboardStats {
    total_count,
    risk_distribution,
    average_scores,
    trend_by_date,
    top_habits,
    dissatisfaction,
    recent_high_risk: high_risk_records,
  })
}

#[tauri::command]
fn verify_admin_password(state: State<AppState>, password: String) -> bool {
  hash_text(password.trim()) == state.admin_password_hash
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("读取应用数据目录失败: {error}"))?;
      let state = AppState {
        db_path: app_data_dir.join("data").join("dental_precheck.sqlite"),
        admin_password_hash: hash_text(ADMIN_PASSWORD),
      };
      ensure_db_ready(&state)?;
      app.manage(state);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      create_assessment,
      list_assessments,
      get_assessment,
      update_assessment,
      delete_assessment,
      get_dashboard,
      verify_admin_password
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
