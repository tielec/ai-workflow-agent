#!/bin/bash
# 統合検証スクリプト（Bash版）
# Agent Teams 用の包括的な検証を実行します

set -e  # エラー時に即座に終了

echo "========================================="
echo "AI Workflow Agent - 統合検証"
echo "========================================="
echo ""

# 色の定義
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 検証結果を保存する変数
LINT_RESULT=0
TEST_RESULT=0
BUILD_RESULT=0

# 1. TypeScript 型チェック
echo "----------------------------------------"
echo "ステップ 1/3: TypeScript 型チェック"
echo "----------------------------------------"
if npm run lint; then
    echo -e "${GREEN}✓ TypeScript 型チェック成功${NC}"
    LINT_RESULT=1
else
    echo -e "${RED}✗ TypeScript 型チェック失敗${NC}"
    LINT_RESULT=0
fi
echo ""

# 2. ユニット・統合テスト
echo "----------------------------------------"
echo "ステップ 2/3: ユニット・統合テスト"
echo "----------------------------------------"
if npm test; then
    echo -e "${GREEN}✓ テスト成功${NC}"
    TEST_RESULT=1
else
    echo -e "${RED}✗ テスト失敗${NC}"
    TEST_RESULT=0
fi
echo ""

# 3. ビルド確認
echo "----------------------------------------"
echo "ステップ 3/3: ビルド確認"
echo "----------------------------------------"
if npm run build; then
    echo -e "${GREEN}✓ ビルド成功${NC}"
    BUILD_RESULT=1
else
    echo -e "${RED}✗ ビルド失敗${NC}"
    BUILD_RESULT=0
fi
echo ""

# 総合結果
echo "========================================="
echo "検証結果サマリー"
echo "========================================="
if [ $LINT_RESULT -eq 1 ]; then
    echo -e "${GREEN}✓ TypeScript 型チェック: 成功${NC}"
else
    echo -e "${RED}✗ TypeScript 型チェック: 失敗${NC}"
fi

if [ $TEST_RESULT -eq 1 ]; then
    echo -e "${GREEN}✓ テスト: 成功${NC}"
else
    echo -e "${RED}✗ テスト: 失敗${NC}"
fi

if [ $BUILD_RESULT -eq 1 ]; then
    echo -e "${GREEN}✓ ビルド: 成功${NC}"
else
    echo -e "${RED}✗ ビルド: 失敗${NC}"
fi
echo ""

# 最終判定
if [ $LINT_RESULT -eq 1 ] && [ $TEST_RESULT -eq 1 ] && [ $BUILD_RESULT -eq 1 ]; then
    echo -e "${GREEN}=========================================${NC}"
    echo -e "${GREEN}すべての検証に合格しました！${NC}"
    echo -e "${GREEN}=========================================${NC}"
    exit 0
else
    echo -e "${RED}=========================================${NC}"
    echo -e "${RED}一部の検証に失敗しました${NC}"
    echo -e "${RED}=========================================${NC}"
    exit 1
fi
