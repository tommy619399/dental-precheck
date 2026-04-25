import { questionnaireDefinition, questionMap } from "./questionnaire.js";
import type {
  AssessmentAnswers,
  AssessmentCreateInput,
  FollowupStatus,
  PatientInfo,
  RiskLevel,
  ScoreResult,
} from "./types.js";

const requiredQuestionIds = questionnaireDefinition.sections.flatMap((section) =>
  section.questions.filter((question) => question.required).map((question) => question.id),
);

const sanitizeString = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const toIntOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.round(parsed);
};

export const normalizePatientInfo = (info: Partial<PatientInfo>): PatientInfo => {
  const date = sanitizeString(info.assessmentDate);
  return {
    patientName: sanitizeString(info.patientName),
    gender: sanitizeString(info.gender),
    age: toIntOrNull(info.age),
    assessmentDate: date || new Date().toISOString().slice(0, 10),
  };
};

export const normalizeAnswers = (answers: AssessmentAnswers): AssessmentAnswers => {
  const normalized: AssessmentAnswers = {};
  questionnaireDefinition.sections.forEach((section) => {
    section.questions.forEach((question) => {
      const currentValue = answers[question.id];
      if (question.type === "multi") {
        normalized[question.id] = Array.isArray(currentValue)
          ? currentValue.map((item) => String(item))
          : [];
        return;
      }
      if (question.type === "scale") {
        const parsed = Number(currentValue);
        const min = question.min ?? 0;
        const max = question.max ?? 10;
        if (!Number.isFinite(parsed)) {
          normalized[question.id] = min;
          return;
        }
        normalized[question.id] = Math.max(min, Math.min(max, Math.round(parsed)));
        return;
      }
      normalized[question.id] = typeof currentValue === "string" ? currentValue : "";
    });
  });
  return normalized;
};

const calculateSingleScore = (questionId: string, value: string): number => {
  const question = questionMap.get(questionId);
  if (!question || question.type !== "single" || !question.options) {
    return 0;
  }
  const option = question.options.find((item) => item.value === value);
  return option?.score ?? 0;
};

const calculateMultiScore = (questionId: string, value: string[]): number => {
  const question = questionMap.get(questionId);
  if (!question || question.type !== "multi" || !question.options) {
    return 0;
  }
  const selected = new Set(value);
  if (selected.has("E")) {
    return 0;
  }
  return question.options
    .filter((option) => selected.has(option.value))
    .reduce((sum, option) => sum + option.score, 0);
};

const calculateScaleScore = (questionId: string, value: number): number => {
  if (questionId !== "D2") {
    return 0;
  }
  return Number(((value / 10) * 5).toFixed(1));
};

const determineRiskLevel = (totalScore: number): RiskLevel => {
  if (totalScore <= 20) {
    return "低风险";
  }
  if (totalScore <= 34) {
    return "中风险";
  }
  if (totalScore <= 49) {
    return "高风险";
  }
  return "极高风险";
};

const ensureMultiArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item));
};

const ensureNumber = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const validateRequiredAnswers = (answers: AssessmentAnswers): string[] => {
  return requiredQuestionIds.filter((questionId) => {
    const question = questionMap.get(questionId);
    const value = answers[questionId];
    if (!question) {
      return false;
    }
    if (question.type === "multi") {
      return !Array.isArray(value) || value.length === 0;
    }
    if (question.type === "scale") {
      return !Number.isFinite(Number(value));
    }
    return typeof value !== "string" || value.length === 0;
  });
};

export const validateCreateInput = (input: AssessmentCreateInput): string[] => {
  const errors: string[] = [];
  const patientInfo = normalizePatientInfo(input.patientInfo);
  if (!patientInfo.patientName) {
    errors.push("请填写患者姓名。");
  }
  if (!patientInfo.gender) {
    errors.push("请选择性别。");
  }
  if (patientInfo.age !== null && (patientInfo.age < 1 || patientInfo.age > 120)) {
    errors.push("年龄需在 1-120 之间。");
  }
  const normalizedAnswers = normalizeAnswers(input.answers);
  const missing = validateRequiredAnswers(normalizedAnswers);
  if (missing.length > 0) {
    errors.push(`问卷未完成：${missing.join(", ")}`);
  }
  return errors;
};

export const normalizeFollowupStatus = (value: unknown): FollowupStatus => {
  const normalized = sanitizeString(value);
  if (normalized === "已沟通" || normalized === "治疗中" || normalized === "已完成") {
    return normalized;
  }
  return "待跟进";
};

export const computeScore = (answersInput: AssessmentAnswers): ScoreResult => {
  const answers = normalizeAnswers(answersInput);
  const anxiety =
    calculateSingleScore("A1", String(answers.A1)) +
    calculateSingleScore("A2", String(answers.A2)) +
    calculateSingleScore("A3", String(answers.A3)) +
    calculateSingleScore("A4", String(answers.A4)) +
    calculateSingleScore("A5", String(answers.A5));

  const occlusalPerception =
    calculateSingleScore("B1", String(answers.B1)) +
    calculateSingleScore("B2", String(answers.B2)) +
    calculateSingleScore("B3", String(answers.B3)) +
    calculateSingleScore("B4", String(answers.B4)) +
    calculateMultiScore("B5", ensureMultiArray(answers.B5)) +
    calculateSingleScore("B6", String(answers.B6));

  const psychosocial =
    calculateSingleScore("C1", String(answers.C1)) +
    calculateSingleScore("C2", String(answers.C2)) +
    calculateSingleScore("C3", String(answers.C3)) +
    calculateSingleScore("C4", String(answers.C4));

  const expectation =
    calculateSingleScore("D1", String(answers.D1)) +
    calculateScaleScore("D2", ensureNumber(answers.D2));

  const totalScore = Number((anxiety + occlusalPerception + psychosocial + expectation).toFixed(1));
  const riskLevel = determineRiskLevel(totalScore);
  const flags: string[] = [];

  if (anxiety >= 18 || calculateSingleScore("C3", String(answers.C3)) >= 2) {
    flags.push("焦虑反应偏高");
  }
  if (
    calculateSingleScore("B3", String(answers.B3)) >= 3 ||
    calculateSingleScore("B4", String(answers.B4)) >= 3 ||
    calculateSingleScore("B2", String(answers.B2)) >= 4
  ) {
    flags.push("咬合高敏感/高关注");
  }
  if (ensureMultiArray(answers.B5).some((item) => ["A", "B", "C"].includes(item))) {
    flags.push("存在磨牙或紧咬牙风险");
  }
  if (String(answers.C1) === "C") {
    flags.push("Doctor Shopping 预警");
  }
  if (String(answers.D1) === "D" || ensureNumber(answers.D2) >= 8 || String(answers.C4) === "C") {
    flags.push("治疗结果完美化期待偏高");
  }

  const recommendations: string[] = [];
  if (riskLevel === "低风险") {
    recommendations.push("可按常规流程修复，重点确保治疗步骤和阶段目标解释清晰。");
  }
  if (riskLevel === "中风险") {
    recommendations.push("建议分阶段沟通关键节点，每次复诊前复盘上次目标达成情况。");
  }
  if (riskLevel === "高风险") {
    recommendations.push("建议采用“短周期复诊 + 咬合微调记录”，降低主观不适放大效应。");
  }
  if (riskLevel === "极高风险") {
    recommendations.push("建议先进行期望校准与风险告知，再进入最终修复方案确认。");
  }

  if (flags.includes("焦虑反应偏高")) {
    recommendations.push("治疗前可使用简短放松指导，必要时增加术前沟通时长。");
  }
  if (flags.includes("咬合高敏感/高关注")) {
    recommendations.push("建议提供可视化咬合记录，避免短期内反复大幅调整。");
  }
  if (flags.includes("存在磨牙或紧咬牙风险")) {
    recommendations.push("建议同步评估夜间护牙垫及肌肉负荷管理方案。");
  }
  if (flags.includes("Doctor Shopping 预警")) {
    recommendations.push("建议统一治疗目标文档，减少多源建议带来的认知冲突。");
  }
  if (flags.includes("治疗结果完美化期待偏高")) {
    recommendations.push("建议提前说明“功能优先于绝对完美”的边界并设置可接受阈值。");
  }

  const summary =
    riskLevel === "低风险"
      ? "总体风险较低，可按常规修复流程推进。"
      : riskLevel === "中风险"
        ? "存在可控风险，建议加强沟通和阶段性预期管理。"
        : riskLevel === "高风险"
          ? "风险较高，建议采用更细颗粒度的复诊与调整策略。"
          : "风险极高，建议优先完成期望管理与心理压力干预。";

  return {
    totalScore,
    riskLevel,
    breakdown: {
      anxiety,
      occlusalPerception,
      psychosocial,
      expectation,
    },
    flags,
    recommendations,
    summary,
  };
};
