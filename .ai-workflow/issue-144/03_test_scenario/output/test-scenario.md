# テストシナリオ

**Issue**: #144 - auto-issue: 言語サポートの汎用化（TypeScript/Python制限の撤廃）
**作成日**: 2025-01-30
**バージョン**: 1.0
**テスト戦略**: UNIT_INTEGRATION

---

## 0. Planning Document・要件定義書・設計書の確認

本テストシナリオは、以下のドキュメントを基に作成しています：

### Planning Phase成果物
- **実装戦略**: EXTEND（既存コードの拡張）
- **テスト戦略**: UNIT_INTEGRATION（ユニットテスト＋インテグレーションテスト）
- **テストコード戦略**: EXTEND_TEST（既存テストの拡張）
- **見積もり工数**: 6〜8時間（1日程度）
- **リスク評価**: 中（プロンプト変更によるバグ検出精度低下、既存機能の回帰リスク）

### 要件定義書から
- **FR-1**: ファイル拡張子制限の撤廃（高優先度）
- **FR-2**: 除外パターンの実装（高優先度）
- **FR-3**: プロンプトの言語非依存化（高優先度）
- **FR-4**: サポート対象言語の明示（中優先度）
- **受け入れ基準**: 6つのAC（AC-1〜AC-6）

### 設計書から
- **変更ファイル1**: `src/core/repository-analyzer.ts`（`validateBugCandidate()` の修正）
- **変更ファイル2**: `src/prompts/auto-issue/detect-bugs.txt`（言語非依存化）
- **新規ヘルパー関数**: `isExcludedDirectory()`, `isExcludedFile()`, `matchesWildcard()`

---

## 1. テスト戦略サマリー

### 1.1 選択されたテスト戦略
**UNIT_INTEGRATION**（Phase 2で決定）

### 1.2 テスト対象の範囲

#### ユニットテスト対象
1. **`validateBugCandidate()` メソッド**
   - 言語制限撤廃後の動作確認
   - 除外パターンの正確性検証
   - 既存バリデーションロジックの回帰確認

2. **除外ロジックヘルパー関数**
   - `isExcludedDirectory()` - 除外ディレクトリチェック
   - `isExcludedFile()` - 除外ファイルパターンチェック
   - `matchesWildcard()` - ワイルドカードパターンマッチング

#### インテグレーションテスト対象
1. **多言語リポジトリでのエンドツーエンドテスト**
   - TypeScript, Python, Go, Java, Ruby, Groovy等の検出
   - CI/CD設定ファイル（Jenkinsfile, Dockerfile）の検出

2. **AIエージェントとの統合テスト**
   - プロンプト変更後のバグ検出精度
   - 言語非依存のバグパターン検出

3. **除外パターンの実際動作確認**
   - `node_modules/`, `dist/`, `build/` 等の除外
   - バイナリファイル、生成ファイル、ロックファイルの除外

### 1.3 テストの目的

1. **言語制限撤廃の検証**: TypeScript/Python以外のファイルが正しく検証を通過すること
2. **除外パターンの検証**: 不要なファイルが適切に除外されること
3. **既存機能の保護**: TypeScript/Pythonリポジトリでの動作が維持されること
4. **プロンプト品質の検証**: 言語非依存のバグパターンが正しく検出されること
5. **セキュリティの検証**: パストラバーサル攻撃、ReDoS攻撃が防止されること

---

## 2. ユニットテストシナリオ

### 2.1 `validateBugCandidate()` メソッド - 言語制限撤廃

#### テストケース 2.1.1: Go言語ファイルが検証を通過する（正常系）

- **目的**: 言語制限撤廃後、Go言語（`.go`）ファイルがバリデーションを通過することを検証
- **前提条件**: `validateBugCandidate()` の言語制限コードが削除されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Nil pointer dereference in GetUser",
    file: "src/services/user-service.go",
    line: 42,
    severity: "high",
    description: "GetUser()メソッドでnilポインタデリファレンスが発生する可能性があります。ユーザーが存在しない場合、nilチェックなしでポインタを参照しています。",
    suggestedFix: "nilチェックを追加し、エラーハンドリングを実装してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `true` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.1.2: Java言語ファイルが検証を通過する（正常系）

- **目的**: Java言語（`.java`）ファイルがバリデーションを通過することを検証
- **前提条件**: `validateBugCandidate()` の言語制限コードが削除されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Unclosed resource in FileReader",
    file: "src/main/java/com/example/FileProcessor.java",
    line: 85,
    severity: "medium",
    description: "FileReaderがtry-with-resources構文で管理されておらず、リソースリークの可能性があります。",
    suggestedFix: "try-with-resources構文を使用してFileReaderを自動的にクローズしてください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `true` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.1.3: Rubyファイルが検証を通過する（正常系）

- **目的**: Ruby言語（`.rb`）ファイルがバリデーションを通過することを検証
- **前提条件**: `validateBugCandidate()` の言語制限コードが削除されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Exception not rescued in process_data",
    file: "lib/data_processor.rb",
    line: 23,
    severity: "high",
    description: "process_data()メソッドで例外がrescueされておらず、エラーハンドリングが不足しています。",
    suggestedFix: "begin-rescueブロックを追加し、適切なエラーハンドリングを実装してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `true` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.1.4: Groovyファイルが検証を通過する（正常系）

- **目的**: Groovy言語（`.groovy`）ファイルがバリデーションを通過することを検証
- **前提条件**: `validateBugCandidate()` の言語制限コードが削除されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Command injection in executeShell",
    file: "scripts/deployment.groovy",
    line: 67,
    severity: "high",
    description: "executeShell()でユーザー入力が直接シェルコマンドに渡されており、コマンドインジェクションの可能性があります。",
    suggestedFix: "入力をサニタイズし、パラメータ化されたコマンド実行を使用してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `true` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.1.5: Jenkinsfile（拡張子なし）が検証を通過する（正常系）

- **目的**: 拡張子のないCI/CD設定ファイル（Jenkinsfile）がバリデーションを通過することを検証
- **前提条件**: `validateBugCandidate()` の言語制限コードが削除されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Hardcoded credential in pipeline",
    file: "Jenkinsfile",
    line: 12,
    severity: "high",
    description: "パイプライン定義でクレデンシャルがハードコードされており、セキュリティリスクがあります。",
    suggestedFix: "Jenkins Credentials Pluginを使用して、クレデンシャルを安全に管理してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `true` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.1.6: Dockerfile（拡張子なし）が検証を通過する（正常系）

- **目的**: Dockerfileがバリデーションを通過することを検証
- **前提条件**: `validateBugCandidate()` の言語制限コードが削除されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Root user in production image",
    file: "Dockerfile",
    line: 8,
    severity: "medium",
    description: "本番環境イメージでrootユーザーが使用されており、セキュリティリスクがあります。",
    suggestedFix: "非特権ユーザーを作成し、USERディレクティブで切り替えてください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `true` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.1.7: TypeScriptファイルが引き続き検証を通過する（回帰テスト）

- **目的**: 言語制限撤廃後も、既存のTypeScriptファイルが正しく検証を通過することを確認
- **前提条件**: `validateBugCandidate()` の言語制限コードが削除されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Unhandled promise rejection in fetchData",
    file: "src/services/api-client.ts",
    line: 34,
    severity: "high",
    description: "fetchData()メソッドでPromiseの拒否が適切にハンドリングされておらず、エラーがキャッチされません。",
    suggestedFix: "async/awaitを使用し、try-catchブロックでエラーをハンドリングしてください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `true` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.1.8: Pythonファイルが引き続き検証を通過する（回帰テスト）

- **目的**: 言語制限撤廃後も、既存のPythonファイルが正しく検証を通過することを確認
- **前提条件**: `validateBugCandidate()` の言語制限コードが削除されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "File handle not closed in read_config",
    file: "src/utils/config_loader.py",
    line: 19,
    severity: "medium",
    description: "read_config()でファイルハンドルがクローズされておらず、リソースリークの可能性があります。",
    suggestedFix: "with文を使用して、ファイルハンドルを自動的にクローズしてください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `true` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

---

### 2.2 `validateBugCandidate()` メソッド - 除外パターン

#### テストケース 2.2.1: node_modules/内のファイルが除外される（正常系）

- **目的**: `node_modules/` ディレクトリ内のファイルが除外されることを検証
- **前提条件**: `isExcludedDirectory()` が実装されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Type error in lodash",
    file: "node_modules/lodash/index.js",
    line: 42,
    severity: "high",
    description: "lodashライブラリで型エラーが発生する可能性があります。",
    suggestedFix: "型定義を修正してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す、ログに「excluded directory」が記録される
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.2.2: dist/内のファイルが除外される（正常系）

- **目的**: `dist/` ディレクトリ内のファイルが除外されることを検証
- **前提条件**: `isExcludedDirectory()` が実装されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Minified code issue",
    file: "dist/bundle.min.js",
    line: 1,
    severity: "medium",
    description: "minifiedコードでエラーが発生しています。",
    suggestedFix: "ソースコードを修正してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.2.3: .git/内のファイルが除外される（正常系）

- **目的**: `.git/` ディレクトリ内のファイルが除外されることを検証
- **前提条件**: `isExcludedDirectory()` が実装されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Git object corruption",
    file: ".git/objects/ab/cdef1234567890",
    line: 1,
    severity: "low",
    description: "Gitオブジェクトが破損しています。",
    suggestedFix: "Gitリポジトリを修復してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.2.4: vendor/内のファイルが除外される（正常系）

- **目的**: `vendor/` ディレクトリ内のファイルが除外されることを検証
- **前提条件**: `isExcludedDirectory()` が実装されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Dependency bug in vendor library",
    file: "vendor/github.com/example/lib/main.go",
    line: 25,
    severity: "high",
    description: "vendorライブラリでバグが検出されました。",
    suggestedFix: "ライブラリをアップデートしてください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.2.5: __pycache__/内のファイルが除外される（正常系）

- **目的**: `__pycache__/` ディレクトリ内のファイルが除外されることを検証
- **前提条件**: `isExcludedDirectory()` が実装されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Bytecode issue",
    file: "src/__pycache__/module.cpython-39.pyc",
    line: 1,
    severity: "low",
    description: "バイトコードファイルで問題が検出されました。",
    suggestedFix: "ソースコードを修正してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.2.6: *.min.jsファイルが除外される（正常系）

- **目的**: minifiedファイル（`*.min.js`）が除外されることを検証
- **前提条件**: `isExcludedFile()` が実装されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Error in minified code",
    file: "src/assets/jquery.min.js",
    line: 1,
    severity: "low",
    description: "minifiedコードでエラーが検出されました。",
    suggestedFix: "ソースコードを修正してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.2.7: *.generated.*ファイルが除外される（正常系）

- **目的**: 生成ファイル（`*.generated.*`）が除外されることを検証
- **前提条件**: `isExcludedFile()` が実装されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Error in generated code",
    file: "src/types/api.generated.ts",
    line: 50,
    severity: "medium",
    description: "生成されたコードでエラーが検出されました。",
    suggestedFix: "ジェネレーターを修正してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.2.8: *.pb.go（Protocol Buffer生成ファイル）が除外される（正常系）

- **目的**: Protocol Buffer生成ファイル（`*.pb.go`）が除外されることを検証
- **前提条件**: `isExcludedFile()` が実装されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Error in protobuf code",
    file: "pkg/api/user.pb.go",
    line: 123,
    severity: "low",
    description: "Protocol Buffer生成コードでエラーが検出されました。",
    suggestedFix: ".protoファイルを修正して再生成してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.2.9: package-lock.json（ロックファイル）が除外される（正常系）

- **目的**: ロックファイル（`package-lock.json`）が除外されることを検証
- **前提条件**: `isExcludedFile()` が実装されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Dependency version conflict",
    file: "package-lock.json",
    line: 456,
    severity: "medium",
    description: "依存関係のバージョン競合が検出されました。",
    suggestedFix: "package.jsonを修正してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.2.10: go.sum（ロックファイル）が除外される（正常系）

- **目的**: Goロックファイル（`go.sum`）が除外されることを検証
- **前提条件**: `isExcludedFile()` が実装されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Checksum mismatch",
    file: "go.sum",
    line: 89,
    severity: "low",
    description: "チェックサム不一致が検出されました。",
    suggestedFix: "go mod tidyを実行してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.2.11: .pngファイル（バイナリ）が除外される（正常系）

- **目的**: バイナリファイル（`.png`）が除外されることを検証
- **前提条件**: `isExcludedFile()` が実装されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Image corruption",
    file: "assets/logo.png",
    line: 1,
    severity: "low",
    description: "画像ファイルが破損しています。",
    suggestedFix: "画像を再生成してください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.2.12: .exeファイル（バイナリ）が除外される（正常系）

- **目的**: 実行ファイル（`.exe`）が除外されることを検証
- **前提条件**: `isExcludedFile()` が実装されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Malware detected",
    file: "bin/application.exe",
    line: 1,
    severity: "high",
    description: "実行ファイルでマルウェアが検出されました。",
    suggestedFix: "ソースコードをレビューしてください。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

---

### 2.3 ヘルパー関数 - `isExcludedDirectory()`

#### テストケース 2.3.1: node_modules/を含むパスが除外される（正常系）

- **目的**: `node_modules/` を含むパスが除外されることを検証
- **前提条件**: `isExcludedDirectory()` が実装されている
- **入力**: `"project/node_modules/lodash/index.js"`
- **期待結果**: `isExcludedDirectory("project/node_modules/lodash/index.js")` が `true` を返す
- **テストデータ**: 上記文字列

#### テストケース 2.3.2: パス正規化が正しく動作する（Windowsスタイル）

- **目的**: Windows形式のパス（バックスラッシュ）が正しく正規化されることを検証
- **前提条件**: `isExcludedDirectory()` が実装されている
- **入力**: `"project\\node_modules\\lodash\\index.js"`
- **期待結果**: `isExcludedDirectory("project\\node_modules\\lodash\\index.js")` が `true` を返す
- **テストデータ**: 上記文字列

#### テストケース 2.3.3: パストラバーサル攻撃が防止される（異常系）

- **目的**: `../` を含む相対パスが除外されることを検証（セキュリティ対策）
- **前提条件**: `isExcludedDirectory()` にパストラバーサル防止ロジックが実装されている
- **入力**: `"../../node_modules/lodash/index.js"`
- **期待結果**: `isExcludedDirectory("../../node_modules/lodash/index.js")` が `true` を返す、ログに警告が記録される
- **テストデータ**: 上記文字列

#### テストケース 2.3.4: 通常のファイルパスが除外されない（正常系）

- **目的**: 除外ディレクトリを含まないパスが除外されないことを検証
- **前提条件**: `isExcludedDirectory()` が実装されている
- **入力**: `"src/services/user-service.ts"`
- **期待結果**: `isExcludedDirectory("src/services/user-service.ts")` が `false` を返す
- **テストデータ**: 上記文字列

#### テストケース 2.3.5: 複数の除外ディレクトリがチェックされる（正常系）

- **目的**: `vendor/`, `dist/`, `build/` 等の複数の除外ディレクトリが正しくチェックされることを検証
- **前提条件**: `isExcludedDirectory()` が実装されている
- **入力**:
  - `"vendor/github.com/lib/main.go"`
  - `"dist/bundle.js"`
  - `"build/output/app.js"`
- **期待結果**: すべて `true` を返す
- **テストデータ**: 上記3つの文字列

---

### 2.4 ヘルパー関数 - `isExcludedFile()`

#### テストケース 2.4.1: *.min.jsパターンが正しくマッチする（正常系）

- **目的**: `*.min.js` パターンにマッチするファイルが除外されることを検証
- **前提条件**: `isExcludedFile()` と `matchesWildcard()` が実装されている
- **入力**: `"src/assets/jquery.min.js"`
- **期待結果**: `isExcludedFile("src/assets/jquery.min.js")` が `true` を返す
- **テストデータ**: 上記文字列

#### テストケース 2.4.2: *.bundle.jsパターンが正しくマッチする（正常系）

- **目的**: `*.bundle.js` パターンにマッチするファイルが除外されることを検証
- **前提条件**: `isExcludedFile()` と `matchesWildcard()` が実装されている
- **入力**: `"dist/main.bundle.js"`
- **期待結果**: `isExcludedFile("dist/main.bundle.js")` が `true` を返す
- **テストデータ**: 上記文字列

#### テストケース 2.4.3: *.generated.*パターンが正しくマッチする（正常系）

- **目的**: `*.generated.*` パターンにマッチするファイルが除外されることを検証
- **前提条件**: `isExcludedFile()` と `matchesWildcard()` が実装されている
- **入力**: `"src/types/api.generated.ts"`
- **期待結果**: `isExcludedFile("src/types/api.generated.ts")` が `true` を返す
- **テストデータ**: 上記文字列

#### テストケース 2.4.4: ロックファイル名が完全一致する（正常系）

- **目的**: ロックファイル名（`package-lock.json` 等）が完全一致で除外されることを検証
- **前提条件**: `isExcludedFile()` が実装されている
- **入力**:
  - `"package-lock.json"`
  - `"yarn.lock"`
  - `"Gemfile.lock"`
- **期待結果**: すべて `true` を返す
- **テストデータ**: 上記3つの文字列

#### テストケース 2.4.5: バイナリ拡張子が除外される（正常系）

- **目的**: バイナリファイル拡張子（`.png`, `.exe` 等）が除外されることを検証
- **前提条件**: `isExcludedFile()` が実装されている
- **入力**:
  - `"assets/logo.png"`
  - `"bin/app.exe"`
  - `"lib/libfoo.so"`
- **期待結果**: すべて `true` を返す
- **テストデータ**: 上記3つの文字列

#### テストケース 2.4.6: 通常のソースファイルが除外されない（正常系）

- **目的**: 除外パターンに該当しない通常のソースファイルが除外されないことを検証
- **前提条件**: `isExcludedFile()` が実装されている
- **入力**: `"src/services/user-service.ts"`
- **期待結果**: `isExcludedFile("src/services/user-service.ts")` が `false` を返す
- **テストデータ**: 上記文字列

---

### 2.5 ヘルパー関数 - `matchesWildcard()`

#### テストケース 2.5.1: *.min.jsパターンが正しくマッチする（正常系）

- **目的**: `*.min.js` パターンが `jquery.min.js` にマッチすることを検証
- **前提条件**: `matchesWildcard()` が実装されている
- **入力**: `fileName = "jquery.min.js"`, `pattern = "*.min.js"`
- **期待結果**: `matchesWildcard("jquery.min.js", "*.min.js")` が `true` を返す
- **テストデータ**: 上記文字列

#### テストケース 2.5.2: *.generated.*パターンが正しくマッチする（正常系）

- **目的**: `*.generated.*` パターンが `api.generated.ts` にマッチすることを検証
- **前提条件**: `matchesWildcard()` が実装されている
- **入力**: `fileName = "api.generated.ts"`, `pattern = "*.generated.*"`
- **期待結果**: `matchesWildcard("api.generated.ts", "*.generated.*")` が `true` を返す
- **テストデータ**: 上記文字列

#### テストケース 2.5.3: パターンにマッチしない場合はfalseを返す（正常系）

- **目的**: パターンにマッチしないファイル名の場合、`false` が返されることを検証
- **前提条件**: `matchesWildcard()` が実装されている
- **入力**: `fileName = "user-service.ts"`, `pattern = "*.min.js"`
- **期待結果**: `matchesWildcard("user-service.ts", "*.min.js")` が `false` を返す
- **テストデータ**: 上記文字列

#### テストケース 2.5.4: ReDoS攻撃が防止される（セキュリティテスト）

- **目的**: 正規表現のReDoS攻撃が防止されることを検証（`replaceAll()` 使用）
- **前提条件**: `matchesWildcard()` が `replaceAll()` を使用している
- **入力**: `fileName = "a".repeat(1000) + ".js"`, `pattern = "*.min.js"`
- **期待結果**: `matchesWildcard(fileName, pattern)` が1秒以内に完了する（タイムアウトなし）
- **テストデータ**: 上記文字列

---

### 2.6 既存バリデーションロジックの回帰テスト

#### テストケース 2.6.1: タイトルが10文字未満の場合は拒否される（異常系）

- **目的**: 既存のタイトル長バリデーションが機能していることを確認
- **前提条件**: `validateBugCandidate()` のタイトル長チェックが保持されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Short",
    file: "src/test.ts",
    line: 10,
    severity: "high",
    description: "これは50文字以上の説明文です。これは50文字以上の説明文です。これは50文字以上の説明文です。",
    suggestedFix: "これは20文字以上の修正案です。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.6.2: 深刻度が不正な値の場合は拒否される（異常系）

- **目的**: 既存の深刻度バリデーションが機能していることを確認
- **前提条件**: `validateBugCandidate()` の深刻度チェックが保持されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Valid title here",
    file: "src/test.ts",
    line: 10,
    severity: "critical" as any,  // 不正な値
    description: "これは50文字以上の説明文です。これは50文字以上の説明文です。これは50文字以上の説明文です。",
    suggestedFix: "これは20文字以上の修正案です。",
    category: "bug"
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

#### テストケース 2.6.3: カテゴリが'bug'以外の場合は拒否される（異常系）

- **目的**: 既存のカテゴリバリデーションが機能していることを確認（Phase 1では'bug'のみ）
- **前提条件**: `validateBugCandidate()` のカテゴリチェックが保持されている
- **入力**:
  ```typescript
  const candidate: BugCandidate = {
    title: "Valid title here",
    file: "src/test.ts",
    line: 10,
    severity: "high",
    description: "これは50文字以上の説明文です。これは50文字以上の説明文です。これは50文字以上の説明文です。",
    suggestedFix: "これは20文字以上の修正案です。",
    category: "refactor" as any
  };
  ```
- **期待結果**: `validateBugCandidate(candidate)` が `false` を返す
- **テストデータ**: 上記 `candidate` オブジェクト

---

## 3. インテグレーションテストシナリオ

### 3.1 多言語リポジトリでのエンドツーエンドテスト

#### シナリオ 3.1.1: TypeScript + Go + Java混在リポジトリでの検出

- **目的**: 複数の言語が混在するリポジトリで、すべての言語のファイルがバグ検出対象になることを検証
- **前提条件**:
  - テスト用の多言語リポジトリが用意されている
  - TypeScript（`.ts`）、Go（`.go`）、Java（`.java`）ファイルが含まれる
  - 各ファイルに意図的なバグ（エラーハンドリング欠如等）を仕込む

- **テスト手順**:
  1. テスト用リポジトリを準備（3つの言語のファイルを含む）
  2. `auto-issue` コマンドを実行: `ai-workflow-agent auto-issue --repo-path ./test-repo --agent codex`
  3. AIエージェントがリポジトリを解析
  4. バグ候補JSON出力ファイルが生成される
  5. `validateBugCandidate()` がすべての言語のバグ候補を検証
  6. 有効なバグ候補がフィルタリングされる

- **期待結果**:
  - TypeScriptファイルのバグ候補が検出される
  - Goファイルのバグ候補が検出される
  - Javaファイルのバグ候補が検出される
  - すべてのバグ候補が `validateBugCandidate()` を通過する
  - 最終的に3つ以上のバグ候補が報告される

- **確認項目**:
  - [ ] TypeScript（`.ts`）ファイルがバグ検出対象に含まれている
  - [ ] Go（`.go`）ファイルがバグ検出対象に含まれている
  - [ ] Java（`.java`）ファイルがバグ検出対象に含まれている
  - [ ] バリデーションでいずれの言語も拒否されていない
  - [ ] 各言語のバグ候補が正しくJSONに出力されている

#### シナリオ 3.1.2: Python + Ruby + PHPリポジトリでの検出

- **目的**: スクリプト言語が混在するリポジトリで、すべての言語のファイルがバグ検出対象になることを検証
- **前提条件**:
  - テスト用リポジトリが用意されている
  - Python（`.py`）、Ruby（`.rb`）、PHP（`.php`）ファイルが含まれる

- **テスト手順**:
  1. テスト用リポジトリを準備（3つの言語のファイルを含む）
  2. `auto-issue` コマンドを実行
  3. AIエージェントがリポジトリを解析
  4. バグ候補が検出される

- **期待結果**:
  - Pythonファイルのバグ候補が検出される
  - Rubyファイルのバグ候補が検出される
  - PHPファイルのバグ候補が検出される

- **確認項目**:
  - [ ] Python（`.py`）ファイルがバグ検出対象に含まれている
  - [ ] Ruby（`.rb`）ファイルがバグ検出対象に含まれている
  - [ ] PHP（`.php`）ファイルがバグ検出対象に含まれている

#### シナリオ 3.1.3: CI/CD設定ファイル（Jenkinsfile, Dockerfile）の検出

- **目的**: 拡張子のないCI/CD設定ファイルがバグ検出対象になることを検証
- **前提条件**:
  - テスト用リポジトリが用意されている
  - Jenkinsfile, Dockerfile, Makefileが含まれる
  - 各ファイルに意図的なバグ（ハードコードされたクレデンシャル等）を仕込む

- **テスト手順**:
  1. テスト用リポジトリを準備（Jenkinsfile, Dockerfile, Makefileを含む）
  2. `auto-issue` コマンドを実行
  3. AIエージェントがリポジトリを解析
  4. バグ候補が検出される

- **期待結果**:
  - Jenkinsfileのバグ候補が検出される
  - Dockerfileのバグ候補が検出される
  - Makefileのバグ候補が検出される

- **確認項目**:
  - [ ] Jenkinsfileがバグ検出対象に含まれている
  - [ ] Dockerfileがバグ検出対象に含まれている
  - [ ] Makefileがバグ検出対象に含まれている
  - [ ] セキュリティ関連のバグ（ハードコードされたクレデンシャル等）が検出されている

---

### 3.2 除外パターンの実際動作確認

#### シナリオ 3.2.1: node_modules/配下のファイルが除外される

- **目的**: `node_modules/` ディレクトリ内のファイルが実際に除外されることを検証
- **前提条件**:
  - テスト用リポジトリが用意されている
  - `node_modules/` ディレクトリが存在し、依存ライブラリが含まれる

- **テスト手順**:
  1. テスト用リポジトリを準備（`node_modules/lodash/`, `node_modules/express/` 等を含む）
  2. `auto-issue` コマンドを実行
  3. AIエージェントがリポジトリを解析
  4. バグ候補が検出される（`node_modules/` は除外される）
  5. 最終的なバグ候補リストを確認

- **期待結果**:
  - `node_modules/` 配下のファイルがバグ候補に含まれていない
  - ログに「excluded directory」が記録されている（`node_modules/`）

- **確認項目**:
  - [ ] バグ候補リストに `node_modules/` 配下のファイルが含まれていない
  - [ ] ログに除外ディレクトリとして `node_modules/` が記録されている
  - [ ] `src/` 等の通常ディレクトリのファイルは検出されている

#### シナリオ 3.2.2: dist/, build/配下の生成ファイルが除外される

- **目的**: `dist/`, `build/` ディレクトリ内の生成ファイルが除外されることを検証
- **前提条件**:
  - テスト用リポジトリが用意されている
  - `dist/`, `build/` ディレクトリが存在し、minifiedファイル等が含まれる

- **テスト手順**:
  1. テスト用リポジトリを準備（`dist/bundle.min.js`, `build/output.js` 等を含む）
  2. `auto-issue` コマンドを実行
  3. AIエージェントがリポジトリを解析
  4. バグ候補が検出される（`dist/`, `build/` は除外される）

- **期待結果**:
  - `dist/`, `build/` 配下のファイルがバグ候補に含まれていない

- **確認項目**:
  - [ ] バグ候補リストに `dist/` 配下のファイルが含まれていない
  - [ ] バグ候補リストに `build/` 配下のファイルが含まれていない

#### シナリオ 3.2.3: バイナリファイル（.png, .exe）が除外される

- **目的**: バイナリファイルが除外されることを検証
- **前提条件**:
  - テスト用リポジトリが用意されている
  - `.png`, `.jpg`, `.exe`, `.dll` 等のバイナリファイルが含まれる

- **テスト手順**:
  1. テスト用リポジトリを準備（`assets/logo.png`, `bin/app.exe` 等を含む）
  2. `auto-issue` コマンドを実行
  3. AIエージェントがリポジトリを解析
  4. バグ候補が検出される（バイナリファイルは除外される）

- **期待結果**:
  - バイナリファイルがバグ候補に含まれていない

- **確認項目**:
  - [ ] バグ候補リストに `.png` ファイルが含まれていない
  - [ ] バグ候補リストに `.exe` ファイルが含まれていない

#### シナリオ 3.2.4: ロックファイル（package-lock.json, go.sum）が除外される

- **目的**: ロックファイルが除外されることを検証
- **前提条件**:
  - テスト用リポジトリが用意されている
  - `package-lock.json`, `yarn.lock`, `go.sum` 等のロックファイルが含まれる

- **テスト手順**:
  1. テスト用リポジトリを準備（ロックファイルを含む）
  2. `auto-issue` コマンドを実行
  3. AIエージェントがリポジトリを解析
  4. バグ候補が検出される（ロックファイルは除外される）

- **期待結果**:
  - ロックファイルがバグ候補に含まれていない

- **確認項目**:
  - [ ] バグ候補リストに `package-lock.json` が含まれていない
  - [ ] バグ候補リストに `go.sum` が含まれていない

---

### 3.3 AIエージェントとの統合テスト

#### シナリオ 3.3.1: プロンプト変更後のバグ検出精度検証（Codexエージェント）

- **目的**: 言語非依存のプロンプトで、Codexエージェントが多言語のバグを正しく検出できることを検証
- **前提条件**:
  - `detect-bugs.txt` プロンプトが言語非依存形式に更新されている
  - Codexエージェント（`gpt-5-codex`）が利用可能

- **テスト手順**:
  1. テスト用リポジトリを準備（TypeScript, Python, Go, Javaファイルを含む）
  2. 各ファイルに意図的なバグを仕込む:
     - TypeScript: Promiseの未処理拒否
     - Python: ファイルハンドルの未クローズ
     - Go: エラー返り値の無視
     - Java: リソースリーク（try-with-resources不使用）
  3. `auto-issue --agent codex` を実行
  4. Codexエージェントがプロンプトに基づいてバグを検出
  5. バグ候補JSONが出力される

- **期待結果**:
  - 4つのバグ候補が検出される（各言語1つずつ）
  - バグ候補のタイトルが言語非依存の形式（例: "Unhandled promise rejection in fetchData"）
  - 検出精度が既存のTypeScript/Python限定時と同等以上

- **確認項目**:
  - [ ] TypeScriptのPromise未処理拒否が検出されている
  - [ ] Pythonのファイルハンドル未クローズが検出されている
  - [ ] Goのエラー返り値無視が検出されている
  - [ ] Javaのリソースリークが検出されている
  - [ ] バグ候補のタイトル・説明が言語非依存の形式である

#### シナリオ 3.3.2: プロンプト変更後のバグ検出精度検証（Claudeエージェント）

- **目的**: 言語非依存のプロンプトで、Claudeエージェントが多言語のバグを正しく検出できることを検証
- **前提条件**:
  - `detect-bugs.txt` プロンプトが言語非依存形式に更新されている
  - Claudeエージェント（`claude-3-sonnet-20240229`）が利用可能

- **テスト手順**:
  1. テスト用リポジトリを準備（TypeScript, Python, Go, Rubyファイルを含む）
  2. 各ファイルに意図的なバグを仕込む
  3. `auto-issue --agent claude` を実行
  4. Claudeエージェントがプロンプトに基づいてバグを検出
  5. バグ候補JSONが出力される

- **期待結果**:
  - 4つのバグ候補が検出される（各言語1つずつ）
  - 検出精度がCodexエージェントと同等

- **確認項目**:
  - [ ] 各言語のバグが正しく検出されている
  - [ ] バグ候補のフォーマットが正しい（必須フィールドがすべて存在）

#### シナリオ 3.3.3: 除外パターンがプロンプトで正しく指示される

- **目的**: AIエージェントがプロンプトの除外パターン指示に従って、不要なファイルを検出対象から除外することを検証
- **前提条件**:
  - `detect-bugs.txt` プロンプトに除外パターンセクションが追加されている
  - テスト用リポジトリに `node_modules/`, `dist/`, バイナリファイルが含まれる

- **テスト手順**:
  1. テスト用リポジトリを準備（通常ファイル + 除外対象ファイルを含む）
  2. `auto-issue` コマンドを実行
  3. AIエージェントがプロンプトに基づいてリポジトリを解析
  4. バグ候補JSONが出力される
  5. 除外対象ファイルのバグ候補が含まれていないことを確認

- **期待結果**:
  - `node_modules/` 配下のファイルのバグ候補が含まれていない
  - `dist/` 配下のファイルのバグ候補が含まれていない
  - バイナリファイルのバグ候補が含まれていない
  - 通常のソースファイルのバグ候補は正しく検出されている

- **確認項目**:
  - [ ] AIエージェントが除外パターンを正しく理解している
  - [ ] バグ候補JSONに除外対象ファイルが含まれていない

---

### 3.4 既存機能の保護（回帰テスト）

#### シナリオ 3.4.1: TypeScriptのみのリポジトリでの動作確認

- **目的**: 既存のTypeScriptリポジトリで、言語制限撤廃後も正常にバグ検出が動作することを検証
- **前提条件**:
  - 既存のTypeScriptリポジトリ（Issue #126のテストリポジトリ等）が存在する
  - 以前のバージョンで検出されたバグ候補のリストが存在する

- **テスト手順**:
  1. 既存のTypeScriptリポジトリで `auto-issue` を実行
  2. バグ候補が検出される
  3. 以前のバージョンの検出結果と比較

- **期待結果**:
  - バグ候補の検出数が以前と同等以上
  - 検出されたバグ候補の内容が以前と同等
  - 既存のユニットテスト・インテグレーションテストがすべてパス

- **確認項目**:
  - [ ] バグ候補が正しく検出されている
  - [ ] 検出数が以前より減少していない
  - [ ] 既存テストがすべてパスしている

#### シナリオ 3.4.2: Pythonのみのリポジトリでの動作確認

- **目的**: 既存のPythonリポジトリで、言語制限撤廃後も正常にバグ検出が動作することを検証
- **前提条件**:
  - 既存のPythonリポジトリが存在する

- **テスト手順**:
  1. 既存のPythonリポジトリで `auto-issue` を実行
  2. バグ候補が検出される
  3. 以前のバージョンの検出結果と比較

- **期待結果**:
  - バグ候補の検出数が以前と同等以上
  - 検出されたバグ候補の内容が以前と同等

- **確認項目**:
  - [ ] バグ候補が正しく検出されている
  - [ ] 検出数が以前より減少していない

---

## 4. テストデータ

### 4.1 ユニットテスト用テストデータ

#### 4.1.1 有効なBugCandidateオブジェクト（多言語）

```typescript
const validCandidates: BugCandidate[] = [
  // Go
  {
    title: "Nil pointer dereference in GetUser",
    file: "src/services/user-service.go",
    line: 42,
    severity: "high",
    description: "GetUser()メソッドでnilポインタデリファレンスが発生する可能性があります。ユーザーが存在しない場合、nilチェックなしでポインタを参照しています。",
    suggestedFix: "nilチェックを追加し、エラーハンドリングを実装してください。",
    category: "bug"
  },
  // Java
  {
    title: "Unclosed resource in FileReader",
    file: "src/main/java/com/example/FileProcessor.java",
    line: 85,
    severity: "medium",
    description: "FileReaderがtry-with-resources構文で管理されておらず、リソースリークの可能性があります。",
    suggestedFix: "try-with-resources構文を使用してFileReaderを自動的にクローズしてください。",
    category: "bug"
  },
  // Ruby
  {
    title: "Exception not rescued in process_data",
    file: "lib/data_processor.rb",
    line: 23,
    severity: "high",
    description: "process_data()メソッドで例外がrescueされておらず、エラーハンドリングが不足しています。",
    suggestedFix: "begin-rescueブロックを追加し、適切なエラーハンドリングを実装してください。",
    category: "bug"
  },
  // Jenkinsfile
  {
    title: "Hardcoded credential in pipeline",
    file: "Jenkinsfile",
    line: 12,
    severity: "high",
    description: "パイプライン定義でクレデンシャルがハードコードされており、セキュリティリスクがあります。",
    suggestedFix: "Jenkins Credentials Pluginを使用して、クレデンシャルを安全に管理してください。",
    category: "bug"
  }
];
```

#### 4.1.2 除外すべきBugCandidateオブジェクト

```typescript
const excludedCandidates: BugCandidate[] = [
  // node_modules/
  {
    title: "Type error in lodash",
    file: "node_modules/lodash/index.js",
    line: 42,
    severity: "high",
    description: "lodashライブラリで型エラーが発生する可能性があります。",
    suggestedFix: "型定義を修正してください。",
    category: "bug"
  },
  // dist/
  {
    title: "Minified code issue",
    file: "dist/bundle.min.js",
    line: 1,
    severity: "medium",
    description: "minifiedコードでエラーが発生しています。",
    suggestedFix: "ソースコードを修正してください。",
    category: "bug"
  },
  // バイナリファイル
  {
    title: "Image corruption",
    file: "assets/logo.png",
    line: 1,
    severity: "low",
    description: "画像ファイルが破損しています。",
    suggestedFix: "画像を再生成してください。",
    category: "bug"
  },
  // ロックファイル
  {
    title: "Dependency version conflict",
    file: "package-lock.json",
    line: 456,
    severity: "medium",
    description: "依存関係のバージョン競合が検出されました。",
    suggestedFix: "package.jsonを修正してください。",
    category: "bug"
  }
];
```

### 4.2 インテグレーションテスト用テストリポジトリ

#### 4.2.1 多言語リポジトリ構成例

```
test-multi-lang-repo/
├── src/
│   ├── typescript/
│   │   └── api-client.ts        # Promiseの未処理拒否
│   ├── go/
│   │   └── user-service.go      # エラー返り値の無視
│   ├── java/
│   │   └── FileProcessor.java   # リソースリーク
│   └── ruby/
│       └── data_processor.rb    # Exception未処理
├── Jenkinsfile                   # ハードコードされたクレデンシャル
├── Dockerfile                    # rootユーザー使用
├── node_modules/                 # 除外対象
│   └── lodash/
│       └── index.js
├── dist/                         # 除外対象
│   └── bundle.min.js
├── package-lock.json             # 除外対象
└── assets/                       # 除外対象（バイナリ）
    └── logo.png
```

---

## 5. テスト環境要件

### 5.1 必要なテスト環境

- **ローカル開発環境**:
  - Node.js 20以上
  - TypeScript 5.x
  - Jest（テストフレームワーク）

- **CI/CD環境**:
  - Jenkins（GitHub Actionsでも可）
  - 自動テスト実行環境

### 5.2 必要な外部サービス

- **AIエージェント**:
  - Codexエージェント（`gpt-5-codex`）: インテグレーションテストで使用
  - Claudeエージェント（`claude-3-sonnet-20240229`）: インテグレーションテストで使用

- **GitHub API**:
  - Issue作成テスト用（オプション、ドライラン可能）

### 5.3 モック/スタブの必要性

#### ユニットテスト
- **モック不要**: `validateBugCandidate()` は純粋関数であり、外部依存なし
- **スタブ不要**: ヘルパー関数（`isExcludedDirectory()` 等）も外部依存なし

#### インテグレーションテスト
- **AIエージェントのモック**: 不要（実際のエージェントAPIを使用）
- **GitHub APIのモック**: 推奨（Issue作成時のAPI呼び出しをモック化し、実際のIssue作成を回避）

---

## 6. 品質ゲート（Phase 3）

本テストシナリオは、以下の品質ゲートを満たしていることを確認しました：

### ✅ Phase 2の戦略に沿ったテストシナリオである

- **テスト戦略**: UNIT_INTEGRATION（Phase 2で決定）
- **対応**: セクション2でユニットテストシナリオ、セクション3でインテグレーションテストシナリオを作成

### ✅ 主要な正常系がカバーされている

**ユニットテスト正常系**:
- Go, Java, Ruby, Groovy, Jenkinsfile, Dockerfileの言語制限撤廃（テストケース 2.1.1〜2.1.6）
- TypeScript/Pythonの回帰テスト（テストケース 2.1.7〜2.1.8）

**インテグレーションテスト正常系**:
- 多言語リポジトリでのエンドツーエンドテスト（シナリオ 3.1.1〜3.1.3）
- 既存機能の保護（シナリオ 3.4.1〜3.4.2）

### ✅ 主要な異常系がカバーされている

**ユニットテスト異常系**:
- 除外パターン（node_modules/, dist/, .git/ 等）の検証（テストケース 2.2.1〜2.2.12）
- パストラバーサル攻撃の防止（テストケース 2.3.3）
- ReDoS攻撃の防止（テストケース 2.5.4）
- 既存バリデーションロジックの異常系（テストケース 2.6.1〜2.6.3）

**インテグレーションテスト異常系**:
- 除外パターンの実際動作確認（シナリオ 3.2.1〜3.2.4）

### ✅ 期待結果が明確である

- すべてのテストケースに「期待結果」セクションを記載
- すべてのインテグレーションシナリオに「確認項目」チェックリストを記載
- 検証可能な指標を明記（例: `validateBugCandidate(candidate)` が `true` を返す）

---

## 7. ブロッカー確認

次フェーズ（Phase 4: Implementation）に進む前に、以下のブロッカーがないことを確認しました：

- [x] **Phase 2のテスト戦略に準拠している**（UNIT_INTEGRATION）
- [x] **主要な正常系がカバーされている**（言語制限撤廃、多言語検出）
- [x] **主要な異常系がカバーされている**（除外パターン、セキュリティ対策）
- [x] **期待結果が明確である**（すべてのテストケース・シナリオに記載）
- [x] **テストデータが準備されている**（セクション4）
- [x] **テスト環境要件が明確である**（セクション5）
- [x] **実行可能なテストシナリオである**（曖昧な表現なし、具体的な入力・出力）

**ブロッカーなし**: 次フェーズ（Phase 4: Implementation）に進む準備が整っています。

---

## 8. 受け入れ基準との対応

本テストシナリオが、Issue #144の受け入れ基準をすべてカバーしていることを確認します：

| 受け入れ基準 | 対応するテストケース/シナリオ | カバー状況 |
|------------|---------------------------|----------|
| TypeScript/Python以外のファイル（Go, Java, Ruby, Groovy等）でもバグ候補が検出される | テストケース 2.1.1〜2.1.4、シナリオ 3.1.1〜3.1.2 | ✅ |
| Jenkinsfile、Dockerfile等のCI/CD設定ファイルも対象となる | テストケース 2.1.5〜2.1.6、シナリオ 3.1.3 | ✅ |
| バイナリファイルやnode_modules等の不要なファイルは除外される | テストケース 2.2.1〜2.2.12、シナリオ 3.2.1〜3.2.4 | ✅ |
| 既存のTypeScript/Pythonリポジトリでの動作が維持される | テストケース 2.1.7〜2.1.8、シナリオ 3.4.1〜3.4.2 | ✅ |
| プロンプトが言語非依存の形式に更新されている | シナリオ 3.3.1〜3.3.2 | ✅ |
| CLAUDE.mdのドキュメントが更新されている | （Phase 7: Documentation で実施、テストシナリオ対象外） | N/A |

**すべての受け入れ基準がテストシナリオでカバーされています。**

---

## 9. 注意事項

### 9.1 テスト実施時の注意点

1. **AIエージェントのAPI制限**: インテグレーションテストでは実際のAIエージェントAPIを使用するため、APIレート制限に注意してください。
2. **テスト実行時間**: インテグレーションテストは時間がかかるため、ユニットテストを先に実行し、問題がないことを確認してからインテグレーションテストを実施してください。
3. **テストデータの管理**: テスト用リポジトリはバージョン管理し、再現可能なテスト環境を維持してください。

### 9.2 テストカバレッジ目標

- **ユニットテスト**: カバレッジ90%以上を目標
- **インテグレーションテスト**: 主要なエンドツーエンドフローをすべてカバー

### 9.3 テスト優先度

**高優先度**:
- 言語制限撤廃の検証（テストケース 2.1.1〜2.1.6）
- 除外パターンの検証（テストケース 2.2.1〜2.2.12）
- 多言語リポジトリでのエンドツーエンドテスト（シナリオ 3.1.1〜3.1.3）

**中優先度**:
- セキュリティ対策の検証（テストケース 2.3.3, 2.5.4）
- プロンプト変更後のバグ検出精度検証（シナリオ 3.3.1〜3.3.2）

**低優先度**:
- 既存バリデーションロジックの異常系（テストケース 2.6.1〜2.6.3）: 既存機能の回帰テストのため

---

**テストシナリオ作成者**: AI Workflow Agent
**レビュー状態**: Pending Review
**最終更新日**: 2025-01-30
