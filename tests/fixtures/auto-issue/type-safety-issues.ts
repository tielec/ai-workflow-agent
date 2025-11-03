/**
 * テストフィクスチャ: 型安全性問題のサンプルコード
 */

// ❌ any型の変数宣言（検出されるべき）
export const userData: any = { name: 'John', age: 30 };

// ❌ any型の変数宣言（検出されるべき）
export const config: any = loadConfig();

// ✅ 型安全な変数宣言（検出されない）
export const typedUserData: { name: string; age: number } = { name: 'John', age: 30 };

// ❌ any型のパラメータ（検出されるべき）
export function processData(data: any) {
  return data.value;
}

// ✅ 型安全なパラメータ（検出されない）
export function processTypedData(data: { value: string }) {
  return data.value;
}

// ❌ any型のパラメータを持つアロー関数（検出されるべき）
export const transformData = (input: any) => {
  return input.toString();
};

function loadConfig(): unknown {
  return {};
}
