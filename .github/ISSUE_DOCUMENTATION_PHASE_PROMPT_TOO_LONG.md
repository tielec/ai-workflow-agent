# Documentation Phase でプロンプトが長すぎるエラー

## 概要

Documentation Phase（Phase 7）の実行中に「Prompt is too long」エラーが発生し、フェーズが失敗する問題が報告されました。エージェント（Claude Code）が大量のファイルを読み込んだ結果、プロンプトの長さ制限を超えてしまっています。

## 問題の詳細

### エラーログ

```
[AGENT ACTION] Using tool: Read
[AGENT ACTION] Parameters: {"file_path":"/tmp/ai-workflow-repos-62-431479e8/ai-workflow-agent/CLAUDE.md","limit":1000}
[AGENT ACTION] Using tool: Read
[AGENT ACTION] Parameters: {"file_path":"/tmp/ai-workflow-repos-62-431479e8/ai-workflow-agent/TROUBLESHOOTING.md"}
[AGENT ACTION] Using tool: Read
[AGENT ACTION] Parameters: {"file_path":"/tmp/ai-workflow-repos-62-431479e8/ai-workflow-agent/ROADMAP.md"}
[AGENT THINKING] Prompt is too long
[AGENT RESULT] status=success, turns=30, duration_ms=30316
[AGENT RESULT] Prompt is too long
[ERROR] Phase documentation failed
```

### 発生状況

- **対象Issue**: #383（PR comment resolution feature）
- **フェーズ**: Documentation Phase（Phase 7）
- **エージェント**: Claude Code
- **実行時間**: 約30秒（30ターン）
- **最終ステータス**: `status=success` だが実際にはエラー

### 原因分析

1. **二重読み込み**: エージェントが CLAUDE.md を Read tool で読み込んでいるが、このファイルは Claude Code のシステム設定として自動的にコンテキストに含まれている（約50K tokens の無駄）
2. **大量のファイル読み込み**: エージェントが複数の大きなドキュメントファイル（TROUBLESHOOTING.md、ROADMAP.md 等）を Read tool で読み込んでいる
3. **コンテキスト累積**: 30ターンの実行で読み込んだファイル内容がすべてコンテキストに累積
4. **プロンプト長制限**: Claude Code のプロンプト長制限（約200K tokens）を超過
5. **エラーハンドリング不足**: `status=success` と表示されるが、実際には「Prompt is too long」エラーで失敗

## 影響範囲

### 発生条件

以下の条件が重なると発生する可能性が高い：

1. **自動読み込みファイルの二重読み込み**: エージェントが CLAUDE.md を Read tool で読み込んでいる（最大の要因）
2. **大きなリポジトリ**: README.md、ARCHITECTURE.md 等の大きなドキュメントが存在
3. **多数のドキュメント**: 更新対象ドキュメントが複数存在
4. **複雑なIssue**: 実装内容が複雑で、エージェントが多くのファイルを参照する必要がある

### 影響を受けるフェーズ

- **Documentation Phase（Phase 7）**: 最も影響を受けやすい（複数ドキュメントを読み込む必要がある）
- **Report Phase（Phase 8）**: 全フェーズの成果物を参照するため、発生可能性あり
- **Implementation Phase（Phase 4）**: 大規模な実装で多数のファイル参照が必要な場合

## 解決策

### Option 1: プロンプト最適化（短期対策）

Documentation Phase のプロンプトを最適化し、コンテキスト消費量を削減する。

**実装内容**:

1. **ファイル読み込みのガイダンス追加**:
   ```
   重要: プロンプト長制限を超えないよう、以下を厳守してください：

   【自動的にコンテキストに含まれているファイル（Read 不要）】
   - CLAUDE.md（Claude Code のプロジェクト設定として自動読み込み）
   - ~/.claude/CLAUDE.md（ユーザーグローバル設定として自動読み込み）

   これらのファイルを Read tool で読み込むと二重読み込みになり、コンテキストを無駄に消費します。

   【Read tool 使用時のルール】
   - 一度に読み込むファイル数を最小限に（最大3-5ファイル）
   - 大きなファイル（README.md、ARCHITECTURE.md等）は limit パラメータを使用（1000-2000行）
   - 既に読み込んだファイルは再読み込みしない
   - 更新が必要なセクションのみを特定し、部分的に読み込む
   ```

2. **段階的処理の推奨**:
   ```
   大量のドキュメント更新が必要な場合、以下の戦略を採用してください：
   1. 影響を受けるドキュメントをリストアップ（ファイル読み込み不要）
   2. 最も重要なドキュメントから順に処理（1-2ファイルずつ）
   3. 各ドキュメントの更新内容を決定してから Edit で更新
   ```

**利点**:
- 実装が容易（プロンプトファイルの修正のみ）
- 即座に適用可能

**欠点**:
- エージェントがガイダンスに従わない場合、効果が限定的
- 根本的な解決にはならない

### Option 2: チャンキング戦略（中期対策）

大きなドキュメントを複数の小さなチャンクに分割して処理する。

**実装内容**:

1. **ドキュメントリスト取得**:
   - 更新対象ドキュメントのリストを最初に取得（ファイル読み込み不要）

2. **チャンク処理**:
   - ドキュメントを1-2ファイルずつのチャンクに分割
   - 各チャンクに対してエージェントを実行（独立したコンテキスト）
   - チャンク間でステート（更新内容の記録）を共有

3. **結果の統合**:
   - 各チャンクの更新内容をマージ
   - 最終的な `documentation.md` を生成

**実装例**:
```typescript
// DocumentationPhase.execute() の拡張
async execute(agent: AgentClient): Promise<string[]> {
  // 1. 更新対象ドキュメントリストを取得
  const targetDocs = await this.identifyTargetDocuments();

  // 2. チャンクに分割（1-2ファイルずつ）
  const chunks = this.chunkDocuments(targetDocs, 2);

  // 3. 各チャンクを処理
  const updates: DocumentUpdate[] = [];
  for (const chunk of chunks) {
    const result = await this.processChunk(agent, chunk);
    updates.push(...result);
  }

  // 4. 結果を統合
  await this.applyUpdates(updates);
  return this.generateOutputFiles();
}
```

**利点**:
- プロンプト長制限を確実に回避
- 大規模リポジトリでも安定動作

**欠点**:
- 実装が複雑（DocumentationPhase クラスの大幅な改修）
- チャンク間の整合性管理が必要
- エージェント呼び出し回数が増加（コスト増）

### Option 3: プログレッシブ処理（長期対策）

エージェントがコンテキスト制限に近づいたら自動的に中間結果を保存し、新しいコンテキストで再開する。

**実装内容**:

1. **コンテキスト使用量の監視**:
   - エージェント実行中にトークン使用量を監視
   - 閾値（例: 150K tokens）を超えたら中間保存

2. **中間結果の保存**:
   - 現在までの更新内容を一時ファイルに保存
   - エージェントセッションを終了

3. **新しいコンテキストで再開**:
   - 新しいエージェントセッションを開始
   - 中間結果をロードして続行

**実装例**:
```typescript
// AgentExecutor でトークン使用量を監視
class AgentExecutor {
  private tokenThreshold = 150000;

  async execute(prompt: string): Promise<AgentResult> {
    const result = await this.agent.run(prompt);

    if (result.tokenUsage > this.tokenThreshold) {
      // 中間結果を保存
      await this.saveIntermediateState(result);

      // 新しいセッションで再開
      return await this.resumeWithFreshContext();
    }

    return result;
  }
}
```

**利点**:
- 全フェーズで共通的に使用可能
- エージェント実行の透明性が高い

**欠点**:
- 実装が最も複雑（BasePhase、AgentExecutor の改修）
- トークン使用量の正確な監視が必要
- 中間ステートの管理が複雑

### Option 4: Claude モデルのアップグレード（代替案）

Claude Opus 4.5（200K context window）から Claude Opus 4.7（1M context window）にアップグレードする。

**実装内容**:
- `CLAUDE_MODEL` 環境変数のデフォルト値を更新
- または、Documentation Phase のみ Opus 4.7 を使用

**利点**:
- コード変更が最小限
- 即座に適用可能

**欠点**:
- Claude Opus 4.7 のリリース待ち（未リリース）
- コスト増加の可能性
- 根本的な解決にはならない（1M context でも制限は存在）

## 推奨アプローチ

**Phase 1（即座に実施）**: Option 1（プロンプト最適化）
- `src/prompts/documentation/execute.txt` を修正
- ファイル読み込みガイダンスを追加
- @references 形式の活用を推奨

**Phase 2（v0.6.0で実装）**: Option 2（チャンキング戦略）
- DocumentationPhase クラスを拡張
- チャンク処理を実装
- テストを追加

**Phase 3（将来検討）**: Option 3（プログレッシブ処理）
- BasePhase、AgentExecutor の改修
- トークン使用量監視機能を追加
- 全フェーズで適用

## 実装計画

### Phase 1: プロンプト最適化（緊急対応）

**実装内容**:
1. `src/prompts/documentation/execute.txt` にガイダンスを追加
2. **自動読み込みファイルの明記**: CLAUDE.md、~/.claude/CLAUDE.md は Read 不要と明記（二重読み込み防止）
3. ファイル読み込み制限を明記（最大3-5ファイル、limit パラメータ使用）
4. 段階的処理の推奨を追加

**期待される効果**:
- CLAUDE.md の二重読み込み防止により約50K tokens 削減
- プロンプト長エラーの発生率を70-90%削減
- エージェントの効率向上（不要なファイル読み込みを削減）

**実装工数**: 1-2時間

### Phase 2: チャンキング戦略（v0.6.0）

**実装内容**:
1. `DocumentationPhase.identifyTargetDocuments()` を実装（ファイルリスト取得）
2. `DocumentationPhase.chunkDocuments()` を実装（チャンク分割）
3. `DocumentationPhase.processChunk()` を実装（チャンク処理）
4. `DocumentationPhase.applyUpdates()` を実装（結果統合）
5. ユニットテスト追加

**期待される効果**:
- プロンプト長エラーをほぼ完全に回避
- 大規模リポジトリでの安定動作

**実装工数**: 1-2日

### Phase 3: プログレッシブ処理（将来検討）

**実装内容**:
1. `AgentExecutor.monitorTokenUsage()` を実装
2. `AgentExecutor.saveIntermediateState()` を実装
3. `AgentExecutor.resumeWithFreshContext()` を実装
4. BasePhase との統合
5. 統合テスト追加

**期待される効果**:
- 全フェーズでプロンプト長制限を回避
- エージェント実行の安定性向上

**実装工数**: 3-5日

## 検証計画

### Phase 1 の検証

1. **プロンプト修正のレビュー**:
   - 自動読み込みファイル（CLAUDE.md）の明記が明確か
   - ファイル読み込み制限が適切か

2. **実環境テスト**:
   - Issue #383 で Documentation Phase を再実行
   - エージェントログで CLAUDE.md の Read が発生していないことを確認
   - 大きなリポジトリ（ai-workflow-agent）でテスト
   - エラー発生率を記録

### Phase 2 の検証

1. **ユニットテスト**:
   - `identifyTargetDocuments()` のテスト
   - `chunkDocuments()` のテスト
   - `processChunk()` のテスト

2. **統合テスト**:
   - 小規模リポジトリ（3-5ドキュメント）
   - 中規模リポジトリ（10-15ドキュメント）
   - 大規模リポジトリ（20+ ドキュメント）

3. **パフォーマンステスト**:
   - 実行時間の測定
   - トークン使用量の測定
   - コストの見積もり

## 成功基準

### Phase 1（緊急対応）

- ✅ プロンプトガイダンスを追加（自動読み込みファイルの明記、ファイル読み込み制限）
- ✅ エージェントログで CLAUDE.md の Read が発生していないことを確認
- ✅ Issue #383 で Documentation Phase が成功
- ✅ エラー発生率が70%以下に削減（CLAUDE.md 二重読み込み防止による効果）

### Phase 2（v0.6.0）

- ✅ チャンク処理の実装完了
- ✅ ユニットテスト カバレッジ 80% 以上
- ✅ 大規模リポジトリ（20+ ドキュメント）でエラー発生率 0%
- ✅ 実行時間が従来の1.5倍以内

### Phase 3（将来）

- ✅ プログレッシブ処理の実装完了
- ✅ 全フェーズで適用
- ✅ トークン使用量監視の精度 95% 以上
- ✅ エージェント実行の安定性向上（エラー率 1% 以下）

## 関連Issue

- Issue #207: Phase 4-8 の出力ドキュメント簡潔化（コンテキスト消費量削減）
- Issue #113: フォールバック機構（成果物ファイル生成失敗時の復旧）

## 参考情報

### Claude Code のコンテキスト制限

- **Claude Opus 4.5**: 200K tokens（約150万文字）
- **Claude Sonnet 4**: 200K tokens
- **Claude Haiku 3.5**: 200K tokens

### 典型的なファイルサイズ

- `CLAUDE.md`: 約50K tokens（4万行）
- `README.md`: 約30K tokens（2万行）
- `ARCHITECTURE.md`: 約20K tokens（1.5万行）
- `TROUBLESHOOTING.md`: 約10K tokens（7千行）

### プロンプト長の構成

1. **システムプロンプト**: 約10K tokens
2. **フェーズプロンプト**: 約5K tokens
3. **コンテキストファイル**: 可変（0-150K tokens）
4. **エージェント履歴**: 可変（0-50K tokens）

合計: 約15K + コンテキストファイル + エージェント履歴

## チェックリスト

### Phase 1（緊急対応）

- [ ] `src/prompts/documentation/execute.txt` にガイダンスを追加
- [ ] 自動読み込みファイル（CLAUDE.md、~/.claude/CLAUDE.md）の明記（Read 不要）
- [ ] ファイル読み込み制限を明記（最大3-5ファイル、limit パラメータ使用）
- [ ] 段階的処理の推奨を追加
- [ ] コミット・プッシュ
- [ ] Issue #383 で Documentation Phase を再実行
- [ ] エージェントログで CLAUDE.md の Read が発生していないことを確認
- [ ] エラー発生率を記録

### Phase 2（v0.6.0）

- [ ] `DocumentationPhase.identifyTargetDocuments()` を実装
- [ ] `DocumentationPhase.chunkDocuments()` を実装
- [ ] `DocumentationPhase.processChunk()` を実装
- [ ] `DocumentationPhase.applyUpdates()` を実装
- [ ] ユニットテスト追加
- [ ] 統合テスト実施
- [ ] パフォーマンステスト実施
- [ ] ドキュメント更新（CLAUDE.md、README.md）

### Phase 3（将来検討）

- [ ] `AgentExecutor.monitorTokenUsage()` を実装
- [ ] `AgentExecutor.saveIntermediateState()` を実装
- [ ] `AgentExecutor.resumeWithFreshContext()` を実装
- [ ] BasePhase との統合
- [ ] 統合テスト追加
- [ ] 全フェーズでの動作確認
- [ ] ドキュメント更新
