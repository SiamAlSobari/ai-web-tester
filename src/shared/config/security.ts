import { SecurityViolationError } from '../errors/domain-errors.js';

export interface SecurityConfig {
  allowedHosts?: string[];
  blockPrivateNetwork?: boolean;
}

function hostMatchesPattern(host: string, pattern: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(2);
    return host === suffix || host.endsWith(`.${suffix}`);
  }
  return false;
}

export function isUrlAllowed(urlStr: string, config?: SecurityConfig): { allowed: boolean; reason?: string } {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    if (!config || !config.allowedHosts || config.allowedHosts.length === 0) {
      if (config?.blockPrivateNetwork && isPrivateHost(host)) {
        return { allowed: false, reason: `Private network host blocked: ${host}` };
      }
      return { allowed: true };
    }
    for (const pattern of config.allowedHosts) {
      if (hostMatchesPattern(host, pattern.toLowerCase())) return { allowed: true };
    }
    return { allowed: false, reason: `Host "${host}" not in allowedHosts whitelist [${config.allowedHosts.join(', ')}]` };
  } catch {
    return { allowed: false, reason: `Invalid URL: ${urlStr}` };
  }
}

function isPrivateHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

export function assertUrlAllowed(urlStr: string, config?: SecurityConfig): void {
  const result = isUrlAllowed(urlStr, config);
  if (!result.allowed) {
    throw new SecurityViolationError(result.reason || `URL not allowed: ${urlStr}`, { url: urlStr, allowedHosts: config?.allowedHosts });
  }
}
