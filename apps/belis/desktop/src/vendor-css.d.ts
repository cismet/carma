// Vite's `?url` import suffix yields the bundled stylesheet's URL as a string.
// Used by HelpModal to lazily load the bootstrap/topicMaps vendor CSS.
declare module "*.css?url" {
  const url: string;
  export default url;
}
