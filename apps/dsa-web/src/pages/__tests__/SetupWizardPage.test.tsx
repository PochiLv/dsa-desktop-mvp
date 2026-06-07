import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analysisApi } from '../../api/analysis';
import { systemConfigApi } from '../../api/systemConfig';
import SetupWizardPage from '../SetupWizardPage';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../../api/systemConfig', () => ({
  systemConfigApi: {
    getConfig: vi.fn(),
    getSetupStatus: vi.fn(),
    testLLMChannel: vi.fn(),
    testNotificationChannel: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../api/analysis', () => ({
  analysisApi: {
    analyzeAsync: vi.fn(),
  },
}));

describe('SetupWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigateMock.mockReset();
    vi.mocked(systemConfigApi.getConfig).mockResolvedValue({
      configVersion: 'v1',
      maskToken: '******',
      updatedAt: '2026-06-06T00:00:00Z',
      items: [
        { key: 'LLM_MY_PROXY_BASE_URL', value: '', rawValueExists: false, isMasked: false },
        { key: 'LLM_MY_PROXY_API_KEY', value: '', rawValueExists: false, isMasked: false },
        { key: 'LLM_MY_PROXY_MODELS', value: '', rawValueExists: false, isMasked: false },
        { key: 'STOCK_LIST', value: '', rawValueExists: false, isMasked: false },
        { key: 'FEISHU_WEBHOOK_URL', value: '', rawValueExists: false, isMasked: false },
        { key: 'FEISHU_WEBHOOK_SECRET', value: '', rawValueExists: false, isMasked: false },
      ],
    });
    vi.mocked(systemConfigApi.getSetupStatus).mockResolvedValue({
      isComplete: false,
      readyForSmoke: false,
      requiredMissingKeys: ['llm_primary', 'stock_list'],
      nextStepKey: 'llm_primary',
      checks: [
        {
          key: 'llm_primary',
          title: 'LLM 主渠道',
          category: 'ai_model',
          required: true,
          status: 'needs_action',
          message: '尚未检测到主模型配置',
        },
        {
          key: 'stock_list',
          title: '自选股',
          category: 'base',
          required: true,
          status: 'needs_action',
          message: '当前 STOCK_LIST 为空',
        },
      ],
    });
    vi.mocked(systemConfigApi.testLLMChannel).mockResolvedValue({
      success: true,
      message: 'LLM channel test succeeded',
      error: null,
      errorCode: null,
      stage: 'chat_completion',
      retryable: false,
      details: {},
      resolvedProtocol: 'openai',
      resolvedModel: 'openai/qwen-plus',
      latencyMs: 120,
      capabilityResults: {},
    });
    vi.mocked(systemConfigApi.update).mockResolvedValue({
      success: true,
      configVersion: 'v2',
      appliedCount: 9,
      skippedMaskedCount: 0,
      reloadTriggered: true,
      updatedKeys: ['LLM_CHANNELS', 'STOCK_LIST'],
      warnings: [],
    });
    vi.mocked(analysisApi.analyzeAsync).mockResolvedValue({
      taskId: 'task-1',
      status: 'pending',
    });
  });

  it('tests the OpenAI-compatible channel without saving', async () => {
    render(
      <MemoryRouter>
        <SetupWizardPage />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText('Base URL'), {
      target: { value: 'https://api.example.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'sk-test' },
    });
    fireEvent.change(screen.getByLabelText('模型名'), {
      target: { value: 'qwen-plus' },
    });

    fireEvent.click(screen.getByRole('button', { name: '测试 LLM' }));

    await waitFor(() => {
      expect(systemConfigApi.testLLMChannel).toHaveBeenCalledWith({
        name: 'my_proxy',
        protocol: 'openai',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        models: ['qwen-plus'],
        enabled: true,
        timeoutSeconds: 20,
      });
    });
    expect(await screen.findByText('LLM 连接成功')).toBeInTheDocument();
  });

  it('saves core config and starts the first stock analysis', async () => {
    vi.mocked(systemConfigApi.getSetupStatus)
      .mockResolvedValueOnce({
        isComplete: false,
        readyForSmoke: false,
        requiredMissingKeys: ['llm_primary', 'stock_list'],
        nextStepKey: 'llm_primary',
        checks: [],
      })
      .mockResolvedValueOnce({
        isComplete: true,
        readyForSmoke: true,
        requiredMissingKeys: [],
        nextStepKey: null,
        checks: [],
      });

    render(
      <MemoryRouter>
        <SetupWizardPage />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText('Base URL'), {
      target: { value: 'https://api.example.com/v1' },
    });
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'sk-test' },
    });
    fireEvent.change(screen.getByLabelText('模型名'), {
      target: { value: 'qwen-plus' },
    });
    fireEvent.change(screen.getByLabelText('自选股列表'), {
      target: { value: '600519, AAPL' },
    });

    fireEvent.click(screen.getByRole('button', { name: '保存并开始分析' }));

    await waitFor(() => {
      expect(systemConfigApi.update).toHaveBeenCalledWith({
        configVersion: 'v1',
        maskToken: '******',
        reloadNow: true,
        items: expect.arrayContaining([
          { key: 'LLM_CHANNELS', value: 'my_proxy' },
          { key: 'LLM_MY_PROXY_PROTOCOL', value: 'openai' },
          { key: 'LLM_MY_PROXY_BASE_URL', value: 'https://api.example.com/v1' },
          { key: 'LLM_MY_PROXY_API_KEY', value: 'sk-test' },
          { key: 'LLM_MY_PROXY_MODELS', value: 'qwen-plus' },
          { key: 'LITELLM_MODEL', value: 'openai/qwen-plus' },
          { key: 'STOCK_LIST', value: '600519,AAPL' },
        ]),
      });
    });
    expect(analysisApi.analyzeAsync).toHaveBeenCalledWith({
      stockCode: '600519',
      originalQuery: '600519',
      selectionSource: 'manual',
      notify: false,
    });
    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});
