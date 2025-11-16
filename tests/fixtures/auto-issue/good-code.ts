/**
 * テストフィクスチャ: 問題のないコード
 */

// ✅ 型安全で適切なエラーハンドリング
export async function fetchUserData(userId: string): Promise<UserData> {
  try {
    const response = await fetch(`https://api.example.com/users/${userId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data as UserData;
  } catch (error) {
    console.error('Failed to fetch user data', error);
    throw error;
  }
}

// ✅ 型安全な関数
export function calculateTotal(items: Array<{ price: number; quantity: number }>): number {
  return items.reduce((total, item) => total + item.price * item.quantity, 0);
}

// ✅ 適切な型定義
interface UserData {
  id: string;
  name: string;
  email: string;
}

// ✅ ジェネリクスを使用した型安全な関数
export function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}
