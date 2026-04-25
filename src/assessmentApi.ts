import { invoke } from "@tauri-apps/api/core";
import { questionnaireDefinition } from "./shared/questionnaire";
import {
  computeScore,
  normalizeAnswers,
  normalizeFollowupStatus,
  normalizePatientInfo,
  validateCreateInput,
} from "./shared/scoring";
import type {
  AssessmentCreateInput,
  AssessmentRecord,
  AssessmentUpdateInput,
  DashboardStats,
  QuestionnaireDefinition,
  RiskLevel,
} from "./shared/types";

type ListFilters = { keyword?: string; riskLevel?: RiskLevel | "全部"; limit?: number };

const hasTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

const toCreatePayload = (payload: AssessmentCreateInput) => {
  const patientInfo = normalizePatientInfo(payload.patientInfo);
  const answers = normalizeAnswers(payload.answers);
  return {
    patientInfo,
    answers,
    score: computeScore(answers),
    notes: payload.notes?.trim() ?? "",
  };
};

const toUpdatePayload = (payload: AssessmentUpdateInput) => {
  const nextPayload: AssessmentUpdateInput & { score?: ReturnType<typeof computeScore> } = {
    ...payload,
  };
  if (payload.followupStatus !== undefined) {
    nextPayload.followupStatus = normalizeFollowupStatus(payload.followupStatus);
  }
  if (payload.answers) {
    const normalizedAnswers = normalizeAnswers(payload.answers);
    nextPayload.answers = normalizedAnswers;
    nextPayload.score = computeScore(normalizedAnswers);
  }
  return nextPayload;
};

const tauriAssessmentApi = {
  getQuestionnaire: async (): Promise<QuestionnaireDefinition> => questionnaireDefinition,
  createAssessment: async (payload: AssessmentCreateInput): Promise<AssessmentRecord> => {
    const errors = validateCreateInput(payload);
    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
    return invoke("create_assessment", { payload: toCreatePayload(payload) });
  },
  listAssessments: async (filters?: ListFilters): Promise<AssessmentRecord[]> => {
    return invoke("list_assessments", { filters });
  },
  getAssessment: async (id: number): Promise<AssessmentRecord | null> => {
    return invoke("get_assessment", { id });
  },
  updateAssessment: async (id: number, payload: AssessmentUpdateInput): Promise<AssessmentRecord> => {
    return invoke("update_assessment", { id, payload: toUpdatePayload(payload) });
  },
  deleteAssessment: async (id: number): Promise<boolean> => {
    return invoke("delete_assessment", { id });
  },
  getDashboard: async (): Promise<DashboardStats> => {
    return invoke("get_dashboard");
  },
  verifyAdminPassword: async (password: string): Promise<boolean> => {
    return invoke("verify_admin_password", { password });
  },
};

export const installAssessmentApi = (): void => {
  const existing = window.assessmentApi;
  if (existing && !hasTauri()) {
    return;
  }
  if (hasTauri()) {
    window.assessmentApi = tauriAssessmentApi;
  }
};
