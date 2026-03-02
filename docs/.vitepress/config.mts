import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'seal',
  description: 'Voice-first frontend documentation',
  lastUpdated: true,
  cleanUrls: true,
  vite: {
    // Keep docs build self-contained on Vercel and avoid inheriting parent
    // PostCSS/Tailwind config from the application repository.
    css: {
      postcss: {
        plugins: []
      }
    }
  },
  themeConfig: {
    search: {
      provider: 'local'
    },
    outline: {
      level: [2, 3],
      label: 'On this page'
    },
    editLink: {
      pattern: 'https://github.com/Unchained-Labs/seal/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },
    docFooter: {
      prev: 'Previous',
      next: 'Next'
    },
    footer: {
      message: 'seal docs',
      copyright: 'Unchained Labs'
    },
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/tutorials/getting-started' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Concepts', link: '/concepts' },
      { text: 'API and Integrations', link: '/api/index' },
      { text: 'Tutorials', link: '/tutorials/getting-started' },
      { text: 'References', link: '/related-documents' }
    ],
    sidebar: [
      {
        text: 'Overview',
        collapsed: false,
        items: [
          { text: 'Product Landing', link: '/' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Concepts', link: '/concepts' }
        ]
      },
      {
        text: 'Tutorials',
        collapsed: false,
        items: [
          { text: 'Getting Started', link: '/tutorials/getting-started' },
          { text: 'Operating the Board', link: '/tutorials/operating-the-board' }
        ]
      },
      {
        text: 'APIs and Events',
        collapsed: false,
        items: [
          { text: 'Interface Overview', link: '/api/index' },
          { text: 'Backend Endpoint Usage', link: '/api/backend-endpoints' },
          { text: 'Event Stream Contract', link: '/api/event-stream-contract' }
        ]
      },
      {
        text: 'References',
        collapsed: false,
        items: [{ text: 'Related Documents', link: '/related-documents' }]
      }
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/Unchained-Labs/seal' }]
  }
})
