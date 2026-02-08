# 統合検証スクリプト（PowerShell版）
# Agent Teams 用の包括的な検証を実行します

# エラーアクションの設定
$ErrorActionPreference = "Continue"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "AI Workflow Agent - 統合検証" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 検証結果を保存する変数
$lintResult = $false
$testResult = $false
$buildResult = $false

# 1. TypeScript 型チェック
Write-Host "----------------------------------------" -ForegroundColor Yellow
Write-Host "ステップ 1/3: TypeScript 型チェック" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow
try {
    npm run lint
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ TypeScript 型チェック成功" -ForegroundColor Green
        $lintResult = $true
    } else {
        Write-Host "✗ TypeScript 型チェック失敗" -ForegroundColor Red
        $lintResult = $false
    }
} catch {
    Write-Host "✗ TypeScript 型チェック失敗（例外）" -ForegroundColor Red
    $lintResult = $false
}
Write-Host ""

# 2. ユニット・統合テスト
Write-Host "----------------------------------------" -ForegroundColor Yellow
Write-Host "ステップ 2/3: ユニット・統合テスト" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow
try {
    npm test
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ テスト成功" -ForegroundColor Green
        $testResult = $true
    } else {
        Write-Host "✗ テスト失敗" -ForegroundColor Red
        $testResult = $false
    }
} catch {
    Write-Host "✗ テスト失敗（例外）" -ForegroundColor Red
    $testResult = $false
}
Write-Host ""

# 3. ビルド確認
Write-Host "----------------------------------------" -ForegroundColor Yellow
Write-Host "ステップ 3/3: ビルド確認" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Yellow
try {
    npm run build
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ ビルド成功" -ForegroundColor Green
        $buildResult = $true
    } else {
        Write-Host "✗ ビルド失敗" -ForegroundColor Red
        $buildResult = $false
    }
} catch {
    Write-Host "✗ ビルド失敗（例外）" -ForegroundColor Red
    $buildResult = $false
}
Write-Host ""

# 総合結果
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "検証結果サマリー" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

if ($lintResult) {
    Write-Host "✓ TypeScript 型チェック: 成功" -ForegroundColor Green
} else {
    Write-Host "✗ TypeScript 型チェック: 失敗" -ForegroundColor Red
}

if ($testResult) {
    Write-Host "✓ テスト: 成功" -ForegroundColor Green
} else {
    Write-Host "✗ テスト: 失敗" -ForegroundColor Red
}

if ($buildResult) {
    Write-Host "✓ ビルド: 成功" -ForegroundColor Green
} else {
    Write-Host "✗ ビルド: 失敗" -ForegroundColor Red
}
Write-Host ""

# 最終判定
if ($lintResult -and $testResult -and $buildResult) {
    Write-Host "=========================================" -ForegroundColor Green
    Write-Host "すべての検証に合格しました！" -ForegroundColor Green
    Write-Host "=========================================" -ForegroundColor Green
    exit 0
} else {
    Write-Host "=========================================" -ForegroundColor Red
    Write-Host "一部の検証に失敗しました" -ForegroundColor Red
    Write-Host "=========================================" -ForegroundColor Red
    exit 1
}
