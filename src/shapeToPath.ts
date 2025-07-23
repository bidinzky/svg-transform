/**
 * retrieve patData from primitives:
 * <circle>, <ellipse>, <rect>, <polygon>, <polyline>, <line>, 
 */

import { svgElUnitsToPixel } from "./helper";
import { parsePathDataNormalized } from "./parser";
import { serializePathData } from "./serialize";
import { PathData } from "./type";

export function convertShapeToPath(el: SVGGeometryElement, decimals = 3) {
    let pathData = getPathDataFromEl(el);

    // create path element
    let path = document.createElementNS("http://www.w3.org/2000/svg", "path");

    // get all attributes as object
    const setAttributes = (el: SVGGeometryElement, attributes: Record<string, string>, exclude: string[] = []) => {
        for (let key in attributes) {
            if (exclude.indexOf(key) === -1) {
                el.setAttribute(key, attributes[key]);
            }
        }
    }
    const getAttributes = (el: SVGGeometryElement) => {
        let attArr = [...el.attributes];
        let attObj: Record<string, string> = {};
        attArr.forEach((att) => {
            if (att.nodeValue) {
                attObj[att.nodeName] = att.nodeValue;
            }
        });
        return attObj;
    }

    let attributes = getAttributes(el);

    //exclude attributes not needed for paths
    let exclude = ["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "points", "width", "height"];

    // copy attributes to path and set pathData
    setAttributes(path, attributes, exclude);
    let d = serializePathData(pathData, decimals)
    path.setAttribute('d', d);
    el.replaceWith(path);
    return path;
}

// retrieve pathdata from svg geometry elements
export function getPathDataFromEl(el: SVGGeometryElement) {
    let pathData: PathData = [];
    let type = el.nodeName;
    let atts, attNames, d, x, y, width, height, r, rx, ry, cx, cy, x1, x2, y1, y2;

    // convert relative or absolute units 
    svgElUnitsToPixel(el)

    const getAtts = (attNames) => {
        atts = {}
        attNames.forEach(att => {
            const attr = el.getAttribute(att);
            if (attr) {
                atts[att] = +attr
            }
        })
        return atts
    }

    switch (type) {
        case 'path':
            d = el.getAttribute("d");
            pathData = parsePathDataNormalized(d);
            break;

        case 'rect':
            attNames = ['x', 'y', 'width', 'height', 'rx', 'ry'];
            ({ x, y, width, height, rx, ry } = getAtts(attNames));


            if (!rx && !ry) {
                pathData = [
                    { type: "M", values: [x, y] },
                    { type: "H", values: [x + width] },
                    { type: "V", values: [y + height] },
                    { type: "H", values: [x] },
                    { type: "Z", values: [] }
                ];
            } else {

                if (rx > width / 2) {
                    rx = width / 2;
                }
                if (ry > height / 2) {
                    ry = height / 2;
                }

                pathData = [
                    { type: "M", values: [x + rx, y] },
                    { type: "H", values: [x + width - rx] },
                    { type: "A", values: [rx, ry, 0, 0, 1, x + width, y + ry] },
                    { type: "V", values: [y + height - ry] },
                    { type: "A", values: [rx, ry, 0, 0, 1, x + width - rx, y + height] },
                    { type: "H", values: [x + rx] },
                    { type: "A", values: [rx, ry, 0, 0, 1, x, y + height - ry] },
                    { type: "V", values: [y + ry] },
                    { type: "A", values: [rx, ry, 0, 0, 1, x + rx, y] },
                    { type: "Z", values: [] }
                ];
            }
            break;

        case 'circle':
        case 'ellipse':

            attNames = ['cx', 'cy', 'rx', 'ry', 'r'];
            ({ cx, cy, r, rx, ry } = getAtts(attNames));

            if (type === 'circle') {
                r = r;
                rx = r
                ry = r
            } else {
                rx = rx ? rx : r;
                ry = ry ? ry : r;
            }

            pathData = [
                { type: "M", values: [cx + rx, cy] },
                { type: "A", values: [rx, ry, 0, 1, 1, cx - rx, cy] },
                { type: "A", values: [rx, ry, 0, 1, 1, cx + rx, cy] },
            ];

            break;
        case 'line':
            attNames = ['x1', 'y1', 'x2', 'y2'];
            ({ x1, y1, x2, y2 } = getAtts(attNames));
            pathData = [
                { type: "M", values: [x1, y1] },
                { type: "L", values: [x2, y2] }
            ];
            break;
        case 'polygon':
        case 'polyline':
            const attr = el.getAttribute('points');
            if (attr) {
                let points = attr.replaceAll(',', ' ').split(' ').filter(Boolean)

                for (let i = 0; i < points.length; i += 2) {
                    pathData.push({
                        type: (i === 0 ? "M" : "L"),
                        values: [+points[i], +points[i + 1]]
                    });
                }
                if (type === 'polygon') {
                    pathData.push({
                        type: "Z",
                        values: []
                    });
                }
            }

            break;
    }

    return pathData;
};
