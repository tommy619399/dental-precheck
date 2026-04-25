import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, screen } from "electron";
import { AssessmentDatabase } from "./db.js";
import { IPC_CHANNELS } from "../src/shared/ipc.js";
import { questionnaireDefinition } from "../src/shared/questionnaire.js";
import type { AssessmentCreateInput, AssessmentUpdateInput, RiskLevel } from "../src/shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminPasswordHash = createHash("sha256").update("Dental@2026").digest("hex");

const db = new AssessmentDatabase();
let mainWindow: BrowserWindow | null = null;

const createWindow = async (): Promise<void> => {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.max(1080, Math.round(workArea.width * 0.9));
  const height = Math.max(760, Math.round(workArea.height * 0.9));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: "#f7f4ef",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  mainWindow.webContents.on("did-fail-load", (_event, code, description, validatedUrl, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }
    dialog.showErrorBox(
      "页面加载失败",
      `code=${code}\nreason=${description}\nurl=${validatedUrl}\n请将该信息反馈给开发者。`,
    );
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    dialog.showErrorBox("渲染进程异常", `reason=${details.reason}\nexitCode=${details.exitCode}`);
  });

  await mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
};

const registerIpcHandlers = (): void => {
  ipcMain.handle(IPC_CHANNELS.getQuestionnaire, () => questionnaireDefinition);
  ipcMain.handle(IPC_CHANNELS.createAssessment, (_event, payload: AssessmentCreateInput) =>
    db.createAssessment(payload),
  );
  ipcMain.handle(
    IPC_CHANNELS.listAssessments,
    (_event, filters?: { keyword?: string; riskLevel?: RiskLevel | "全部"; limit?: number }) =>
      db.listAssessments(filters),
  );
  ipcMain.handle(IPC_CHANNELS.getAssessment, (_event, id: number) => db.getAssessment(id));
  ipcMain.handle(IPC_CHANNELS.updateAssessment, (_event, id: number, payload: AssessmentUpdateInput) =>
    db.updateAssessment(id, payload),
  );
  ipcMain.handle(IPC_CHANNELS.deleteAssessment, (_event, id: number) => {
    db.deleteAssessment(id);
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.getDashboard, () => db.getDashboard());
  ipcMain.handle(IPC_CHANNELS.verifyAdminPassword, (_event, password: string) => {
    const digest = createHash("sha256").update(password.trim()).digest("hex");
    return digest === adminPasswordHash;
  });
};

app.whenReady().then(async () => {
  await db.init();
  registerIpcHandlers();
  await createWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
