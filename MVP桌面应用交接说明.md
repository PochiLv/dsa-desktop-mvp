# Daily Stock Analysis MVP 桌面应用交接说明

## 背景

目标是把 `ZhuLinsen/daily_stock_analysis` 改造成更接近普通用户可用的桌面应用：

下载安装后，用户不需要懂 Python、Node、命令行或 `.env`，只需要在界面里配置第三方 LLM 的 URL / API Key / 模型名，再填股票代码，就能测试连接、运行分析、查看报告。

原试用仓库位置：

```bash
/Users/wktx/Documents/股票交易/daily_stock_analysis
```

当前 MVP 二次开发仓库位置：

```bash
/Users/wktx/Documents/股票交易/dsa-desktop-mvp
```

原试用仓库保留为参考，不建议继续直接修改；MVP 改造请在当前新仓库里进行。

## 当前已验证的本地配置

本地 WebUI 已能运行：

```bash
cd /Users/wktx/Documents/股票交易/daily_stock_analysis
.venv/bin/python main.py --webui-only --host 127.0.0.1 --port 8000
```

本地 `.env` 已配置过：

- OpenAI-compatible 第三方 LLM 渠道，模型为 `qwen3.6-plus`
- `TAVILY_API_KEYS`
- `SERPAPI_API_KEYS`
- `TUSHARE_TOKEN`，但当前账号没有 Tushare `daily` 接口权限
- 飞书 `FEISHU_WEBHOOK_URL` + `FEISHU_WEBHOOK_SECRET`
- `SEARXNG_PUBLIC_INSTANCES_ENABLED=false`
- `MARKET_REVIEW_ENABLED=false`
- `WEBUI_AUTO_BUILD=false`

飞书通知已经通过 WebUI 后端接口真实测试成功：

```bash
curl -sS -X POST 'http://127.0.0.1:8000/api/v1/system/config/notification/test-channel' \
  -H 'Content-Type: application/json' \
  --data '{"channel":"feishu","title":"DSA 通知测试","content":"这是一条来自本地 daily_stock_analysis 的飞书通知测试。","timeout_seconds":20}'
```

返回过：

```text
success: true
message: feishu 通知测试成功
latency_ms: 432
```

注意：不要在交接或提交中泄露 `.env` 里的 Key。

## 当前项目已有的产品化基础

这个项目已经不是纯命令行工程，已有桌面应用雏形：

- FastAPI 后端：`api/app.py`
- React WebUI：`apps/dsa-web`
- Electron 桌面壳：`apps/dsa-desktop`
- Electron 入口：`apps/dsa-desktop/main.js`
- 桌面打包配置：`apps/dsa-desktop/package.json`
- 桌面打包说明：`docs/desktop-package.md`
- 小白客户端说明：`docs/beginner-client-setup.md`
- 系统设置页：`apps/dsa-web/src/pages/SettingsPage.tsx`
- 配置服务：`src/services/system_config_service.py`
- 首次配置状态接口：`GET /api/v1/system/config/setup/status`
- LLM 测试接口：`POST /api/v1/system/config/llm/test-channel`
- 通知测试接口：`POST /api/v1/system/config/notification/test-channel`

Electron 当前逻辑大致是：

1. 启动 Electron。
2. 自动创建/读取 `.env`。
3. 自动拉起本地 FastAPI 后端。
4. 等待 `/api/health` 就绪。
5. 加载本地 WebUI。

## MVP 目标

第一版不要做 SaaS，也不要做复杂平台。目标只做桌面 MVP：

1. 用户下载安装应用。
2. 首次打开进入设置向导。
3. 填第三方 OpenAI-compatible LLM 配置：
   - Base URL
   - API Key
   - Model
4. 填自选股列表。
5. 点击测试 LLM。
6. 点击开始分析。
7. 能看到一份分析报告。
8. 可选配置飞书通知并测试。

## MVP 暂不做

- 多用户
- 云端 SaaS
- 账号体系
- 计费系统
- 内置平台 Key 给别人共用
- 复杂数据源市场
- 所有模型服务商都做完整适配
- 投资建议/荐股包装

## 建议优先开发项

### 1. 首次启动向导

基于现有 `GET /api/v1/system/config/setup/status` 判断是否配置完整。

如果未完整，引导用户进入一个简单向导，而不是让用户面对完整设置页。

建议步骤：

1. AI 模型配置
2. 自选股配置
3. 可选新闻源/飞书通知
4. 测试并开始分析

### 2. OpenAI-compatible 模板

MVP 先支持一种最通用配置：

```dotenv
LLM_CHANNELS=my_proxy
LLM_MY_PROXY_PROTOCOL=openai
LLM_MY_PROXY_BASE_URL=<用户填写>
LLM_MY_PROXY_API_KEY=<用户填写>
LLM_MY_PROXY_MODELS=<用户填写>
LITELLM_MODEL=openai/<用户填写的模型名>
```

注意：模型名是否需要加 `openai/` 前缀，要以现有 `LLMChannelEditor` 和 `SystemConfigService` 的规范为准。

### 3. 一键测试

优先复用现有接口：

- LLM：`POST /api/v1/system/config/llm/test-channel`
- 通知：`POST /api/v1/system/config/notification/test-channel`

### 4. 一键分析

复用现有 WebUI 首页/分析接口即可。MVP 可以只支持单只股票试跑。

### 5. 错误提示产品化

把工程错误转成普通用户能懂的话：

- Key 无效
- Base URL 不通
- 模型名不存在
- 余额/额度不足
- 新闻源未配置，所以新闻缺失
- Tushare token 配了但账号无接口权限

## 技术风险

1. PyInstaller 打包 Python 后端时可能有 hidden import 问题。
2. Akshare/yfinance/Tushare/搜索源不稳定，需要在 UI 里显示数据缺失原因。
3. macOS 正式分发需要签名和公证。
4. Windows 正式分发最好做代码签名。
5. 不建议把自己的 API Key 内置到客户端，容易泄露且不可控。

## 推荐下一会话开场词

可以直接复制下面这段开启新会话：

```text
我们继续做 /Users/wktx/Documents/股票交易/daily_stock_analysis 这个项目。

目标：把它改造成别人下载安装后，配置第三方 OpenAI-compatible URL / API Key / 模型名，再填股票代码，就能测试并生成股票分析报告的桌面 MVP。

请先阅读：
/Users/wktx/Documents/股票交易/daily_stock_analysis/MVP桌面应用交接说明.md

然后请你先做技术落地计划，不要马上大改代码。重点判断：
1. 首次启动向导放在哪里最合适；
2. 现有 SettingsPage / SystemConfigService / setup status 接口怎么复用；
3. MVP 第一轮需要改哪些文件；
4. 怎么验证本地 WebUI 和 Electron 桌面端都能跑。

计划确认后再开始实现。
```

## 推荐第一轮验收标准

MVP 第一轮可以这样验收：

1. 清空关键配置后，打开应用能看到首次配置入口。
2. 填入 Base URL / API Key / Model / 股票代码。
3. 点击测试 LLM 成功。
4. 点击保存后，`GET /api/v1/system/config/setup/status` 返回 `is_complete=true`。
5. 回首页分析 `600519` 能产出报告。
6. 不泄露任何 Key。
