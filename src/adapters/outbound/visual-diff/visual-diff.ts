import fs from 'node:fs/promises';
import path from 'node:path';

export interface VisualDiffResult {
  hasDiff: boolean;
  baselinePath: string;
  currentPath: string;
  diffPercentage: number;
  message: string;
}

export class VisualDiffEngine {
  async compareScreenshots(currentPath: string, baselinePath: string): Promise<VisualDiffResult> {
    try {
      const currentBuf = await fs.readFile(currentPath);
      const baselineExists = await fs.access(baselinePath).then(() => true).catch(() => false);

      if (!baselineExists) {
        // Automatically save current as baseline if baseline doesn't exist yet
        await fs.mkdir(path.dirname(baselinePath), { recursive: true });
        await fs.writeFile(baselinePath, currentBuf);
        return {
          hasDiff: false,
          baselinePath,
          currentPath,
          diffPercentage: 0,
          message: 'Baseline image initialized.',
        };
      }

      const baselineBuf = await fs.readFile(baselinePath);

      if (currentBuf.equals(baselineBuf)) {
        return {
          hasDiff: false,
          baselinePath,
          currentPath,
          diffPercentage: 0,
          message: 'Pixel-perfect match with baseline.',
        };
      }

      // Fast byte-level & length comparison
      const maxLen = Math.max(currentBuf.length, baselineBuf.length);
      let diffBytes = Math.abs(currentBuf.length - baselineBuf.length);
      const minLen = Math.min(currentBuf.length, baselineBuf.length);
      for (let i = 0; i < minLen; i++) {
        if (currentBuf[i] !== baselineBuf[i]) {
          diffBytes++;
        }
      }

      const diffPercentage = Number(((diffBytes / maxLen) * 100).toFixed(2));

      return {
        hasDiff: diffPercentage > 0.05,
        baselinePath,
        currentPath,
        diffPercentage,
        message: `Visual difference detected (${diffPercentage}% variance from baseline).`,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        hasDiff: false,
        baselinePath,
        currentPath,
        diffPercentage: 0,
        message: `Visual comparison failed: ${errorMsg}`,
      };
    }
  }
}
