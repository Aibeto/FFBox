<p align="center"><img width="128" alt="FFBox logo" src="https://raw.githubusercontent.com/ttqftech/FFBox/refs/heads/4.0%2B/src/renderer/public/images/icon_256.png"></p>

<h1 align="center">FFBox</h1>

<p align="center">一个多媒体转码百宝箱 / 一个 FFmpeg 的套壳</p>

<p align="center">
  <img src="https://img.shields.io/github/downloads/ttqftech/FFBox/total" alt="总下载量" />
  <img src="https://img.shields.io/github/downloads/ttqftech/FFBox/latest/total" alt="最新版下载量" />
  <img src="https://img.shields.io/website?url=http%3A%2F%2Fffbox.ttqf.tech" alt="网站状态" />
</p>

- 原汁原味的 FFmpeg 工作流  
  全链路支持：输入 → 滤镜 → 编码 → 输出。参数配置透明直观，对齐 FFmpeg 的原生用法。

- 所见即所得的参数生成  
  所有 FFmpeg 参数公开透明，用户通过操作界面，即能同时学习 FFmpeg 的命令。

- 自动适配本机 FFmpeg 功能  
  自动扫描并加载本机 FFmpeg 支持的全部复用器、解复用器、滤镜、编码器及其参数，尽支持尽支持。

- 预置选项 & 专业扩展  
  内置数十款常见编码器、封装格式、分辨率等参数的最佳实践与简要说明，从傻瓜式自动到高级参数随心切换。

- 高级滤镜图、多输入多输出支持  
  相比大多数软件仅支持的简单滤镜，FFBox 支持完整的流图和滤镜图编辑，可处理复杂的多输入多输出任务。
  支持扫描 FFmpeg 官网滤镜文档供用户随时参考。

- 舒适界面与自研组件库  
  自研 UI 组件库，界面细节考究，针对浅色/深色模式细致调节界面细节，视觉体验焕然一新。

- 改进的的进度与性能面板  
  图形化实时显示进度、速度、码率、剩余时间等信息，并支持以图表模式直观展示。

- 前后端分离、可部署、跨平台  
  既可直接使用 FFBox，也可单独使用 Node.js 远程转码服务 + WebUI 部署，或混搭使用。
  支持 Windows、Linux、macOS。

- 任务管理系统  
  支持拖入即开始、完成即移除。
  支持单任务/全任务的启动、暂停、复制操作。
  支持自定义并发数。
  支持崩溃后保留未完成任务项。

- 更多实用功能  
  保留文件时间戳或依条件改写时间戳。
  自研开发/打包脚本，一键傻瓜式打包。
  Windows 专属支持：特制安装器、DirectX 开屏画面、任务暂停功能。

- 独创特色  
  全球独一无二的使用许可与条款！
  全球独一无二的「涩话草坪」！

详细软件介绍请访问 [FFBox 官网](http://ffbox.ttqf.tech/)。

<picture>
  <!-- 浅色模式时显示 -->
  <source srcset="https://raw.githubusercontent.com/ttqftech/FFBoxSite/refs/heads/ffboxSite-releaseCountFetcher/src/assets/%E8%BD%AF%E4%BB%B6%E6%88%AA%E5%9B%BE_%E4%B8%AD_%E6%B5%85%E8%89%B2_%E5%AE%8C%E6%95%B4.webp" media="(prefers-color-scheme: light)">
  <!-- 深色模式时显示 -->
  <source srcset="https://raw.githubusercontent.com/ttqftech/FFBoxSite/refs/heads/ffboxSite-releaseCountFetcher/src/assets/%E8%BD%AF%E4%BB%B6%E6%88%AA%E5%9B%BE_%E4%B8%AD_%E6%B7%B1%E8%89%B2_%E5%AE%8C%E6%95%B4.webp" media="(prefers-color-scheme: dark)">
  <img src="https://raw.githubusercontent.com/ttqftech/FFBoxSite/refs/heads/ffboxSite-releaseCountFetcher/src/assets/%E8%BD%AF%E4%BB%B6%E6%88%AA%E5%9B%BE_%E4%B8%AD_%E6%B5%85%E8%89%B2_%E5%AE%8C%E6%95%B4.webp" alt="FFBox logo">
</picture>

## 工程简介

您现在看到的是 5.x 版本的 readme 文件。FFBox 在不同的大版本之间，使用的技术/框架存在区别。若需查阅版本对应的 readme，建议切换到对应分支。

- `1.x 版本`：经典的“html + css + js”前端三件套，没有工程化和模块化。
- `2.x 版本`：使用 vue 2 进行工程化、模块化开发。主要控制逻辑集中在状态管理器上。
- `3.x 版本`：更好的高聚低耦与工程结构，服务与 UI 分离，引入 TypeScript，支持远程控制。
- `4.x 版本`：全新界面，使用更新、更多样的技术架构，自行编写开发与打包脚本，彻底分离前后端。
- `5.x 版本`：技术和框架上与 4.x 版本大体上无异，主要在功能上改进了与 ffmpeg 的“全”适配程度。

## 准备自行编译

由于这里不是前端课堂，此处当然不会有手把手的详细指南🌚。以下会列出一些需要的东西，您可自行了解：

1. `Visual Studio Code`：这是本项目推荐使用的编辑器。本项目已为该编辑器进行了启动后端等相关任务的编写。
2. `node.js`：它是一个 JavaScript 运行环境，主要用于项目的编译。建议使用 `nvm`，当项目运行不起来的时候可尝试使用它来切换一下 node.js 的版本。
3. `pnpm`：它是本项目推荐使用的依赖管理器。
4. `pnpm set registry ___` `pnpm set ELECTRON_MIRROR`：如果您无法正常下载依赖，请配置源。
5. `Visual Studio 2022`：如果您要在 Windows 平台上编译 FFBoxHelper，那么这是必须的。
6. `Inno Setup 6`: 如果要在 Windows 平台上制作安装包，那么需要将软件放置在环境变量中。另外，`ChineseSimplified.isl` 也需要另行准备放在该软件目录下。

## FFmpeg

本项目并不自带 FFmpeg。如果您没有 FFmpeg，那么 FFBox 只能为您展示启动命令，不能进行转码工作。您需要在 [FFmpeg 下载页面](http://ffmpeg.org/download.html) 下载 FFmpeg 后，根据 FFBox 的指示，将其放入系统路径（推荐）或程序目录中。

## 开发与打包流程

```mermaid
flowchart TB
  subgraph DFmjs[dev-frontend.mjs]
    IPE1[injectProcessEnv] --> CSR["createServer(renderer)"] --> watchPreload --> watchMain
  end
  subgraph BBmjs[build-backend.mjs]
    IPE2[injectProcessEnv] --> BB1["buildBackend"]
  end
  subgraph BBmjs2[build-backend.mjs]
    IPE3[injectProcessEnv] --> BB2["buildBackend"]
  end
  subgraph BFmjs[build-frontend.mjs]
    IPE4[injectProcessEnv] --> buildMain --> buildPreload --> buildRenderer
  end
  subgraph VCLaunchB["vscode launch 编译调试后端 (vite)"]
    VSTask["vscode task 启动"] --> BBmjs2
  end
  subgraph 生产前端["生产前端【npm run build:frontend】"]
    BFmjs
  end
  subgraph 生产后端["生产后端【npm run build:backend】"]
    BBmjs --> PB[pkg:backend]
  end
  subgraph 开发前端["开发前端【npm run dev:frontend】"]
    DFmjs
  end
  subgraph 开发后端["开发后端【vscode F5】"]
    VCLaunchB
  end

  注1[注意 Windows Helper 需要使用 VS 手动编译并放入项目根目录]
  开发("开发") --> 开发后端 --> 开发前端
  打包("打包") --> 生产后端 & 生产前端 --> pkg["npm run package"]
  注1 --> 开发 & 打包[打包【npm run build:everything】]
```
