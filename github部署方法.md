<!-- 版权声明：肖沐樑  QQ：3387432690 -->
<!-- 完成时间：2026，09，23 -->

# GitHub / Gitee Pages 部署方法

本项目为纯前端可构建的静态站点（`npm run build` 产出 `dist/`），通过 GitHub Pages 自动部署为公网演示地址；
Gitee Pages 作为国内访问的镜像线路，部署方式在文末对照说明。

**当前线上地址**：https://lihua5645.github.io/15-minute-living-circle/

---

## 一、部署原理

```
git push github master
        │
        ▼
GitHub Actions 触发 .github/workflows/deploy-pages.yml
        │
        ▼
npm ci → npm run build（注入 VITE_BMAP_AK）→ dist/
        │
        ▼
actions/upload-pages-artifact + deploy-pages@v4
        │
        ▼
https://lihua5645.github.io/15-minute-living-circle/ 自动更新
```

- 每次向 `master` 推送都会**自动**构建并发布，无需手动操作
- 也可以在 Actions 页面手动触发（workflow_dispatch）

## 二、首次部署的前提配置（一次性）

### 1. 仓库密钥 Secret（地图 AK）

构建时通过 GitHub Secrets 注入浏览器端百度 AK，**密钥不进代码仓库**：

1. 仓库页 → **Settings** → 左侧 **Secrets and variables** → **Actions**
2. 点 **New repository secret**
3. **Name** 填：`VITE_BMAP_AK`（全大写，一字不差）
4. **Secret** 填：百度控制台里**浏览器端**类型的 AK（注意大小写，AK 区分大小写）
5. 点 **Add secret**

> 注意：应用类型必须是「浏览器端」；「服务端」类型的 AK 加载不了 JS 地图。
> 同理确认百度控制台该 AK 的 **Referer 白名单**包含：`https://lihua5645.github.io/*`

### 2. 开启 Pages 服务（Source 指向 Actions）

1. 仓库 → **Settings** → 左侧 **Pages**
2. **Build and deployment → Source** 下拉框：改为 **GitHub Actions**
3. 选完自动保存，无需其他操作

### 3. 放开部署分支限制（关键坑）

`github-pages` 环境默认只允许 `main` 分支部署，本项目用的是 `master`，会报
"Branch 'master' is not allowed to deploy to github-pages due to environment protection rules"：

1. **Settings** → 左侧 **Environments** → 点 **github-pages**
2. **Deployment branches and tags** → 点铅笔 ✏️ 编辑
3. 删除 `main` 白名单（或改为 **No restriction**）
4. 保存

## 三、触发部署

方式一（自动）：向 `master` 推送任意提交，工作流自动运行。

方式二（手动）：仓库 → **Actions** → 左侧「Deploy Pages」→ 右侧 **Run workflow ▾** → **Run workflow**。

运行约 2~3 分钟，圆点变绿 ✅ 即发布成功，访问地址见文首。

## 四、常见问题排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 打开 404 "There isn't a GitHub Pages site here" | 未开启 Pages 或部署未成功 | 完成前提配置 2、3，重跑工作流 |
| 部署失败：Branch not allowed to deploy | 环境分支保护规则没放行 `master` | 完成前提配置 3 |
| 部署成功但页面无地图（红色报错横幅） | 构建时没拿到 AK（Secret 缺失 / 晚于构建） | 确认 Secret 后重跑工作流 |
| 地图报「APP不存在，AK有误」 | AK 类型不对（服务端）或 Referer 白名单未放行 | 换浏览器端 AK；白名单加演示域名 |
| 推送时 Connection reset | 大陆访问 GitHub 不稳定 | 重试即可；或为 git 配置代理 |

## 五、更新流程（日常）

```bash
# 正常开发提交后，一条命令同时更新两个远程
git push origin master   # Gitee
git push github master   # GitHub（自动触发 Pages 重新构建发布）
```

推送后等 Actions 变绿即可，线上 2~3 分钟内同步。

## 六、Gitee Pages 部署（国内镜像线路）

前提：Gitee 账号完成**实名认证**（Pages 强制要求，设置 → 实名认证）。

1. 本地构建静态产物并推送到专用分支（已推好 `gh-pages` 分支）：
   ```bash
   npm run build
   # 将 dist/ 内容提交到 gh-pages 分支并 git push origin gh-pages
   ```
2. Gitee 仓库页 → 顶部 **「服务 ▾」→ Gitee Pages**
3. 部署分支选 **`gh-pages`**、部署目录选 **根目录**
4. 点 **「启动」** → 首次发布需**人工审核**（几分钟到几小时）
5. 审核通过后地址：`https://zhang-san-zhangshan.gitee.io/15-minute-living-circle`
6. 之后每次更新代码，需重新构建推送 `gh-pages` 分支，并回到 Gitee Pages 页面**手动点「更新」**

> 与 GitHub Pages 的差别：Gitee 需实名认证 + 人工审核 + 手动更新；GitHub 全自动。
> 但 Gitee 国内直连速度快，作为面向国内评审的演示线路更稳妥。

## 七、注意事项

- 纯静态版**不含本地 Node 服务**：账号登录 / 注册与 AI 在线问答在公网静态页上不可用（它们依赖 `/api`、`/airelay` 本地中间件）；地图、体检、评分、盲区、AI 导航（本地规则）均正常
- `.env`（含 AK）已在 `.gitignore` 中排除，绝不入库
- 百度个人开发者配额有限，线上演示请节制触发体检；同一点重复体检走缓存零调用
