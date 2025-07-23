type FlattenSvgOptions = {
    arcsToCubic: boolean;
    toRelative: boolean;
    toAbsolute: boolean;
    toShorthands: boolean;
    toLonghands: boolean;
    arcAccuracy: number;
    minify: boolean;
    decimals: number;
};
declare function flattenSVGTransformations(svg: SVGSVGElement, options: Partial<FlattenSvgOptions>): void;

export { flattenSVGTransformations };
