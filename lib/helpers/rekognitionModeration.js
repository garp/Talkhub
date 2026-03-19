const {
  RekognitionClient,
  DetectModerationLabelsCommand,
  StartContentModerationCommand,
  GetContentModerationCommand,
} = require('@aws-sdk/client-rekognition');

const awsConfig = require('../configs/aws.config');
const { getMediaModerationPolicy } = require('./mediaModerationPolicy');

const buildClient = () => {
  const region = awsConfig.AWS_REGION || process.env.AWS_REGION;
  if (!region) {
    throw new Error('AWS_REGION is required for Rekognition');
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || awsConfig.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || awsConfig.AWS_SECRET_ACCESS_KEY;

  // Prefer default credential chain (IAM role) when keys are not present.
  const base = { region };
  if (accessKeyId && secretAccessKey) {
    return new RekognitionClient({
      ...base,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return new RekognitionClient(base);
};

const normalizeImageLabels = (labels = []) => (labels || []).map((l) => ({
  name: l.Name || null,
  parentName: l.ParentName || null,
  confidence: typeof l.Confidence === 'number' ? l.Confidence : null,
  timestampMs: null,
})).filter((l) => l.name);

// For videos, collapse to a "max confidence per label" view.
const normalizeVideoLabels = (entries = []) => {
  const byKey = new Map();
  (entries || []).forEach((entry) => {
    const ts = typeof entry.Timestamp === 'number' ? entry.Timestamp : null;
    const m = entry.ModerationLabel || {};
    const l = m.ModerationLabel || m || {};
    const name = l.Name || null;
    const parentName = l.ParentName || null;
    const confidence = typeof l.Confidence === 'number' ? l.Confidence : null;
    if (!name) return;
    const key = `${parentName || ''}::${name}`;
    const current = byKey.get(key);
    if (!current || (confidence != null && confidence > (current.confidence || 0))) {
      byKey.set(key, {
        name,
        parentName,
        confidence,
        timestampMs: ts,
      });
    }
  });
  return [...byKey.values()];
};

const evaluateLabels = (labels = []) => {
  const policy = getMediaModerationPolicy();
  if (!policy.enabled) {
    return {
      status: 'skipped',
      ban: {
        isBanned: false,
        primaryReason: {
          label: null,
          parentLabel: null,
          confidence: null,
          threshold: null,
        },
        reasons: [],
        policyVersion: policy.policyVersion,
      },
    };
  }

  const reasons = [];
  const reviewReasons = [];

  (labels || []).forEach((l) => {
    const parent = l.parentName || null;
    const confidence = typeof l.confidence === 'number' ? l.confidence : null;
    if (!parent || confidence == null) return;

    if (policy.blockParents.includes(parent) && confidence >= policy.blockMinConfidence) {
      reasons.push({
        label: l.name,
        parentLabel: parent,
        confidence,
        threshold: policy.blockMinConfidence,
      });
    } else if (policy.reviewParents.includes(parent) && confidence >= policy.reviewMinConfidence) {
      reviewReasons.push({
        label: l.name,
        parentLabel: parent,
        confidence,
        threshold: policy.reviewMinConfidence,
      });
    }
  });

  const sortDesc = (a, b) => (b.confidence || 0) - (a.confidence || 0);
  reasons.sort(sortDesc);
  reviewReasons.sort(sortDesc);

  if (reasons.length) {
    const top = reasons[0];
    return {
      status: 'rejected',
      ban: {
        isBanned: true,
        primaryReason: {
          label: top.label || null,
          parentLabel: top.parentLabel || null,
          confidence: top.confidence || null,
          threshold: top.threshold || null,
        },
        reasons,
        policyVersion: policy.policyVersion,
      },
    };
  }

  if (reviewReasons.length) {
    const top = reviewReasons[0];
    return {
      status: 'needs_review',
      ban: {
        isBanned: false,
        primaryReason: {
          label: top.label || null,
          parentLabel: top.parentLabel || null,
          confidence: top.confidence || null,
          threshold: top.threshold || null,
        },
        reasons: reviewReasons,
        policyVersion: policy.policyVersion,
      },
    };
  }

  return {
    status: 'approved',
    ban: {
      isBanned: false,
      primaryReason: {
        label: null,
        parentLabel: null,
        confidence: null,
        threshold: null,
      },
      reasons: [],
      policyVersion: policy.policyVersion,
    },
  };
};

exports.detectImageModeration = async ({ bucket, key, minConfidence = 50 }) => {
  const client = buildClient();
  const cmd = new DetectModerationLabelsCommand({
    Image: { S3Object: { Bucket: bucket, Name: key } },
    MinConfidence: minConfidence,
  });
  const resp = await client.send(cmd);
  const labels = normalizeImageLabels(resp && resp.ModerationLabels);
  const decision = evaluateLabels(labels);
  return { resp, labels, decision };
};

exports.startVideoModeration = async ({ bucket, key, minConfidence = 50 }) => {
  const client = buildClient();
  const topicArn = process.env.AWS_REKOGNITION_SNS_TOPIC_ARN || null;
  const roleArn = process.env.AWS_REKOGNITION_ROLE_ARN || null;

  const cmd = new StartContentModerationCommand({
    Video: { S3Object: { Bucket: bucket, Name: key } },
    MinConfidence: minConfidence,
    NotificationChannel: topicArn && roleArn ? { SNSTopicArn: topicArn, RoleArn: roleArn } : undefined,
  });
  const resp = await client.send(cmd);
  return { resp, jobId: resp && resp.JobId ? resp.JobId : null };
};

exports.getVideoModeration = async ({ jobId, maxPages = 10 }) => {
  const client = buildClient();
  let nextToken;
  const all = [];
  let pages = 0;
  let jobStatus = null;

  do {
    pages += 1;
    const cmd = new GetContentModerationCommand({
      JobId: jobId,
      NextToken: nextToken,
      MaxResults: 1000,
      SortBy: 'TIMESTAMP',
    });
    const resp = await client.send(cmd);
    jobStatus = resp && resp.JobStatus ? resp.JobStatus : null;
    if (Array.isArray(resp && resp.ModerationLabels)) {
      all.push(...resp.ModerationLabels);
    }
    nextToken = resp && resp.NextToken ? resp.NextToken : undefined;
  } while (nextToken && pages < maxPages);

  const labels = normalizeVideoLabels(all);
  const decision = evaluateLabels(labels);
  return {
    jobStatus,
    labels,
    decision,
    pages,
  };
};

exports.evaluateLabels = evaluateLabels;
