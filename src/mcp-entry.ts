#!/usr/bin/env node
import { runMcpServer } from './adapters/inbound/mcp/server.js';

runMcpServer().catch((error) => {
  console.error('Fatal error in AI Browser Testing MCP Server:', error);
  process.exit(1);
});
