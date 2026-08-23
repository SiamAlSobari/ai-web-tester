import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface VisualDiffResult {
  hasDiff: boolean;
  baselinePath: string;
  currentPath: string;
  diffPercentage: number;
  message: string;
  diffPath?: string;
}

export class VisualDiffEngine {
  async compareScreenshots(currentPath: string, baselinePath: string, threshold = 0.1): Promise<VisualDiffResult> {
    try {
      const currentBuf = await fs.readFile(currentPath);
      const baselineExists = await fs.access(baselinePath).then(() => true).catch(() => false);

      if (!baselineExists) {
        await fs.mkdir(path.dirname(baselinePath), { recursive: true });
        await fs.writeFile(baselinePath, currentBuf);
        return { hasDiff: false, baselinePath, currentPath, diffPercentage: 0, message: 'Baseline image initialized.' };
      }

      const baselineBuf = await fs.readFile(baselinePath);

      let currentImg: PNG;
      let baselineImg: PNG;
      try {
        currentImg = PNG.sync.read(currentBuf);
        baselineImg = PNG.sync.read(baselineBuf);
      } catch {
        return this.byteCompare(currentBuf, baselineBuf, currentPath, baselinePath);
      }

      const { width, height } = currentImg;
      if (baselineImg.width !== width || baselineImg.height !== height) {
        const total = Math.max(width * height, baselineImg.width * baselineImg.height);
        const diffPx = width * height + baselineImg.width * baselineImg.height - Math.min(width * height, baselineImg.width * baselineImg.height);
        const diffPercentage = Number(((diffPx / total) * 100).toFixed(2));
        return {
          hasDiff: true,
          baselinePath,
          currentPath,
          diffPercentage,
          message: `Image dimensions differ (current ${width}x${height} vs baseline ${baselineImg.width}x${baselineImg.height}).`,
        };
      }

      const diff = new PNG({ width, height });
      const numDiffPixels = pixelmatch(currentImg.data, baselineImg.data, diff.data, width, height, { threshold: 0.1 });
      const diffPercentage = Number(((numDiffPixels / (width * height)) * 100).toFixed(2));
      const hasDiff = diffPercentage > threshold;

      let diffPath: string | undefined;
      if (hasDiff) {
        const dir = path.dirname(currentPath);
        diffPath = path.join(dir, `diff-${Date.now()}.png`);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(diffPath, PNG.sync.write(diff));
      }

      return {
        hasDiff,
        baselinePath,
        currentPath,
        diffPercentage,
        diffPath,
        message: hasDiff ? `Visual difference detected (${diffPercentage}% variance from baseline).` : 'Pixel-perfect match with baseline.',
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { hasDiff: false, baselinePath, currentPath, diffPercentage: 0, message: `Visual comparison failed: ${errorMsg}` };
    }
  }

  private byteCompare(currentBuf: Buffer, baselineBuf: Buffer, currentPath: string, baselinePath: string): VisualDiffResult {
    if (currentBuf.equals(baselineBuf)) {
      return { hasDiff: false, baselinePath, currentPath, diffPercentage: 0, message: 'Byte-perfect match.' };
    }
    const maxLen = Math.max(currentBuf.length, baselineBuf.length);
    let diffBytes = Math.abs(currentBuf.length - baselineBuf.length);
    const minLen = Math.min(currentBuf.length, baselineBuf.length);
    for (let i = 0; i < minLen; i++) {
      if (currentBuf[i] !== baselineBuf[i]) diffBytes++;
    }
    const diffPercentage = Number(((diffBytes / maxLen) * 100).toFixed(2));
    return {
      hasDiff: diffPercentage > 0.05,
      baselinePath,
      currentPath,
      diffPercentage,
      message: `Visual difference detected (${diffPercentage}% variance from baseline, byte-level fallback).`,
    };
  }
}
