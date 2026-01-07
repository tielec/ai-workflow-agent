import { sanitizeGitUrl } from '../../../src/utils/git-url-utils.js';

describe('sanitizeGitUrl', () => {
  describe('正常系: HTTPS形式のURL', () => {
    // UC-1.1.1: HTTPS + ghp_トークン形式からトークンを除去
    it('HTTPS + ghp_トークン形式からトークンを除去', () => {
      // Given: HTTPS形式のURLに ghp_ 形式のGitHub Personal Access Tokenが含まれる
      const input = 'https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/tielec/ai-workflow-agent.git';
      const expected = 'https://github.com/tielec/ai-workflow-agent.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: トークンが除去されたURLが返される
      expect(result).toBe(expected);
    });

    it('HTTPS + ghp_トークン形式からトークンを除去（複数パターン）', () => {
      // Given: 異なるオーナー・リポジトリのURL
      const testCases = [
        {
          input: 'https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/tielec/ai-workflow-agent.git',
          expected: 'https://github.com/tielec/ai-workflow-agent.git',
        },
        {
          input: 'https://ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456@github.com/owner/repo.git',
          expected: 'https://github.com/owner/repo.git',
        },
      ];

      // When/Then: 各テストケースでトークンが除去されることを確認
      testCases.forEach(({ input, expected }) => {
        expect(sanitizeGitUrl(input)).toBe(expected);
      });
    });

    // UC-1.1.2: HTTPS + github_pat_トークン形式からトークンを除去
    it('HTTPS + github_pat_トークン形式からトークンを除去', () => {
      // Given: HTTPS形式のURLに github_pat_ 形式のトークンが含まれる
      const input = 'https://github_pat_1234567890abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJ@github.com/owner/repo.git';
      const expected = 'https://github.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: トークンが除去されたURLが返される
      expect(result).toBe(expected);
    });

    // UC-1.1.3: HTTPS + ユーザー:パスワード形式から認証情報を除去
    it('HTTPS + ユーザー:パスワード形式から認証情報を除去', () => {
      // Given: HTTPS形式のURLにユーザー名とパスワードが含まれる
      const input = 'https://username:password123@github.com/owner/repo.git';
      const expected = 'https://github.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: 認証情報が除去されたURLが返される
      expect(result).toBe(expected);
    });

    it('HTTPS + ユーザー:パスワード形式から認証情報を除去（複数パターン）', () => {
      // Given: 異なるユーザー名・パスワードのパターン
      const testCases = [
        {
          input: 'https://username:password123@github.com/owner/repo.git',
          expected: 'https://github.com/owner/repo.git',
        },
        {
          input: 'https://user:p@ssw0rd!@github.com/owner/repo.git',
          expected: 'https://github.com/owner/repo.git',
        },
      ];

      // When/Then: 各テストケースで認証情報が除去されることを確認
      testCases.forEach(({ input, expected }) => {
        expect(sanitizeGitUrl(input)).toBe(expected);
      });
    });

    // UC-1.1.6: ポート番号付きHTTPS + トークン形式からトークンを除去
    it('ポート番号付きHTTPS + トークン形式からトークンを除去', () => {
      // Given: ポート番号を含むHTTPS形式のURLにトークンが含まれる
      const input = 'https://ghp_token123@github.com:443/owner/repo.git';
      const expected = 'https://github.com:443/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: トークンが除去されたURL（ポート番号は保持）が返される
      expect(result).toBe(expected);
    });

    it('ポート番号付きHTTPS + ユーザー:パスワード形式から認証情報を除去', () => {
      // Given: ポート番号を含むHTTPS形式のURLに認証情報が含まれる
      const input = 'https://user:pass@custom-git.example.com:8443/repo.git';
      const expected = 'https://custom-git.example.com:8443/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: 認証情報が除去されたURL（ポート番号は保持）が返される
      expect(result).toBe(expected);
    });

    // UC-1.1.8: HTTP形式（非HTTPS）+ トークンからトークンを除去
    it('HTTP形式（非HTTPS）+ トークンからトークンを除去', () => {
      // Given: HTTP形式のURLにトークンが含まれる
      const input = 'http://ghp_token123@github.com/owner/repo.git';
      const expected = 'http://github.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: トークンが除去されたURLが返される
      expect(result).toBe(expected);
    });
  });

  describe('正常系: その他の形式（変更なし）', () => {
    // UC-1.1.4: SSH形式はそのまま返す
    it('SSH形式はそのまま返す', () => {
      // Given: SSH形式のURL
      const input = 'git@github.com:tielec/ai-workflow-agent.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: URLは変更されずにそのまま返される
      expect(result).toBe(input);
    });

    it('SSH形式はそのまま返す（複数パターン）', () => {
      // Given: 異なるGitホストのSSH形式URL
      const testCases = [
        {
          input: 'git@github.com:tielec/ai-workflow-agent.git',
          expected: 'git@github.com:tielec/ai-workflow-agent.git',
        },
        {
          input: 'git@gitlab.com:group/project.git',
          expected: 'git@gitlab.com:group/project.git',
        },
      ];

      // When/Then: 各テストケースでURLが変更されないことを確認
      testCases.forEach(({ input, expected }) => {
        expect(sanitizeGitUrl(input)).toBe(expected);
      });
    });

    // UC-1.1.5: 通常のHTTPS形式（認証情報なし）はそのまま返す
    it('通常のHTTPS形式（認証情報なし）はそのまま返す', () => {
      // Given: 認証情報を含まないHTTPS形式のURL
      const input = 'https://github.com/tielec/ai-workflow-agent.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: URLは変更されずにそのまま返される
      expect(result).toBe(input);
    });

    it('通常のHTTPS形式（認証情報なし）はそのまま返す（複数パターン）', () => {
      // Given: 異なるGitホストの通常HTTPS形式URL
      const testCases = [
        {
          input: 'https://github.com/tielec/ai-workflow-agent.git',
          expected: 'https://github.com/tielec/ai-workflow-agent.git',
        },
        {
          input: 'https://gitlab.com/group/project.git',
          expected: 'https://gitlab.com/group/project.git',
        },
      ];

      // When/Then: 各テストケースでURLが変更されないことを確認
      testCases.forEach(({ input, expected }) => {
        expect(sanitizeGitUrl(input)).toBe(expected);
      });
    });
  });

  describe('GitHub以外のGitホスト', () => {
    // UC-1.1.9: GitLab HTTPS + トークン形式からトークンを除去
    it('GitLab HTTPS + トークン形式からトークンを除去', () => {
      // Given: GitLab のHTTPS形式のURLにトークンが含まれる
      const input = 'https://oauth2:glpat-xxxxxxxxxxxxxxxxxxxx@gitlab.com/group/project.git';
      const expected = 'https://gitlab.com/group/project.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: トークンが除去されたURLが返される
      expect(result).toBe(expected);
    });

    // UC-1.1.10: Bitbucket HTTPS + トークン形式からトークンを除去
    it('Bitbucket HTTPS + トークン形式からトークンを除去', () => {
      // Given: Bitbucket のHTTPS形式のURLにトークンが含まれる
      const input = 'https://x-token-auth:ATBB_xxxxxxxxxxxxxxxxx@bitbucket.org/workspace/repo.git';
      const expected = 'https://bitbucket.org/workspace/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: トークンが除去されたURLが返される
      expect(result).toBe(expected);
    });

    // UC-1.1.11: サブドメイン付きURL + トークンからトークンを除去
    it('サブドメイン付きURL + トークンからトークンを除去', () => {
      // Given: サブドメインを含むURLにトークンが含まれる
      const input = 'https://token123@git.example.com/owner/repo.git';
      const expected = 'https://git.example.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: トークンが除去されたURLが返される
      expect(result).toBe(expected);
    });
  });

  describe('エッジケース', () => {
    // Issue #58: パスワードに @ を含むケース
    it('パスワードに@を1つ含むケース', () => {
      // Given: パスワードに @ を1つ含むURL
      const input = 'https://user:p@ssword@github.com/owner/repo.git';
      const expected = 'https://github.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: トークンが除去されたURLが返される
      expect(result).toBe(expected);
    });

    it('パスワードに@を複数含むケース', () => {
      // Given: パスワードに @ を複数含むURL
      const input = 'https://user:p@ss@word@github.com/owner/repo.git';
      const expected = 'https://github.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: トークンが除去されたURLが返される
      expect(result).toBe(expected);
    });

    it('トークンのみ（ユーザー名なし）のケース', () => {
      // Given: トークンのみ（ユーザー名なし）のURL
      const input = 'https://ghp_token123@github.com/owner/repo.git';
      const expected = 'https://github.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: トークンが除去されたURLが返される
      expect(result).toBe(expected);
    });

    it('ユーザー名とパスワードの両方に@を含むケース', () => {
      // Given: ユーザー名とパスワードの両方に @ を含むURL
      const input = 'https://user@domain:p@ss@word@github.com/owner/repo.git';
      const expected = 'https://github.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: トークンが除去されたURLが返される
      expect(result).toBe(expected);
    });

    it('HTTP（HTTPSではない）プロトコルでトークンを除去', () => {
      // Given: HTTPプロトコルでトークンを含むURL
      const input = 'http://token@github.com/owner/repo.git';
      const expected = 'http://github.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: トークンが除去されたURLが返される
      expect(result).toBe(expected);
    });

    // UC-1.1.7: 空文字列はそのまま返す（フェイルセーフ）
    it('空文字列はそのまま返す', () => {
      // Given: 空文字列
      const input = '';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: エラーをスローせず、そのまま返される
      expect(result).toBe('');
    });

    // UC-1.1.12: 複数の@記号を含むURL（エッジケース）
    it('複数の@記号を含むURL（エッジケース）', () => {
      // Given: 複数の@記号を含むURL（例: user@domain@host）
      const input = 'https://user@domain@github.com/owner/repo.git';
      const expected = 'https://github.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: 最初の@までを認証情報として除去
      expect(result).toBe(expected);
    });

    it('空白のみの文字列はそのまま返す', () => {
      // Given: 空白のみの文字列
      const input = '   ';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: エラーをスローせず、そのまま返される
      expect(result).toBe('   ');
    });

    it('不正なURL形式でもエラーをスローしない', () => {
      // Given: 不正なURL形式の文字列
      const input = 'not-a-valid-url';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: エラーをスローせず、そのまま返される（フェイルセーフ）
      expect(result).toBe('not-a-valid-url');
    });

    it('URLエンコードされた認証情報も除去できる', () => {
      // Given: URLエンコードされた認証情報を含むURL
      const input = 'https://user%40domain:p%40ssw0rd@github.com/owner/repo.git';
      const expected = 'https://github.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: 認証情報が除去されたURLが返される
      expect(result).toBe(expected);
    });

    it('認証情報に特殊文字が含まれる場合も除去できる', () => {
      // Given: 認証情報に特殊文字が含まれるURL
      const input = 'https://user:p@ssw0rd!#$%@github.com/owner/repo.git';
      const expected = 'https://github.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出す
      const result = sanitizeGitUrl(input);

      // Then: 認証情報が除去されたURLが返される
      expect(result).toBe(expected);
    });
  });

  describe('パフォーマンステスト（ReDoS脆弱性評価）', () => {
    // Issue #58: ReDoS脆弱性がないことを検証
    it('大量の@を含む入力でもパフォーマンス劣化がない', () => {
      // Given: 大量の @ を含む悪意のある入力
      const maliciousInput = 'https://' + '@'.repeat(10000) + '@github.com/owner/repo.git';
      const expected = 'https://github.com/owner/repo.git';

      // When: sanitizeGitUrl() 関数を呼び出し、処理時間を計測
      const start = Date.now();
      const result = sanitizeGitUrl(maliciousInput);
      const elapsed = Date.now() - start;

      // Then: 処理が十分高速であること（CI環境のオーバーヘッドを考慮し1500ms以内）
      expect(result).toBe(expected);
      expect(elapsed).toBeLessThan(1500);
    });

    it('通常の入力で1000回実行しても許容範囲内', () => {
      // Given: 通常の入力
      const input = 'https://token@github.com/owner/repo.git';
      const expected = 'https://github.com/owner/repo.git';

      // When: 1000回実行し、処理時間を計測
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        const result = sanitizeGitUrl(input);
        expect(result).toBe(expected);
      }
      const elapsed = Date.now() - start;

      // Then: 合計1500ms以内に処理が完了すること（CI環境のオーバーヘッドを考慮）
      expect(elapsed).toBeLessThan(1500);
    });
  });

  describe('包括的なテストケース', () => {
    it('すべての主要パターンでサニタイズが正しく動作する', () => {
      // Given: 様々なURL形式のテストケース
      const testCases = [
        // HTTPS + トークン形式
        {
          input: 'https://ghp_1234567890abcdefghijklmnopqrstuvwxyz@github.com/owner/repo.git',
          expected: 'https://github.com/owner/repo.git',
          description: 'HTTPS + ghp_トークン',
        },
        {
          input: 'https://github_pat_1234567890abcdefghijklmnopqrstuvwxyz@github.com/owner/repo.git',
          expected: 'https://github.com/owner/repo.git',
          description: 'HTTPS + github_pat_トークン',
        },
        // HTTPS + ユーザー:パスワード
        {
          input: 'https://username:password@github.com/owner/repo.git',
          expected: 'https://github.com/owner/repo.git',
          description: 'HTTPS + ユーザー:パスワード',
        },
        // SSH形式（変更なし）
        {
          input: 'git@github.com:owner/repo.git',
          expected: 'git@github.com:owner/repo.git',
          description: 'SSH形式',
        },
        // 通常HTTPS（変更なし）
        {
          input: 'https://github.com/owner/repo.git',
          expected: 'https://github.com/owner/repo.git',
          description: '通常HTTPS',
        },
        // ポート番号付き
        {
          input: 'https://token@github.com:443/owner/repo.git',
          expected: 'https://github.com:443/owner/repo.git',
          description: 'ポート番号付きHTTPS + トークン',
        },
        // HTTP形式
        {
          input: 'http://token@github.com/owner/repo.git',
          expected: 'http://github.com/owner/repo.git',
          description: 'HTTP形式 + トークン',
        },
        // GitLab
        {
          input: 'https://oauth2:glpat-xxxx@gitlab.com/group/project.git',
          expected: 'https://gitlab.com/group/project.git',
          description: 'GitLab HTTPS + トークン',
        },
        // Bitbucket
        {
          input: 'https://x-token-auth:ATBB_xxxx@bitbucket.org/workspace/repo.git',
          expected: 'https://bitbucket.org/workspace/repo.git',
          description: 'Bitbucket HTTPS + トークン',
        },
        // エッジケース
        {
          input: '',
          expected: '',
          description: '空文字列',
        },
        {
          input: 'https://user@domain@github.com/owner/repo.git',
          expected: 'https://github.com/owner/repo.git',
          description: '複数の@記号',
        },
      ];

      // When/Then: すべてのテストケースで正しくサニタイズされることを確認
      testCases.forEach(({ input, expected, description }) => {
        expect(sanitizeGitUrl(input)).toBe(expected);
      });
    });
  });
});
