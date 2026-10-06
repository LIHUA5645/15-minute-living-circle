# 小程序端（微信 / 支付宝 / 抖音）对接说明

> 本目录是「15 分钟生活圈体检助手」的小程序端。分析与体检引擎与 Web 端**同源**（`src/core`，一行不改），
> 差异全部收敛在 `xcx/common/plat*.js` 一层；三端视图由同一套微信视图机械转换生成。
> 设计方案见同目录 `设计方案.md`，施工与验证记录见根目录 `修复记录文档.md`。

---

## 1. 三端结构总览

```
xcx/
├─ project.config.json          微信开发者工具的工程配置（miniprogramRoot: miniprogram/，AppID 见该文件）
├─ miniprogram/                 ★ 微信端小程序本体（视图真源：页面模板与全局样式都改这里）
│   ├─ app.js / app.json / app.wxss     app.wxss 是三端样式真源，改它 + 同步即可三端一致
│   ├─ pages/ditu|tijian|baogao|wo|denglu/  本项目的五个页面（.js 只有 2 行，逻辑在 lib/common）
│   ├─ pages/index|example/            quickstart 示例页（保留未动，可在 app.json 里删掉）
│   └─ lib/{core,common}/              ← 由同步脚本生成（引擎 + 共享层）
├─ zhifubao/                    支付宝端工程（mini.project.json + app.* + pages/*.axml + lib/）
├─ douyin/                      抖音端工程（project.config.json + app.* + pages/*.ttml + lib/）
├─ common/                      ★ 三端共享源码（真源，改这里）
│   └─ images/logo-circle.png   品牌 logo（同步脚本按字节复制到各端 images/，视图里用 /images/xxx.png 引用）
├─ core/                        引擎暂存（由 scripts/tongbu-xcx.mjs 从 src/core 同步，供编辑器解析相对引用）
├─ 设计方案.md
└─ README.md                    ← 本文件
```

三个必须记住的约定：

1. **`xcx/common/**` 是共享层真源，`xcx/<端>/lib/**` 是生成物**，不要直接改生成物（文件头有标注）。
2. **引擎真源是 `src/core`**，改完跑一次 `node scripts/tongbu-xcx.mjs` 同步到三端。
3. **页面逻辑写在 `xcx/common/pages/*.js`**，各端页面目录只放视图模板与两行绑定代码。

## 2. 共享层各文件职责

| 文件 | 职责 |
|---|---|
| `common/plat.js` | 平台探测（wx/my/tt）+ 统一 API 入口。页面与适配器只认 `plat.xxx()` |
| `common/plat.wxLei.js` | 微信与抖音共用实现（两者 API 同形）：request / storage / 定位 / 选点 / 导航 / 提示 |
| `common/plat.weixin.js`、`plat.douyin.js` | 分别绑定 `wx` / `tt` 全局 |
| `common/plat.zhifubao.js` | 支付宝实现（`headers`/`status`、存储对象入参、`showToast(content)`、`confirm`） |
| `common/peizhi.js` | 服务端地址（可运行期修改）、检索半径、目标时长、密度档、QPS/并发 |
| `common/cunchu.js` | 给引擎 `HuanCun` 用的存储适配（TTL、单条上限、索引自管、满了清一半） |
| `common/zuobiao.js` | 坐标转换出口：`wgsDaoGcj` / `gcjDaoWgs`（引擎恒 WGS-84，地图恒 GCJ-02） |
| `common/bidui.js` | 渲染前处理：保形抽稀、等时圈→polygons、水面虚线→polyline、设施→小圆点、盲区→circles、补建点→markers |
| `common/zhuangTai.js` | 跨页状态（中心点/参数/完整报告/登录用户）+ 存储里只放瘦身摘要 |
| `common/tijian.js` | 体检编排：拼 provider、取水域、建缓存、把引擎进度翻成中文阶段 |
| `common/ai.js` | **AI 三能力，与网页端同源**：① 诊断叙述（大模型 + 本地规则双路）② 在线问答（体检上下文注入 + 「【导航】目的地」约定）③ 智能选点导航（从本轮真实设施里选点，本地规则兜底）。提示词与网页端**逐字一致**，只把 `fetch` 换成 `plat.request` |
| `common/adapters/bmapXcx.js` | geo provider：`walkingRoute` / `routeMatrix` / `searchPoi` / `reverseGeocode` |
| `common/adapters/shuiyuXcx.js` | 水域掩膜数据（走服务端 `/shuiyu`，取不到就这轮不避让） |
| `common/pages/{shouYe,ditu,baoGao,wo,dengLu,ai}.js` | 六个页面的逻辑（导出 `Page()` 配置的工厂函数）：体检参数与历史、地图首页、报告、我的、登录注册、AI 助手 |

## 3. 怎么跑起来

### 3.1 百度接口走哪条通道（两条互为备份，所以服务端不是必须的）

| 通道 | 用什么 | 说明 |
|---|---|---|
| ① 直连百度（默认优先） | `peizhi.js` 里的**小程序 AK** | 微信发请求会自动带 `servicewechat` Referer，「微信小程序」类型 AK 正是为此签发；端上不需要任何服务也能体检 |
| ② 自有服务端 | `/bmapapi` | 服务端代持密钥 + 多 AK 轮换，适合生产；端上不出现任何密钥 |

策略在 `peizhi.js` 的 `bmapMoShi` 里改（`zhiLian` 直连优先 / `fuWuDuan` 服务端优先 / `zhenDuan` 两边都试）。
**任一条失败会自动换另一条**，并把原因一起报出来（AK 配额、Referer、域名白名单都能一眼分辨），
命中过的通道会被记住，不会每个请求都先撞一次失败。地图页底部脚注会显示当前实际通道。

### 3.2 需要服务端的功能（可选但推荐起一下）

```powershell
# 项目根目录
npm run fuwu:bg                  # 后台常驻：隐藏窗口启动 + 日志写 fuwuqi/fuwu.log，已在跑就不重复起
npm run fuwu                     # 或前台常驻（想直接看输出时用）
npm run fuwu:stop                # 停止常驻的服务端
# 等价于 node fuwuqi/fuwu-qi.mjs，缺省端口 8787（FUWU_PORT 可改）
```

启动后提供：`/api`（账号与共享盲区标记）、`/airelay`（AI 诊断，服务端代持密钥）、
`/shuiyu`（水域数据：预置样例 → 落盘缓存 → Overpass）、`/bmapapi`（通道②）、`/jianKang`（健康检查）；
存在 `dist/` 时还会一并托管 Web 端静态页面。

**服务端地址是自动找的，不用你填对**（客户端侧，见 `common/peizhi.js`）：

| 机制 | 说明 |
|---|---|
| 候选探测 | 依次试「上次可用的地址 → 代码默认地址 → 服务端上报过的内网候选」的 `/jianKang`，谁通用谁并记住（真机换网段后也能自己切回来） |
| 自动重连 | 读不到配置时**每 6 秒自动重读一次、共 5 次**；服务端后起（演示前才发现没起）也能自己接上，接通后 toast「已自动接通服务器」 |
| 内网候选上报 | `/jianKang` 会回报服务端所在机器的内网地址（如 `http://192.168.1.6:8787`），AI 页与「我的」页可据此切换；真机预览必须用内网 IP 或 HTTPS 域名（`127.0.0.1` 指手机自己） |
| 兜底提示 | 5 次都没接上才在 AI 页显示提示条「读不到服务器配置 · 服务端地址 …（· 正在自动重连…）｜重试」，点整条立即重试 |

> 服务端没起时会看到 `request:fail ... ERR_CONNECTION_REFUSED`，此时**体检仍可用**（走直连），
> 只有「AI 诊断 / 账号登录 / 水域避让」会失效（水域取不到就这一轮不避让，报告里会提示）。
> Vite 开发服务器与它是同一份实现（`fuwuqi/zhongJian.mjs`）：Web 端用 `npm run dev`（5173），小程序用 8787。

### 3.3 微信端（优先，功能最全）

1. 微信开发者工具 → 导入项目 → 目录选 **`D:\比赛专用\xcx`**（`project.config.json` 已就位，AppID `wx45cdc69a7eabe6f8`）。
2. 右上角「详情 → 本地设置」勾上 **不校验合法域名**（开发期用 `http://127.0.0.1:8787` 与直连 `api.map.baidu.com` 都必须勾，否则只能连 https 且要事先加白名单）。
3. 编译。**打开就是地图页**（第一屏）：顶部定位条 → 「切换」里用当前位置或地图上选点 → 底部卡片「开始体检」（带进度）→ 「看报告」；地图上点设施/盲区会弹卡片，可算步行路线、唤起导航、设为体检中心。
4. 真机预览：① 直连通道需在小程序后台把 **`https://api.map.baidu.com`** 加进 request 合法域名；② 若要用账号/AI/水域，把服务端用 HTTPS 暴露（cloudflared / ngrok）后填进「我的 → 服务端地址」，并在后台加进白名单。

### 3.4 支付宝端

1. 支付宝小程序开发者工具 → 打开 **`xcx/zhifubao`**。
2. `mini.project.json` 已就位；`app.json` 里的标题键是支付宝的 `defaultTitle`。
3. 位置权限需在支付宝开放平台控制台为小程序开通（`my.getLocation`），工具里可先勾「不校验」。
4. 视图（`.axml`/`.acss`）与 `lib/` 由同步脚本生成，**改真源后重跑同步**。

### 3.5 抖音端

1. 抖音开发者工具 → 打开 **`xcx/douyin`**（`project.config.json` 里的 AppID 换成你自己的 `tt...`）。
2. 视图为 `.ttml`/`.ttss`，其余同上。

### 3.6 改完代码要同步

```powershell
node scripts/tongbu-xcx.mjs            # 同步：src/core → 三端 lib；xcx/common → 三端 lib；微信视图 → 支付宝/抖音视图
node scripts/tongbu-xcx.mjs --jiancha  # 只检查是否与真源一致（提交前跑，不一致退出码 1）
```

### 3.7 不装开发者工具也能自检

```powershell
node tests/xcx-zijian.mjs              # 坐标转换 / 适配器 URL 与坐标 / 抽稀 / 渲染数据 / 引擎流水线 / 水域接口
```

该脚本在 Node 里给 `plat` 装上 fetch 与内存存储的实现，因此**不需要小程序运行时**即可验证共享层；
输出形如「通过 23 项，失败 0 项」，失败即退出码 1（可直接进 CI）。
其中几组值得一提：**双通道**（打桩让直连返回 302，验证自动落到服务端并记住通道）、
**批量算路未开通**（240 只撞一次，之后直接抛错让引擎走直线估算）、
**真实直连探针**（带 `servicewechat` Referer 实打一次百度步行算路，验证小程序 AK 是否放行，1 次请求）。

### 3.8 AI 能力（与网页端一致）

| 能力 | 在哪 | 依赖 | 说明 |
|---|---|---|---|
| 诊断叙述 | 报告页「智能诊断」卡 | 大模型需服务端 + 管理员配置；**本地规则零依赖** | 打开自动生成；右上齿轮切「大模型生成 / 本地规则引擎」；大模型失败会如实说明原因并回退本地规则（与网页端同一套文案） |
| 在线问答 | AI 助手页（地图页「切换」面板 / 报告页「问问 AI 助手」进入） | 需服务端 + 管理员启用大模型 | 提示词、上下文注入（体检摘要 / 中心点过期判定 / 设施名称清单 / 设施明细）与网页端**逐字一致**；未接入大模型时给出可执行的配置指引 |
| 选点导航 | 对话里说「去最近的医院」「带我去超市」 | 本地规则兜底，无需大模型 | 模型回「【导航】目的地」或本地词元判定 → 从本轮真实设施里选一个 → 卡片「带我去」唤起系统地图导航 |

> 提示词与本地规则是对齐的**硬保证**：自检脚本会直接把两边的 `benDiZhenDuan()` 输出做全等比较，
> 并逐字比对 8 处关键提示句（见 `npm run xcx:zijian` 第 ⑦ 组）。

## 4. 服务端对接（端点点表）

小程序**只连一个域名**（就是上面这个服务端），不需要把小程序的请求白名单开给百度或 Overpass。

| 端点 | 方法 | 入参 | 出参 | 用途 / 调用处 |
|---|---|---|---|---|
| `/api/zhuCe` | POST | `{zhangHao, miMa}` | `{ok}` | 注册（我的页） |
| `/api/dengLu` | POST | `{zhangHao, miMa}` | `{ok, yongHu}` | 登录（我的页） |
| `/api/peiZhi/du` | GET | — | `{ok, peiZhi}` | 管理员配置（密钥字段会被抹掉） |
| `/api/mangqu/lieBiao` | GET | — | `{ok, list:[{id,zhangHao,weiZhi,beiZhu,shiJian}]}` | 共享盲区标记（我的页 / 地图图层） |
| `/api/mangqu/biaoJi` | POST | `{zhangHao, lng, lat, beiZhu}` | `{ok, id}` | 报告页「标记我的位置」 |
| `/api/mangqu/shanChu` | POST | `{id, zhangHao}` | `{ok}` | 我的页删除自己的标记 |
| `/bmapapi/*` | GET | 同百度 Web 服务 API | 百度原始 JSON | 适配器四个方法；**AK 由服务端注入并做多 AK 轮换** |
| `/airelay` | POST | `{tou, body}`（不带 `Authorization` 时服务端补 url/密钥/模型） | 上游原始响应 | AI 诊断（报告页） |
| `/shuiyu` | GET | `?lng=&lat=[&banJingMi=2600]` | `{duoBianXing, geShu, laiYuan}` | 水域掩膜（等时圈避让河流） |
| `/jianKang` | GET | — | `{ok, fuWu, shiJian}` | 部署探活（自检脚本也用它判断服务端是否在跑） |

**水域接口的三级取数**：预置样例文件 `public/osm/shuiyu_<经度>_<纬度>.json`（含 3×3 邻格容差）→
本地缓存 `fuwuqi/shuju/`（30 天）→ Overpass 多节点联网（成功即落盘）。所以演示现场断网也能避让。

**百度配额**：`/bmapapi` 用 `.env` 里的 `BAIDU_SERVER_AK`、`BAIDU_SERVER_AK2` 轮换（某把当日 302 超限就换下一把）。
全部用尽时接口会把百度的原始 `status/message` 透传，小程序端会弹出「换一把 AK 或明天再试」的提示。

## 5. 坐标系约定（最容易踩的坑）

| 层 | 坐标系 | 说明 |
|---|---|---|
| 引擎 `src/core` | **WGS-84** | 与 Web 端一致，`geo/zuobiao.js` 提供全部换算 |
| 小程序地图组件 | **GCJ-02**（腾讯 / 高德底图） | 微信、支付宝、抖音三端都是 GCJ-02 |
| 百度 Web 服务接口 | **BD-09** | 因此在 `adapters/bmapXcx.js` 里出站转 BD-09、入站转回 WGS-84 |

- 转换只允许出现在 `xcx/common/zuobiao.js` 与 `adapters/` 里；页面里不要自己换算。
- `wx.getLocation({type:'gcj02'})` 与 `tt.getLocation` 返回 GCJ-02；`my.getLocation({type:1})` 按 GCJ-02 处理。
  若某端实际返回 WGS-84，整圈会偏 500 米左右——「我的 → 坐标系自检 → 测一次定位」会把原始值与转换结果都列出来，
  真机核对一次即可（如不符，只改 `plat.zhifubao.js` 的 `getLocation` 一处）。

## 6. 数据契约

### 6.1 geo provider（与 Web 端同名同参同返回，见 `src/core/types.js`）

| 方法 | 参数 | 返回 |
|---|---|---|
| `walkingRoute(origin, dest)` | WGS-84 点对 | `{durationSec, distanceM, polyline:[{lng,lat}]}`（WGS-84） |
| `routeMatrix(origins, dests)` | WGS-84 点数组 | `{durationSec, distanceM}[][]`（失败抛错，引擎自动降级为直线估算） |
| `searchPoi(center, keywords, radiusMi)` | 中心 + 关键词数组 | `[{uid,name,lng,lat,type,address}]` |
| `reverseGeocode(point)` | WGS-84 点 | `{address, aoi, poiType}` |
| `danGuanJianCi`（标记位） | — | `true`：一次只认一个关键词，引擎据此展开并发 |

### 6.2 `src/core` 同步清单（脚本自动处理）

- **带入**：`pipeline.js`、`isochrone/`、`poi/`、`blindspot/`、`scoring/`、`geo/`、`scheduler/`、`types.js`
- **排除**（直接依赖 `fetch` / `sessionStorage` / `window`，小程序端由 `xcx/common` 对应模块承担）：
  `yonghu.js`（账号）、`fuwuDiZhi.js`（服务地址）、`zhenduan.js`（AI 诊断）、`aiLiaoTian.js`（AI 对话）、`aiDaohang.js`（AI 导航）
- 脚本会扫描生成的 `lib/core`，若出现对上述被排除模块的引用会打印告警（当前为 0）。

### 6.3 报告字段（与 Web 端完全一致）

`report = { zhongXin, canShu, total, dengji, dengShiQuan{ceng[{miao,polygon,shuiDuan}], shuiYu}, poiSet, fenleiPingfen, mangquList, jianYi, warnings, xinxi{qingQiuShu,haoShiMs,miDu} }`

## 7. 页面 ↔ 数据/接口对照

| 页面（微信路径） | 主要数据 | 用到的接口 |
|---|---|---|
| `pages/ditu/ditu` **地图首页（打开即此页）** | 定位条（社区名/坐标）、图层胶囊、预估可达圈、`dengShiQuan.ceng` 与 `shuiDuan`、`poiSet`、`mangquList`、步行路线、体检入口与进度、总分摘要 | 百度 `reverse_geocoding/v3`、`direction/v2/walking`（通道见 §3.1）；`/api/mangqu/lieBiao` |
| `pages/tijian/tijian` 体检参数与历史 | 中心点、目标时长、密度档、进度、上次结论摘要 | 同地图页 |
| `pages/baogao/baogao` 报告 | `total/dengji`、`fenleiPingfen`、`warnings`、`mangquList`、`jianYi` | `/airelay`（AI 诊断）、`/api/mangqu/biaoJi` |
| `pages/wo/wo` 我的 | 账号态（头像首字母/未登录）、共享标记、服务端地址、缓存条数、坐标自检、关于 | `/api/mangqu/*` |
| `pages/denglu/denglu` 登录 / 注册 | 账号、密码、模式切换、错误提示、服务端地址与「测连通」 | `/api/zhuCe`、`/api/dengLu`、`/jianKang`（测连通） |
| `pages/ai/ai` AI 助手 | 对话列表、推荐问法、思考中、导航确认卡（带我去 / 先不去） | `/api/peiZhi/du`（AI 配置）、`/airelay`（大模型） |

## 8. 三端差异对照表（同步脚本已覆盖前四行）

| 项 | 微信 | 支付宝 | 抖音 |
|---|---|---|---|
| 模板文件 | `.wxml` | `.axml` | `.ttml` |
| 样式文件 | `.wxss` | `.acss` | `.ttss` |
| 指令前缀 | `wx:` | `a:` | `tt:` |
| 事件绑定 | `bindtap` / `bindinput` / `bindmarkertap` | `onTap` / `onInput` / `onMarkerTap` | 同微信 |
| 全局对象 | `wx` | `my` | `tt` |
| 请求头字段 | `header` | `headers` | `header` |
| 响应状态码 | `statusCode` | `status` | `statusCode` |
| 存储 | `setStorageSync(k,v)` | `setStorageSync({key,data})` | `setStorageSync(k,v)` |
| 提示 | `showToast({title,icon})` | `showToast({content,type})` | `showToast({title,icon})` |
| 确认框 | `showModal` | `confirm` | `showModal` |
| 页面标题 | `navigationBarTitleText` | `defaultTitle` | `navigationBarTitleText` |
| 工程配置 | `project.config.json` | `mini.project.json` | `project.config.json` |

**需要你在各端 IDE 里核对一次的项**（我无法在此环境启动它们的模拟器）：
支付宝的 `map` 组件事件名（`onMarkerTap` / `onRegionChange`）、`dottedLine` 虚线支持情况、
`my.getLocation` 返回的坐标系；抖音端 `map` 的 `polygon.circles` 字段名与事件名。
若某端不支持虚线，`shuiDuanLines` 会退化为实线，不影响功能。

## 9. 排错手册

| 现象 | 原因与处理 |
|---|---|
| `request:fail ... ERR_CONNECTION_REFUSED http://127.0.0.1:8787/...`（AI 页会直接提示「读不到服务器配置 · 服务端地址 …」） | 自有服务端没起。**体检仍可用**（自动走直连百度通道），只有账号 / AI / 水域 / 共享标记需要它：`npm run fuwu` 起好（保持终端开着），再点 AI 页提示条上的「重试」即可接通，不必退出重进。自测：浏览器打开 `http://127.0.0.1:8787/jianKang` 看到 `{"ok":true,...}` 就说明服务端在跑。控制台里还会有「工具未校验合法域名…」的提示，那是开发者工具的提醒，不是错误 |
| `status 220 APP Referer校验失败` | 直连 AK 与调用来源不匹配（在浏览器/Node 里直连会这样；小程序内微信会自动带 `servicewechat` Referer，正常不出现）。若出现，说明请求不是从微信环境发的 |
| `status 240 APP 服务被禁用`（多见于「批量算路」） | 「微信小程序」类型的 AK 一般不开通 routematrix 这类 Web 服务接口。已做处理：识别到一次后就记住不再请求，引擎自动改用直线估算，盲区结论仍可用（精度略降）；要用真矩阵就把服务端 AK（服务端类型）配好走服务端通道 |
| `status 302 天配额超限`（逆地理编码/地点检索等） | 该 AK 当日配额用尽：换 `BAIDU_SERVER_AK2` 走服务端通道，或次日再试。逆地理编码失败时顶部只会显示「当前位置」，不影响体检 |
| 请求失败：`url not in domain list` | 本地设置未勾「不校验合法域名」，或真机未把 `https://api.map.baidu.com` 与服务端域名加进 request 白名单（真机必须 HTTPS） |
| 首屏只有底图、没有热力圈 | 正常：还没体检时只画「预估可达圈」示意范围与中心点图钉，点底部「开始体检」 |
| AI 不回复 / 只给「管理员尚未配置大模型」 | 大模型由服务端 + 管理员配置（Web 端管理员面板 → AI 设置：接口地址 + 密钥 + 模型名 + 启用）。没接入时**诊断仍会出**（本地规则引擎），对话式问答则按网页端同样提示；导航类问题（「去最近的医院」）本地规则仍可用 |
| AI 回复「读不到服务器上的 AI 配置：…（服务端地址 …）」 | 不是管理员没配，而是**这个请求没拿到服务端配置**：服务端没起（`npm run fuwu`）、地址不通（真机要用 HTTPS 穿透域名且在小程序后台加白名单）、或「我的」页填的服务端地址不对。这句提示里带原因与服务端地址，照着查即可；失败不会被缓存，服务端恢复后下一条消息自动重试 |
| AI 回复「还没有可用的体检结果…请先回地图页跑一轮体检」 | 问答里的导航意图要落到**本轮真实设施**上，而本机还没有报告。先去地图页跑一轮体检（报告只在本机内存，杀进程后需重跑） |
| 表头写着「已接入大模型」但回复说没配置 | 老版本会这样自相矛盾（读配置失败被当成「管理员没配」写进了缓存，而已打开的页面不会重读）。现已修：发送前强制复核配置并同步表头，读失败也不写缓存 |
| 控制台一直刷 `Do not set same key "1" in wx:key` | 聊天记录存在本机，历史里的 `id` 是上一次会话的自增号，冷启动后计数器又从 1 开始，于是和本次新消息撞号。现已修：`onLoad` 载入历史时统一重排 id，并把计数器推到已用完的值之后（「开始新对话」会把计数器清零）。若仍见，说明还在跑旧代码——重跑 `npm run xcx:tongbu` 后在开发者工具点一次「编译」（必要时「工具 → 清除缓存 → 全部清除」） |
| 报告页诊断标着「本地规则 · 大模型失败已回退」 | 大模型调不通：卡片下方会写明原因（密钥/模型/配额/返回网页等）。要到管理面板核对配置；也可以先手动切「本地规则引擎」 |
| 顶部定位条一直「未定位，点这里手动选点」 | 自动定位被拒（常见于开发者工具未给权限）：点右侧「切换」→「用当前位置」重试，或「在地图上选点」 |
| 体检报「baidu:302 天配额超限」 | 服务端 AK 当日配额用尽：换 `.env` 里的 `BAIDU_SERVER_AK2`，或改用更低密度档（快）后明天再试 |
| 地图上什么都没画 | 还没有完整报告：报告只在本机内存，杀进程后需重跑体检；页面会提示「先回首页跑一轮体检」 |
| 圈整体偏 500 米左右 | 坐标系假设不成立，按第 5 节用「我的 → 坐标系自检」核对 |
| 等时圈看不到江面虚线 | 该区域水面占比过低（如长沙·砂子塘仅 0.23%），圈没够到江；换有江的社区（如桂林）就能看到 |
| 地图卡顿 | 关掉部分图层；等时圈已按 180 点/环保形抽稀，设施单类上限 120 个 |
| 主包体积告急（2MB） | 引擎是纯 JS 约 150KB；设施图标零资源（用小圆点）；如需再加，把地图页放分包 |
| `xcx/weixin` 目录还在 | 那是早期布局的残留（现微信端在 `miniprogram/`），可直接删除；`zhifubao/pages/{index,map,report}`、`douyin/pages/{index,map,report}` 同理 |

## 10. 视觉与设计语言（改样式只看两个地方）

| 改什么 | 改哪里 |
|---|---|
| 全局样式（配色、卡片、按钮、胶囊、报告条、登录页…） | `xcx/miniprogram/app.wxss`（**三端样式真源**，同步脚本会原样复制成 `app.acss` / `app.ttss`） |
| 单个页面的结构 | `xcx/miniprogram/pages/<页>/*.wxml`（同步脚本转成 `axml` / `ttml`） |

设计语言一句话：**白卡片 + 低扩散投影 + 绿色主色 + 大号分数**。

- 主色：绿 `#12a150` / 深绿 `#0b7a3b` / 软绿 `#e9f7ef`（选中态、主按钮、进度条）；
- 墨色阶：`#101828`（标题）· `#475467`（正文）· `#98a2b3`（辅助）· `#eef2f6`（分隔/底色）；
- 语义色：红 `#e5484d`（重度盲区/告警）· 橙 `#f59f00`（轻度）· 蓝 `#2f9bff`（信息）· 紫 `#7c5cff`（AI 卡片）；
- 圆角：卡片 24rpx、底部抽屉 32rpx、胶囊与进度条 999rpx；投影只用 `0 6rpx 22rpx rgba(16,24,40,.05)` 这一档，浮层才加重；
- 页面结构统一为「`.ka` 卡片 + `.qu-biao` 绿色竖条标题 + `.an` 按钮（`.zhu` 主 / `.ci` 次 / `.bai` 幽灵）」；
- 地图首页是唯一有「浮层」的页面：顶部定位条 + 图层胶囊 + 底部抽屉（`.di-ka`，带 `.di-ba` 把手）。

改完记得跑 `npm run xcx:tongbu`（或 `node scripts/tongbu-xcx.mjs`）把样式与视图同步到三端。

### 两条踩过的坑（改视图时注意）

1. **别在同一个 `.an-hang` 里混放「整行按钮」与「等分按钮」**：`.an.zhu { width: 100% }` 在 flex 容器里会被 `flex-shrink` 压回去，三个按钮会挤成一行、后两个文字被截断（真机上出现过「用当前」「地图选」）。要「主按钮独占一行 + 两个次按钮并排」，就写成两个 `.an-hang`；一行三个按钮用 `.an.ci.ling.xiao`（收紧内边距与字号）。
2. **事件名不能用三目动态绑定**：`bindtap="{{a ? 'x' : 'y'}}"` 在小程序里不生效，必须拆成 `wx:if` / `wx:else` 两个元素（抖音端为 `tt:if` / `tt:else`，同步脚本会转）。

### 图标使用规则（与 Web 端同一原则）

**一律用语义图标；不用 emoji、不引图片资源**（emoji 跨端字形不一、无法控制粗细与颜色，不合组件化规范——Web 端历史的同类问题也已在 `修复记录文档.md` 里纠正过）。

| 端 | 用什么 |
|---|---|
| Web / Electron | lucide 语义图标 + morphicons `MorphIcon` 渲染（`src/ui` 既有约定） |
| 小程序（三端共用） | `app.wxss` 里的 `.ic-*` CSS 自绘图标 + `.chev` 方向箭头 |

小程序这套 CSS 图标清单（颜色一律 `currentColor` 跟随文字色，尺寸 rpx 固定，三端字形完全一致）：

| 类名 | 语义 | 用在哪 |
|---|---|---|
| `.ic-ding` | 定位针 | 顶部定位条、登录页徽标 |
| `.ic-zhun` | 准星 | 「用当前位置」 |
| `.ic-tu` | 折页地图 | 「在地图上选点」 |
| `.ic-can` | 三档滑杆 | 「体检参数与历史」 |
| `.ic-ren` | 人形 | 「我的 / 登录」 |
| `.ic-jing` | 圆圈感叹号（元素内写一个 `!`） | 报告页告警条目 |
| `.chev` / `.chev.shang` / `.chev.you` | 方向箭头（下 / 上 / 右） | 参数折叠、行尾进入 |

地图上的图钉与气泡不塞 emoji：中心点、补建点用地图组件默认图钉 + 纯文字气泡（如「补建建议 MQ1」「标记 张三」）。

### 品牌 logo

| 项 | 说明 |
|---|---|
| 真源 | `xcx/common/images/logo-circle.png`（由项目根 `logo1.png` 等比缩放到 **200×196 / 31 KB**；原图 696×683 / 544 KB，直接进包会白吃主包额度） |
| 同步 | `npm run xcx:tongbu` 会**按字节**复制到 `xcx/<端>/images/logo-circle.png`（图片走二进制复制，不能走文本写入） |
| 用法 | 视图里写绝对路径 `/images/logo-circle.png`（登录页品牌区已在用），三端通用 |
| 换图 | 只改 `xcx/common/images/` 里这一张，重新同步即可；建议先缩到显示尺寸的 2~3 倍像素（这里显示 108rpx ≈ 54px，200px 够 3 倍屏） |

### AI 徽章（与网页端同一张图）

网页端 AI 助手的形象是根目录的 `AIlogo.png`（1033×1373 竖版、约 1.4 MB），网页端在 `src/ui/App.jsx` 的 `.lt-jiQi` 里**原图等比直出**（不加底色、不做圆形裁切，圆裁会把头发切掉）。小程序端跟它保持一致：

| 项 | 说明 |
|---|---|
| 真源 | `xcx/common/images/ailogo.png`（193×256 / 80.6 KB），由 `powershell -ExecutionPolicy Bypass -File scripts/shengcheng-ai-logo.ps1` 从根目录 `AIlogo.png` 等比缩放生成（保留透明通道） |
| 同步 | `npm run xcx:tongbu` 按字节复制到 `xcx/<端>/images/ailogo.png` |
| 用法 | `<image class="ai-logo xiao" src="/images/ailogo.png" mode="heightFix" />`；尺寸类：`.ai-logo.xiao` = 56rpx（对应网页端 28px，消息头像 / 卡片小徽章）、`.ai-logo.da` = 112rpx（对应网页端 56px，欢迎态大徽章）；其它尺寸直接写 `style="height: 40rpx"` |
| 出现位置 | 地图右侧浮动入口 + 「切换」面板条目、AI 页顶部与首屏大徽章、消息头像（含「正在思考」）、报告页「智能诊断」卡头 |
| 换图 | 替换根目录 `AIlogo.png` → 跑生成脚本 → `npm run xcx:tongbu`（三端一起换） |

## 11. 二期计划

1. 登录态补齐：目前普通用户在接口里靠请求体带 `zhangHao` 识别，建议服务端补一个用户 token（与管理员令牌同套）。
2. 报告分享图（`canvas` 绘制 → `wx.saveImageToPhotosAlbum`）与订阅消息（体检完成提醒）。
3. 步行导航唤起已可用（`plat.openLocation`），可再加「路线方案对比」（步行/骑行/公交）。
4. 管理端只读页（查看配置与用户），写操作仍留在 Web / Electron 端。
