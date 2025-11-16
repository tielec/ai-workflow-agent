/**
 * テストフィクスチャ: リソースリークのサンプルコード
 */

import fs from 'node:fs';

// ❌ createReadStream未クローズ（検出されるべき）
export function readFileWithoutClose() {
  const stream = fs.createReadStream('data.txt');
  // close()もpipe()も呼ばれていない
  return stream;
}

// ✅ createReadStreamをpipe()で使用（検出されない）
export function readFileWithPipe() {
  const stream = fs.createReadStream('data.txt');
  stream.pipe(process.stdout);
  return stream;
}

// ✅ createReadStreamを明示的にclose()（検出されない）
export function readFileWithClose() {
  const stream = fs.createReadStream('data.txt');
  stream.on('end', () => stream.close());
  return stream;
}

// ❌ 別の関数でもcreateReadStream未クローズ（検出されるべき）
export function anotherReadWithoutClose() {
  const fileStream = fs.createReadStream('another.txt');
  // リソースリーク
  return fileStream;
}
