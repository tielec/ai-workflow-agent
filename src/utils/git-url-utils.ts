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

  // 2. HTTPS format: Remove authentication credentials
  // Pattern: https://<any-credentials>@<host-and-path>
  // Issue #58: Support passwords containing '@' characters
  // The pattern matches everything between protocol and the LAST '@' as credentials
  // Captures: (protocol)(credentials)(host-and-path)
  const httpsPattern = /^(https?:\/\/)(.+)@([^@]+)$/;
  const match = url.match(httpsPattern);

  if (match) {
    const [, protocol, , rest] = match;
    // Credentials detected (group 2), remove them by returning protocol + rest
    return `${protocol}${rest}`;
  }

  // 3. SSH format or normal HTTPS (no credentials): Return unchanged
  return url;
}
