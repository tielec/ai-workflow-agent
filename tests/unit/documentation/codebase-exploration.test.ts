import { access, readFile } from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

type DocumentMetrics = {
  content: string;
  lines: string[];
  lineCount: number;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const docPath = path.join(repoRoot, 'CODEBASE_EXPLORATION.md');

async function loadDocument(): Promise<DocumentMetrics> {
  const content = await readFile(docPath, 'utf-8');
  const lines = content.split('\n');
  return { content, lines, lineCount: lines.length };
}

describe('CODEBASE_EXPLORATION.md の品質検証', () => {
  let metrics: DocumentMetrics;

  beforeAll(async () => {
    metrics = await loadDocument();
  });

  it('古い /tmp/ai-workflow-repos-82-* パスが含まれていないことを確認', () => {
    // 古いパスの痕跡を正規表現ベースで検出しない
    expect(metrics.content).not.toMatch(/\/tmp\/ai-workflow-repos-82-[a-z0-9]+/i);
  });

  it('parseResponsePlan in analyze.ts など旧仕様の関数が現行構成では参照されていないことを確認', () => {
    // 現行の構造に合わせて古いキーワードを排除
    expect(metrics.content).not.toMatch(/parseResponsePlan.*analyze\\.ts/);
  });

  it('git-manager.ts など古いファイル名は削除済みであることを示す文脈でのみ使われていること', () => {
    const matcher = /git-manager\\.ts/g;
    const occurrences: RegExpExecArray[] = [];
    let match: RegExpExecArray | null = null;

    while ((match = matcher.exec(metrics.content)) !== null) {
      occurrences.push(match);
    }

    if (occurrences.length === 0) {
      return;
    }

    for (const occurrence of occurrences) {
      const snippet = metrics.content.slice(
        Math.max(0, occurrence.index - 40),
        Math.min(metrics.content.length, occurrence.index + 40)
      );
      expect(snippet).toMatch(/旧|廃止/);
    }
  });

  it('行数が 200 行未満であることを確認', () => {
    expect(metrics.lineCount).toBeLessThan(200);
  });

  it('元の 595 行から 66% 以上削減されていることを確認', () => {
    const reductionPercentage = ((595 - metrics.lineCount) / 595) * 100;
    expect(reductionPercentage).toBeGreaterThanOrEqual(66);
  });

  it('現在のパス /tmp/ai-workflow-repos-183-35addf50/ai-workflow-agent/ が記載されていること', () => {
    expect(metrics.content).toContain('/tmp/ai-workflow-repos-183-35addf50/ai-workflow-agent/');
  });

  it('core/git/ と analyze/ ディレクトリ構成を説明していること', () => {
    expect(metrics.content).toContain('core/git/');
    expect(metrics.content).toContain('analyze/');
    expect(metrics.content).toContain('response-parser.ts');
  });

  it('最終更新日 2026-01-29 が記載されていること', () => {
    expect(metrics.content).toMatch(/最終更新[^\n]*[:：]\s*2026-01-29/);
  });

  it('Markdown 見出し構造が存在すること', () => {
    const headings = metrics.content.match(/^#{1,4}\s+.+$/gm);
    expect(headings).toBeDefined();
    expect(headings?.length ?? 0).toBeGreaterThan(0);
  });

  it('相対リンクが存在する場合はターゲットファイルが解決できること', async () => {
    const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
    const links: string[] = [];
    let match: RegExpExecArray | null = null;

    // リンク抽出
    while ((match = linkPattern.exec(metrics.content)) !== null) {
      links.push(match[1]);
    }

    if (links.length === 0) {
      expect(links).toHaveLength(0);
      return;
    }

    const docDir = path.dirname(docPath);
    for (const target of links) {
      if (/^https?:\/\//.test(target)) {
        continue;
      }

      const [relativeTarget] = target.split('#');
      if (!relativeTarget) {
        continue;
      }

      const resolved = relativeTarget.startsWith('/')
        ? path.join(repoRoot, relativeTarget)
        : path.resolve(docDir, relativeTarget);

      await expect(access(resolved)).resolves.toBeUndefined();
    }
  });

  it('src 配下の変更が想定外のファイルに含まれていないこと', () => {
    const statusOutput = execSync('git status --porcelain -- src/').toString();
    if (!statusOutput.trim()) {
      return;
    }

    const allowedPrefixes = ['src/prompts/'];
    const allowedFiles = new Set(['src/core/prompt-loader.ts']);
    const unexpected = statusOutput
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => (line.length >= 3 ? line.slice(3) : line.trim()))
      .filter(
        (filePath) =>
          !allowedPrefixes.some((prefix) => filePath.startsWith(prefix)) &&
          !allowedFiles.has(filePath),
      );

    expect(unexpected).toHaveLength(0);
  });

  it('行の長さが 120 文字を超えるものが全体の 10% 以下であること', () => {
    const longLines = metrics.lines.filter((line) => line.length > 120);
    const allowed = Math.max(1, Math.floor(metrics.lineCount * 0.1));
    expect(longLines.length).toBeLessThanOrEqual(allowed);
  });
});
