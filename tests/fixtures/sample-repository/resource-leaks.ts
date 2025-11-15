/**
 * テストフィクスチャ: リソースリークのサンプル
 * Phase 5 Test Implementation: Issue #121
 */

import fs from 'node:fs';

/**
 * リソースリーク（Issue候補として検出されるべき）
 */
export function readFileWithoutClose(): void {
  const stream = fs.createReadStream('data.txt');
  // close()もpipe()も呼ばれていない
}

/**
 * 正しいリソース管理（検出されないべき）
 */
export function readFileWithClose(): void {
  const stream = fs.createReadStream('data.txt');
  stream.on('end', () => stream.close());
}

/**
 * pipe()使用（検出されないべき）
 */
export function readFileWithPipe(): void {
  const stream = fs.createReadStream('input.txt');
  const writeStream = fs.createWriteStream('output.txt');
  stream.pipe(writeStream);
}

/**
 * 複数のストリーム（一部リークあり）
 */
export function multipleStreams(): void {
  const stream1 = fs.createReadStream('file1.txt');
  stream1.on('end', () => stream1.close());

  const stream2 = fs.createReadStream('file2.txt');
  // stream2はcloseされていない（リーク）

  const stream3 = fs.createReadStream('file3.txt');
  stream3.on('end', () => stream3.close());
}
