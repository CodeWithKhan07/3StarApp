// Static document assets are imported as URLs by Next.js and used by the
// client-side PDF export service.
declare module "*.png" {
  const source: { src: string; width: number; height: number };
  export default source;
}

declare module "*.jpg" {
  const source: { src: string; width: number; height: number };
  export default source;
}

declare module "*.jpeg" {
  const source: { src: string; width: number; height: number };
  export default source;
}
