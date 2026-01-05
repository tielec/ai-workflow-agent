import { logger } from '../utils/logger.js';
import type { BugCandidate, RefactorCandidate, EnhancementProposal } from './types.js';
import { isExcludedDirectory, isExcludedFile } from './path-exclusion.js';

export function validateAnalysisResult<T extends BugCandidate | RefactorCandidate>(
  candidates: T[],
  candidateType: 'bug' | 'refactor',
): T[] {
  const validCandidates = candidates.filter((candidate) => {
    if (candidateType === 'bug') {
      return validateBugCandidate(candidate as BugCandidate);
    }
    return validateRefactorCandidate(candidate as RefactorCandidate);
  });

  logger.info(
    `Parsed ${candidates.length} ${candidateType} candidates, ${validCandidates.length} valid after validation.`,
  );

  return validCandidates;
}

export function validateBugCandidate(candidate: BugCandidate): boolean {
  if (!candidate || typeof candidate !== 'object') {
    logger.debug('Invalid candidate: not an object');
    return false;
  }

  if (!candidate.title || typeof candidate.title !== 'string') {
    logger.debug('Invalid candidate: missing or invalid title');
    return false;
  }
  if (candidate.title.length < 10 || candidate.title.length > 100) {
    logger.debug(
      `Invalid candidate: title length ${candidate.title.length} is out of range (10-100)`,
    );
    return false;
  }

  if (!candidate.file || typeof candidate.file !== 'string') {
    logger.debug('Invalid candidate: missing or invalid file');
    return false;
  }

  if (isExcludedDirectory(candidate.file)) {
    logger.debug(`Invalid candidate: file "${candidate.file}" is in excluded directory`);
    return false;
  }

  if (isExcludedFile(candidate.file)) {
    logger.debug(`Invalid candidate: file "${candidate.file}" matches excluded file pattern`);
    return false;
  }

  if (typeof candidate.line !== 'number' || candidate.line < 1) {
    logger.debug(`Invalid candidate: invalid line number ${candidate.line}`);
    return false;
  }

  if (!['high', 'medium', 'low'].includes(candidate.severity)) {
    logger.debug(`Invalid candidate: invalid severity "${candidate.severity}"`);
    return false;
  }

  if (!candidate.description || typeof candidate.description !== 'string') {
    logger.debug('Invalid candidate: missing or invalid description');
    return false;
  }
  if (candidate.description.length < 50) {
    logger.debug(
      `Invalid candidate: description length ${candidate.description.length} is too short (min 50)`,
    );
    return false;
  }

  if (!candidate.suggestedFix || typeof candidate.suggestedFix !== 'string') {
    logger.debug('Invalid candidate: missing or invalid suggestedFix');
    return false;
  }
  if (candidate.suggestedFix.length < 20) {
    logger.debug(
      `Invalid candidate: suggestedFix length ${candidate.suggestedFix.length} is too short (min 20)`,
    );
    return false;
  }

  if (candidate.category !== 'bug') {
    logger.debug(`Invalid candidate: invalid category "${candidate.category}" (must be "bug")`);
    return false;
  }

  return true;
}

export function validateRefactorCandidate(candidate: RefactorCandidate): boolean {
  if (!candidate || typeof candidate !== 'object') {
    logger.debug('Invalid refactor candidate: not an object');
    return false;
  }

  const validTypes = [
    'large-file',
    'large-function',
    'high-complexity',
    'duplication',
    'unused-code',
    'missing-docs',
  ];
  if (!validTypes.includes(candidate.type)) {
    logger.debug(`Invalid refactor candidate: invalid type "${candidate.type}"`);
    return false;
  }

  if (!candidate.filePath || typeof candidate.filePath !== 'string') {
    logger.debug('Invalid refactor candidate: missing or invalid filePath');
    return false;
  }

  if (isExcludedDirectory(candidate.filePath)) {
    logger.debug(
      `Invalid refactor candidate: filePath "${candidate.filePath}" is in excluded directory`,
    );
    return false;
  }

  if (isExcludedFile(candidate.filePath)) {
    logger.debug(
      `Invalid refactor candidate: filePath "${candidate.filePath}" matches excluded file pattern`,
    );
    return false;
  }

  if (candidate.lineRange !== undefined) {
    if (
      typeof candidate.lineRange !== 'object' ||
      typeof candidate.lineRange.start !== 'number' ||
      typeof candidate.lineRange.end !== 'number'
    ) {
      logger.debug('Invalid refactor candidate: invalid lineRange structure');
      return false;
    }
    if (candidate.lineRange.start < 1 || candidate.lineRange.end < candidate.lineRange.start) {
      logger.debug(
        `Invalid refactor candidate: invalid lineRange values (start: ${candidate.lineRange.start}, end: ${candidate.lineRange.end})`,
      );
      return false;
    }
  }

  if (!candidate.description || typeof candidate.description !== 'string') {
    logger.debug('Invalid refactor candidate: missing or invalid description');
    return false;
  }
  if (candidate.description.length < 25) {
    logger.debug(
      `Invalid refactor candidate: description length ${candidate.description.length} is too short (min 25)`,
    );
    return false;
  }

  if (!candidate.suggestion || typeof candidate.suggestion !== 'string') {
    logger.debug('Invalid refactor candidate: missing or invalid suggestion');
    return false;
  }
  if (candidate.suggestion.length < 25) {
    logger.debug(
      `Invalid refactor candidate: suggestion length ${candidate.suggestion.length} is too short (min 25)`,
    );
    return false;
  }

  if (!['low', 'medium', 'high'].includes(candidate.priority)) {
    logger.debug(`Invalid refactor candidate: invalid priority "${candidate.priority}"`);
    return false;
  }

  return true;
}

export function validateEnhancementProposal(proposal: EnhancementProposal): boolean {
  if (!proposal || typeof proposal !== 'object') {
    logger.debug('Invalid enhancement proposal: not an object');
    return false;
  }

  const validTypes = ['improvement', 'integration', 'automation', 'dx', 'quality', 'ecosystem'];
  if (!validTypes.includes(proposal.type)) {
    logger.debug(`Invalid enhancement proposal: invalid type "${proposal.type}"`);
    return false;
  }

  if (!proposal.title || typeof proposal.title !== 'string') {
    logger.debug('Invalid enhancement proposal: missing or invalid title');
    return false;
  }
  if (proposal.title.length < 10 || proposal.title.length > 200) {
    logger.debug(
      `Invalid enhancement proposal: title length ${proposal.title.length} is out of range (10-200)`,
    );
    return false;
  }

  if (!proposal.description || typeof proposal.description !== 'string') {
    logger.debug('Invalid enhancement proposal: missing or invalid description');
    return false;
  }
  if (proposal.description.length < 100) {
    logger.debug(
      `Invalid enhancement proposal: description length ${proposal.description.length} is too short (min 100)`,
    );
    return false;
  }

  if (!proposal.rationale || typeof proposal.rationale !== 'string') {
    logger.debug('Invalid enhancement proposal: missing or invalid rationale');
    return false;
  }
  if (proposal.rationale.length < 50) {
    logger.debug(
      `Invalid enhancement proposal: rationale length ${proposal.rationale.length} is too short (min 50)`,
    );
    return false;
  }

  if (!Array.isArray(proposal.implementation_hints) || proposal.implementation_hints.length === 0) {
    logger.debug('Invalid enhancement proposal: no implementation hints provided');
    return false;
  }

  if (!['low', 'medium', 'high'].includes(proposal.expected_impact)) {
    logger.debug(
      `Invalid enhancement proposal: invalid expected_impact "${proposal.expected_impact}"`,
    );
    return false;
  }

  if (!['small', 'medium', 'large'].includes(proposal.effort_estimate)) {
    logger.debug(
      `Invalid enhancement proposal: invalid effort_estimate "${proposal.effort_estimate}"`,
    );
    return false;
  }

  if (!Array.isArray(proposal.related_files) || proposal.related_files.length === 0) {
    logger.debug('Invalid enhancement proposal: no related files provided');
    return false;
  }

  return true;
}
