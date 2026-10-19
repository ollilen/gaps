// Files in public/ are served under Vite's base path, which is a sub-path on GitHub Pages
// (e.g. /gaps/), so root-absolute fetch paths would miss them.
export const publicAssetUrl = (base: string, file: string): string =>
  `${base.replace(/\/+$/, '')}/${file.replace(/^\/+/, '')}`

export const assetUrl = (file: string): string => publicAssetUrl(import.meta.env.BASE_URL, file)
