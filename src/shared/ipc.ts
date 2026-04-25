export const IPC_CHANNELS = {
  getQuestionnaire: "questionnaire:get",
  createAssessment: "assessment:create",
  listAssessments: "assessment:list",
  getAssessment: "assessment:get",
  updateAssessment: "assessment:update",
  deleteAssessment: "assessment:delete",
  getDashboard: "dashboard:get",
  verifyAdminPassword: "auth:verify-admin",
} as const;
