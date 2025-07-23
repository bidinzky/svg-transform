import { flattenSVGTransformations } from "./flatten/index";

export function SvgToPath(svg: SVGSVGElement) {
    const copy = svg.cloneNode(true) as SVGSVGElement;
    flattenSVGTransformations(copy, {});
    let walker = document.createTreeWalker(svg, NodeFilter.SHOW_ELEMENT);

    let node: SVGGraphicsElement | null = null;
    let result = "";
    while ((node = walker.nextNode() as SVGGraphicsElement | null)) {
        if (!node) {
            continue;
        }

        if (node instanceof SVGGeometryElement) {
            result += node.getAttribute("d");
        }
    }

    return result;
}
globalThis["SvgToPath"] = SvgToPath;
export default SvgToPath;