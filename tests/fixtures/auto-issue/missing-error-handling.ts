/**
 * テストフィクスチャ: エラーハンドリング欠如のサンプルコード
 */

// ❌ エラーハンドリングなし（検出されるべき）
export async function fetchDataWithoutTryCatch() {
  const response = await fetch('https://api.example.com/data');
  return response.json();
}

// ✅ 正しいエラーハンドリング（検出されない）
export async function fetchDataWithTryCatch() {
  try {
    const response = await fetch('https://api.example.com/data');
    return response.json();
  } catch (error) {
    console.error('Failed to fetch data', error);
    throw error;
  }
}

// ❌ async アロー関数のエラーハンドリング欠如
export const processDataAsync = async (data: unknown) => {
  const result = await someAsyncOperation(data);
  return result;
};

// ✅ async アロー関数の正しいエラーハンドリング
export const processDataAsyncSafe = async (data: unknown) => {
  try {
    const result = await someAsyncOperation(data);
    return result;
  } catch (error) {
    console.error('Failed to process data', error);
    throw error;
  }
};

async function someAsyncOperation(data: unknown): Promise<unknown> {
  return data;
}
