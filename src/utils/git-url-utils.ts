/**
 * Git URL Utilities - Sanitize Git remote URLs to remove authentication credentials
 *
 * This module provides utilities to remove HTTPS authentication information
 * (tokens, username:password) from Git remote URLs before saving to metadata.json.
 *
 * Issue #54: Prevent GitHub Personal Access Tokens from being stored in metadata.json
 */

/**
 * Sanitize Git remote URL by removing HTTPS authentication credentials
 *
 * Removes authentication information from HTTPS URLs while preserving SSH URLs unchanged.
 * This prevents GitHub Personal Access Tokens from being stored in metadata.json.
 *
 * @param url - Git remote URL
 * @returns Sanitized URL (credentials removed for HTTPS, unchanged for SSH)
 *
 * @example
 * // HTTPS + token
 * sanitizeGitUrl('https://ghp_xxxxx@github.com/owner/repo.git')
 * // => 'https://github.com/owner/repo.git'
 *
 * @example
 * // HTTPS + username:password
 * sanitizeGitUrl('https://user:pass@github.com/owner/repo.git')
 * // => 'https://github.com/owner/repo.git'
 *
 * @example
 * // SSH format (unchanged)
 * sanitizeGitUrl('git@github.com:owner/repo.git')
 * // => 'git@github.com:owner/repo.git'
 *
 * @example
 * // Normal HTTPS (unchanged)
 * sanitizeGitUrl('https://github.com/owner/repo.git')
 * // => 'https://github.com/owner/repo.git'
 */
export function sanitizeGitUrl(url: string): string {
  // 1. Failsafe: Return empty/null/undefined as-is
  if (!url || url.trim() === '') {
    return url;
  }

  // 2. Only process HTTP/HTTPS URLs; leave others unchanged
  const lowerUrl = url.toLowerCase();
  if (!lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://')) {
    return url;
  }

  // 3. Locate the authority section (between // and the next /, or end-of-string)
  const protocolTerminator = url.indexOf('//');
  if (protocolTerminator === -1) {
    return url;
  }

  const authorityStart = protocolTerminator + 2;
  const pathStart = url.indexOf('/', authorityStart);
  const authorityEnd = pathStart === -1 ? url.length : pathStart;

  // 4. Remove credentials that appear before the host (last '@' in the authority)
  const authority = url.slice(authorityStart, authorityEnd);
  const lastAt = authority.lastIndexOf('@');
  if (lastAt === -1) {
    return url;
  }

  // Preserve host, path, query, and fragment after the credentials separator
  return `${url.slice(0, authorityStart)}${authority.slice(lastAt + 1)}${url.slice(authorityEnd)}`;
}
