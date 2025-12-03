# 要件定義書

## 0. Planning Documentの確認

Planning Document（@.ai-workflow/issue-184/00_planning/output/planning.md）で策定された開発計画を確認しました：

- **実装戦略**: EXTEND（既存Jenkinsfileの拡張）
- **テスト戦略**: INTEGRATION_ONLY（Jenkins Job実行時の動作検証）
- **テストコード戦略**: CREATE_TEST（テストシナリオドキュメントを新規作成、自動テストスクリプトは不要）
- **複雑度**: 簡単（単一ファイルの修正のみ）
- **見積もり工数**: 2~3時間
- **リスク評価**: 低

この計画に基づき、以下の要件定義を実施します。

---

## 1. 概要

### 背景
現在のJenkinsfileでは、認証情報の取得方法が統一されていません：
- **AWS認証情報**（`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`）: パラメータから受け取る方式
- **OpenAI API Key**（`OPENAI_API_KEY`）: `credentials('openai-api-key')`から取得
- **GitHub Token**（`GITHUB_TOKEN`）: `credentials('github-token')`から取得

この不統一は、保守性の低下と運用上の混乱を招く可能性があります。

### 目的
認証情報の取得方法を統一し、**すべてパラメータから受け取る方式**に変更することで、以下を実現します：

1. **一貫性の向上**: AWS認証情報と同じパターンで統一
2. **保守性の向上**: 認証情報管理方針が明確化
3. **運用の簡素化**: Jenkinsの認証情報ストアとパラメータの使い分けが不要

### ビジネス価値・技術的価値

- **技術的価値**:
  - コードの一貫性が向上し、保守コストが削減
  - Jenkinsfile内の認証情報管理ロジックが統一され、可読性が向上
- **運用上の価値**:
  - Jenkins Job実行時のパラメータ設定が明確化
  - 認証情報の設定方法が統一され、オペレーションミスが減少

---

## 2. 機能要件

### FR-1: パラメータセクションへの`OPENAI_API_KEY`追加（優先度: 高）

**説明**: Jenkinsfileの`parameters`セクションに、`OPENAI_API_KEY`を`password`型パラメータとして追加する。

**詳細**:
- パラメータ名: `OPENAI_API_KEY`
- 型: `password`（Jenkins画面でマスキング表示）
- 説明文: `OpenAI API Key`

**検証方法**: Jenkins Job実行時に、パラメータ入力画面で`OPENAI_API_KEY`フィールドが表示され、入力値がマスキングされることを確認する。

---

### FR-2: パラメータセクションへの`GITHUB_TOKEN`追加（優先度: 高）

**説明**: Jenkinsfileの`parameters`セクションに、`GITHUB_TOKEN`を`password`型パラメータとして追加する。

**詳細**:
- パラメータ名: `GITHUB_TOKEN`
- 型: `password`（Jenkins画面でマスキング表示）
- 説明文: `GitHub Personal Access Token`

**検証方法**: Jenkins Job実行時に、パラメータ入力画面で`GITHUB_TOKEN`フィールドが表示され、入力値がマスキングされることを確認する。

---

### FR-3: environmentセクションでの`OPENAI_API_KEY`の参照方法変更（優先度: 高）

**説明**: Jenkinsfileの`environment`セクションで、`OPENAI_API_KEY`の取得方法を`credentials('openai-api-key')`から`"${params.OPENAI_API_KEY}"`に変更する。

**変更前**:
```groovy
environment {
    OPENAI_API_KEY = credentials('openai-api-key')
}
```

**変更後**:
```groovy
environment {
    OPENAI_API_KEY = "${params.OPENAI_API_KEY}"
}
```

**検証方法**: Docker コンテナ内で`echo $OPENAI_API_KEY`を実行し、パラメータで指定した値が正しく設定されていることを確認する。また、Jenkins Jobのコンソール出力でマスキングされていることを確認する。

---

### FR-4: environmentセクションでの`GITHUB_TOKEN`の参照方法変更（優先度: 高）

**説明**: Jenkinsfileの`environment`セクションで、`GITHUB_TOKEN`の取得方法を`credentials('github-token')`から`"${params.GITHUB_TOKEN}"`に変更する。

**変更前**:
```groovy
environment {
    GITHUB_TOKEN = credentials('github-token')
}
```

**変更後**:
```groovy
environment {
    GITHUB_TOKEN = "${params.GITHUB_TOKEN}"
}
```

**検証方法**: Docker コンテナ内で`echo $GITHUB_TOKEN`を実行し、パラメータで指定した値が正しく設定されていることを確認する。また、Jenkins Jobのコンソール出力でマスキングされていることを確認する。

---

### FR-5: 既存のcredentials参照の完全削除（優先度: 高）

**説明**: `credentials('openai-api-key')`と`credentials('github-token')`の参照をJenkinsfileから完全に削除する。

**検証方法**:
- Jenkinsfile全体を`credentials('openai-api-key')`と`credentials('github-token')`で検索し、ヒットしないことを確認
- AWS認証情報のパターンと一貫性があることを確認

---

## 3. 非機能要件

### NFR-1: セキュリティ要件

- **パラメータマスキング**: `password`型パラメータを使用し、Jenkins画面とコンソール出力で値が`****`でマスキングされること
- **ログ出力制御**: 環境変数の値が平文でログに記録されないこと

### NFR-2: 保守性要件

- **コード一貫性**: AWS認証情報のパターンと一貫性があること
- **可読性**: コードレビューで誤字脱字やGroovy構文エラーがないこと

### NFR-3: 後方互換性

- **既存Jobへの影響**: パラメータ追加は後方互換性があり、既存のJobは影響を受けないこと
- **移行手順の明確化**: ドキュメントで新しいパラメータ設定方法を明記すること

---

## 4. 制約事項

### 技術的制約

- **変更対象ファイル**: `Jenkinsfile`のみ
- **Groovy構文**: Jenkins Pipeline Groovy構文に準拠すること
- **パラメータ型**: `password`型を使用し、マスキング機能を活用すること

### リソース制約

- **作業時間**: 2~3時間以内で完了すること
- **テスト時間**: Jenkins Job実行による統合テストを含む

### ポリシー制約

- **認証情報管理方針**: すべての認証情報をパラメータから受け取る方式に統一
- **既存パターンの踏襲**: AWS認証情報のパラメータ化パターンと一貫性を保つこと

---

## 5. 前提条件

### システム環境

- Jenkinsサーバーが稼働していること
- Jenkinsfileが対象のJobに紐づいていること

### 依存コンポーネント

- なし（Jenkinsfile単体の修正）

### 外部システム連携

- なし

---

## 6. 受け入れ基準

### AC-1: パラメータが正しく追加されている

**Given**: Jenkinsfileの`parameters`セクションが修正されている
**When**: Jenkins Jobのビルド画面を開く
**Then**: `OPENAI_API_KEY`と`GITHUB_TOKEN`のパラメータ入力フィールドが表示され、`password`型でマスキングされている

---

### AC-2: 環境変数が正しく設定されている

**Given**: パラメータ入力画面で`OPENAI_API_KEY`と`GITHUB_TOKEN`を設定
**When**: Jenkins Jobをビルド実行する
**Then**: Docker コンテナ内で`echo $OPENAI_API_KEY`と`echo $GITHUB_TOKEN`を実行し、パラメータで指定した値が正しく設定されていることを確認できる

---

### AC-3: パラメータがマスキングされている

**Given**: パラメータ入力画面で`OPENAI_API_KEY`と`GITHUB_TOKEN`を設定
**When**: Jenkins Jobをビルド実行する
**Then**: Jenkins Jobのコンソール出力で、`OPENAI_API_KEY`と`GITHUB_TOKEN`の値が`****`でマスキングされていることを確認できる

---

### AC-4: 既存のcredentials参照が完全に削除されている

**Given**: Jenkinsfileが修正されている
**When**: Jenkinsfile全体を`credentials('openai-api-key')`と`credentials('github-token')`で検索する
**Then**: どちらもヒットせず、完全に削除されていることを確認できる

---

### AC-5: AWS認証情報のパターンと一貫性がある

**Given**: Jenkinsfileが修正されている
**When**: AWS認証情報（`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`）のパラメータ化パターンと比較する
**Then**: `OPENAI_API_KEY`と`GITHUB_TOKEN`のパラメータ化パターンが同じ方式であることを確認できる

---

## 7. スコープ外

### 明確にスコープ外とする事項

1. **Jenkins Credentialsの削除**:
   - `openai-api-key`と`github-token`のcredentialsをJenkinsから削除するかどうかは、このIssueのスコープ外
   - 削除する場合は別Issueで対応する

2. **他の認証情報のパラメータ化**:
   - 他にcredentialsから取得している認証情報がある場合、それらのパラメータ化は別途対応する

3. **Jenkinsfile以外のファイル修正**:
   - ドキュメント更新（README.md、CLAUDE.md等）はPhase 7（Documentation）で対応

---

## 8. 将来的な拡張候補

- **認証情報の一元管理**: すべての認証情報をパラメータ化した後、外部Secrets管理ツール（AWS Secrets Manager、HashiCorp Vault等）への移行を検討
- **パラメータのバリデーション**: パラメータ未設定時のエラーメッセージを改善し、ユーザーフレンドリーなエラー処理を追加

---

## 9. リスクと軽減策（Planning Documentより）

### リスク1: パラメータ未設定時のビルド失敗
- **影響度**: 中
- **確率**: 中
- **軽減策**:
  - パラメータにデフォルト値を設定しない（セキュリティ上の理由）
  - Jenkins Job実行時に、パラメータ入力を必須とするUI設計を確認
  - テストシナリオで「パラメータ未設定時のエラーメッセージ」を検証項目に追加

### リスク2: 既存のJenkins Jobとの互換性問題
- **影響度**: 低
- **確率**: 低
- **軽減策**:
  - パラメータ追加は後方互換性があるため、既存のJobは影響を受けない
  - ただし、新しいパラメータを設定しない限り、ビルドが失敗する可能性がある
  - ドキュメントで移行手順を明記

### リスク3: credentialsとparamsの混在による混乱
- **影響度**: 低
- **確率**: 低
- **軽減策**:
  - AWS認証情報のパターンと一貫性を保つことで、混乱を防止
  - コードレビューで`credentials()`の参照が残っていないか確認

---

## 10. 参考情報

### 関連ドキュメント

- Planning Document: @.ai-workflow/issue-184/00_planning/output/planning.md
- CLAUDE.md: @CLAUDE.md（Jenkins統合の項目を参照）
- ARCHITECTURE.md: @ARCHITECTURE.md（Jenkins での利用の項目を参照）

### 関連Issue

- Issue #184: https://github.com/tielec/ai-workflow-agent/issues/184

---

**作成日**: 2025-01-XX
**バージョン**: 1.0
**ステータス**: Draft
