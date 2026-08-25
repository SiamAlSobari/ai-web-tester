import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: 'https://ai-web-tester.pages.dev',
  integrations: [
    starlight({
      title: 'AI Web Tester',
      description: 'The Autonomous Eyes & Hands for AI Coding Agents in the Browser',
      logo: { src: './src/assets/logo.svg' },
      social: { github: 'https://github.com/SiamAlSobari/ai-web-tester' },
      defaultLocale: 'en',
      locales: { root: { label: 'English', lang: 'en' } },
      customCss: ['./src/styles/global.css'],
      head: [
        { tag: 'meta', attrs: { name: 'theme-color', content: '#0a0f1c' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' } },
      ],
      sidebar: [
        { label: 'Introduction', items: [
          { label: 'What is AI Web Tester?', slug: 'intro' },
          { label: 'Quickstart', slug: 'quickstart' },
          { label: 'Installation', slug: 'installation' },
        ]},
        { label: 'CLI', items: [
          { label: 'Overview', slug: 'cli/overview' },
          { label: 'Test & Crawl', slug: 'cli/test-crawl' },
          { label: 'Scenario Runner', slug: 'cli/scenarios' },
          { label: 'Dashboard', slug: 'cli/dashboard' },
        ]},
        { label: 'MCP Tools', items: [
          { label: 'Overview', slug: 'mcp/overview' },
          { label: 'Browser Control', slug: 'mcp/browser' },
          { label: 'Assertions & Perf', slug: 'mcp/assertions' },
          { label: 'Crawl & A11y', slug: 'mcp/crawl-a11y' },
          { label: 'Reports', slug: 'mcp/reports' },
        ]},
        { label: 'Guides', items: [
          { label: 'Auth & StorageState', slug: 'guides/auth' },
          { label: 'Visual Regression', slug: 'guides/visual' },
          { label: 'Mobile & Network', slug: 'guides/mobile-network' },
        ]},
        { label: 'Reference', items: [
          { label: 'Architecture', slug: 'architecture' },
          { label: 'Changelog', slug: 'changelog' },
        ]},
      ],
      expressiveCode: { themes: ['github-dark', 'github-light'], styleOverrides: { borderRadius: '0.75rem' } },
    }),
    tailwind({ applyBaseStyles: false }),
  ],
});
