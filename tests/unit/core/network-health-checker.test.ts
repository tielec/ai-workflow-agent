/**
 * ユニットテスト: network-health-checker モジュール（Issue #721）
 *
 * テスト対象:
 * - checkNetworkHealth(): ネットワークスループット低下検知ロジック
 *
 * テスト戦略: UNIT_INTEGRATION（ユニット寄り）
 * - IMDSv2取得は fetch をモック
 * - CloudWatch API は SDK をモック
 * - 内部関数の挙動は checkNetworkHealth の結果で間接検証
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

type FetchMock = jest.Mock;

const IMDS_TOKEN_URL = 'http://169.254.169.254/latest/api/token';
const IMDS_INSTANCE_ID_URL = 'http://169.254.169.254/latest/meta-data/instance-id';
const IMDS_AZ_URL =
  'http://169.254.169.254/latest/meta-data/placement/availability-zone';

const MOCK_TOKEN = 'mock-imds-token';
const MOCK_INSTANCE_ID = 'i-0abcdef1234567890';

const createTextResponse = (text: string, ok = true, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    text: async () => text,
  }) as Response;

const buildDatapoints = (
  peak: number,
  current: number,
  latestTimestamp = new Date('2024-01-01T00:55:00Z'),
  peakTimestamp = new Date('2024-01-01T00:05:00Z'),
) => [
  { Timestamp: peakTimestamp, Average: peak },
  { Timestamp: latestTimestamp, Average: current },
];

async function loadChecker(options?: { mockLogger?: boolean }) {
  const sendMock = jest.fn();
  const cloudWatchClientMock = jest.fn().mockImplementation(() => ({
    send: sendMock,
  }));
  const getMetricStatisticsCommandMock = jest.fn().mockImplementation((input) => ({
    input,
  }));

  await jest.unstable_mockModule('@aws-sdk/client-cloudwatch', () => ({
    __esModule: true,
    CloudWatchClient: cloudWatchClientMock,
    GetMetricStatisticsCommand: getMetricStatisticsCommandMock,
  }));

  let loggerWarnMock: jest.Mock | undefined;
  if (options?.mockLogger) {
    loggerWarnMock = jest.fn();
    await jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
      __esModule: true,
      logger: {
        info: jest.fn(),
        warn: loggerWarnMock,
        error: jest.fn(),
        debug: jest.fn(),
      },
    }));
  }

  const module = await import('../../../src/core/network-health-checker.js');
  return {
    checkNetworkHealth: module.checkNetworkHealth,
    sendMock,
    cloudWatchClientMock,
    getMetricStatisticsCommandMock,
    loggerWarnMock,
  };
}

describe('network-health-checker', () => {
  let originalFetch: typeof global.fetch | undefined;
  let fetchMock: FetchMock;

  beforeEach(() => {
    originalFetch = global.fetch;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof global.fetch;
    jest.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch as typeof global.fetch;
    jest.restoreAllMocks();
  });

  // =============================================================================
  // checkNetworkHealth() - 正常系
  // =============================================================================

  test('NHC-001: checkNetworkHealth_正常系_メトリクス正常時にshouldStopがfalseを返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(1000, 800),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(5000000, 4000000),
      });

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(true);
    expect(result.shouldStop).toBe(false);
    expect(result.networkPacketsOutCurrent).toBe(800);
    expect(result.networkPacketsOutPeak).toBe(1000);
    expect(result.networkOutCurrent).toBe(4000000);
    expect(result.networkOutPeak).toBe(5000000);
    expect(result.dropPercentage).toBeCloseTo(20, 5);
    expect(result.reason).toBeUndefined();
  });

  test('NHC-002: checkNetworkHealth_正常系_両メトリクス低下時にshouldStopがtrueを返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(1000, 200),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(5000000, 500000),
      });

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(true);
    expect(result.shouldStop).toBe(true);
    expect(result.dropPercentage).toBeCloseTo(90, 5);
    expect(result.reason).toContain('network');
  });

  test('NHC-003: checkNetworkHealth_正常系_片方のメトリクスのみ低下時にshouldStopがfalseを返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(1000, 200),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(5000000, 4000000),
      });

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(true);
    expect(result.shouldStop).toBe(false);
    expect(result.dropPercentage).toBeCloseTo(80, 5);
  });

  test('NHC-004: checkNetworkHealth_正常系_NetworkOutのみ低下時にshouldStopがfalseを返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(1000, 800),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(5000000, 500000),
      });

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(true);
    expect(result.shouldStop).toBe(false);
    expect(result.dropPercentage).toBeCloseTo(90, 5);
  });

  test('NHC-005: checkNetworkHealth_正常系_カスタム閾値で判定が正しく動作する', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(1000, 400),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(5000000, 2000000),
      });

    const result = await checkNetworkHealth(50);

    expect(result.available).toBe(true);
    expect(result.shouldStop).toBe(true);
    expect(result.dropPercentage).toBeCloseTo(60, 5);
  });

  test('NHC-006: checkNetworkHealth_境界値_閾値ちょうどの低下率でshouldStopがtrueを返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(1000, 300),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(5000000, 1500000),
      });

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(true);
    expect(result.shouldStop).toBe(true);
    expect(result.dropPercentage).toBeCloseTo(70, 5);
  });

  test('NHC-007: checkNetworkHealth_境界値_閾値をわずかに下回る低下率でshouldStopがfalseを返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(1000, 301),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(5000000, 1505000),
      });

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(true);
    expect(result.shouldStop).toBe(false);
  });

  test('NHC-008: checkNetworkHealth_境界値_peakが0の場合に低下率が0を返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(0, 0),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(0, 0),
      });

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(true);
    expect(result.shouldStop).toBe(false);
    expect(result.dropPercentage).toBe(0);
  });

  test('NHC-009: checkNetworkHealth_境界値_currentが最大値の場合に低下率が0となりshouldStopがfalseを返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(500, 800),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(2000000, 4000000),
      });

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(true);
    expect(result.shouldStop).toBe(false);
    expect(result.dropPercentage).toBe(0);
  });

  test('NHC-010: checkNetworkHealth_境界値_閾値0で常にshouldStopがtrueを返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(1000, 999),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(5000000, 4999000),
      });

    const result = await checkNetworkHealth(0);

    expect(result.available).toBe(true);
    expect(result.shouldStop).toBe(true);
  });

  test('NHC-011: checkNetworkHealth_境界値_閾値100で完全停止時のみshouldStopがtrueを返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(1000, 0),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(5000000, 0),
      });

    const result = await checkNetworkHealth(100);

    expect(result.available).toBe(true);
    expect(result.shouldStop).toBe(true);
    expect(result.dropPercentage).toBeCloseTo(100, 5);
  });

  // =============================================================================
  // checkNetworkHealth() - 異常系
  // =============================================================================

  test('NHC-012: checkNetworkHealth_異常系_非EC2環境でIMDSv2タイムアウト時にavailableがfalseを返す', async () => {
    const { checkNetworkHealth } = await loadChecker({ mockLogger: true });

    fetchMock.mockRejectedValueOnce(
      new DOMException('The operation was aborted.', 'AbortError'),
    );

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(false);
    expect(result.shouldStop).toBe(false);
    expect(result.networkPacketsOutCurrent).toBe(0);
    expect(result.networkPacketsOutPeak).toBe(0);
    expect(result.networkOutCurrent).toBe(0);
    expect(result.networkOutPeak).toBe(0);
    expect(result.dropPercentage).toBe(0);
  });

  test('NHC-013: checkNetworkHealth_異常系_IMDSv2インスタンスID取得失敗時にavailableがfalseを返す', async () => {
    const { checkNetworkHealth } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse('not-found', false, 404));

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(false);
    expect(result.shouldStop).toBe(false);
  });

  test('NHC-014: checkNetworkHealth_異常系_CloudWatch API呼び出しエラー時にavailableがfalseを返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker({ mockLogger: true });

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock.mockRejectedValueOnce(new Error('AccessDeniedException'));

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(false);
    expect(result.shouldStop).toBe(false);
  });

  test('NHC-015: checkNetworkHealth_異常系_CloudWatchデータポイントが空の場合にavailableがfalseを返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({ Datapoints: [] })
      .mockResolvedValueOnce({ Datapoints: [] });

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(false);
    expect(result.shouldStop).toBe(false);
  });

  test('NHC-016: checkNetworkHealth_異常系_ネットワーク接続エラー時にavailableがfalseを返す', async () => {
    const { checkNetworkHealth } = await loadChecker({ mockLogger: true });

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(false);
    expect(result.shouldStop).toBe(false);
  });

  // =============================================================================
  // IMDSv2 取得フロー（内部関数の間接検証）
  // =============================================================================

  test('NHC-017: getEc2InstanceMetadata_正常系_インスタンスメタデータが正しく取得される', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(1000, 800),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(5000000, 4000000),
      });

    await checkNetworkHealth(70);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(IMDS_TOKEN_URL);
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      'X-aws-ec2-metadata-token-ttl-seconds': '21600',
    });
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[1][0]).toBe(IMDS_INSTANCE_ID_URL);
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      'X-aws-ec2-metadata-token': MOCK_TOKEN,
    });
    expect(fetchMock.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[2][0]).toBe(IMDS_AZ_URL);
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
      'X-aws-ec2-metadata-token': MOCK_TOKEN,
    });
    expect(fetchMock.mock.calls[2][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  test('NHC-018: getEc2InstanceMetadata_正常系_リージョン導出が正しく動作する', async () => {
    const patterns = [
      { az: 'ap-northeast-1a', region: 'ap-northeast-1' },
      { az: 'us-east-1b', region: 'us-east-1' },
      { az: 'eu-west-2c', region: 'eu-west-2' },
      { az: 'ap-southeast-1a', region: 'ap-southeast-1' },
    ];

    for (const pattern of patterns) {
      jest.resetModules();
      const { checkNetworkHealth, cloudWatchClientMock, sendMock } =
        await loadChecker();

      fetchMock
        .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
        .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
        .mockResolvedValueOnce(createTextResponse(pattern.az));

      sendMock
        .mockResolvedValueOnce({
          Datapoints: buildDatapoints(1000, 800),
        })
        .mockResolvedValueOnce({
          Datapoints: buildDatapoints(5000000, 4000000),
        });

      await checkNetworkHealth(70);

      expect(cloudWatchClientMock).toHaveBeenCalled();
      expect(cloudWatchClientMock.mock.calls[0][0]).toMatchObject({
        region: pattern.region,
      });
    }
  });

  // =============================================================================
  // CloudWatch パラメータ/データポイント検証（内部関数の間接検証）
  // =============================================================================

  test('NHC-019: getCloudWatchMetrics_正常系_メトリクスデータが正しく取得される', async () => {
    const { checkNetworkHealth, sendMock, getMetricStatisticsCommandMock } =
      await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: [
          { Timestamp: new Date('2024-01-01T00:00:00Z'), Average: 800 },
          { Timestamp: new Date('2024-01-01T00:05:00Z'), Average: 1000 },
          { Timestamp: new Date('2024-01-01T00:10:00Z'), Average: 950 },
          { Timestamp: new Date('2024-01-01T00:55:00Z'), Average: 600 },
        ],
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(5000000, 4000000),
      });

    const result = await checkNetworkHealth(70);

    expect(result.networkPacketsOutCurrent).toBe(600);
    expect(result.networkPacketsOutPeak).toBe(1000);

    const commandInput = getMetricStatisticsCommandMock.mock.calls[0][0];
    expect(commandInput).toMatchObject({
      Namespace: 'AWS/EC2',
      MetricName: 'NetworkPacketsOut',
      Dimensions: [{ Name: 'InstanceId', Value: MOCK_INSTANCE_ID }],
      Period: 300,
      Statistics: ['Average'],
    });
    expect(commandInput.StartTime).toBeInstanceOf(Date);
    expect(commandInput.EndTime).toBeInstanceOf(Date);
    const windowMs = commandInput.EndTime.getTime() - commandInput.StartTime.getTime();
    expect(windowMs).toBeGreaterThanOrEqual(59 * 60 * 1000);
    expect(windowMs).toBeLessThanOrEqual(61 * 60 * 1000);
  });

  test('NHC-020: getCloudWatchMetrics_正常系_データポイントがTimestampでソートされる', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: [
          { Timestamp: new Date('2024-01-01T00:55:00Z'), Average: 200 },
          { Timestamp: new Date('2024-01-01T00:00:00Z'), Average: 1000 },
          { Timestamp: new Date('2024-01-01T00:30:00Z'), Average: 800 },
        ],
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(5000000, 4000000),
      });

    const result = await checkNetworkHealth(70);

    expect(result.networkPacketsOutCurrent).toBe(200);
    expect(result.networkPacketsOutPeak).toBe(1000);
  });

  test('NHC-021: getCloudWatchMetrics_異常系_データポイントが空の場合にエラーをスローする', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({ Datapoints: [] })
      .mockResolvedValueOnce({ Datapoints: buildDatapoints(5000000, 4000000) });

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(false);
  });

  test('NHC-022: getCloudWatchMetrics_異常系_Datapointsがundefinedの場合にエラーをスローする', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({ Datapoints: undefined })
      .mockResolvedValueOnce({ Datapoints: buildDatapoints(5000000, 4000000) });

    const result = await checkNetworkHealth(70);

    expect(result.available).toBe(false);
  });

  // =============================================================================
  // 低下率計算・デフォルト結果（内部関数の間接検証）
  // =============================================================================

  test.each([
    { current: 300, peak: 1000, expected: 70 },
    { current: 500, peak: 1000, expected: 50 },
    { current: 0, peak: 1000, expected: 100 },
    { current: 1000, peak: 1000, expected: 0 },
    { current: 800, peak: 1000, expected: 20 },
  ])(
    'NHC-023: calculateDropPercentage_正常系_低下率が正しく計算される (current=$current, peak=$peak)',
    async ({ current, peak, expected }) => {
      const { checkNetworkHealth, sendMock } = await loadChecker();

      fetchMock
        .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
        .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
        .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

      sendMock
        .mockResolvedValueOnce({
          Datapoints: buildDatapoints(peak, current),
        })
        .mockResolvedValueOnce({
          Datapoints: buildDatapoints(peak, current),
        });

      const result = await checkNetworkHealth(70);

      expect(result.dropPercentage).toBeCloseTo(expected, 5);
    },
  );

  test('NHC-024: calculateDropPercentage_境界値_peakが0の場合に0を返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(0, 0),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(0, 0),
      });

    const result = await checkNetworkHealth(70);

    expect(result.dropPercentage).toBe(0);
  });

  test('NHC-025: calculateDropPercentage_境界値_currentが最大値の場合に0を返す', async () => {
    const { checkNetworkHealth, sendMock } = await loadChecker();

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(1000, 1500),
      })
      .mockResolvedValueOnce({
        Datapoints: buildDatapoints(1000, 1500),
      });

    const result = await checkNetworkHealth(70);

    expect(result.dropPercentage).toBe(0);
  });

  test('NHC-026: buildUnavailableResult_正常系_全フィールドが適切なデフォルト値で返却される', async () => {
    const { checkNetworkHealth } = await loadChecker();

    fetchMock.mockRejectedValueOnce(new Error('IMDS error'));

    const result = await checkNetworkHealth(70);

    expect(result).toEqual({
      available: false,
      shouldStop: false,
      networkPacketsOutCurrent: 0,
      networkPacketsOutPeak: 0,
      networkOutCurrent: 0,
      networkOutPeak: 0,
      dropPercentage: 0,
    });
  });

  // =============================================================================
  // ロギング検証
  // =============================================================================

  test('NHC-027: checkNetworkHealth_ロギング_IMDSv2タイムアウト時にwarningログが出力される', async () => {
    const { checkNetworkHealth, loggerWarnMock } = await loadChecker({ mockLogger: true });

    fetchMock.mockRejectedValueOnce(
      new DOMException('The operation was aborted.', 'AbortError'),
    );

    await checkNetworkHealth(70);

    expect(loggerWarnMock).toHaveBeenCalled();
    expect(String(loggerWarnMock?.mock.calls[0][0])).toContain('IMDSv2');
  });

  test('NHC-028: checkNetworkHealth_ロギング_CloudWatch APIエラー時にwarningログが出力される', async () => {
    const { checkNetworkHealth, sendMock, loggerWarnMock } =
      await loadChecker({ mockLogger: true });

    fetchMock
      .mockResolvedValueOnce(createTextResponse(MOCK_TOKEN))
      .mockResolvedValueOnce(createTextResponse(MOCK_INSTANCE_ID))
      .mockResolvedValueOnce(createTextResponse('ap-northeast-1a'));

    sendMock.mockRejectedValueOnce(new Error('AccessDeniedException'));

    await checkNetworkHealth(70);

    expect(loggerWarnMock).toHaveBeenCalled();
    expect(String(loggerWarnMock?.mock.calls[0][0])).toContain('CloudWatch');
  });
});
