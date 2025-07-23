import { parsePathDataNormalized } from "./parser";
import { convertPathData } from "./path/index";
import { pathDataArcToCubic } from "./path/arcToCubic";
import { serializePathData } from "./serialize";
import { convertShapeToPath } from "./shapeToPath";
import { transformPathData } from "./transformPath";

type FlattenSvgOptions = {
    arcsToCubic: boolean;
    toRelative: boolean;
    toAbsolute: boolean;
    toShorthands: boolean;
    toLonghands: boolean;
    arcAccuracy: number;
    minify: boolean;
    decimals: number
}

export function flattenSVGTransformations(svg: SVGSVGElement, options: Partial<FlattenSvgOptions>) {

    options = {
        arcsToCubic: false,
        toRelative: true,
        toAbsolute: false,
        toLonghands: true,
        toShorthands: true,
        arcAccuracy: 1,
        minify: true,
        decimals: 3,
        ...options
    };

    let els = svg.querySelectorAll<SVGGraphicsElement>('text, path, polyline, polygon, line, rect, circle, ellipse');
    els.forEach(el => {
        // convert shapes to paths
        if (el instanceof SVGGeometryElement && el.nodeName !== 'path') {
            el = convertShapeToPath(el)
        }

        //flatten element transformations
        reduceElementTransforms(el, options);
    });
    // remove group transforms
    let groups = svg.querySelectorAll('g');
    groups.forEach(g => {
        g.removeAttribute('transform');
        g.removeAttribute('transform-origin');
        g.style.removeProperty('transform');
        g.style.removeProperty('transform-origin');
    });
}


function reduceElementTransforms(el: SVGGraphicsElement, options: Partial<{
    arcsToCubic: boolean;
    arcAccuracy: number;
    minify: boolean;
    decimals: number;
}>) {

    options = {
        arcsToCubic: false,
        arcAccuracy: 1,
        minify: true,
        decimals: 3,
        ...options
    };


    //decimals = 3, arcsToCubic = false, arcAccuracy = 1
    let { arcsToCubic, arcAccuracy, minify, decimals } = options;


    let parent = el.viewportElement;
    if (null === parent || !(parent instanceof SVGGraphicsElement)) {
        return [];
    }
    // check elements transformations
    let matrix = parent.getScreenCTM()!.inverse().multiply(el.getScreenCTM()!);
    let { a, b, c, d, e, f } = matrix;
    // round matrix
    [a, b, c, d, e, f] = [a, b, c, d, e, f].map(val => {
        return +val.toFixed(3)
    });
    let matrixStr = [a, b, c, d, e, f].join('');
    let isTransformed = matrixStr !== "100100" ? true : false;
    if (isTransformed) {
        // matrix to readable transfomr functions
        let transObj = qrDecomposeMatrix(matrix);
        // scale stroke-width
        let scale = (Math.abs(transObj.scaleX) + Math.abs(transObj.scaleY)) / 2;

        scaleStrokeWidth(el, scale, decimals)
        // if text element: consolidate all applied transforms 
        if (el instanceof SVGGeometryElement === false) {
            if (isTransformed) {
                if(transObj.svgTransform) {
                    el.setAttribute('transform', transObj.svgTransform);
                }
                el.removeAttribute('transform-origin');
                el.style.removeProperty('transform');
                el.style.removeProperty('transform-origin');
            }
            return false
        }
        /**
         * is geometry elements: 
         * recalculate pathdata
         * according to transforms
         * by matrix transform
         */
        let d = el.getAttribute("d")!;
        let pathData = parsePathDataNormalized(d);

        if (arcsToCubic) {
            pathData = pathDataArcToCubic(pathData, arcAccuracy)
        }

        pathData = transformPathData(pathData, matrix)


        //optimize output
        pathData = convertPathData(pathData, options)


        // apply pathdata - remove transform
        let dNew = serializePathData(pathData, decimals, minify)
        el.setAttribute('d', dNew);
        el.removeAttribute('transform');
        el.style.removeProperty('transform');
        return pathData;
    }
}


function scaleStrokeWidth(el, scale, decimals = 3) {
    let styles = window.getComputedStyle(el);
    let strokeWidth: string | number = styles.getPropertyValue('stroke-width');
    let stroke = styles.getPropertyValue('stroke');
    strokeWidth = stroke != 'none' ? Math.abs(parseFloat(strokeWidth) * scale) : 0;

    // exclude text elements, since they remain transformed
    if (strokeWidth && el.nodeName.toLowerCase() !== 'text') {
        el.setAttribute('stroke-width', +strokeWidth.toFixed(decimals + 2));
        el.style.removeProperty('stroke-width');
    }
}


/**
 *  Decompose matrix to readable transform properties 
 *  translate() rotate() scale() etc.
 *  based on @AndreaBogazzi's answer
 *  https://stackoverflow.com/questions/5107134/find-the-rotation-and-skew-of-a-matrix-transformation#32125700
 *  return object with seperate transform properties 
 *  and ready to use css or svg attribute strings
 */
function qrDecomposeMatrix(matrix: SVGMatrix, precision = 3) {
    let { a, b, c, d, e, f } = matrix;
    // matrix is array
    if (Array.isArray(matrix)) {
        [a, b, c, d, e, f] = matrix;
    }
    let angle = Math.atan2(b, a),
        denom = Math.pow(a, 2) + Math.pow(b, 2),
        scaleX = Math.sqrt(denom),
        scaleY = (a * d - c * b) / scaleX,
        skewX = Math.atan2(a * c + b * d, denom) / (Math.PI / 180),
        translateX = e ? e : 0,
        translateY = f ? f : 0,
        rotate = angle ? angle / (Math.PI / 180) : 0;
    let transObj: {
        translateX: number;
        translateY: number;
        rotate: number;
        scaleX: number;
        scaleY: number;
        skewX: number;
        skewY: number;
        cssTransform?: string;
        svgTransform?: string;
    } = {
        translateX: translateX,
        translateY: translateY,
        rotate: rotate,
        scaleX: scaleX,
        scaleY: scaleY,
        skewX: skewX,
        skewY: 0,
    };
    let cssTransforms: string[] = [];
    let svgTransforms: string[] = [];
    for (let prop in transObj) {
        transObj[prop] = +parseFloat(transObj[prop]).toFixed(precision);
        let val = transObj[prop];
        let unit = "";
        if (prop == "rotate" || prop == "skewX") {
            unit = "deg";
        }
        if (prop.indexOf("translate") != -1) {
            unit = "px";
        }
        // combine these properties
        let convert = ["scaleX", "scaleY", "translateX", "translateY"];
        if (val !== 0) {
            cssTransforms.push(`${prop}(${val}${unit})`);
        }
        if (convert.indexOf(prop) == -1 && val !== 0) {
            svgTransforms.push(`${prop}(${val})`);
        } else if (prop == "scaleX") {
            svgTransforms.push(
                `scale(${+scaleX.toFixed(precision)} ${+scaleY.toFixed(precision)})`
            );
        } else if (prop == "translateX") {
            svgTransforms.push(
                `translate(${transObj.translateX} ${transObj.translateY})`
            );
        }
    }
    // append css style string to object
    transObj.cssTransform = cssTransforms.join(" ");
    transObj.svgTransform = svgTransforms.join(" ");
    return transObj;
}


