module.exports = {
  title: 'Skolplattformen',
  tagline: 'Handbok för användning, utveckling och integration',
  url: 'http://localhost:3003',
  baseUrl: '/',
  onBrokenLinks: 'throw',
  markdown: { hooks: { onBrokenMarkdownLinks: 'throw' } },
  i18n: { defaultLocale: 'sv', locales: ['sv'] },
  presets: [['classic', {
    docs: { path: '../docs/handbok', routeBasePath: '/', sidebarPath: require.resolve('./sidebars.js') },
    blog: false,
    pages: false,
    theme: { customCss: require.resolve('./style.css') },
  }]],
  themeConfig: {
    navbar: { title: 'Skolplattformen · Handbok', items: [{ type: 'docSidebar', sidebarId: 'handbok', label: 'Dokumentation', position: 'left' }] },
    footer: { style: 'light', copyright: 'Lokal dokumentation · Syntetisk provmiljö' },
  },
};
