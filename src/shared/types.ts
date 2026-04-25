export type QuestionType = "single" | "multi" | "scale";

export interface QuestionOption {
  value: string;
  label: string;
  score: number;
}

export interface QuestionDefinition {
  id: string;
  title: string;
  type: QuestionType;
  required?: boolean;
  helpText?: string;
  options?: QuestionOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface SectionDefinition {
  id: string;
  title: string;
  description?: string;
  questions: QuestionDefinition[];
}

export interface QuestionnaireDefinition {
  version: string;
  name: string;
  sections: SectionDefinition[];
}

export type AnswerValue = string | string[] | number;
export type AssessmentAnswers = Record<string, AnswerValue>;

export interface PatientInfo {
  patientName: string;
  gender: string;
  age: number | null;
  assessmentDate: string;
}

export type FollowupStatus = "待跟进" | "已沟通" | "治疗中" | "已完成";

export type RiskLevel = "低风险" | "中风险" | "高风险" | "极高风险";

export interface ScoreBreakdown {
  anxiety: number;
  occlusalPerception: number;
  psychosocial: number;
  expectation: number;
}

export interface ScoreResult {
  totalScore: number;
  riskLevel: RiskLevel;
  breakdown: ScoreBreakdown;
  flags: string[];
  recommendations: string[];
  summary: string;
}

export interface AssessmentCreateInput {
  patientInfo: PatientInfo;
  answers: AssessmentAnswers;
  notes?: string;
}

export interface AssessmentUpdateInput {
  patientName?: string;
  gender?: string;
  age?: number | null;
  assessmentDate?: string;
  notes?: string;
  followupStatus?: FollowupStatus;
  answers?: AssessmentAnswers;
}

export interface AssessmentRecord {
  id: number;
  questionnaireVersion: string;
  patientName: string;
  gender: string;
  age: number | null;
  assessmentDate: string;
  answers: AssessmentAnswers;
  score: ScoreResult;
  totalScore: number;
  riskLevel: RiskLevel;
  notes: string;
  followupStatus: FollowupStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardMetric {
  name: string;
  value: number;
}

export interface DashboardStats {
  totalCount: number;
  riskDistribution: { level: RiskLevel; count: number }[];
  averageScores: ScoreBreakdown & { totalScore: number };
  trendByDate: { date: string; avgTotalScore: number; count: number }[];
  topHabits: DashboardMetric[];
  dissatisfaction: DashboardMetric[];
  recentHighRisk: AssessmentRecord[];
}
