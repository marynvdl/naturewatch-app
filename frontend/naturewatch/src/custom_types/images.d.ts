declare module '*.svg' {
  const content: any;
  export default content;
}

declare module '*.png' {
  const content: any;
  export default content;
}

// eslint-disable-next-line no-unused-vars
interface ImportMeta {
  env: Record<string, string>;
}
