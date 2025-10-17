#!/usr/bin/env bash

# テスト実行スクリプト
# Node.js 18+ の built-in test runner を使用

set -e

echo "========================================="
echo "AI Workflow v2 - Test Runner"
echo "========================================="
echo ""

# プロジェクトルートに移動
cd "$(dirname "$0")/.."

echo "[INFO] Building TypeScript files..."
npm run build

echo ""
echo "[INFO] Running Unit Tests..."
echo "========================================="

# ユニットテスト実行
node --test --loader tsx tests/unit/*.test.ts

echo ""
echo "[INFO] Running Integration Tests..."
echo "========================================="

# インテグレーションテスト実行
node --test --loader tsx tests/integration/*.test.ts

echo ""
echo "========================================="
echo "[OK] All tests completed!"
echo "========================================="
