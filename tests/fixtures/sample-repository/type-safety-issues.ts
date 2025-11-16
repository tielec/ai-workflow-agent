/**
 * テストフィクスチャ: 型安全性問題のサンプル
 * Phase 5 Test Implementation: Issue #121
 */

/**
 * any型使用（Issue候補として検出されるべき）
 */
export function processData(data: any): any {
  return data.value;
}

/**
 * 複数のany型使用
 */
export function complexProcessing(input: any, config: any): any {
  const userData: any = input.user;
  const settings: any = config.settings;
  return { userData, settings };
}

/**
 * 型安全なコード（検出されないべき）
 */
export function processTypedData(data: { value: string }): string {
  return data.value;
}

/**
 * 型安全な複雑な処理
 */
interface User {
  name: string;
  email: string;
}

interface Config {
  theme: string;
  language: string;
}

export function typedComplexProcessing(input: { user: User }, config: { settings: Config }): {
  userData: User;
  settings: Config;
} {
  const userData: User = input.user;
  const settings: Config = config.settings;
  return { userData, settings };
}
