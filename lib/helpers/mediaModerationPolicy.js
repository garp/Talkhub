// Central moderation policy for AWS Rekognition moderation labels.
//
// You can tune these with environment variables without code changes.
// This is intentionally conservative by default.
const splitCsv = (value) => String(value || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const uniq = (arr) => [...new Set(arr)];

const DEFAULT_BLOCK_PARENTS = [
  'Explicit Nudity',
  'Violence',
  'Visually Disturbing',
  'Hate Symbols',
];

const DEFAULT_REVIEW_PARENTS = [
  'Suggestive',
  'Rude Gestures',
  'Drugs',
  'Tobacco',
  'Alcohol',
  'Gambling',
];

// Note: Rekognition label names/parents can change over time; we treat these as "best effort".
exports.getMediaModerationPolicy = () => {
  const enabled = String(process.env.MEDIA_MODERATION_ENABLED || 'true').toLowerCase() !== 'false';

  const blockParents = uniq(splitCsv(process.env.MEDIA_MODERATION_BLOCK_PARENTS).length
    ? splitCsv(process.env.MEDIA_MODERATION_BLOCK_PARENTS)
    : DEFAULT_BLOCK_PARENTS);

  const reviewParents = uniq(splitCsv(process.env.MEDIA_MODERATION_REVIEW_PARENTS).length
    ? splitCsv(process.env.MEDIA_MODERATION_REVIEW_PARENTS)
    : DEFAULT_REVIEW_PARENTS);

  const blockMinConfidence = Number(process.env.MEDIA_MODERATION_BLOCK_MIN_CONFIDENCE || 80);
  const reviewMinConfidence = Number(process.env.MEDIA_MODERATION_REVIEW_MIN_CONFIDENCE || 70);

  const policyVersion = String(process.env.MEDIA_MODERATION_POLICY_VERSION || 'v1');

  return {
    enabled,
    policyVersion,
    blockParents,
    reviewParents,
    blockMinConfidence,
    reviewMinConfidence,
  };
};
