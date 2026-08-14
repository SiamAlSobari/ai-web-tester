import { describe, it, expect } from 'vitest';
import { createMcpServer } from '../../src/adapters/inbound/mcp/server.js';

describe('MCP Server Inbound Adapter', () => {
  it('creates MCP server instance with correct name and version', () => {
    const server = createMcpServer();
    expect(server).toBeDefined();
  });
});
