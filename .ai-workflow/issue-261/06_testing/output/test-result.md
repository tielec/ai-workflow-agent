# テスト失敗による Phase 5（Test Implementation）への差し戻し

## テスト結果サマリー

- **総テスト数**: 27件（実装済み）
- **成功**: 0件
- **失敗**: 27件（TypeScript型エラー - Mock型定義不足）
- **成功率**: 0%
- **判定**: **FAIL - Phase 5への差し戻しが必要**

---

## 差し戻しの理由

### 問題の本質

全27件のテストが**TypeScript型エラーで実行前に失敗**しており、テストロジックが1件も実行されていません。この問題の根本原因は**Phase 5（Test Implementation）でのテスト実装品質の問題**であり、Phase 6（Testing）では対応できません。

### Phase 6では対応できない理由

1. **Phase 6の責務**: テストを実行して結果を確認すること
2. **現在の問題**: テストコードの型定義が不正確（テスト実装の品質問題）
3. **必要な対応**: テストコード自体の修正（Phase 5の責務）

---

## 失敗したテスト

### 全27件のテストが型エラーで失敗

**テストファイル**:
- `tests/unit/commands/finalize.test.ts` - ユニットテスト
- `tests/integration/finalize-command.test.ts` - インテグレーションテスト

**失敗の原因**:
- Jest Mockの型推論エラー（`jest.fn().mockResolvedValue(...)`の型が`never`と推論）
- モックインスタンスの型が`{}`と推論される

---

## Phase 5での必要な実装修正

### 修正タスク

#### 1. 実際の型定義を確認

以下のファイルから正確な型定義を確認する：
- `src/types.ts` - WorkflowMetadata, TargetRepository, GitCommandResult等
- `src/core/repository-utils.ts` - findWorkflowMetadata等
- その他の関連ファイル

#### 2. Jest Mockに明示的な型定義を追加

**影響範囲**:
- GitManagerのモック (commitCleanupLogs, pushToRemote)
- SquashManagerのモック (squashCommitsForFinalize)
- ArtifactCleanerのモック (cleanupWorkflowArtifacts)
- GitHubClientのモック (create, getPullRequestClient, markPRReady, updateBaseBranch)

**修正例**:

```typescript
// ❌ 修正前（型エラー）
jest.mock('../../src/core/git-manager.js', () => ({
  GitManager: jest.fn().mockImplementation(() => ({
    commitCleanupLogs: jest.fn().mockResolvedValue({ success: true, commit_hash: 'abc123' }),
    // エラー: Argument of type '{ success: boolean; commit_hash: string; }'
    //         is not assignable to parameter of type 'never'.
  })),
}));

// ✅ 修正後（型エラー解消）
import type { GitCommandResult } from '../../src/types.js';

jest.mock('../../src/core/git-manager.js', () => ({
  GitManager: jest.fn().mockImplementation(() => ({
    commitCleanupLogs: jest.fn<Promise<GitCommandResult>, [number, string]>()
      .mockResolvedValue({ success: true, commit_hash: 'abc123' }),
    pushToRemote: jest.fn<Promise<GitCommandResult>, []>()
      .mockResolvedValue({ success: true }),
  })),
}));
```

#### 3. モックインスタンスに`jest.Mocked<T>`型を付与

**問題の例**:
```typescript
// ❌ 型が {} と推論される
const artifactCleanerInstance = (ArtifactCleaner as jest.Mock).mock.results[0]?.value;
expect(artifactCleanerInstance?.cleanupWorkflowArtifacts).toHaveBeenCalledWith(true);
//                            ~~~~~~~~~~~~~~~~~~~~~~~~
// エラー: Property 'cleanupWorkflowArtifacts' does not exist on type '{}'.

// ✅ 修正案
const artifactCleanerInstance = (ArtifactCleaner as jest.Mock<ArtifactCleaner>)
  .mock.results[0]?.value;
```

#### 4. テストデータを実際の型定義に合わせて修正

**Phase 6 Reviseで修正済み**（Phase 5に反映が必要）:
- ✅ WorkflowMetadataの構造修正
  - ❌ `issue_info` プロパティ（存在しない）→ ✅ `issue_number`, `issue_title`, `issue_url`
  - ❌ `issue_number: number` → ✅ `issue_number: string`
- ✅ TargetRepositoryの必須フィールド追加
  - `github_name` と `remote_url` を追加
- ✅ findWorkflowMetadataの戻り値型修正
  - ❌ `{ metadataPath: string }` → ✅ `{ repoRoot: string; metadataPath: string }`

#### 5. TypeScript型チェック（`npm run build`）を通過させる

修正後、必ず以下のコマンドで型チェックを実施：
```bash
npm run build
```

すべての型エラーが解消されていることを確認してから、Phase 6に進む。

---

## 実際の型定義（Phase 4で実装済み）

### WorkflowMetadata (src/types.ts)
```typescript
export interface WorkflowMetadata {
  issue_number: string;  // string型（numberではない）
  issue_url: string;
  issue_title: string;
  // issue_info プロパティは存在しない
  target_repository?: TargetRepository | null;
  // ...
}
```

### TargetRepository (src/types.ts)
```typescript
export interface TargetRepository {
  path: string;
  github_name: string;  // 必須
  remote_url: string;   // 必須
  owner: string;
  repo: string;
}
```

### findWorkflowMetadata (src/core/repository-utils.ts)
```typescript
export async function findWorkflowMetadata(
  issueNumber: string,
): Promise<{ repoRoot: string; metadataPath: string }> {
  // repoRootとmetadataPathの両方を返す
}
```

### GitCommandResult (src/types.ts)
```typescript
export interface GitCommandResult {
  success: boolean;
  commit_hash?: string;
  error?: string;
}
```

---

## テスト実装時の型確認チェックリスト

Phase 5での修正時、以下を確認してください：

- [ ] 実際の型定義ファイル（src/types.ts等）を確認したか
- [ ] モックの戻り値型が実際の関数シグネチャと一致しているか
- [ ] `jest.fn<ReturnType, Args>()`で明示的に型を指定したか
- [ ] モックインスタンスに`jest.Mocked<T>`型を付与したか
- [ ] テストデータの型が実際のインターフェースと一致しているか
- [ ] TypeScript型チェック（`npm run build`）を通過しているか

---

## Phase 5での修正後の再テスト手順

1. **Phase 5で上記の修正を実施**
   - すべてのモックに明示的な型定義を追加
   - テストデータを実際の型定義に合わせて修正
   - TypeScript型チェック（`npm run build`）を通過させる

2. **Phase 6に戻る**
   - Phase 5の修正が完了したら、Phase 6（Testing）に戻る

3. **テストを再実行**
   ```bash
   npm run build       # 型チェック
   npm run test:unit   # ユニットテスト実行
   npm run test:integration  # インテグレーションテスト実行
   ```

4. **テスト結果を確認**
   - 型エラーがすべて解消されている
   - 実装コードの動作検証に集中できる
   - 主要なテストケースが成功している

---

## 品質ゲート判定

Phase 6（Testing）の品質ゲートに対する判定:

- [ ] **テストが実行されている** → ❌ **不合格**（TypeScript型エラーで実行不可）
- [ ] **主要なテストケースが成功している** → ❌ **不合格**（テスト実行不可のため未検証）
- [x] **失敗したテストは分析されている** → ✅ **合格**（型エラーの原因と修正方針を詳細に分析）

**品質ゲート総合判定: FAIL**

---

## Phase 5への差し戻しサマリー

| 項目 | 内容 |
|------|------|
| **差し戻し理由** | テストコードの型定義が不正確（Phase 5の実装品質の問題） |
| **失敗したテスト** | 全27件（TypeScript型エラー） |
| **必要な修正** | Jest Mockの明示的な型定義追加、モックインスタンスへの型付与 |
| **修正後の確認** | TypeScript型チェック（`npm run build`）を通過させる |
| **次のステップ** | Phase 5で修正完了後、Phase 6に戻ってテストを再実行 |

---

**テスト実行日時**: 2025-12-06 13:30 UTC
**ステータス**: TypeScript型エラー（Phase 5への差し戻し推奨）
**判定**: **FAIL - Phase 5（Test Implementation）での修正が必要**
