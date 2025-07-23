
export function svgElUnitsToPixel(el: SVGElement, decimals = 5) {
    const svg = (el.nodeName !== "svg" ? el.closest("svg") : el) as SVGSVGElement;

    // convert real life units to pixels
    const translateUnitToPixel = (value) => {

        if (value === null) {
            return 0
        }
        //default dpi = 96
        let dpi = 96;
        let unit = value.match(/([a-z]+)/gi);
        unit = unit ? unit[0] : "";
        let val = parseFloat(value);
        let rat;

        // no unit - already pixes/user unit
        if (!unit) {
            return val;
        }

        switch (unit) {
            case "in":
                rat = dpi;
                break;
            case "pt":
                rat = (1 / 72) * 96;
                break;
            case "cm":
                rat = (1 / 2.54) * 96;
                break;
            case "mm":
                rat = ((1 / 2.54) * 96) / 10;
                break;
            // just a default approximation
            case "em":
                rat = 16;
                break;
            default:
                rat = 1;
        }
        let valuePx = val * rat;
        return +valuePx.toFixed(decimals);
    };

    // svg width and height attributes
    const widthString = svg.getAttribute("width");
    const width = widthString ? translateUnitToPixel(widthString) : 300;
    const heightString = svg.getAttribute("height");
    const height = widthString ? translateUnitToPixel(heightString) : 150;

    //prefer viewBox values
    const vBString = svg.getAttribute("viewBox");
    const vB = vBString
        ? vBString
            .replace(/,/g, " ")
            .split(" ")
            .filter(Boolean)
            .map((val) => {
                return +val;
            })
        : [];

    let w = vB.length ? vB[2] : width;
    let h = vB.length ? vB[3] : height;
    let scaleX = 0.01 * w;
    let scaleY = 0.01 * h;
    let scalRoot = Math.sqrt((Math.pow(scaleX, 2) + Math.pow(scaleY, 2)) / 2);
    let attsH = ["x", "width", "x1", "x2", "rx", "cx", "r"];
    let attsV = ["y", "height", "y1", "y2", "ry", "cy"];


    let atts = el.getAttributeNames();
    atts.forEach((att) => {
        let val = el.getAttribute(att);
        let valAbs: string | number | null = val;
        if ((attsH.includes(att) || attsV.includes(att)) && val && valAbs) {
            let scale = attsH.includes(att) ? scaleX : scaleY;
            scale = att === "r" && w != h ? scalRoot : scale;
            if (val.includes("%")) {
                valAbs = parseFloat(val) * scale;
            }
            //absolute units
            else {
                valAbs = translateUnitToPixel(val);
            }
            el.setAttribute(att, valAbs.toString());
        }
    });
}
