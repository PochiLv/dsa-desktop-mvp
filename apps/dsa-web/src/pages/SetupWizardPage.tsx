import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Play, Send, Settings, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { analysisApi } from '../api/analysis';
import { getParsedApiError, type ParsedApiError } from '../api/error';
import { systemConfigApi } from '../api/systemConfig';
import { ApiErrorAlert, Badge, Button, InlineAlert, Input } from '../components/common';
import type {
  SetupStatusResponse,
  SystemConfigItem,
  TestLLMChannelResponse,
  TestNotificationChannelResponse,
} from '../types/systemConfig';

type WizardNotice = {
  variant: 'success' | 'warning' | 'danger' | 'info';
  title: string;
  message: string;
} | null;

const CHANNEL_NAME = 'my_proxy';
const CHANNEL_PREFIX = 'LLM_MY_PROXY';

function itemValue(items: SystemConfigItem[], key: string) {
  return items.find((item) => item.key === key)?.value ?? '';
}

function stripOpenAiPrefix(model: string) {
  const trimmed = model.trim();
  return trimmed.toLowerCase().startsWith('openai/') ? trimmed.slice('openai/'.length) : trimmed;
}

function normalizePrimaryModel(model: string) {
  const trimmed = model.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.includes('/') ? trimmed : `openai/${trimmed}`;
}

function splitStockCodes(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatMissingSetup(status: SetupStatusResponse | null) {
  if (!status || status.isComplete) {
    return '';
  }
  return status.checks
    .filter((check) => check.required && check.status === 'needs_action')
    .map((check) => check.title)
    .slice(0, 3)
    .join('、');
}

const SetupWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const [configVersion, setConfigVersion] = useState('');
  const [maskToken, setMaskToken] = useState('******');
  const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [stockList, setStockList] = useState('');
  const [feishuWebhookUrl, setFeishuWebhookUrl] = useState('');
  const [feishuSecret, setFeishuSecret] = useState('');
  const [loadError, setLoadError] = useState<ParsedApiError | null>(null);
  const [actionError, setActionError] = useState<ParsedApiError | null>(null);
  const [notice, setNotice] = useState<WizardNotice>(null);
  const [llmTestResult, setLlmTestResult] = useState<TestLLMChannelResponse | null>(null);
  const [notificationTestResult, setNotificationTestResult] = useState<TestNotificationChannelResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTestingLlm, setIsTestingLlm] = useState(false);
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isStartingAnalysis, setIsStartingAnalysis] = useState(false);

  const missingSetupLabel = useMemo(() => formatMissingSetup(setupStatus), [setupStatus]);
  const stockCodes = useMemo(() => splitStockCodes(stockList), [stockList]);
  const canSubmitCore = Boolean(baseUrl.trim() && apiKey.trim() && model.trim() && stockCodes.length > 0);
  const normalizedPrimaryModel = normalizePrimaryModel(model);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [config, status] = await Promise.all([
        systemConfigApi.getConfig(false),
        systemConfigApi.getSetupStatus(),
      ]);
      setConfigVersion(config.configVersion);
      setMaskToken(config.maskToken || '******');
      setSetupStatus(status);
      setBaseUrl(itemValue(config.items, `${CHANNEL_PREFIX}_BASE_URL`) || itemValue(config.items, 'OPENAI_BASE_URL'));
      setApiKey(itemValue(config.items, `${CHANNEL_PREFIX}_API_KEY`) || itemValue(config.items, 'OPENAI_API_KEY'));
      setModel(stripOpenAiPrefix(itemValue(config.items, `${CHANNEL_PREFIX}_MODELS`) || itemValue(config.items, 'LITELLM_MODEL')));
      setStockList(itemValue(config.items, 'STOCK_LIST'));
      setFeishuWebhookUrl(itemValue(config.items, 'FEISHU_WEBHOOK_URL'));
      setFeishuSecret(itemValue(config.items, 'FEISHU_WEBHOOK_SECRET'));
    } catch (error: unknown) {
      setLoadError(getParsedApiError(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = '首次配置 - DSA';
    void load();
  }, [load]);

  const refreshSetupStatus = useCallback(async () => {
    const status = await systemConfigApi.getSetupStatus();
    setSetupStatus(status);
    return status;
  }, []);

  const testLlm = useCallback(async () => {
    setIsTestingLlm(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await systemConfigApi.testLLMChannel({
        name: CHANNEL_NAME,
        protocol: 'openai',
        baseUrl,
        apiKey,
        models: [model],
        enabled: true,
        timeoutSeconds: 20,
      });
      setLlmTestResult(result);
      setNotice({
        variant: result.success ? 'success' : 'danger',
        title: result.success ? 'LLM 连接成功' : 'LLM 连接失败',
        message: result.resolvedModel ? `${result.message} · ${result.resolvedModel}` : result.message,
      });
    } catch (error: unknown) {
      setActionError(getParsedApiError(error));
    } finally {
      setIsTestingLlm(false);
    }
  }, [apiKey, baseUrl, model]);

  const testNotification = useCallback(async () => {
    setIsTestingNotification(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await systemConfigApi.testNotificationChannel({
        channel: 'feishu',
        items: [
          { key: 'FEISHU_WEBHOOK_URL', value: feishuWebhookUrl },
          { key: 'FEISHU_WEBHOOK_SECRET', value: feishuSecret },
        ],
        maskToken,
        title: 'DSA 通知测试',
        content: '这是一条来自 DSA 桌面向导的飞书通知测试。',
        timeoutSeconds: 20,
      });
      setNotificationTestResult(result);
      setNotice({
        variant: result.success ? 'success' : 'danger',
        title: result.success ? '飞书测试成功' : '飞书测试失败',
        message: result.message,
      });
    } catch (error: unknown) {
      setActionError(getParsedApiError(error));
    } finally {
      setIsTestingNotification(false);
    }
  }, [feishuSecret, feishuWebhookUrl, maskToken]);

  const saveConfig = useCallback(async () => {
    if (!canSubmitCore) {
      setNotice({
        variant: 'warning',
        title: '还缺少必要信息',
        message: '请先填好 Base URL、API Key、模型名和至少一只股票。',
      });
      return false;
    }

    setIsSaving(true);
    setActionError(null);
    setNotice(null);
    try {
      const updateResult = await systemConfigApi.update({
        configVersion,
        maskToken,
        reloadNow: true,
        items: [
          { key: 'LLM_CHANNELS', value: CHANNEL_NAME },
          { key: `${CHANNEL_PREFIX}_PROTOCOL`, value: 'openai' },
          { key: `${CHANNEL_PREFIX}_BASE_URL`, value: baseUrl.trim() },
          { key: `${CHANNEL_PREFIX}_API_KEY`, value: apiKey.trim() },
          { key: `${CHANNEL_PREFIX}_MODELS`, value: model.trim() },
          { key: `${CHANNEL_PREFIX}_ENABLED`, value: 'true' },
          { key: 'LITELLM_MODEL', value: normalizedPrimaryModel },
          { key: 'AGENT_LITELLM_MODEL', value: '' },
          { key: 'STOCK_LIST', value: stockCodes.join(',') },
          { key: 'FEISHU_WEBHOOK_URL', value: feishuWebhookUrl.trim() },
          { key: 'FEISHU_WEBHOOK_SECRET', value: feishuSecret.trim() },
        ],
      });
      setConfigVersion(updateResult.configVersion);
      const status = await refreshSetupStatus();
      setNotice({
        variant: status.isComplete ? 'success' : 'warning',
        title: status.isComplete ? '基础配置已完成' : '配置已保存',
        message: status.isComplete
          ? '现在可以开始生成第一份股票分析报告。'
          : `还缺少 ${formatMissingSetup(status) || '部分配置'}，可以继续补齐后再试跑。`,
      });
      return true;
    } catch (error: unknown) {
      setActionError(getParsedApiError(error));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [
    apiKey,
    baseUrl,
    canSubmitCore,
    configVersion,
    feishuSecret,
    feishuWebhookUrl,
    maskToken,
    model,
    normalizedPrimaryModel,
    refreshSetupStatus,
    stockCodes,
  ]);

  const saveAndStartAnalysis = useCallback(async () => {
    setIsStartingAnalysis(true);
    try {
      const saved = await saveConfig();
      if (!saved) {
        return;
      }
      await analysisApi.analyzeAsync({
        stockCode: stockCodes[0],
        originalQuery: stockCodes[0],
        selectionSource: 'manual',
        notify: false,
      });
      setNotice({
        variant: 'success',
        title: '分析任务已开始',
        message: `已提交 ${stockCodes[0]}，回到首页后可以查看任务进度和报告。`,
      });
      navigate('/');
    } catch (error: unknown) {
      setActionError(getParsedApiError(error));
    } finally {
      setIsStartingAnalysis(false);
    }
  }, [navigate, saveConfig, stockCodes]);

  return (
    <main className="min-h-screen bg-base px-4 py-6 text-foreground md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-3 border-b border-border/60 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="info" className="rounded-md">桌面 MVP</Badge>
              <Badge variant={setupStatus?.isComplete ? 'success' : 'warning'} className="rounded-md">
                {setupStatus?.isComplete ? '可开始分析' : '首次配置'}
              </Badge>
            </div>
            <h1 className="text-2xl font-semibold tracking-normal text-foreground">配置第一份股票分析报告</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-secondary-text">
              填入第三方 OpenAI-compatible 接口和股票代码，测试连接后即可在本机生成报告。
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate('/settings')}>
            <Settings className="h-4 w-4" />
            高级设置
          </Button>
        </header>

        {loadError ? <ApiErrorAlert error={loadError} actionLabel="重试" onAction={() => void load()} /> : null}
        {actionError ? <ApiErrorAlert error={actionError} /> : null}
        {notice ? (
          <InlineAlert
            variant={notice.variant}
            title={notice.title}
            message={notice.message}
            className="rounded-lg shadow-none"
          />
        ) : null}
        {!setupStatus?.isComplete && missingSetupLabel ? (
          <InlineAlert
            variant="warning"
            title="基础配置未完成"
            message={`当前还缺少 ${missingSetupLabel}。完成下面的必要项后，系统会自动写入本机配置。`}
            className="rounded-lg shadow-none"
          />
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-border/70 bg-card p-5 shadow-soft-card">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan/20 bg-cyan/10 text-cyan">
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">AI 模型</h2>
                  <p className="text-xs text-secondary-text">支持 OpenAI-compatible Base URL。</p>
                </div>
              </div>
              <div className="grid gap-4">
                <Input
                  label="Base URL"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://api.example.com/v1"
                  disabled={isLoading || isSaving}
                />
                <Input
                  label="API Key"
                  type="password"
                  allowTogglePassword
                  iconType="key"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="sk-..."
                  disabled={isLoading || isSaving}
                />
                <Input
                  label="模型名"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="qwen-plus 或 openai/qwen-plus"
                  hint={normalizedPrimaryModel ? `将保存为 LITELLM_MODEL=${normalizedPrimaryModel}` : undefined}
                  disabled={isLoading || isSaving}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void testLlm()}
                    isLoading={isTestingLlm}
                    loadingText="测试中..."
                    disabled={!baseUrl.trim() || !apiKey.trim() || !model.trim() || isSaving}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    测试 LLM
                  </Button>
                  {llmTestResult ? (
                    <Badge variant={llmTestResult.success ? 'success' : 'danger'} className="rounded-md">
                      {llmTestResult.success ? '连接成功' : llmTestResult.errorCode || '连接失败'}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-card p-5 shadow-soft-card">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-success/20 bg-success/10 text-success">
                  <Wand2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">股票代码</h2>
                  <p className="text-xs text-secondary-text">至少填 1 只股票，多个代码用英文逗号分隔。</p>
                </div>
              </div>
              <Input
                label="自选股列表"
                value={stockList}
                onChange={(event) => setStockList(event.target.value)}
                placeholder="600519,hk00700,AAPL"
                hint={stockCodes.length ? `当前 ${stockCodes.length} 只：${stockCodes.slice(0, 5).join('、')}` : undefined}
                disabled={isLoading || isSaving}
              />
            </div>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-lg border border-border/70 bg-card p-5 shadow-soft-card">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-warning/20 bg-warning/10 text-warning">
                  <Send className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground">飞书通知</h2>
                  <p className="text-xs text-secondary-text">可选。只想先生成报告可以留空。</p>
                </div>
              </div>
              <div className="grid gap-4">
                <Input
                  label="Webhook URL"
                  value={feishuWebhookUrl}
                  onChange={(event) => setFeishuWebhookUrl(event.target.value)}
                  placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                  disabled={isLoading || isSaving}
                />
                <Input
                  label="签名密钥"
                  type="password"
                  allowTogglePassword
                  value={feishuSecret}
                  onChange={(event) => setFeishuSecret(event.target.value)}
                  disabled={isLoading || isSaving}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void testNotification()}
                  isLoading={isTestingNotification}
                  loadingText="测试中..."
                  disabled={!feishuWebhookUrl.trim() || isSaving}
                  className="w-fit"
                >
                  <Send className="h-4 w-4" />
                  测试飞书
                </Button>
                {notificationTestResult ? (
                  <Badge variant={notificationTestResult.success ? 'success' : 'danger'} className="w-fit rounded-md">
                    {notificationTestResult.success ? '通知成功' : notificationTestResult.errorCode || '通知失败'}
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-card p-5 shadow-soft-card">
              <h2 className="text-base font-semibold text-foreground">下一步</h2>
              <p className="mt-2 text-sm leading-6 text-secondary-text">
                保存后会写入本机配置文件。点击开始分析会提交第一只股票，报告生成后可在首页查看。
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <Button
                  variant="primary"
                  onClick={() => void saveAndStartAnalysis()}
                  isLoading={isStartingAnalysis}
                  loadingText="提交中..."
                  disabled={!canSubmitCore || isSaving || isTestingLlm}
                >
                  <Play className="h-4 w-4" />
                  保存并开始分析
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void saveConfig()}
                  isLoading={isSaving && !isStartingAnalysis}
                  loadingText="保存中..."
                  disabled={!canSubmitCore || isStartingAnalysis}
                >
                  仅保存配置
                </Button>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
};

export default SetupWizardPage;
