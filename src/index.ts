import { flattenSVGTransformations } from "./flatten/index";
import { parsePathDataNormalized, PathData } from "./flatten/parser";
import { serializePathData } from "./flatten/serialize";

export function SvgToPath(svg: SVGSVGElement) {
    const copy = svg.cloneNode(true) as SVGSVGElement;
    flattenSVGTransformations(copy, {});
    let walker = document.createTreeWalker(copy, NodeFilter.SHOW_ELEMENT);

    let node: SVGGraphicsElement | null = null;
    let result = "";
    while ((node = walker.nextNode() as SVGGraphicsElement | null)) {
        if (!node) {
            continue;
        }

        if (node instanceof SVGGeometryElement) {
            let d = node.getAttribute("d");
            if(d?.endsWith("Z") || d?.endsWith("z")) {
                const path = parsePathDataNormalized(d);
                const nonMoveIndex = path.findIndex(e => e.type !== "M" && e.type !== "m");
                const values = getEndPos(path.slice(0,nonMoveIndex));
                path[path.length-1] = {
                    type: "L",
                    values
                };
                d = serializePathData(path);
            }
            result += d;
        }
    }
    return result;
}

function getEndPos(data: PathData, pose = [0,0]) {
    
    for(let d of data) {
        const current = [0,0]
        switch(d.type.toLowerCase()) {
            case "v":
                current[1] = d.values[0];
                break;
            case "h":
                current[0] = d.values[0];
                break;
            default:
                current[0] = d.values.at(-2) ?? 0;
                current[1] = d.values.at(-1) ?? 0;
        }

        if(d.type.toLowerCase() === d.type) {
            current[0] += pose[0];
            current[1] += pose[1];
        }
        pose[0] = current[0];
        pose[1] = current[1];
    }
    return pose;
}
globalThis["SvgToPath"] = SvgToPath;
export default SvgToPath;