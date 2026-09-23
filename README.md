# 15 分钟便民生活圈 · 智能体检与规划助手

> 开源 AI 工具赛道参赛作品 · 作者：肖沐樑（QQ：3387432690） · 许可证：MIT

基于百度地图开放能力，输入社区中心点坐标，系统自动计算**真实步行路网**下的 15 分钟等时圈，
统计圈内民生设施覆盖，识别"服务盲区"，输出可导出、可复现的**社区生活圈体检报告**。

## 在线演示（免安装，打开即用）

| 部署平台 | 访问地址 |
|---|---|
| GitHub Pages | **https://lihua5645.github.io/15-minute-living-circle/** |
| Gitee Pages | https://zhang-san-zhangshan.gitee.io/15-minute-living-circle （人工审核通过后生效） |

> 使用说明：打开页面允许浏览器定位（或直接拖动地图图钉 / 搜索框输入社区名选点），点击「开始体检」即可完整复现
> 等时圈计算 → 六类设施统计 → 盲区识别 → 可视化体检报告全流程。
> 纯静态演示版不含账号登录与 AI 在线问答（需本地服务），本地运行方式见下文「快速运行」。

---

## 一、特性

- **真实路网等时圈**：扇形方位采样 → 割线法边界收敛 → 各向异性 IDW 插值 → Marching Squares 等值线 → 采样路网吸附，边界贴合真实道路而非"画圆"。
- **多源 POI 清洗**：同义词检索、编辑距离去重、品牌去重、黑名单噪声过滤、可信度打分、分维归档。
- **服务盲区识别**：居住性过滤 + 粗筛 + 批量距离矩阵精算 + DBSCAN 聚类，输出补建建议清单。
- **六维评分报告**：医疗/教育/购物/养老/交通/休闲，雷达图 + 柱状图 + 仪表盘，一键导出 JSON。
- **多端复用**：分析引擎 `src/core` 零 DOM 依赖，Web / Electron / 小程序 / 安卓共用。
- **AI 增强**：管理员在控制台配置任意 OpenAI 兼容大模型（DeepSeek / 智谱 / 通义等）后，自动启用 AI 诊断叙述、AI 一句话导航选点、AI 在线问答（对话式界面，结合本轮体检结果作答）；未配置或调用失败时自动回退本地规则引擎，密钥经服务端中转、不落库。
- **账号体系**：用户注册 / 登录（MySQL 存储、密码加盐哈希）、个人主页（历史体检 / 等级分布 / 导出档案）、管理员控制台（用户管理、评分维度调参、盲区阈值、AI 配置与多套服务商档案切换）。
- **配额与容错**：令牌桶限流 + 并发池 + 三级缓存 + 退避重试 + 离线降级，全程可跑通演示。

## 二、目录结构

```
src/
  core/        分析引擎（纯 JS，零 DOM）
    geo/       几何工具
    isochrone/ 等时圈五阶段算法
    poi/       POI 检索与清洗
    blindspot/ 盲区识别
    scoring/   评分模型
    scheduler/ 限流/并发/缓存/降级
    pipeline.js 流水线编排
  adapters/    数据源适配器（bmapWeb / bmapServer / osm / mock）
  ui/          React 界面 + Canvas 可视化 + ECharts 报告
public/osm/    样例社区预下载路网（可完全离线复现）
electron/    桌面端壳（主进程 API 代理 + 磁盘缓存 + 打包）
tests/        vitest 单元测试

设计实录.md              技术设计文档（架构 / 算法 / 数据清洗 / 盲区识别）
真实对比测试报告.md      长沙·砂子塘社区 画圆法 vs 真实路网实测对比
修复记录文档.md          开发修复记录
```

## 三、环境配置（AK 脱敏）

复制 `.env.example` 为 `.env`，按需填写：

```
VITE_BMAP_AK=浏览器端AK       # 地图渲染/检索/步行路线，百度控制台"应用类型=浏览器端"
BAIDU_SERVER_AK=服务端AK      # 可选，批量距离矩阵，桌面端 Electron 主进程使用
```

> AK 不硬编码进代码；未配置时自动使用**离线样例**模式，无需 AK 即可完整演示。

## 四、快速运行

```bash
# 1. 安装依赖
npm install

# 2. 开发（Web）
npm run dev            # 访问 http://localhost:5173

# 3. 构建 Web 产物
npm run build          # 产物在 dist/

# 4. 单元测试
npm run test

# 5. Docker 一键演示
docker compose up -d --build   # 访问 http://localhost:8080
```

## 五、桌面端打包（exe 安装包）

```bash
# 构建 Web 产物并由 electron-builder 打包 NSIS 安装包
npm run dist:win       # 产物在 release/生活圈体检助手-Setup-*.exe
```

桌面端主进程使用**服务端 AK** 通过 Web 服务 API 启用批量距离矩阵，并落盘缓存以降低配额。

## 六、API 调用策略要点

| 能力 | 接口 | 用途 |
|---|---|---|
| 地图渲染 | BMap GL JS SDK | 底图/覆盖物/热力 |
| 地理/逆地理编码 | Geocoder / geocoding(v3) | 地址↔坐标、居住性判断 |
| POI 检索 | LocalSearch / place/v2/search | 民生设施采集 |
| 步行路径规划 | WalkingRoute / direction/v2/walking | 等时圈边界 |
| 批量距离矩阵 | routematrix/v1/walking | 盲区批量判定（降耗时核心） |

**等时圈算法**：`r0 = v·T/k`（v=80m/min，k=1.25）≈ 960m；每个方位用割线法求"耗时=15min"边界半径；
迭代过程采样点构造各向异性 IDW 插值场（`w=1/(d²·(1+α·Δθ))`），Marching Squares 提取等值线并吸附到采样路网。

## 七、CI/CD

`.github/workflows/ci.yml`：lint + Prettier 格式检查 + vitest 测试 + 构建，推送即触发。

## 八、许可证

MIT License，详见 `LICENSE`。
