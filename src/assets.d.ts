// Font files imported from JS resolve to their URL inside the built extension
// (Vite emits them under assets/ with a content hash).
declare module '*.woff2' {
  const url: string;
  export default url;
}
