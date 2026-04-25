/// <reference types="vite/client" />

import type {
  AssessmentCreateInput,
  AssessmentRecord,
  AssessmentUpdateInput,
  DashboardStats,
  QuestionnaireDefinition,
  RiskLevel,
} from "./shared/types";

declare global {
  interface Window {
    assessmentApi: {
      getQuestionnaire: () => Promise<QuestionnaireDefinition>;
      createAssessment: (payload: AssessmentCreateInput) => Promise<AssessmentRecord>;
      listAssessments: (filters?: {
        keyword?: string;
        riskLevel?: RiskLevel | "全部";
        limit?: number;
      }) => Promise<AssessmentRecord[]>;
      getAssessment: (id: number) => Promise<AssessmentRecord | null>;
      updateAssessment: (id: number, payload: AssessmentUpdateInput) => Promise<AssessmentRecord>;
      deleteAssessment: (id: number) => Promise<boolean>;
      getDashboard: () => Promise<DashboardStats>;
      verifyAdminPassword: (password: string) => Promise<boolean>;
    };
  }
}
