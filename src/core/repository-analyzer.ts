import { Project, SyntaxKind, type SourceFile } from 'ts-morph';
import { logger } from '../utils/logger.js';
import { IssueCategory, type IssueCandidateResult } from '../types.js';
import path from 'node:path';

/**
 * リポジトリ探索エンジン
 * Phase 1 (MVP): バグ検出機能のみ実装
 */
export class RepositoryAnalyzer {
  private project: Project;
  private repoRoot: string;

  constructor(repoRoot?: string) {
    this.repoRoot = repoRoot ?? process.cwd();

    try {
      this.project = new Project({
        tsConfigFilePath: path.join(this.repoRoot, 'tsconfig.json'),
      });

      // プロジェクトにソースファイルを追加
      this.project.addSourceFilesAtPaths('src/**/*.ts');
      logger.debug(`Loaded ${this.project.getSourceFiles().length} TypeScript files.`);
    } catch (error) {
      // tsconfig.jsonが存在しない場合は、デフォルト設定でプロジェクトを作成
      logger.warn('tsconfig.json not found. Using default TypeScript configuration.');
      this.project = new Project();
      this.project.addSourceFilesAtPaths(path.join(this.repoRoot, 'src/**/*.ts'));
      logger.debug(`Loaded ${this.project.getSourceFiles().length} TypeScript files.`);
    }
  }

  /**
   * Phase 1 (MVP): 潜在的なバグを検出
   * @returns Issue候補の配列
   */
  public async analyzeForBugs(): Promise<IssueCandidateResult[]> {
    logger.info('Analyzing repository for potential bugs...');
    const candidates: IssueCandidateResult[] = [];

    const sourceFiles = this.project.getSourceFiles();
    for (const sourceFile of sourceFiles) {
      // 1. エラーハンドリングの欠如
      candidates.push(...this.detectMissingErrorHandling(sourceFile));

      // 2. 型安全性の問題
      candidates.push(...this.detectTypeSafetyIssues(sourceFile));

      // 3. リソースリーク
      candidates.push(...this.detectResourceLeaks(sourceFile));
    }

    logger.info(`Detected ${candidates.length} potential bugs.`);
    return candidates;
  }

  /**
   * エラーハンドリングの欠如を検出
   */
  private detectMissingErrorHandling(sourceFile: SourceFile): IssueCandidateResult[] {
    const candidates: IssueCandidateResult[] = [];

    // 非同期関数を取得
    const asyncFunctions = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction).filter((fn) => fn.isAsync()),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).filter((fn) => fn.isAsync()),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration).filter((fn) => fn.isAsync()),
    ];

    for (const fn of asyncFunctions) {
      // try-catchブロックの有無をチェック
      const hasTryCatch = fn.getDescendantsOfKind(SyntaxKind.TryStatement).length > 0;

      if (!hasTryCatch) {
        const filePath = sourceFile.getFilePath();
        const lineNumber = fn.getStartLineNumber();
        // ArrowFunction doesn't have getName(), so we need to handle it differently
        const fnName =
          fn.getKind() === SyntaxKind.ArrowFunction
            ? '<anonymous>'
            : (fn as any).getName?.() ?? '<anonymous>';
        const codeSnippet = this.extractCodeSnippet(sourceFile, lineNumber);

        candidates.push({
          category: IssueCategory.BUG,
          title: `エラーハンドリングの欠如: ${fnName}() in ${path.basename(filePath)}`,
          description: `非同期関数 ${fnName}() でtry-catchが使用されていません。予期しないエラーが発生した場合、アプリケーションがクラッシュする可能性があります。`,
          file: filePath,
          lineNumber,
          codeSnippet,
          confidence: 0.95,
          suggestedFixes: [
            'try-catchブロックで非同期関数を囲む',
            'エラーをキャッチして適切なログを出力する',
            'エラーを上位の呼び出し元に伝播させる',
          ],
          expectedBenefits: [
            'アプリケーションの安定性向上',
            'エラー発生時のデバッグが容易に',
            '予期しないクラッシュの防止',
          ],
          priority: 'High',
        });
      }
    }

    return candidates;
  }

  /**
   * 型安全性の問題を検出
   */
  private detectTypeSafetyIssues(sourceFile: SourceFile): IssueCandidateResult[] {
    const candidates: IssueCandidateResult[] = [];

    // `any`型の使用箇所を検出
    const variableDeclarations = sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    for (const varDecl of variableDeclarations) {
      const typeNode = varDecl.getTypeNode();
      if (typeNode && typeNode.getText() === 'any') {
        const filePath = sourceFile.getFilePath();
        const lineNumber = varDecl.getStartLineNumber();
        const varName = varDecl.getName();
        const codeSnippet = this.extractCodeSnippet(sourceFile, lineNumber);

        candidates.push({
          category: IssueCategory.BUG,
          title: `型安全性の問題: any型の使用 (${varName}) in ${path.basename(filePath)}`,
          description: `変数 ${varName} で any型が使用されています。TypeScriptの型チェックが無効化され、ランタイムエラーのリスクが高まります。`,
          file: filePath,
          lineNumber,
          codeSnippet,
          confidence: 0.85,
          suggestedFixes: [
            '適切な型アノテーションを追加する',
            'unknown型を使用し、型ガードで安全に処理する',
            '型推論を活用して暗黙的な型を使用する',
          ],
          expectedBenefits: [
            'コンパイル時の型チェックによるバグ検出',
            'IDEのインテリセンス機能の向上',
            'リファクタリング時の安全性向上',
          ],
          priority: 'Medium',
        });
      }
    }

    // パラメータの `any` 型も検出
    const parameters = sourceFile.getDescendantsOfKind(SyntaxKind.Parameter);
    for (const param of parameters) {
      const typeNode = param.getTypeNode();
      if (typeNode && typeNode.getText() === 'any') {
        const filePath = sourceFile.getFilePath();
        const lineNumber = param.getStartLineNumber();
        const paramName = param.getName();
        const codeSnippet = this.extractCodeSnippet(sourceFile, lineNumber);

        candidates.push({
          category: IssueCategory.BUG,
          title: `型安全性の問題: any型のパラメータ (${paramName}) in ${path.basename(filePath)}`,
          description: `パラメータ ${paramName} で any型が使用されています。TypeScriptの型チェックが無効化され、ランタイムエラーのリスクが高まります。`,
          file: filePath,
          lineNumber,
          codeSnippet,
          confidence: 0.85,
          suggestedFixes: [
            '適切な型アノテーションを追加する',
            'unknown型を使用し、型ガードで安全に処理する',
            'ジェネリクス型を使用して柔軟性と型安全性を両立',
          ],
          expectedBenefits: [
            'コンパイル時の型チェックによるバグ検出',
            'IDEのインテリセンス機能の向上',
            'リファクタリング時の安全性向上',
          ],
          priority: 'Medium',
        });
      }
    }

    return candidates;
  }

  /**
   * リソースリークを検出
   */
  private detectResourceLeaks(sourceFile: SourceFile): IssueCandidateResult[] {
    const candidates: IssueCandidateResult[] = [];

    // fs.createReadStream の使用箇所を検出
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const callExpr of callExpressions) {
      const expression = callExpr.getExpression();
      const expressionText = expression.getText();

      if (expressionText.includes('createReadStream')) {
        // close() または pipe() の呼び出しをチェック
        const parentBlock = callExpr.getFirstAncestorByKind(SyntaxKind.Block);
        const hasClose = parentBlock?.getText().includes('.close()') ?? false;
        const hasPipe = parentBlock?.getText().includes('.pipe(') ?? false;

        if (!hasClose && !hasPipe) {
          const filePath = sourceFile.getFilePath();
          const lineNumber = callExpr.getStartLineNumber();
          const codeSnippet = this.extractCodeSnippet(sourceFile, lineNumber);

          candidates.push({
            category: IssueCategory.BUG,
            title: `リソースリーク: createReadStream未クローズ in ${path.basename(filePath)}`,
            description: `createReadStream() で作成されたストリームが適切にクローズされていません。メモリリークやファイルハンドルの枯渇が発生する可能性があります。`,
            file: filePath,
            lineNumber,
            codeSnippet,
            confidence: 0.80,
            suggestedFixes: [
              'ストリームを明示的にclose()する',
              'pipe()メソッドで別のストリームに接続する',
              'try-finallyブロックでリソースを確実に解放する',
            ],
            expectedBenefits: [
              'メモリリークの防止',
              'ファイルハンドル枯渇の回避',
              'システムリソースの効率的な利用',
            ],
            priority: 'High',
          });
        }
      }
    }

    return candidates;
  }

  /**
   * コードスニペット抽出（前後10行）
   */
  private extractCodeSnippet(sourceFile: SourceFile, lineNumber: number): string {
    const lines = sourceFile.getFullText().split('\n');
    const start = Math.max(0, lineNumber - 10);
    const end = Math.min(lines.length, lineNumber + 10);
    return lines.slice(start, end).join('\n');
  }

  /**
   * Phase 2: リファクタリング候補を検出（Phase 2で実装）
   */
  public async analyzeForRefactoring(): Promise<IssueCandidateResult[]> {
    // Phase 2で実装
    logger.info('Phase 2: Refactoring analysis not yet implemented.');
    return [];
  }

  /**
   * Phase 3: 機能拡張のアイデアを提案（Phase 3で実装）
   */
  public async analyzeForEnhancements(): Promise<IssueCandidateResult[]> {
    // Phase 3で実装
    logger.info('Phase 3: Enhancement analysis not yet implemented.');
    return [];
  }
}
