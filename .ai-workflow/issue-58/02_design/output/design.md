# 詳細設計書 - Issue #58

## 0. Planning Document・Requirements Documentの確認

Planning Phase（`.ai-workflow/issue-58/00_planning/output/planning.md`）とRequirements Phase（`.ai-workflow/issue-58/01_requirements/output/requirements.md`）で策定された開発計画と要件を確認しました。

### 開発戦略サマリー（Planning Documentより）
- **実装戦略**: EXTEND（既存実装の軽微な改善）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
- **テストコード戦略**: BOTH_TEST（既存テスト修正 + 新規テスト作成）
- **複雑度**: 簡単
- **見積もり工数**: 4~8時間
- **リスク評価**: 低

### スコープ確認（Requirements Documentより）
- **FR-1**: Task 1 - 正規表現パターンの改善（`sanitizeGitUrl()`）
- **FR-2**: Task 2 - トークン検出モニタリングスクリプト作成
- **FR-3**: Task 3 - マイグレーションコマンド実装（`ai-workflow migrate --sanitize-tokens`）

### 前提
- Issue #54で既に統合テスト100%成功済み
- Defense in Depthパターンで保護済み（`SecretMasker` + `sanitizeGitUrl()` の2層防御）
- すべてのタスクは低優先度（実運用への影響は極めて低い）

---

## 1. アーキテクチャ設計

### システム全体図

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Workflow CLI                              │
│                      (src/main.ts, src/commands/*)                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
                ▼                   ▼                   ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │   Task 1:       │ │   Task 2:       │ │   Task 3:       │
    │   正規表現改善   │ │   モニタリング   │ │   マイグレーション│
    │                 │ │   スクリプト     │ │   コマンド       │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
            │                   │                   │
            ▼                   ▼                   ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │ git-url-utils.ts│ │ monitor-token-  │ │ migrate.ts      │
    │ sanitizeGitUrl()│ │ detection.ts    │ │ (新規コマンド)   │
    └─────────────────┘ └─────────────────┘ └─────────────────┘
            │                   │                   │
            │                   │                   └──────┐
            │                   │                          │
            ▼                   ▼                          ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                  既存コンポーネント                          │
    │  - SecretMasker (src/core/secret-masker.ts)                │
    │  - MetadataManager (src/core/metadata-manager.ts)          │
    │  - Logger (src/utils/logger.ts)                            │
    │  - fs-extra, glob (Node.js標準ライブラリ)                  │
    └─────────────────────────────────────────────────────────────┘
```

### コンポーネント間の関係

#### Task 1: 正規表現パターンの改善
- **入力**: Git URL文字列（HTTPS形式）
- **処理**: `sanitizeGitUrl()` 関数の正規表現パターン変更
- **出力**: サニタイズされたGit URL（トークン除去済み）
- **依存**: なし（純粋関数）

#### Task 2: トークン検出モニタリングスクリプト
- **入力**: ワークフローログファイル（`.ai-workflow/issue-*/execute/agent_log_raw.txt` 等）
- **処理**: 正規表現でトークン検出警告メッセージをスキャン、統計集計
- **出力**: Markdownレポート（`.ai-workflow/issue-58/08_report/output/monitoring_report.md`）
- **依存**: `fs-extra`, `glob`, `logger`

#### Task 3: マイグレーションコマンド
- **入力**: 既存メタデータファイル（`.ai-workflow/issue-*/metadata.json`）
- **処理**:
  1. メタデータファイル探索（`glob`）
  2. トークン検出（正規表現）
  3. サニタイズ（`sanitizeGitUrl()` 再利用）
  4. バックアップ作成（`.bak` ファイル）
  5. ファイル保存（`fs-extra`）
- **出力**: サニタイズされたメタデータファイル、バックアップファイル
- **依存**: `sanitizeGitUrl()`, `MetadataManager`, `logger`, `fs-extra`, `glob`, `commander`

### データフロー

#### Task 1: 正規表現パターンの改善
```
Git URL (HTTPS形式)
    │
    ▼
[正規表現マッチング] (/^(https?:\/\/)(.+)@([^@]+)$/)
    │
    ├─ マッチ成功 → トークン除去 → サニタイズ済みURL
    └─ マッチ失敗 → 元のURLを返す（SSH形式等）
```

#### Task 2: モニタリングスクリプト
```
ワークフローログファイル群
    │
    ▼
[ファイル探索] (glob: .ai-workflow/issue-*/execute/agent_log_raw.txt)
    │
    ▼
[正規表現スキャン] (/\[WARNING\] GitHub Personal Access Token detected/)
    │
    ▼
[統計集計]
    ├─ 検出回数
    ├─ Issue番号ごとの内訳
    ├─ フェーズごとの内訳
    └─ 日付ごとのトレンド
    │
    ▼
Markdownレポート生成
```

#### Task 3: マイグレーションコマンド
```
.ai-workflow/issue-*/metadata.json
    │
    ▼
[メタデータファイル探索] (glob: .ai-workflow/issue-*/metadata.json)
    │
    ▼
[JSON解析]
    │
    ▼
[トークン検出] (target_repository.remote_url フィールドスキャン)
    │
    ├─ トークンあり → サニタイズ処理へ
    └─ トークンなし → 次のファイルへ
    │
    ▼
[sanitizeGitUrl() 呼び出し]
    │
    ▼
[バックアップ作成] (metadata.json.bak)
    │
    ▼
[ファイル保存]
    │
    ▼
[レポート出力] (処理件数、検出数、エラー数)
```

---

## 2. 実装戦略判断

### 実装戦略: EXTEND

**判断根拠**:

1. **既存実装の軽微な改善**
   - Task 1: `src/utils/git-url-utils.ts` の `sanitizeGitUrl()` 関数の正規表現パターンを1行変更（line 48）
   - Task 3: 既存の `sanitizeGitUrl()` 関数を再利用し、新規CLIコマンド `migrate` を追加（`src/main.ts` に約10行追加）

2. **新規ファイル作成は最小限**
   - Task 2: `scripts/monitor-token-detection.ts`（約50~100行）
   - Task 3: `src/commands/migrate.ts`（約200~300行）、`tests/unit/commands/migrate.test.ts`、`tests/integration/migrate-sanitize-tokens.test.ts`
   - 合計5ファイル（Planning Documentと一致）

3. **既存ファイル修正は3ファイルのみ**
   - `src/utils/git-url-utils.ts`（1行変更）
   - `tests/unit/utils/git-url-utils.test.ts`（4件のテスト期待値更新）
   - `src/main.ts`（約10行追加）

4. **アーキテクチャ変更なし**
   - 既存のGit URLサニタイゼーション機能（Issue #54で実装済み）を拡張するのみ
   - Defense in Depthパターン（`SecretMasker` + `sanitizeGitUrl()`）は維持

5. **CREATE戦略を採用しない理由**
   - 新規サブシステムの作成ではなく、既存機能の改善
   - 既存コンポーネント（`sanitizeGitUrl()`, `MetadataManager`, `logger`）への依存が強い

6. **REFACTOR戦略を採用しない理由**
   - コード構造の改善が目的ではなく、機能拡張が目的
   - Issue #54で既にクリーンな実装が完了している

---

## 3. テスト戦略判断

### テスト戦略: UNIT_INTEGRATION

**判断根拠**:

1. **UNIT（ユニットテスト）が必要な理由**
   - **Task 1（正規表現改善）**: 純粋関数 `sanitizeGitUrl()` のエッジケース検証
     - パスワードに `@` を含むケース（例: `https://user:p@ss@word@github.com/owner/repo.git`）
     - 既存テストケースの回帰テスト（4件のテスト期待値更新）
   - **Task 3（マイグレーションコマンド）**: ロジック検証
     - 正常系（トークン検出 → サニタイズ）
     - エラー系（ファイル読み込み失敗、書き込み失敗）
     - エッジケース（空メタデータ、トークンなし、SSH形式URL）

2. **INTEGRATION（統合テスト）が必要な理由**
   - **Task 3（マイグレーションコマンド）**: E2Eフロー検証
     - 既存メタデータ読み込み → トークン検出 → サニタイズ → バックアップ作成 → 保存 → 検証
     - ドライラン機能（`--dry-run` でファイルが変更されないこと）
     - 外部ファイル操作を伴うため、統合テストが必須

3. **BDD不要の理由**
   - エンドユーザー向け機能ではなく、開発者向けツール
   - ユーザーストーリー駆動ではなく、技術的な改善のため
   - Given-When-Then形式は受け入れ基準（Requirements Document）で既に定義済み

4. **他の戦略を採用しない理由**
   - **UNIT_ONLY不適**: Task 3のマイグレーションコマンドは外部ファイル操作を伴うため、統合テストが必要
   - **INTEGRATION_ONLY不適**: Task 1の正規表現は純粋関数であり、ユニットテストが効率的
   - **BDD系不適**: エンドユーザー向け機能ではない

5. **Task 2（モニタリングスクリプト）のテスト**
   - テストコード不要（スクリプトとして実行し、レポートを手動検証）
   - 理由: 集計ロジックは単純であり、1回限りの実行のため、テスト工数が過剰

---

## 4. テストコード戦略判断

### テストコード戦略: BOTH_TEST

**判断根拠**:

1. **EXTEND_TEST（既存テストの拡張）が必要な理由**
   - **Task 1**: 既存テストファイル `tests/unit/utils/git-url-utils.test.ts` の修正
     - 4件のテストケース期待値を更新（パスワードに `@` を含むケース）
     - 既存テストスイートに統合することで、回帰テストを強化

2. **CREATE_TEST（新規テスト作成）が必要な理由**
   - **Task 3**: 新規CLIコマンド `migrate` のテストファイル作成
     - `tests/unit/commands/migrate.test.ts`（ユニットテスト）
     - `tests/integration/migrate-sanitize-tokens.test.ts`（統合テスト）
     - 新規コマンドのため、新規テストファイルが必要

3. **他の戦略を採用しない理由**
   - **EXTEND_TEST不適**: Task 3の新規CLIコマンドには新規テストファイルが必要
   - **CREATE_TEST不適**: Task 1は既存テストファイルの修正のみで対応可能

4. **テストファイル一覧**
   - **既存ファイル修正**: `tests/unit/utils/git-url-utils.test.ts`
   - **新規作成**:
     - `tests/unit/commands/migrate.test.ts`
     - `tests/integration/migrate-sanitize-tokens.test.ts`

---

## 5. 影響範囲分析

### 既存コードへの影響

#### 変更が必要な既存ファイル（3ファイル）

| ファイルパス | 変更内容 | 変更規模 | リスク評価 |
|------------|---------|---------|-----------|
| `src/utils/git-url-utils.ts` | 正規表現パターン変更（line 48）<br>旧: `/^(https?:\/\/)[^@]+@([^@]+)$/`<br>新: `/^(https?:\/\/)(.+)@([^@]+)$/` | 軽微（1行） | 低（ReDoS脆弱性評価で検証） |
| `tests/unit/utils/git-url-utils.test.ts` | テストケース期待値更新（4件）<br>- パスワードに `@` を含むケース対応 | 軽微（約20行） | 低（回帰テスト実施） |
| `src/main.ts` | 新規コマンド `migrate` 追加<br>- `commander` 定義に約10行追加 | 軽微（約10行） | 低（既存コマンドへの影響なし） |

#### 新規作成ファイル（5ファイル）

| ファイルパス | 目的 | 規模 | 依存関係 |
|------------|------|------|---------|
| `scripts/monitor-token-detection.ts` | トークン検出ログ分析スクリプト | 約50~100行 | `fs-extra`, `glob`, `logger` |
| `src/commands/migrate.ts` | マイグレーションコマンド本体 | 約200~300行 | `sanitizeGitUrl()`, `MetadataManager`, `fs-extra`, `glob`, `commander`, `logger` |
| `tests/unit/commands/migrate.test.ts` | マイグレーションコマンドのユニットテスト | 約100~150行 | `migrate.ts`, Jest |
| `tests/integration/migrate-sanitize-tokens.test.ts` | マイグレーションコマンドの統合テスト | 約100~150行 | `migrate.ts`, `fs-extra`, Jest |
| `docs/MIGRATION.md` | マイグレーションガイド | 約50~100行 | なし |

#### 変更が不要なファイル（参照のみ）

- `src/core/secret-masker.ts`: Defense in Depthパターンの一部として参照のみ
- `src/core/metadata-manager.ts`: メタデータ構造の理解のため参照のみ
- `src/utils/logger.ts`: ログ出力のため使用（変更なし）

### 依存関係の変更

#### 新規依存の追加

**なし**（すべて既存ライブラリで実装可能）

#### 既存依存の利用

- **Node.js標準ライブラリ**: `fs`, `path`
- **既存依存関係**:
  - `fs-extra`: ファイル操作（メタデータ読み込み・書き込み、バックアップ作成）
  - `commander`: CLIコマンド定義
  - `glob`: ファイル探索（メタデータファイル、ログファイル）
  - `chalk`: ログ出力の色付け（`logger` 経由で使用）

#### 循環依存のリスク

**なし**（新規ファイルはすべて既存コンポーネントに依存するのみ）

### マイグレーション要否

#### データベーススキーマ変更

**なし**（データベース未使用）

#### 設定ファイル変更

**なし**（`.ai-workflow/issue-*/metadata.json` の構造は変更しない）

#### 既存メタデータへの影響

- **Task 3のマイグレーションコマンド**: ユーザーが明示的に実行する場合のみ、既存の `.ai-workflow/issue-*/metadata.json` をサニタイズ
- **自動マイグレーション**: 実施しない（ユーザーの選択を尊重）
- **後方互換性**: 維持（既存のワークフローに影響を与えない）

---

## 6. 変更・追加ファイルリスト

### 新規作成ファイル（5ファイル）

1. `scripts/monitor-token-detection.ts`（約50~100行）
2. `src/commands/migrate.ts`（約200~300行）
3. `tests/unit/commands/migrate.test.ts`（約100~150行）
4. `tests/integration/migrate-sanitize-tokens.test.ts`（約100~150行）
5. `docs/MIGRATION.md`（約50~100行）

### 修正が必要な既存ファイル（3ファイル）

1. `src/utils/git-url-utils.ts`（1行変更）
2. `tests/unit/utils/git-url-utils.test.ts`（約20行修正）
3. `src/main.ts`（約10行追加）

### 削除が必要なファイル

**なし**

---

## 7. 詳細設計

### Task 1: 正規表現パターンの改善

#### 7.1.1. 変更対象ファイル

**ファイルパス**: `src/utils/git-url-utils.ts`

#### 7.1.2. 関数設計: `sanitizeGitUrl()`

**現在の実装（Issue #54）**:
```typescript
export function sanitizeGitUrl(url: string): string {
  // HTTPS形式のURLに埋め込まれたPersonal Access Tokenを検出・除去
  // パターン: https://<TOKEN>@github.com/owner/repo.git
  const tokenPattern = /^(https?:\/\/)[^@]+@([^@]+)$/;

  if (tokenPattern.test(url)) {
    return url.replace(tokenPattern, '$1$2');
  }

  // SSH形式または既にサニタイズ済みの場合は変更しない
  return url;
}
```

**問題点**:
- `[^@]+` は「`@` を含まない1文字以上」を意味するため、パスワードに `@` を含むケース（例: `https://user:p@ss@word@github.com/owner/repo.git`）でマッチしない

**新しい実装**:
```typescript
export function sanitizeGitUrl(url: string): string {
  // HTTPS形式のURLに埋め込まれたPersonal Access Tokenを検出・除去
  // パターン: https://<TOKEN>@github.com/owner/repo.git
  // Issue #58: パスワードに @ を含むケースにも対応
  const tokenPattern = /^(https?:\/\/)(.+)@([^@]+)$/;

  if (tokenPattern.test(url)) {
    return url.replace(tokenPattern, '$1$3');
  }

  // SSH形式または既にサニタイズ済みの場合は変更しない
  return url;
}
```

**変更点**:
- `[^@]+` → `.+`: 任意の文字（`@` を含む）を1文字以上マッチ
- `$1$2` → `$1$3`: グループ2（トークン部分）を除外し、グループ1（プロトコル）とグループ3（ホスト以降）のみを結合

**ReDoS脆弱性評価**:
- `.+` は貪欲マッチ（greedy）だが、最後の `@([^@]+)$` で終端が確定するため、バックトラックは最小限
- テストケース: `https://` + `@` を1000個繰り返した文字列 + `@github.com/owner/repo.git`
- 評価方法: `safe-regex` ライブラリまたは手動でパフォーマンステスト
- 期待結果: 1000回実行で10ms以内（Issue #54の基準を維持）

#### 7.1.3. テストケース修正

**ファイルパス**: `tests/unit/utils/git-url-utils.test.ts`

**修正が必要なテストケース（4件）**:

1. **ケース1: パスワードに `@` を1つ含む**
   ```typescript
   it('should sanitize URL with @ in password (single)', () => {
     const input = 'https://user:p@ssword@github.com/owner/repo.git';
     const expected = 'https://github.com/owner/repo.git';
     expect(sanitizeGitUrl(input)).toBe(expected);
   });
   ```

2. **ケース2: パスワードに `@` を複数含む**
   ```typescript
   it('should sanitize URL with @ in password (multiple)', () => {
     const input = 'https://user:p@ss@word@github.com/owner/repo.git';
     const expected = 'https://github.com/owner/repo.git';
     expect(sanitizeGitUrl(input)).toBe(expected);
   });
   ```

3. **ケース3: トークンのみ（ユーザー名なし）**
   ```typescript
   it('should sanitize URL with token only', () => {
     const input = 'https://ghp_token@github.com/owner/repo.git';
     const expected = 'https://github.com/owner/repo.git';
     expect(sanitizeGitUrl(input)).toBe(expected);
   });
   ```

4. **ケース4: ユーザー名とパスワードの両方に `@` を含む**
   ```typescript
   it('should sanitize URL with @ in both username and password', () => {
     const input = 'https://user@domain:p@ss@word@github.com/owner/repo.git';
     const expected = 'https://github.com/owner/repo.git';
     expect(sanitizeGitUrl(input)).toBe(expected);
   });
   ```

**回帰テスト（既存ケースはすべてパスすること）**:
- SSH形式URL（変更なし）
- HTTPS形式でトークンなし（変更なし）
- 空文字列（変更なし）
- 不正なURL形式（変更なし）

---

### Task 2: トークン検出モニタリングスクリプト

#### 7.2.1. ファイル構成

**ファイルパス**: `scripts/monitor-token-detection.ts`

#### 7.2.2. データ構造設計

```typescript
interface TokenDetectionEvent {
  issueNumber: string;        // Issue番号（例: "54"）
  phase: string;              // フェーズ名（例: "requirements"）
  timestamp: Date;            // 検出日時
  logFilePath: string;        // ログファイルパス
}

interface MonitoringStatistics {
  totalDetections: number;                        // 総検出回数
  detectionsByIssue: Map<string, number>;        // Issue番号ごとの検出回数
  detectionsByPhase: Map<string, number>;        // フェーズごとの検出回数
  detectionsByDate: Map<string, number>;         // 日付ごとの検出回数（YYYY-MM-DD形式）
  events: TokenDetectionEvent[];                  // すべての検出イベント
}
```

#### 7.2.3. 関数設計

##### `findLogFiles(): Promise<string[]>`

**説明**: `.ai-workflow/issue-*/execute/agent_log_raw.txt` をすべて探索

**実装**:
```typescript
async function findLogFiles(): Promise<string[]> {
  const pattern = '.ai-workflow/issue-*/execute/agent_log_raw.txt';
  const files = await glob(pattern, { cwd: process.cwd() });
  logger.info(`Found ${files.length} log files`);
  return files;
}
```

##### `scanLogFile(filePath: string): Promise<TokenDetectionEvent[]>`

**説明**: ログファイルをスキャンし、トークン検出警告メッセージを抽出

**実装**:
```typescript
async function scanLogFile(filePath: string): Promise<TokenDetectionEvent[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const events: TokenDetectionEvent[] = [];
  const warningPattern = /\[WARNING\] GitHub Personal Access Token detected/g;

  let match;
  while ((match = warningPattern.exec(content)) !== null) {
    // ファイルパスから Issue番号とフェーズを抽出
    const issueMatch = filePath.match(/issue-(\d+)/);
    const phaseMatch = filePath.match(/\/(\d+_\w+)\//);

    if (issueMatch && phaseMatch) {
      events.push({
        issueNumber: issueMatch[1],
        phase: phaseMatch[1],
        timestamp: new Date(), // 実際にはログファイルのタイムスタンプを使用
        logFilePath: filePath,
      });
    }
  }

  return events;
}
```

##### `aggregateStatistics(events: TokenDetectionEvent[]): MonitoringStatistics`

**説明**: 検出イベントを集計

**実装**:
```typescript
function aggregateStatistics(events: TokenDetectionEvent[]): MonitoringStatistics {
  const stats: MonitoringStatistics = {
    totalDetections: events.length,
    detectionsByIssue: new Map(),
    detectionsByPhase: new Map(),
    detectionsByDate: new Map(),
    events,
  };

  for (const event of events) {
    // Issue番号ごとの集計
    stats.detectionsByIssue.set(
      event.issueNumber,
      (stats.detectionsByIssue.get(event.issueNumber) || 0) + 1
    );

    // フェーズごとの集計
    stats.detectionsByPhase.set(
      event.phase,
      (stats.detectionsByPhase.get(event.phase) || 0) + 1
    );

    // 日付ごとの集計
    const dateKey = event.timestamp.toISOString().split('T')[0];
    stats.detectionsByDate.set(
      dateKey,
      (stats.detectionsByDate.get(dateKey) || 0) + 1
    );
  }

  return stats;
}
```

##### `generateReport(stats: MonitoringStatistics): string`

**説明**: Markdownレポート生成

**実装**:
```typescript
function generateReport(stats: MonitoringStatistics): string {
  let report = '# トークン検出モニタリングレポート\n\n';
  report += `**レポート生成日時**: ${new Date().toISOString()}\n\n`;
  report += `## サマリー\n\n`;
  report += `- **総検出回数**: ${stats.totalDetections}\n`;
  report += `- **対象Issue数**: ${stats.detectionsByIssue.size}\n`;
  report += `- **対象フェーズ数**: ${stats.detectionsByPhase.size}\n\n`;

  // Issue番号ごとの内訳
  report += `## Issue番号ごとの内訳\n\n`;
  report += '| Issue番号 | 検出回数 |\n';
  report += '|----------|--------|\n';
  for (const [issue, count] of Array.from(stats.detectionsByIssue.entries()).sort()) {
    report += `| #${issue} | ${count} |\n`;
  }
  report += '\n';

  // フェーズごとの内訳
  report += `## フェーズごとの内訳\n\n`;
  report += '| フェーズ | 検出回数 |\n';
  report += '|---------|--------|\n';
  for (const [phase, count] of Array.from(stats.detectionsByPhase.entries()).sort()) {
    report += `| ${phase} | ${count} |\n`;
  }
  report += '\n';

  // 日付ごとのトレンド
  report += `## 日付ごとのトレンド\n\n`;
  report += '| 日付 | 検出回数 |\n';
  report += '|------|--------|\n';
  for (const [date, count] of Array.from(stats.detectionsByDate.entries()).sort()) {
    report += `| ${date} | ${count} |\n`;
  }
  report += '\n';

  return report;
}
```

##### `main(): Promise<void>`

**説明**: メイン処理

**実装**:
```typescript
async function main(): Promise<void> {
  try {
    logger.info('Starting token detection monitoring...');

    const logFiles = await findLogFiles();
    const allEvents: TokenDetectionEvent[] = [];

    for (const filePath of logFiles) {
      const events = await scanLogFile(filePath);
      allEvents.push(...events);
    }

    const stats = aggregateStatistics(allEvents);
    const report = generateReport(stats);

    const outputPath = '.ai-workflow/issue-58/08_report/output/monitoring_report.md';
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, report, 'utf-8');

    logger.info(`Report generated: ${outputPath}`);
    logger.info(`Total detections: ${stats.totalDetections}`);
  } catch (error) {
    logger.error('Monitoring failed:', error);
    process.exit(1);
  }
}
```

#### 7.2.4. 実行方法

**package.json に追加**:
```json
{
  "scripts": {
    "monitor:tokens": "tsx scripts/monitor-token-detection.ts"
  }
}
```

**実行コマンド**:
```bash
npm run monitor:tokens
```

---

### Task 3: マイグレーションコマンド実装

#### 7.3.1. ファイル構成

**ファイルパス**: `src/commands/migrate.ts`

#### 7.3.2. データ構造設計

```typescript
interface MigrateOptions {
  sanitizeTokens: boolean;     // --sanitize-tokens フラグ
  dryRun: boolean;             // --dry-run フラグ
  issue?: string;              // --issue オプション（特定Issueのみ対象）
  repo?: string;               // --repo オプション（対象リポジトリパス）
}

interface MigrationResult {
  processedCount: number;      // 処理したファイル数
  detectedCount: number;       // トークンを検出したファイル数
  sanitizedCount: number;      // サニタイズしたファイル数
  errorCount: number;          // エラーが発生したファイル数
  errors: Array<{
    filePath: string;
    error: string;
  }>;
}

interface MetadataFile {
  filePath: string;            // メタデータファイルのパス
  content: any;                // JSON解析後のオブジェクト
  hasToken: boolean;           // トークンが含まれているか
  originalUrl?: string;        // 元のURL
  sanitizedUrl?: string;       // サニタイズ後のURL
}
```

#### 7.3.3. 関数設計

##### `handleMigrateCommand(options: MigrateOptions): Promise<void>`

**説明**: マイグレーションコマンドのハンドラ（`src/main.ts` から呼び出される）

**実装**:
```typescript
export async function handleMigrateCommand(options: MigrateOptions): Promise<void> {
  try {
    logger.info('Starting migration command...');

    if (options.sanitizeTokens) {
      const result = await sanitizeTokensInMetadata(options);
      printMigrationSummary(result, options.dryRun);
    } else {
      logger.error('No migration option specified. Use --sanitize-tokens.');
      process.exit(1);
    }

    logger.info('Migration completed successfully.');
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}
```

##### `findAllMetadataFiles(options: MigrateOptions): Promise<string[]>`

**説明**: メタデータファイルを探索

**実装**:
```typescript
async function findAllMetadataFiles(options: MigrateOptions): Promise<string[]> {
  const repoPath = options.repo || process.cwd();

  let pattern: string;
  if (options.issue) {
    pattern = `.ai-workflow/issue-${options.issue}/metadata.json`;
  } else {
    pattern = '.ai-workflow/issue-*/metadata.json';
  }

  const files = await glob(pattern, { cwd: repoPath, absolute: true });
  logger.info(`Found ${files.length} metadata files`);

  // パストラバーサル攻撃防止: 正規表現でパス検証
  const safePathPattern = /\.ai-workflow[\/\\]issue-\d+[\/\\]metadata\.json$/;
  const validFiles = files.filter(file => safePathPattern.test(file));

  if (validFiles.length !== files.length) {
    logger.warn(`Filtered out ${files.length - validFiles.length} invalid paths`);
  }

  return validFiles;
}
```

##### `loadMetadataFile(filePath: string): Promise<MetadataFile | null>`

**説明**: メタデータファイルを読み込み、トークン検出

**実装**:
```typescript
async function loadMetadataFile(filePath: string): Promise<MetadataFile | null> {
  try {
    // シンボリックリンク攻撃防止
    const stats = await fs.lstat(filePath);
    if (stats.isSymbolicLink()) {
      logger.warn(`Skipping symbolic link: ${filePath}`);
      return null;
    }

    const content = await fs.readJSON(filePath);
    const remoteUrl = content?.target_repository?.remote_url;

    if (!remoteUrl) {
      logger.debug(`No remote_url found in ${filePath}`);
      return { filePath, content, hasToken: false };
    }

    // HTTPS形式のURLにトークンが含まれているか検出
    const tokenPattern = /^https?:\/\/.+@.+$/;
    const hasToken = tokenPattern.test(remoteUrl);

    if (hasToken) {
      const sanitizedUrl = sanitizeGitUrl(remoteUrl);
      return {
        filePath,
        content,
        hasToken: true,
        originalUrl: remoteUrl,
        sanitizedUrl,
      };
    }

    return { filePath, content, hasToken: false };
  } catch (error) {
    logger.error(`Failed to load metadata file ${filePath}:`, error);
    return null;
  }
}
```

##### `sanitizeMetadataFile(metadata: MetadataFile, dryRun: boolean): Promise<boolean>`

**説明**: メタデータファイルをサニタイズ

**実装**:
```typescript
async function sanitizeMetadataFile(
  metadata: MetadataFile,
  dryRun: boolean
): Promise<boolean> {
  if (!metadata.hasToken || !metadata.sanitizedUrl) {
    return false;
  }

  logger.info(`Token detected in ${metadata.filePath}`);
  logger.info(`  Original URL: ***`); // トークンはマスク
  logger.info(`  Sanitized URL: ${metadata.sanitizedUrl}`);

  if (dryRun) {
    logger.info('  [DRY RUN] Skipping file write');
    return true;
  }

  try {
    // バックアップ作成
    const backupPath = `${metadata.filePath}.bak`;
    await fs.copy(metadata.filePath, backupPath);
    logger.debug(`Backup created: ${backupPath}`);

    // メタデータ更新
    metadata.content.target_repository.remote_url = metadata.sanitizedUrl;

    // ファイル保存
    await fs.writeJSON(metadata.filePath, metadata.content, { spaces: 2 });
    logger.info(`  Sanitized and saved: ${metadata.filePath}`);

    return true;
  } catch (error) {
    logger.error(`Failed to sanitize ${metadata.filePath}:`, error);
    return false;
  }
}
```

##### `sanitizeTokensInMetadata(options: MigrateOptions): Promise<MigrationResult>`

**説明**: メタデータファイル群をサニタイズ

**実装**:
```typescript
async function sanitizeTokensInMetadata(
  options: MigrateOptions
): Promise<MigrationResult> {
  const result: MigrationResult = {
    processedCount: 0,
    detectedCount: 0,
    sanitizedCount: 0,
    errorCount: 0,
    errors: [],
  };

  const files = await findAllMetadataFiles(options);

  for (const filePath of files) {
    result.processedCount++;

    const metadata = await loadMetadataFile(filePath);
    if (!metadata) {
      result.errorCount++;
      result.errors.push({
        filePath,
        error: 'Failed to load metadata file',
      });
      continue;
    }

    if (metadata.hasToken) {
      result.detectedCount++;

      const success = await sanitizeMetadataFile(metadata, options.dryRun);
      if (success) {
        result.sanitizedCount++;
      } else {
        result.errorCount++;
        result.errors.push({
          filePath,
          error: 'Failed to sanitize metadata file',
        });
      }
    }
  }

  return result;
}
```

##### `printMigrationSummary(result: MigrationResult, dryRun: boolean): void`

**説明**: マイグレーション結果サマリーを出力

**実装**:
```typescript
function printMigrationSummary(result: MigrationResult, dryRun: boolean): void {
  logger.info('');
  logger.info('=== Migration Summary ===');

  if (dryRun) {
    logger.info('[DRY RUN MODE]');
  }

  logger.info(`Processed: ${result.processedCount} files`);
  logger.info(`Detected: ${result.detectedCount} files with tokens`);
  logger.info(`Sanitized: ${result.sanitizedCount} files`);
  logger.info(`Errors: ${result.errorCount} files`);

  if (result.errors.length > 0) {
    logger.info('');
    logger.info('Errors:');
    for (const error of result.errors) {
      logger.error(`  ${error.filePath}: ${error.error}`);
    }
  }
}
```

#### 7.3.4. CLI統合（`src/main.ts` への追加）

**追加コード**:
```typescript
import { handleMigrateCommand } from './commands/migrate.js';

// ... 既存のコマンド定義 ...

program
  .command('migrate')
  .description('Migrate workflow metadata')
  .option('--sanitize-tokens', 'Sanitize Personal Access Tokens in metadata.json')
  .option('--dry-run', 'Dry run mode (do not modify files)')
  .option('--issue <number>', 'Target specific issue number')
  .option('--repo <path>', 'Target repository path')
  .action(async (options) => {
    await handleMigrateCommand(options);
  });
```

#### 7.3.5. 使用例

```bash
# 基本的な使用方法
ai-workflow migrate --sanitize-tokens

# ドライラン（ファイルを変更せず、検出のみ）
ai-workflow migrate --sanitize-tokens --dry-run

# 特定のIssueのみ対象
ai-workflow migrate --sanitize-tokens --issue 123

# 対象リポジトリを指定
ai-workflow migrate --sanitize-tokens --repo /path/to/repo
```

---

## 8. セキュリティ考慮事項

### 8.1. Task 1: 正規表現パターンの改善

#### ReDoS（Regular Expression Denial of Service）脆弱性

**リスク**: `.+` は貪欲マッチのため、悪意のある入力で指数関数的にバックトラックが発生する可能性

**評価方法**:
1. `safe-regex` ライブラリで静的解析
   ```typescript
   import safeRegex from 'safe-regex';
   const pattern = /^(https?:\/\/)(.+)@([^@]+)$/;
   console.log(safeRegex(pattern)); // true なら安全
   ```

2. パフォーマンステスト
   ```typescript
   const maliciousInput = 'https://' + '@'.repeat(10000) + '@github.com/owner/repo.git';
   const start = Date.now();
   sanitizeGitUrl(maliciousInput);
   const elapsed = Date.now() - start;
   console.log(`Elapsed: ${elapsed}ms`); // 10ms以内であること
   ```

**軽減策**:
- Design Phaseで脆弱性評価を実施
- テストシナリオに極端なケースを含める
- Issue #54の基準（1000回実行で10ms以内）を維持

### 8.2. Task 2: モニタリングスクリプト

#### トークン漏洩リスク

**リスク**: レポートにトークン文字列が含まれる可能性

**軽減策**:
- `generateReport()` 関数でトークン文字列を `***` でマスキング
- ログファイルパスのみ記録（ログファイル内容は記録しない）

#### ログファイル不在エラー

**リスク**: ログファイルが存在しない場合、スクリプトがエラーで終了する

**軽減策**:
- `findLogFiles()` で空配列が返された場合も正常終了
- `scanLogFile()` でファイル読み込み失敗時もエラーを記録して続行

### 8.3. Task 3: マイグレーションコマンド

#### パストラバーサル攻撃

**リスク**: 悪意のあるパス（例: `../../etc/passwd`）でシステムファイルが改ざんされる

**軽減策**:
- `findAllMetadataFiles()` で正規表現によるパス検証
  ```typescript
  const safePathPattern = /\.ai-workflow[\/\\]issue-\d+[\/\\]metadata\.json$/;
  ```

#### シンボリックリンク攻撃

**リスク**: シンボリックリンクを通じて意図しないファイルが改ざんされる

**軽減策**:
- `loadMetadataFile()` で `fs.lstat()` によるシンボリックリンクチェック
  ```typescript
  const stats = await fs.lstat(filePath);
  if (stats.isSymbolicLink()) {
    logger.warn(`Skipping symbolic link: ${filePath}`);
    return null;
  }
  ```

#### バックアップファイルの自動削除禁止

**リスク**: バックアップファイルが自動削除され、ロールバックできなくなる

**軽減策**:
- `.bak` ファイルは明示的にユーザーが削除するまで保持
- ドライラン機能（`--dry-run`）でファイル変更前に確認可能

#### トークンの再漏洩リスク

**リスク**: ログ出力でトークン文字列が露出する

**軽減策**:
- `printMigrationSummary()` でトークン文字列を `***` でマスキング
- `logger.info('  Original URL: ***');`

---

## 9. 非機能要件への対応

### 9.1. パフォーマンス

#### Task 1: 正規表現パターンの改善
- **目標**: 既存実装と同等（1000回実行で10ms以内）
- **対応**: ReDoS脆弱性評価で検証、パフォーマンステストを実施

#### Task 2: モニタリングスクリプト
- **目標**: 1000件のログファイルを10秒以内に処理
- **対応**: ストリーミング処理は不要（メモリ内で処理可能な規模のため）

#### Task 3: マイグレーションコマンド
- **目標**: 100個のメタデータファイルを1分以内に処理
- **対応**:
  - 並列処理は不要（ファイルI/Oが支配的でCPU負荷は低い）
  - 進捗表示機能により、ユーザーに処理状況をリアルタイムで通知（将来的な拡張候補）

### 9.2. スケーラビリティ

#### Task 2: モニタリングスクリプト
- **現状**: ログファイル数が10,000件を超えると処理時間が100秒以上になる可能性
- **対応**:
  - 現状のままで実運用には十分（ログファイルは通常100件未満）
  - 将来的にはストリーミング処理を実装（Nice to Have）

#### Task 3: マイグレーションコマンド
- **現状**: メタデータファイル数が1,000件を超えると処理時間が10分以上になる可能性
- **対応**:
  - 現状のままで実運用には十分（メタデータファイルは通常100件未満）
  - 将来的には並列処理を実装（`Promise.all()` を使用、Nice to Have）

### 9.3. 保守性

#### コメント規約
- すべてのpublic関数にJSDoc形式のコメントを追加
- 設計判断の根拠をコメントに明記（特に正規表現パターン変更）

#### ログ出力規約
- 統一loggerモジュール（`src/utils/logger.ts`）を使用
- `console.log`/`console.error` 等の直接使用は禁止（ESLintの `no-console` ルールで強制）
- ログレベル制御: `logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()`

#### エラーハンドリング
- すべての非同期関数で `try-catch` を使用
- エラーメッセージは具体的かつアクショナブルに記載
- エラー発生時は `process.exit(1)` で終了（ゼロ以外のステータスコード）

#### テストカバレッジ
- 目標: 90%以上（Planning Documentと一致）
- 対象: Task 1（正規表現）、Task 3（マイグレーションコマンド）

---

## 10. 実装の順序

### 推奨実装順序（Planning Documentと一致）

#### Phase 2: 設計（現在のフェーズ）
1. Task 1の正規表現設計（0.25~0.5h）
2. Task 2のモニタリングスクリプト設計（0.25~0.5h）
3. Task 3のマイグレーションコマンド設計（0.5h）

#### Phase 3: テストシナリオ
1. Task 1のテストシナリオ策定（0.25~0.5h）
2. Task 3のテストシナリオ策定（0.25~0.5h）

#### Phase 4: 実装
1. **Task 1（正規表現改善）**: 0.5~1h
   - `src/utils/git-url-utils.ts` のパターン変更（line 48）
   - コメント更新（Issue #58参照を追加）
   - 理由: 最もシンプルで、他のタスクへの影響なし

2. **Task 3（マイグレーションコマンド）**: 1~2h
   - `src/commands/migrate.ts` の作成
   - `src/main.ts` へのコマンド追加
   - 理由: Task 1の `sanitizeGitUrl()` を再利用するため、Task 1完了後に実装

3. **Task 2（モニタリングスクリプト）**: 0.5~1h（並行実行可能）
   - `scripts/monitor-token-detection.ts` の作成
   - 理由: 他のタスクと独立しているため、並行実行可能

#### Phase 5: テストコード実装
1. Task 1のテストコード修正（0.25~0.5h）
2. Task 3のユニットテスト実装（0.5~1h）
3. Task 3の統合テスト実装（0.25~0.5h）

#### Phase 6: テスト実行
1. Task 1のテスト実行（0.25~0.5h）
2. Task 3のテスト実行（0.25~0.5h）

#### Phase 7: ドキュメント
1. `docs/MIGRATION.md` の作成（0.25~0.5h）
2. `TROUBLESHOOTING.md` の更新（0.25~0.5h）

#### Phase 8: レポート
1. Task 2のモニタリングレポート作成（0.25h）
2. ステータスレポート作成（0.25h）

### 依存関係

```
Phase 2 (Design) → Phase 3 (Test Scenario) → Phase 4 (Implementation)
                                                │
                                                ├─ Task 1 (正規表現改善)
                                                │        ↓
                                                ├─ Task 3 (マイグレーション) … Task 1完了後
                                                │
                                                └─ Task 2 (モニタリング) … 並行実行可能
                                                         ↓
Phase 5 (Test Implementation) → Phase 6 (Testing) → Phase 7 (Documentation) → Phase 8 (Report)
```

---

## 11. 品質ゲート確認

### 品質ゲート1: 実装戦略の判断根拠が明記されている

✅ **完了**: セクション2で明記
- EXTEND戦略を選択
- 判断根拠: 既存実装の軽微な改善、新規ファイル5件・既存ファイル修正3件のみ

### 品質ゲート2: テスト戦略の判断根拠が明記されている

✅ **完了**: セクション3で明記
- UNIT_INTEGRATION戦略を選択
- 判断根拠: Task 1はユニットテストで効率的、Task 3は統合テストが必須

### 品質ゲート3: テストコード戦略の判断根拠が明記されている

✅ **完了**: セクション4で明記
- BOTH_TEST戦略を選択
- 判断根拠: Task 1は既存テスト修正、Task 3は新規テスト作成

### 品質ゲート4: 既存コードへの影響範囲が分析されている

✅ **完了**: セクション5で分析
- 既存ファイル修正: 3ファイル（`git-url-utils.ts`, `git-url-utils.test.ts`, `main.ts`）
- 新規ファイル作成: 5ファイル
- 依存関係の変更: なし

### 品質ゲート5: 変更が必要なファイルがリストアップされている

✅ **完了**: セクション6でリストアップ
- 新規作成ファイル: 5ファイル（相対パス明記）
- 修正が必要な既存ファイル: 3ファイル（相対パス明記）
- 削除が必要なファイル: なし

### 品質ゲート6: 設計が実装可能である

✅ **完了**: セクション7で詳細設計を記載
- Task 1: 関数設計、テストケース修正方法を明記
- Task 2: データ構造、関数設計、実行方法を明記
- Task 3: データ構造、関数設計、CLI統合方法、使用例を明記

---

## 12. 追加の考慮事項

### 12.1. Planning Documentとの整合性確認

| 項目 | Planning Document | Design Document | 整合性 |
|------|------------------|----------------|-------|
| 実装戦略 | EXTEND | EXTEND | ✅ 一致 |
| テスト戦略 | UNIT_INTEGRATION | UNIT_INTEGRATION | ✅ 一致 |
| テストコード戦略 | BOTH_TEST | BOTH_TEST | ✅ 一致 |
| 新規ファイル数 | 5ファイル | 5ファイル | ✅ 一致 |
| 既存ファイル修正数 | 3ファイル | 3ファイル | ✅ 一致 |
| 見積もり工数 | 4~8時間 | 4~8時間 | ✅ 一致 |

### 12.2. Requirements Documentとの整合性確認

| 要件ID | Requirements Document | Design Document | 整合性 |
|--------|----------------------|----------------|-------|
| FR-1 | 正規表現パターンの改善 | セクション7.1で詳細設計 | ✅ 一致 |
| FR-2 | モニタリングスクリプト | セクション7.2で詳細設計 | ✅ 一致 |
| FR-3 | マイグレーションコマンド | セクション7.3で詳細設計 | ✅ 一致 |
| NFR-1 | パフォーマンス要件 | セクション9.1で対応方法を明記 | ✅ 一致 |
| NFR-2 | セキュリティ要件 | セクション8で詳細に記載 | ✅ 一致 |
| NFR-3 | 可用性・信頼性要件 | セクション7でエラーハンドリングを設計 | ✅ 一致 |
| NFR-4 | 保守性・拡張性要件 | セクション9.3で対応方法を明記 | ✅ 一致 |
| NFR-5 | テスト要件 | セクション3でテスト戦略を策定 | ✅ 一致 |

### 12.3. スコープ外項目の再確認

以下の項目は明確にスコープ外です（Requirements Documentと一致）：

- **OUT-1**: 自動マイグレーション機能（ユーザーが明示的に実行する場合のみ動作）
- **OUT-2**: トークン検出の自動通知機能（Slack/Email等への通知は実装しない）
- **OUT-3**: Git URLサニタイゼーションの対象拡大（Personal Access Token以外は対象外）
- **OUT-4**: メタデータ構造の変更（`target_repository` オブジェクトの構造は変更しない）
- **OUT-5**: UI/UX改善（進捗バー、カラー出力等は実装しない）
- **OUT-6**: 他のGit URLプロトコル対応（`file://`, `ftp://` 等は対象外）
- **OUT-7**: ReDoS脆弱性の自動修正（手動で評価・修正する）

---

## 13. リスクと軽減策（Planning Documentより）

### リスク1: 正規表現パターン変更による予期しない動作

- **影響度**: 中
- **確率**: 低
- **軽減策**（本設計書で対応）:
  - セクション7.1.2でReDoS脆弱性評価方法を明記
  - セクション7.1.3でエッジケースのテストケースを策定
  - セクション10で回帰テスト計画を策定

### リスク2: モニタリングスクリプトのログ形式依存

- **影響度**: 低
- **確率**: 中
- **軽減策**（本設計書で対応）:
  - セクション7.2.3でエラーハンドリングを設計（ログファイルが存在しない場合も正常終了）

### リスク3: マイグレーションコマンドによる既存メタデータ破壊

- **影響度**: 高
- **確率**: 低
- **軽減策**（本設計書で対応）:
  - セクション7.3.3でドライラン機能を設計（`--dry-run` でファイルを変更しない）
  - セクション7.3.3でバックアップ機能を設計（変更前に `.bak` ファイルを作成）
  - セクション8.3でセキュリティ対策を詳細に記載

---

## 14. まとめ

Issue #58の詳細設計書を作成しました。本設計書は、Planning DocumentとRequirements Documentの内容を基に、以下の点を満たしています：

### 設計の完全性

1. **3つの戦略判断を明記**:
   - 実装戦略: EXTEND（既存実装の軽微な改善）
   - テスト戦略: UNIT_INTEGRATION（ユニットテスト + 統合テスト）
   - テストコード戦略: BOTH_TEST（既存テスト修正 + 新規テスト作成）

2. **影響範囲分析を実施**:
   - 既存ファイル修正: 3ファイル
   - 新規ファイル作成: 5ファイル
   - 依存関係の変更: なし

3. **詳細設計を記載**:
   - Task 1: 関数設計、テストケース修正方法
   - Task 2: データ構造、関数設計、実行方法
   - Task 3: データ構造、関数設計、CLI統合方法、使用例

4. **セキュリティ考慮事項を記載**:
   - ReDoS脆弱性評価
   - パストラバーサル攻撃防止
   - シンボリックリンク攻撃防止
   - トークン漏洩リスク対策

5. **非機能要件への対応を記載**:
   - パフォーマンス目標と対応方法
   - スケーラビリティの考慮
   - 保守性・拡張性への対応

6. **実装順序を推奨**:
   - Phase 2（設計）〜 Phase 8（レポート）の詳細な実装順序

### 品質ゲート達成状況

- ✅ 実装戦略の判断根拠が明記されている
- ✅ テスト戦略の判断根拠が明記されている
- ✅ テストコード戦略の判断根拠が明記されている
- ✅ 既存コードへの影響範囲が分析されている
- ✅ 変更が必要なファイルがリストアップされている
- ✅ 設計が実装可能である

### 次ステップ

Phase 3（Test Scenario）へ進み、詳細なテストシナリオを策定します。

---

**作成日**: 2025-01-22
**作成者**: AI Workflow Agent (Phase 2: Design)
**承認者**: （レビュー完了後に記載）
**バージョン**: 1.0
**次ステップ**: Phase 3 (Test Scenario) へ進む
