/**
 * テストフィクスチャ: エラーハンドリング欠如のサンプル
 * Phase 5 Test Implementation: Issue #121
 */

/**
 * エラーハンドリング欠如（Issue候補として検出されるべき）
 */
export async function fetchDataWithoutTryCatch(): Promise<any> {
  const response = await fetch('https://api.example.com/data');
  return response.json();
}

/**
 * 正しいエラーハンドリング（検出されないべき）
 */
export async function fetchDataWithTryCatch(): Promise<any> {
  try {
    const response = await fetch('https://api.example.com/data');
    return response.json();
  } catch (error) {
    console.error('Failed to fetch data', error);
    throw error;
  }
}

/**
 * 複数の非同期関数（エラーハンドリング欠如）
 */
export async function processMultipleSteps(): Promise<void> {
  const data1 = await fetchDataWithoutTryCatch();
  const data2 = await fetchDataWithoutTryCatch();
  await saveToDatabase(data1, data2);
}

async function saveToDatabase(data1: any, data2: any): Promise<void> {
  // データベースへの保存処理（エラーハンドリング欠如）
  await fetch('https://api.example.com/save', {
    method: 'POST',
    body: JSON.stringify({ data1, data2 }),
  });
}
