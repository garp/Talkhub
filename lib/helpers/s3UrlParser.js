// Best-effort parser for standard S3 virtual-hosted-style URLs.
//
// Examples:
// - https://my-bucket.s3.eu-central-1.amazonaws.com/images/abc.png
// - https://my-bucket.s3.amazonaws.com/images/abc.png
//
// Returns: { bucket, key } or null.
exports.parseS3Url = (url) => {
  if (!url || typeof url !== 'string') return null;
  let u;
  try {
    u = new URL(url);
  } catch (_) {
    return null;
  }

  const host = u.hostname || '';
  const pathname = u.pathname || '';
  if (!host.includes('.s3.')) return null;

  // bucket.s3.<region>.amazonaws.com OR bucket.s3.amazonaws.com
  const bucket = host.split('.s3.')[0];
  if (!bucket) return null;

  const key = pathname.replace(/^\/+/, '');
  if (!key) return null;

  return { bucket, key };
};
