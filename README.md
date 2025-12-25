# 视频抽帧与人头姿态标注工具

## 1. 项目简介
基于 FastAPI + React 的前后端分离标注工具，支持 mp4 视频上传、抽帧、逐帧人头姿态标注（1=正, 2=下, 3=左, 4=右, 5=歪），并一键导出裁剪图片与标签文件。当前聚焦数据采集与标注，不包含模型训练。

## 2. 快速使用

### 环境准备
- Python 3.9+，Node.js 18+（包含 npm）

### 安装依赖

**macOS（bash/zsh）**
- 后端：`cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`
- 前端：`cd frontend && npm install`

**Windows（PowerShell）**
- 后端：`cd backend; python -m venv .venv; .\\.venv\\Scripts\\Activate.ps1; pip install -r requirements.txt`
- 前端：`cd frontend; npm install`

### 启动服务（两个终端）

**macOS（bash/zsh）**
- 后端（默认 http://localhost:8000）：  
  `cd backend && c z`
- 前端（默认 http://localhost:5173）：  
  `cd frontend && npm run dev`

**Windows（PowerShell）**
- 后端（默认 http://localhost:8000）：  
  `cd backend; .\\.venv\\Scripts\\Activate.ps1; python -m uvicorn app.main:app --reload --app-dir .`
- 前端（默认 http://localhost:5173）：  
  `cd frontend; npm run dev`

### 网页操作流程
1. 打开前端地址 `/upload`：选择 mp4、输入 FPS，点击“开始抽帧”。
2. 上传成功后自动跳转加载页 `/loading/{session_id}`，查看抽帧进度；完成后进入 `/label/{session_id}`：逐帧点击生成固定边长裁剪框（固定 1:1，以点击点为中心）、选择标签（1=正, 2=下, 3=左, 4=右, 5=歪）、保存并下一张。可切换“只看未标注”，使用缩略图跳转，支持导出 zip。
3. 标注完成后点击“导出数据集”按钮，浏览器将下载 zip，或在后端 `data/labels/{session_id}_export.zip` 查看。

## 3. API 快速参考
- 上传视频：`POST /api/videos/upload`（form-data: file, fps）→ `{ session_id, message }`
- 抽帧状态：`GET /api/videos/{session_id}/status`
- 帧列表：`GET /api/videos/{session_id}/frames`
- 获取单帧：`GET /api/videos/{session_id}/frames/{frame_name}`
- 提交标注：`POST /api/labels/{session_id}/frame/{frame_name}`（JSON: bbox {x,y,width,height}, label）
- 标注进度：`GET /api/labels/{session_id}`
- 导出数据集：`POST /api/export/{session_id}` → `{ download_url }`，下载：`GET /api/export/{session_id}/download`

## 4. 技术栈与实现要点
- 后端：FastAPI，OpenCV 抽帧与裁剪；JSON 存储标注；zipfile 导出；CORS 已开启。
- 前端：React + TypeScript + Vite；canvas 裁剪组件；缩略图与未标注筛选；axios 请求。
- 文件存储：`data/videos`（原视频）、`data/frames`（抽帧）、`data/crops`（裁剪）、`data/labels`（labels.json 与导出 zip）。

## 5. 目录结构
```text
project_root/
  backend/
    app/
      api/           # 路由：视频上传/帧列表/标注/导出
      core/          # 配置与通用工具
      services/      # 抽帧、标注与导出逻辑
      main.py        # FastAPI 入口
    requirements.txt
  frontend/
    src/
      pages/         # UploadPage, LabelPage
      components/    # ImageCropper, FrameNavigator
      api/           # axios 客户端
      App.tsx, main.tsx
    package.json, vite.config.ts
  data/
    videos/ frames/ crops/ labels/
  README.md
```

### 接口使用说明（本地环境）
- 基础 URL：`http://localhost:8000`
- 上传：`POST /api/videos/upload`（form-data: file, fps）
- 标注：`POST /api/labels/{session_id}/frame/{frame_name}`（JSON: bbox, label）
- 帧列表：`GET /api/videos/{session_id}/frames`
- 标注状态：`GET /api/labels/{session_id}`
- 导出：`POST /api/export/{session_id}`，下载：`GET /api/export/{session_id}/download`

## 6. 清理缓存数据（释放磁盘）
视频上传与抽帧会在 `backend/data` 下产生大文件，可按需清理：

**PowerShell 清空全部会话数据（慎用，全部删除）**
```
Remove-Item backend/data/videos/* -Recurse -Force
Remove-Item backend/data/frames/* -Recurse -Force
Remove-Item backend/data/crops/* -Recurse -Force
Remove-Item backend/data/labels/* -Force
```

**仅删除指定 session（假设 ID 为 abc123）**
```
Remove-Item backend/data/videos/abc123 -Recurse -Force
Remove-Item backend/data/frames/abc123 -Recurse -Force
Remove-Item backend/data/crops/abc123 -Recurse -Force
Remove-Item backend/data/labels/abc123.json -Force
Remove-Item backend/data/labels/abc123_export.zip -Force
Remove-Item backend/data/labels/abc123_det_export.zip -Force
```

清理后可用 `Get-PSDrive -PSProvider FileSystem` 查看磁盘剩余空间。
