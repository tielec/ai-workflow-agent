# 要件定義書 - Issue #26

**Issue番号**: #26
**タイトル**: [REFACTOR] 残り4ファイルの軽量リファクタリング
**Issue URL**: https://github.com/tielec/ai-workflow-agent/issues/26
**作成日**: 2025-01-20
**優先度**: 低

---

## 0. Planning Documentの確認

Planning Phase（Phase 0）で策定された計画を確認し、以下の戦略に基づいて要件定義を実施します：

### 0.1 全体戦略

- **実装戦略**: REFACTOR（既存コードの改善、新規ファイル作成は最小限）
- **テスト戦略**: UNIT_INTEGRATION（ユニット+統合テスト）
- **テストコード戦略**: BOTH_TEST（既存テスト拡張+新規テスト作成）
- **見積もり工数**: 12～16時間（Phase 1から8まで）
- **総合リスク**: 中（エージェントクライアントの複雑性、既存テスト不足）

### 0.2 成功パターンの適用

本Issueは、以下の成功パターンを踏襲します：

- **Issue #23 (BasePhase)**: 1420行 → 676行（52.4%削減）、4モジュール分離
- **Issue #24 (GitHubClient)**: 702行 → 402行（42.7%削減）、ファサードパターン
- **Issue #25 (GitManager)**: 548行 → 181行（67%削減）、ファサードパターン

### 0.3 実装方針

1. **新規ファイル作成なし**: 各ファイル内での整理が中心、新規モジュール作成は最小限（3～4ヘルパーファイル）
2. **既存コードの改善**: 重複ロジックの抽出、ヘルパー関数の分離による可読性向上
3. **破壊的変更の回避**: 公開APIは維持、既存の呼び出し元は無変更で動作
4. **成功パターンの適用**: Issue #23, #24, #25で確立されたリファクタリングパターンの踏襲

---

## 1. 概要

### 1.1 背景

AI Workflow Agentプロジェクトでは、大規模なリファクタリング（Issue #23, #24, #25）により主要モジュールの行数削減と責務分離が成功しました。しかし、以下の4つのコアファイルは依然として300～360行程度の規模を持ち、重複ロジックや共通化可能な処理が残っています：

- `src/core/codex-agent-client.ts` (359行)
- `src/core/claude-agent-client.ts` (354行)
- `src/core/metadata-manager.ts` (342行)
- `src/core/phase-dependencies.ts` (336行)

これらのファイルは現状でも管理可能なサイズですが、さらなる可読性向上と保守性向上のため、軽量なリファクタリングが求められています。

### 1.2 目的

1. **可読性向上**: 重複ロジックの抽出とヘルパー関数の分離により、コードの意図を明確にする
2. **保守性向上**: 共通処理を独立したモジュールに分離し、変更影響範囲を局所化する
3. **テストカバレッジ向上**: 新規ヘルパー関数と既存ロジックに対する包括的なテストを追加
4. **一貫性確保**: Issue #23, #24, #25で確立されたリファクタリングパターンとの整合性を維持

### 1.3 ビジネス価値

- **開発効率の向上**: 共通処理の再利用により、将来の機能追加が容易になる
- **品質の向上**: テストカバレッジの向上により、リグレッションリスクが低減する
- **技術的負債の削減**: 重複コードの削減により、長期的な保守コストが低減する

### 1.4 技術的価値

- **単一責任原則（SRP）の遵守**: 各モジュールの責務を明確化
- **DRY原則の遵守**: 重複ロジックを排除
- **テスタビリティの向上**: ヘルパー関数の分離により、ユニットテストが容易になる

---

## 2. 機能要件

### 2.1 codex-agent-client.ts のリファクタリング（優先度: 高）

#### 2.1.1 JSONイベントパース処理の共通化

**要件ID**: REQ-001
**説明**: `logEvent()` メソッド内のJSONイベントパース処理を共通化し、agent-event-parserヘルパーに移行する

**現状の課題**:
- JSONイベントのパース処理（204～258行）が冗長
- イベントタイプごとの分岐処理が複雑

**期待される改善**:
- `parseCodexEvent()` ヘルパー関数を作成
- イベントタイプ判定ロジックを分離
- ログメッセージ生成処理を分離

**受け入れ基準**:
- Given: Codexエージェントから受信したJSONイベント
- When: `parseCodexEvent()` 関数を呼び出す
- Then: イベントタイプに応じた構造化データを返す

#### 2.1.2 ログフォーマット処理の分離

**要件ID**: REQ-002
**説明**: コンソールログ出力処理（`console.log` 呼び出し）をlog-formatterヘルパーに移行する

**現状の課題**:
- ログ出力処理がlogEventメソッドに混在
- 同様の処理がclaudeagent-client.tsにも存在（重複）

**期待される改善**:
- `formatCodexLog()` ヘルパー関数を作成
- ログプレフィックス（`[CODEX THINKING]`, `[CODEX ACTION]` 等）の統一管理

**受け入れ基準**:
- Given: パース済みのCodexイベントデータ
- When: `formatCodexLog()` 関数を呼び出す
- Then: フォーマット済みのログメッセージを返す

#### 2.1.3 環境変数設定処理の抽出

**要件ID**: REQ-003
**説明**: `runCodexProcess()` メソッド内の環境変数設定処理（128～139行）を共通化する

**現状の課題**:
- 環境変数設定ロジックがrunCodexProcessメソッドに埋め込まれている
- GitHub CLI用の環境変数設定が他のファイルでも必要になる可能性

**期待される改善**:
- `setupCodexEnvironment()` ヘルパー関数を作成
- CODEX_API_KEY → OPENAI_API_KEY の変換処理を分離
- GITHUB_TOKEN → GH_TOKEN の変換処理を分離

**受け入れ基準**:
- Given: プロセス環境変数オブジェクト
- When: `setupCodexEnvironment()` 関数を呼び出す
- Then: Codex実行に必要な環境変数が設定された新しい環境変数オブジェクトを返す

### 2.2 claude-agent-client.ts のリファクタリング（優先度: 高）

#### 2.2.1 SDKイベントハンドリングの共通化

**要件ID**: REQ-004
**説明**: SDKメッセージタイプごとの処理（90～164行）を共通化し、agent-event-parserヘルパーに移行する

**現状の課題**:
- `logMessage()`, `logAssistantMessage()`, `logResultMessage()`, `logStreamEvent()` メソッドが冗長
- Codexとの類似処理が存在するが、完全には統一できていない

**期待される改善**:
- `parseClaudeEvent()` ヘルパー関数を作成
- SDKメッセージタイプ判定ロジックを分離

**受け入れ基準**:
- Given: Claude Agent SDKから受信したメッセージ
- When: `parseClaudeEvent()` 関数を呼び出す
- Then: メッセージタイプに応じた構造化データを返す

#### 2.2.2 ログフォーマット処理の分離

**要件ID**: REQ-005
**説明**: コンソールログ出力処理をlog-formatterヘルパーに移行する

**現状の課題**:
- ログ出力処理がlogMessage系メソッドに混在
- Codexとの重複コードが存在

**期待される改善**:
- `formatClaudeLog()` ヘルパー関数を作成
- ログプレフィックス（`[AGENT THINKING]`, `[AGENT ACTION]` 等）の統一管理

**受け入れ基準**:
- Given: パース済みのClaudeイベントデータ
- When: `formatClaudeLog()` 関数を呼び出す
- Then: フォーマット済みのログメッセージを返す

#### 2.2.3 トークン抽出処理の整理

**要件ID**: REQ-006
**説明**: `readTokenFromCredentials()` および `extractToken()` メソッド（187～267行）を整理する

**現状の課題**:
- トークン抽出処理が複雑（再帰的な探索）
- エラーハンドリングが冗長

**期待される改善**:
- トークン抽出ロジックを明確化
- エラーメッセージを統一

**受け入れ基準**:
- Given: credentials.jsonファイルパス
- When: `readTokenFromCredentials()` 関数を呼び出す
- Then: 有効なOAuthトークンを抽出するか、明確なエラーを返す

### 2.3 metadata-manager.ts のリファクタリング（優先度: 中）

#### 2.3.1 ファイルI/O操作の共通化

**要件ID**: REQ-007
**説明**: ファイル操作処理（38～40行、91～100行、119～144行、156～163行）を共通化し、metadata-ioヘルパーに移行する

**現状の課題**:
- `fs.copyFileSync()`, `fs.removeSync()`, `fs.existsSync()` の呼び出しが分散
- バックアップファイル作成処理が重複

**期待される改善**:
- `backupMetadataFile()` ヘルパー関数を作成
- `removeWorkflowDirectory()` ヘルパー関数を作成

**受け入れ基準**:
- Given: メタデータファイルパス
- When: `backupMetadataFile()` 関数を呼び出す
- Then: タイムスタンプ付きバックアップファイルが作成され、パスを返す

#### 2.3.2 バリデーション処理の分離

**要件ID**: REQ-008
**説明**: フェーズ名やステップ名のバリデーション処理を分離する

**現状の課題**:
- バリデーション処理が各メソッドに分散
- エラーメッセージが統一されていない

**期待される改善**:
- `validatePhaseName()` ヘルパー関数を作成
- `validateStepName()` ヘルパー関数を作成

**受け入れ基準**:
- Given: 任意の文字列（フェーズ名候補）
- When: `validatePhaseName()` 関数を呼び出す
- Then: 有効なフェーズ名であればtrue、無効であればfalseを返す

#### 2.3.3 タイムスタンプフォーマット処理の抽出

**要件ID**: REQ-009
**説明**: `formatTimestampForFilename()` 関数（12～21行）をmetadata-ioヘルパーに移行する

**現状の課題**:
- タイムスタンプフォーマット処理がmetadata-manager.ts内に埋め込まれている
- 他のファイルでも同様の処理が必要になる可能性

**期待される改善**:
- metadata-ioヘルパーに移行し、再利用可能にする

**受け入れ基準**:
- Given: 任意のDateオブジェクト（またはデフォルトで現在時刻）
- When: `formatTimestampForFilename()` 関数を呼び出す
- Then: `YYYYMMDD_HHMMSS` 形式の文字列を返す

### 2.4 phase-dependencies.ts のリファクタリング（優先度: 中）

#### 2.4.1 プリセット定義の構造化

**要件ID**: REQ-010
**説明**: プリセット定義（19～60行）の構造を整理し、メンテナンス性を向上させる

**現状の課題**:
- プリセット定義とプリセット説明が分離されている
- 新規プリセット追加時の変更箇所が複数ある

**期待される改善**:
- プリセット定義を単一のオブジェクトに統合（名前、フェーズリスト、説明を含む）
- または、既存の分離構造を維持しつつ、コメントを追加して関連性を明確化

**受け入れ基準**:
- Given: PHASE_PRESETSとPRESET_DESCRIPTIONSが定義されている
- When: 新規プリセットを追加する
- Then: 変更箇所が明確で、整合性が保たれる

#### 2.4.2 依存関係検証ロジックの整理

**要件ID**: REQ-011
**説明**: `validatePhaseDependencies()` 関数（78～161行）の複雑性を削減する

**現状の課題**:
- 関数が長い（83行）
- 複数の責務を持つ（依存関係チェック、ファイル存在チェック、エラー/警告メッセージ生成）

**期待される改善**:
- 依存関係チェックロジックを分離
- ファイル存在チェックロジックを分離
- エラー/警告メッセージ生成を既存の`buildErrorMessage()`, `buildWarningMessage()` 関数に委譲

**受け入れ基準**:
- Given: フェーズ名とメタデータマネージャー
- When: `validatePhaseDependencies()` 関数を呼び出す
- Then: 依存関係チェック結果を構造化データで返す（関数の責務は単一に保つ）

#### 2.4.3 エラー/警告メッセージ生成の共通化

**要件ID**: REQ-012
**説明**: `buildErrorMessage()` および `buildWarningMessage()` 関数（163～212行）をdependency-validationヘルパーに移行する

**現状の課題**:
- エラー/警告メッセージ生成処理がphase-dependencies.ts内に埋め込まれている
- 同様のメッセージ生成処理が他のファイルでも必要になる可能性

**期待される改善**:
- dependency-validationヘルパーに移行し、再利用可能にする

**受け入れ基準**:
- Given: フェーズ名、未完了依存フェーズリスト、ファイル不在リスト
- When: `buildErrorMessage()` 関数を呼び出す
- Then: ユーザーに分かりやすいエラーメッセージを返す

### 2.5 ヘルパーモジュールの新規作成（優先度: 高）

#### 2.5.1 agent-event-parser.ts の作成

**要件ID**: REQ-013
**説明**: Codex/Claude共通のイベントパースロジックを含むヘルパーモジュールを作成する

**含まれる関数**:
- `parseCodexEvent(raw: string): CodexEvent | null`
- `parseClaudeEvent(message: SDKMessage): ClaudeEvent | null`
- `determineCodexEventType(event: CodexEvent): string`
- `determineClaudeEventType(event: ClaudeEvent): string`

**受け入れ基準**:
- Given: Codex/ClaudeのJSONイベント文字列
- When: 対応するパース関数を呼び出す
- Then: 構造化されたイベントオブジェクトを返す

#### 2.5.2 metadata-io.ts の作成

**要件ID**: REQ-014
**説明**: メタデータファイルI/O操作の共通処理を含むヘルパーモジュールを作成する

**含まれる関数**:
- `formatTimestampForFilename(date?: Date): string`
- `backupMetadataFile(metadataPath: string): string`
- `removeWorkflowDirectory(workflowDir: string): void`
- `validatePhaseName(phase: string): boolean`
- `validateStepName(step: string): boolean`

**受け入れ基準**:
- Given: メタデータファイルパスまたはワークフローディレクトリパス
- When: 対応するI/O関数を呼び出す
- Then: ファイル操作が正しく実行され、結果を返す

#### 2.5.3 dependency-validation.ts の作成

**要件ID**: REQ-015
**説明**: 依存関係検証の共通ロジックを含むヘルパーモジュールを作成する

**含まれる関数**:
- `buildErrorMessage(phaseName: PhaseName, missingDependencies: PhaseName[], missingFiles: Array<{ phase: PhaseName; file: string }>): string`
- `buildWarningMessage(phaseName: PhaseName, missingDependencies: PhaseName[], missingFiles: Array<{ phase: PhaseName; file: string }>): string`

**受け入れ基準**:
- Given: フェーズ名、未完了依存フェーズリスト、ファイル不在リスト
- When: 対応するメッセージ生成関数を呼び出す
- Then: ユーザーに分かりやすいメッセージを返す

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

#### NFR-001: リファクタリング前後での性能退行がないこと

**測定方法**:
- エージェント実行時間の比較（Codex/Claude共通）
- メタデータ読み書き時間の比較
- 依存関係検証時間の比較

**受け入れ基準**:
- リファクタリング後の実行時間が、リファクタリング前の±5%以内であること

#### NFR-002: ヘルパー関数の呼び出しオーバーヘッドが最小限であること

**受け入れ基準**:
- ヘルパー関数の呼び出しオーバーヘッドが1ms未満であること

### 3.2 セキュリティ要件

#### NFR-003: 認証情報の安全な取り扱い

**要件**:
- CODEX_API_KEY、CLAUDE_CODE_OAUTH_TOKEN等の認証情報がログに出力されないこと
- トークン抽出処理において、不正なファイルパスからの読み込みを防止すること

**受け入れ基準**:
- ログ出力にトークン文字列が含まれないことを確認
- ファイルパス検証処理が正しく動作することを確認

### 3.3 可用性・信頼性要件

#### NFR-004: 既存テストの100%合格

**要件**:
- リファクタリング後、すべての既存テストが合格すること
- 新規テストが既存テストと同等以上の品質を持つこと

**受け入れ基準**:
- `npm test` でエラーなし
- `npm run test:coverage` で全体カバレッジが既存レベル以上（80%以上）

#### NFR-005: 後方互換性の維持

**要件**:
- 各クラスのpublicメソッドのシグネチャが変更されないこと
- 既存の呼び出し元が無変更で動作すること

**受け入れ基準**:
- リファクタリング後、既存のすべてのテストケースが合格すること
- 外部モジュールからの呼び出しが無変更で動作することを確認

### 3.4 保守性・拡張性要件

#### NFR-006: 行数削減目標の達成

**要件**:
- 各ファイルが250行以下に削減される（努力目標）
- 最低でも30%以上の行数削減を達成する（必須）

**受け入れ基準**:
- codex-agent-client.ts: 359行 → 250行以下（努力目標）または270行以下（必須）
- claude-agent-client.ts: 354行 → 250行以下（努力目標）または270行以下（必須）
- metadata-manager.ts: 342行 → 250行以下（努力目標）または260行以下（必須）
- phase-dependencies.ts: 336行 → 250行以下（努力目標）または255行以下（必須）

#### NFR-007: コードの可読性向上

**要件**:
- 各関数の責務が単一であること（Single Responsibility Principle）
- 関数名が意図を明確に表現していること
- JSDocコメントが追加されていること

**受け入れ基準**:
- 各ヘルパーモジュールの全公開関数にJSDocコメントが追加されている
- 関数名が動詞から始まり、処理内容が明確である

---

## 4. 制約事項

### 4.1 技術的制約

#### CONST-001: 既存の依存関係の維持

**制約内容**:
- 新規npm依存パッケージの追加は不可
- 既存の依存関係（fs-extra, node:path, node:child_process 等）のみを使用

#### CONST-002: TypeScript 5.x の使用

**制約内容**:
- TypeScript 5.x の型システムに準拠
- ES Modulesの使用を継続

#### CONST-003: ファサードパターンの採用

**制約内容**:
- Issue #24, #25で確立されたファサードパターンを踏襲
- 既存クラスは公開APIを維持し、内部実装のみリファクタリング

### 4.2 リソース制約

#### CONST-004: 開発期間

**制約内容**:
- 見積もり工数: 12～16時間（Phase 1から8まで）
- Phase 4（実装）: 4～6時間

#### CONST-005: テストカバレッジ

**制約内容**:
- 全体カバレッジ: 既存レベル以上を維持（80%以上）
- 新規ファイルのカバレッジ: 80%以上

### 4.3 ポリシー制約

#### CONST-006: コーディング規約

**制約内容**:
- ESLintルールに準拠
- Prettierフォーマットに準拠

#### CONST-007: Gitコミットポリシー

**制約内容**:
- コミットメッセージ形式: `[ai-workflow] Phase {number} ({name}) - {step} completed`
- 各ステップ完了後に自動コミット＆プッシュ

---

## 5. 前提条件

### 5.1 システム環境

- Node.js 20以上
- npm 10以上
- TypeScript 5.x
- Jest（テストフレームワーク）

### 5.2 依存コンポーネント

- `fs-extra`: ファイルシステム操作
- `@anthropic-ai/claude-agent-sdk`: Claude Agent SDK
- `simple-git`: Git操作

### 5.3 外部システム連携

- GitHub API（Issue、PR、コメント操作）
- Codex CLI（エージェント実行）
- Claude Agent SDK（エージェント実行）

---

## 6. 受け入れ基準

### 6.1 機能要件の受け入れ基準（Given-When-Then形式）

#### AC-001: codex-agent-client.ts のリファクタリング

**Given**: Codexエージェントから受信したJSONイベント
**When**: リファクタリング後のCodexAgentClientを使用してタスクを実行
**Then**:
- JSONイベントが正しくパースされる
- ログフォーマットが正しく出力される
- 環境変数が正しく設定される
- 既存の呼び出し元が無変更で動作する

#### AC-002: claude-agent-client.ts のリファクタリング

**Given**: Claude Agent SDKから受信したメッセージ
**When**: リファクタリング後のClaudeAgentClientを使用してタスクを実行
**Then**:
- SDKメッセージが正しくパースされる
- ログフォーマットが正しく出力される
- トークン抽出処理が正しく動作する
- 既存の呼び出し元が無変更で動作する

#### AC-003: metadata-manager.ts のリファクタリング

**Given**: メタデータファイルパス
**When**: リファクタリング後のMetadataManagerを使用してメタデータを操作
**Then**:
- ファイルI/O操作が正しく動作する
- バリデーション処理が正しく動作する
- タイムスタンプフォーマットが正しく動作する
- 既存の呼び出し元が無変更で動作する

#### AC-004: phase-dependencies.ts のリファクタリング

**Given**: フェーズ名とメタデータマネージャー
**When**: リファクタリング後のvalidatePhaseDependenciesを使用して依存関係をチェック
**Then**:
- 依存関係検証が正しく動作する
- エラー/警告メッセージが正しく生成される
- プリセット定義が正しく機能する
- 既存の呼び出し元が無変更で動作する

#### AC-005: ヘルパーモジュールの動作

**Given**: ヘルパーモジュール（agent-event-parser, metadata-io, dependency-validation）が作成されている
**When**: ヘルパー関数を呼び出す
**Then**:
- 各ヘルパー関数が正しく動作する
- エラーハンドリングが適切に行われる
- ユニットテストが80%以上のカバレッジを達成する

### 6.2 非機能要件の受け入れ基準

#### AC-006: パフォーマンス

**Given**: リファクタリング前後のコード
**When**: 同一のタスクを実行
**Then**: 実行時間がリファクタリング前の±5%以内である

#### AC-007: テストカバレッジ

**Given**: リファクタリング後のコード
**When**: `npm run test:coverage` を実行
**Then**: 全体カバレッジが80%以上である

#### AC-008: 行数削減

**Given**: リファクタリング後のコード
**When**: 各ファイルの行数を確認
**Then**: 各ファイルが30%以上削減されている（必須）または250行以下である（努力目標）

---

## 7. スコープ外

### 7.1 明確にスコープ外とする事項

1. **新規機能の追加**: 本Issueはリファクタリングのみを対象とし、新機能追加は含まない
2. **データベーススキーマ変更**: メタデータフォーマットの変更は含まない
3. **環境変数の追加・変更**: 既存の環境変数のみを使用
4. **外部API仕様の変更**: GitHub API、Codex CLI、Claude Agent SDKの仕様変更は含まない
5. **大規模な再設計**: ファサードパターンの導入など、大規模な設計変更は含まない（既に#23, #24, #25で実施済み）

### 7.2 将来的な拡張候補

1. **エージェント抽象化**: Codex/Claude以外のLLMエージェント（OpenAI Assistants API、Anthropic Messages API等）のサポート
2. **プラグインシステム**: カスタムヘルパーモジュールを動的にロード可能にする
3. **パフォーマンス最適化**: 並列処理やキャッシング機能の追加
4. **リアルタイムログストリーミング**: エージェント実行中のログをリアルタイムで表示

---

## 8. 追加情報

### 8.1 関連Issue

- **親Issue**: #1（リファクタリング全体計画）
- **参考Issue**:
  - #23（BasePhase分離、52.4%削減）
  - #24（GitHubClient分離、42.7%削減）
  - #25（GitManager分離、67%削減）

### 8.2 参照ドキュメント

- `CLAUDE.md`: プロジェクトの全体方針とコーディングガイドライン
- `ARCHITECTURE.md`: アーキテクチャ設計思想
- `README.md`: プロジェクト概要と使用方法
- Planning Document: `.ai-workflow/issue-26/00_planning/output/planning.md`

### 8.3 次のステップ

1. Design Phase（Phase 2）でヘルパーモジュールの詳細設計を実施
2. Test Scenario Phase（Phase 3）でテストシナリオを策定
3. Implementation Phase（Phase 4）で段階的にリファクタリングを実施
4. Testing Phase（Phase 6）でリグレッションテストを徹底

---

**要件定義書作成日**: 2025-01-20
**承認者**: AI Workflow Agent
**次回レビュー日**: Design Phase（Phase 2）完了後
