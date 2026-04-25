import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../src/shared/ipc.js";
import type {
  AssessmentCreateInput,
  AssessmentRecord,
  AssessmentUpdateInput,
  DashboardStats,
  QuestionnaireDefinition,
  RiskLevel,
} from "../src/shared/types.js";

const assessmentApi = {
  getQuestionnaire: (): Promise<QuestionnaireDefinition> =>
    ipcRenderer.invoke(IPC_CHANNELS.getQuestionnaire),
  createAssessment: (payload: AssessmentCreateInput): Promise<AssessmentRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.createAssessment, payload),
  listAssessments: (filters?: { keyword?: string; riskLevel?: RiskLevel | "全部"; limit?: number }): Promise<AssessmentRecord[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.listAssessments, filters),
  getAssessment: (id: number): Promise<AssessmentRecord | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.getAssessment, id),
  updateAssessment: (id: number, payload: AssessmentUpdateInput): Promise<AssessmentRecord> =>
    ipcRenderer.invoke(IPC_CHANNELS.updateAssessment, id, payload),
  deleteAssessment: (id: number): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.deleteAssessment, id),
  getDashboard: (): Promise<DashboardStats> => ipcRenderer.invoke(IPC_CHANNELS.getDashboard),
  verifyAdminPassword: (password: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.verifyAdminPassword, password),
};

contextBridge.exposeInMainWorld("assessmentApi", assessmentApi);
