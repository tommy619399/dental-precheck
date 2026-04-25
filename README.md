# 牙科修复术前心理与咬合知觉评估系统

Dental PreCheck 是一款供个人或科室内部使用的桌面软件，用于牙科修复术前心理状态、牙科焦虑反应、咬合知觉敏感性、既往修复体验和治疗期望评估。

## 技术栈

- Frontend: React + TypeScript + Vite
- Desktop shell: Tauri 2
- Backend: Rust + SQLite
- Charts: ECharts

## 开发运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
npm run tauri:build
```

构建后的 Windows 可执行文件位于：

```text
src-tauri/target/release/dental-precheck-tauri.exe
```

## 说明

- 本仓库只保留源码、配置、图标和必要锁文件。
- 未上传 `node_modules/`、`dist/`、`release/`、`src-tauri/target/` 等依赖或构建产物。
- 默认管理员密码为 `Dental@2026`，正式使用前建议改造成可配置账号或密码。
