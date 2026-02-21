import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';

import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';

/**
 * ネットワークヘルスチェック結果
 */
export interface NetworkHealthCheckResult {
  /** チェックが実行可能だったか（IMDSv2・CloudWatchアクセス成功） */
  available: boolean;
  /** 停止すべきか（両メトリクスがAND条件で閾値超過） */
  shouldStop: boolean;
  /** 直近5分の平均NetworkPacketsOut */
  networkPacketsOutCurrent: number;
  /** 過去1時間のピークNetworkPacketsOut */
  networkPacketsOutPeak: number;
  /** 直近5分の平均NetworkOut（バイト） */
  networkOutCurrent: number;
  /** 過去1時間のピークNetworkOut（バイト） */
  networkOutPeak: number;
  /** ピークからの低下率（%、両メトリクスの大きい方） */
  dropPercentage: number;
  /** 停止理由（shouldStop: true の場合のみ） */
  reason?: string;
}

interface Ec2InstanceMetadata {
  instanceId: string;
  region: string;
}

const IMDS_ENDPOINT = 'http://169.254.169.254';
const IMDS_TOKEN_TTL_SECONDS = '21600';
const IMDS_TIMEOUT_MS = 3000;
const METRIC_PERIOD_SECONDS = 300;
const METRIC_WINDOW_MS = 60 * 60 * 1000;

export async function checkNetworkHealth(dropThreshold: number): Promise<NetworkHealthCheckResult> {
  let metadata: Ec2InstanceMetadata;
  try {
    metadata = await getEc2InstanceMetadata();
  } catch (error) {
    logger.warn(`IMDSv2 access failed: ${getErrorMessage(error)}`);
    return buildUnavailableResult();
  }

  try {
    const [packetsOutResult, bytesOutResult] = await Promise.all([
      getCloudWatchMetrics(metadata.instanceId, metadata.region, 'NetworkPacketsOut'),
      getCloudWatchMetrics(metadata.instanceId, metadata.region, 'NetworkOut'),
    ]);

    const packetsDrop = calculateDropPercentage(
      packetsOutResult.current,
      packetsOutResult.peak,
    );
    const bytesDrop = calculateDropPercentage(bytesOutResult.current, bytesOutResult.peak);
    const dropPercentage = Math.max(packetsDrop, bytesDrop);
    const shouldStop = packetsDrop >= dropThreshold && bytesDrop >= dropThreshold;

    return {
      available: true,
      shouldStop,
      networkPacketsOutCurrent: packetsOutResult.current,
      networkPacketsOutPeak: packetsOutResult.peak,
      networkOutCurrent: bytesOutResult.current,
      networkOutPeak: bytesOutResult.peak,
      dropPercentage,
      reason: shouldStop ? 'network_throughput_degraded' : undefined,
    };
  } catch (error) {
    logger.warn(`CloudWatch metrics retrieval failed: ${getErrorMessage(error)}`);
    return buildUnavailableResult();
  }
}

async function getEc2InstanceMetadata(): Promise<Ec2InstanceMetadata> {
  const tokenResponse = await fetch(`${IMDS_ENDPOINT}/latest/api/token`, {
    method: 'PUT',
    headers: {
      'X-aws-ec2-metadata-token-ttl-seconds': IMDS_TOKEN_TTL_SECONDS,
    },
    signal: AbortSignal.timeout(IMDS_TIMEOUT_MS),
  });

  if (!tokenResponse.ok) {
    throw new Error(`IMDSv2 token request failed with status ${tokenResponse.status}`);
  }

  const token = (await tokenResponse.text()).trim();
  if (!token) {
    throw new Error('IMDSv2 token response was empty');
  }

  const instanceIdResponse = await fetch(`${IMDS_ENDPOINT}/latest/meta-data/instance-id`, {
    headers: {
      'X-aws-ec2-metadata-token': token,
    },
    signal: AbortSignal.timeout(IMDS_TIMEOUT_MS),
  });

  if (!instanceIdResponse.ok) {
    throw new Error(
      `IMDSv2 instance-id request failed with status ${instanceIdResponse.status}`,
    );
  }

  const instanceId = (await instanceIdResponse.text()).trim();
  if (!instanceId) {
    throw new Error('IMDSv2 instance-id response was empty');
  }

  const azResponse = await fetch(
    `${IMDS_ENDPOINT}/latest/meta-data/placement/availability-zone`,
    {
      headers: {
        'X-aws-ec2-metadata-token': token,
      },
      signal: AbortSignal.timeout(IMDS_TIMEOUT_MS),
    },
  );

  if (!azResponse.ok) {
    throw new Error(
      `IMDSv2 availability-zone request failed with status ${azResponse.status}`,
    );
  }

  const availabilityZone = (await azResponse.text()).trim();
  if (availabilityZone.length < 2) {
    throw new Error(`Invalid availability zone value: '${availabilityZone}'`);
  }

  return {
    instanceId,
    region: availabilityZone.slice(0, -1),
  };
}

async function getCloudWatchMetrics(
  instanceId: string,
  region: string,
  metricName: 'NetworkPacketsOut' | 'NetworkOut',
): Promise<{ current: number; peak: number }> {
  const client = new CloudWatchClient({ region });
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - METRIC_WINDOW_MS);

  const command = new GetMetricStatisticsCommand({
    Namespace: 'AWS/EC2',
    MetricName: metricName,
    Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
    StartTime: startTime,
    EndTime: endTime,
    Period: METRIC_PERIOD_SECONDS,
    Statistics: ['Average'],
  });

  const response = await client.send(command);
  const datapoints = response.Datapoints;

  if (!Array.isArray(datapoints) || datapoints.length === 0) {
    throw new Error(`No CloudWatch datapoints available for ${metricName}`);
  }

  const normalized = datapoints
    .map((datapoint) => {
      if (
        typeof datapoint.Average !== 'number' ||
        !Number.isFinite(datapoint.Average) ||
        !(datapoint.Timestamp instanceof Date)
      ) {
        return null;
      }
      return {
        average: datapoint.Average,
        timestamp: datapoint.Timestamp.getTime(),
      };
    })
    .filter((value): value is { average: number; timestamp: number } => value !== null);

  if (normalized.length === 0) {
    throw new Error(`CloudWatch datapoints for ${metricName} are missing valid data`);
  }

  const peak = Math.max(...normalized.map((datapoint) => datapoint.average));
  const latest = normalized.reduce((current, datapoint) =>
    datapoint.timestamp > current.timestamp ? datapoint : current,
  );

  return {
    current: latest.average,
    peak,
  };
}

function calculateDropPercentage(current: number, peak: number): number {
  if (peak <= 0) {
    return 0;
  }
  return (1 - current / peak) * 100;
}

function buildUnavailableResult(): NetworkHealthCheckResult {
  return {
    available: false,
    shouldStop: false,
    networkPacketsOutCurrent: 0,
    networkPacketsOutPeak: 0,
    networkOutCurrent: 0,
    networkOutPeak: 0,
    dropPercentage: 0,
  };
}
