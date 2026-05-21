/// <reference types="vite/client" />

// Vite's `?raw` import suffix returns the file as a string.
declare module "*.md?raw" {
  const content: string;
  export default content;
}
