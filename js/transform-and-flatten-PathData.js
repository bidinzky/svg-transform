function flattenSVGTransformations(svg, options) {

    options = {
        ...{
            arcsToCubic: false,
            toRelative: true,
            toAbsolute: false,
            toLonghands: true,
            toShorthands: true,
            arcAccuracy: 1,
            minify: true,
            decimals: 3,
        },
        ...options,
    };

    let els = svg.querySelectorAll('text, path, polyline, polygon, line, rect, circle, ellipse');
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

function reduceElementTransforms(el, options) {

    options = {
        ...{
            arcsToCubic: false,
            toRelative: true,
            toAbsolute: false,
            toLonghands: true,
            toShorthands: true,
            arcAccuracy: 1,
            minify: true,
            decimals: 3,
        },
        ...options,
    };


    //decimals = 3, arcsToCubic = false, arcAccuracy = 1
    let { arcsToCubic, toRelative, toAbsolute, toLonghands, toShorthands, arcAccuracy, minify, decimals } = options;


    let parent = el.farthestViewportElement;
    // check elements transformations
    let matrix = parent.getScreenCTM().inverse().multiply(el.getScreenCTM());
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
                el.setAttribute('transform', transObj.svgTransform);
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
        let d = el.getAttribute("d");
        let pathData = parsePathDataNormalized(d);

        if (arcsToCubic) {
            pathData = pathDataArcToCubic(pathData, arcAccuracy)
        }

        pathData = transformPathData(pathData, matrix, decimals)


        //optimize output
        pathData = convertPathData(pathData, options)


        // apply pathdata - remove transform
        let dNew = pathDataToD(pathData, decimals, minify)
        el.setAttribute('d', dNew);
        el.removeAttribute('transform');
        el.style.removeProperty('transform');
        return pathData;
    }
}


function flipPath(path, flipX = false, flipY = false, options) {

    options = {
        ...{
            arcsToCubic: false,
            toRelative: true,
            toAbsolute: false,
            toLonghands: false,
            toShorthands: true,
            arcAccuracy: 1,
            minify: true,
            decimals: 3,
        },
        ...options,
    };

    let { arcsToCubic, toRelative, toAbsolute, toLonghands, toShorthands, arcAccuracy, minify, decimals } = options;

    let pathData = getPathDataFromEl(path)
    let { x, y, width, height } = path.getBBox();
    let transX = flipX ? x + width / 2 : 0
    let transY = flipY ? y + height / 2 : 0

    let scaleX = flipX ? -1 : 1
    let scaleY = flipY ? -1 : 1

    // emulate transform origin center
    let matrix = new DOMMatrix().translate(transX, transY).scale(scaleX, scaleY).translate(transX * -1, transY * -1)
    pathData = transformPathData(pathData, matrix, decimals)

    //optimize output
    pathData = convertPathData(pathData, options)
    path.setAttribute('d', pathDataToD(pathData, decimals, minify))

}


function scaleStrokeWidth(el, scale, decimals = 3) {
    let styles = window.getComputedStyle(el);
    let strokeWidth = styles.getPropertyValue('stroke-width');
    let stroke = styles.getPropertyValue('stroke');
    strokeWidth = stroke != 'none' ? Math.abs(parseFloat(strokeWidth) * scale) : 0;

    // exclude text elements, since they remain transformed
    if (strokeWidth && el.nodeName.toLowerCase() !== 'text') {
        el.setAttribute('stroke-width', +strokeWidth.toFixed(decimals + 2));
        el.style.removeProperty('stroke-width');
    }
}

/**
 * get element transforms
 */
function getElementTransform(el, parent, precision = 6) {
    let matrix = parent.getScreenCTM().inverse().multiply(el.getScreenCTM());
    let matrixVals = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].map(val => {
        return +val.toFixed(precision)
    });
    return matrixVals;
}

/**
 * copy attributes:
 * used for primitive to path conversions
 */
function copyAttributes(el, newEl) {
    let atts = [...el.attributes];
    let excludedAtts = ['d', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx',
        'ry', 'points', 'height', 'width'
    ];
    for (let a = 0; a < atts.length; a++) {
        let att = atts[a];
        if (excludedAtts.indexOf(att.nodeName) === -1) {
            let attrName = att.nodeName;
            let attrValue = att.nodeValue;
            newEl.setAttribute(attrName, attrValue + '');
        }
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
function qrDecomposeMatrix(matrix, precision = 3) {
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
    let transObj = {
        translateX: translateX,
        translateY: translateY,
        rotate: rotate,
        scaleX: scaleX,
        scaleY: scaleY,
        skewX: skewX,
        skewY: 0
    };
    let cssTransforms = [];
    let svgTransforms = [];
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


/**
* wrapper for scaling and shifting
*/
function scaleAndShiftPathData(
    pathData,
    scaleX = 1,
    scaleY = 1,
    shiftX = 0,
    shiftY = 0,
    decimals = 3
) {
    // translate transform functions to matrix
    let matrix = new DOMMatrix().translate(shiftX, shiftY).scale(scaleX, scaleY);
    return transformPathData(pathData, matrix, decimals);
}

/**
 * transform path elements
 */

function transformPath(path, options) {
    // merge custom parameters with defaults
    options = {
        ...{
            scaleX: 1,
            scaleY: 1,
            translateX: 0,
            translateY: 0,
            skewX: 0,
            skewY: 0,
            rotate: 0,
            matrix: [1, 0, 0, 1, 0, 0],
            decimals: 3,
            toRelative: true,
            toShorthands: true,
            transfomOrigin: "center"
        },
        ...options
    };

    let { scaleX, scaleY, translateX, translateY, skewX, skewY, rotate,
        matrix, transfomOrigin,
        decimals
    } = options;

    if (transfomOrigin == "center") {
        let bb = path.getBBox();
        translateX += bb.x + bb.width / 2;
        translateY += bb.y + bb.height / 2;
    }

    if (matrix.join("") === "100100") {
        matrix = new DOMMatrix()
            .translate(translateX, translateY)
            .rotate(rotate)
            .scale(scaleX, scaleY)
            .skewX(skewX)
            .skewY(skewY)
            .translate(translateX * -1, translateY * -1);
    }


    let pathData = getPathDataFromEl(path);
    pathData = transformPathData(pathData, matrix, decimals);

    //optimize output
    pathData = convertPathData(pathData, options);
    path.setAttribute("d", pathDataToD(pathData, decimals, true));

    return { pathData: pathData, matrix: matrix };
}



/**
 * scale pathData
 */
function transformPathData(pathData, matrix, decimals = 3) {

    // new pathdata
    let pathDataTrans = [];

    // transform point by 2d matrix
    const transformPoint = (pt, matrix) => {
        let { a, b, c, d, e, f } = matrix;
        let { x, y } = pt;
        return { x: a * x + c * y + e, y: b * x + d * y + f };
    }

    //normalize matrix notations object, array or css matrix string
    const normalizeMatrix = (matrix) => {
        matrix =
            typeof matrix === "string"
                ? (matrix = matrix
                    .replace(/^matrix\(|\)$/g, "")
                    .split(",")
                    .map(Number))
                : matrix;
        matrix = !Array.isArray(matrix)
            ? {
                a: matrix.a,
                b: matrix.b,
                c: matrix.c,
                d: matrix.d,
                e: matrix.e,
                f: matrix.f
            }
            : {
                a: matrix[0],
                b: matrix[1],
                c: matrix[2],
                d: matrix[3],
                e: matrix[4],
                f: matrix[5]
            };
        return matrix;
    }


    const transformArc = (p0, values, matrix) => {
        let [rx, ry, angle, largeArc, sweep, x, y] = values;

        /**
        * parametrize arc command 
        * to get the actual arc params
        */
        let arcData = svgArcToCenterParam(
            p0.x,
            p0.y,
            values[0],
            values[1],
            angle,
            largeArc,
            sweep,
            x,
            y
        );
        ({ rx, ry } = arcData);
        let { a, b, c, d, e, f } = matrix;

        let ellipsetr = transformEllipse(rx, ry, angle, matrix);
        let p = transformPoint({ x: x, y: y }, matrix);


        // adjust sweep if flipped
        let denom = a ** 2 + b ** 2;
        let scaleX = Math.sqrt(denom)
        let scaleY = (a * d - c * b) / scaleX

        let flipX = scaleX < 0 ? true : false;
        let flipY = scaleY < 0 ? true : false;


        // adjust sweep
        if (flipX || flipY) {
            sweep = sweep === 0 ? 1 : 0;
        }

        return {
            type: 'A',
            values: [
                ellipsetr.rx,
                ellipsetr.ry,
                ellipsetr.ax,
                largeArc,
                sweep,
                p.x,
                p.y]
        };
    }

    // normalize matrix input
    matrix = normalizeMatrix(matrix);

    let matrixStr = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]
        .map((val) => {
            return +val.toFixed(1);
        })
        .join("");

    // no transform: quit
    if (matrixStr === "100100") {
        //console.log("no transform");
        return pathData;
    }

    pathData.forEach((com, i) => {
        let { type, values } = com;
        let typeRel = type.toLowerCase();
        let comPrev = i > 0 ? pathData[i - 1] : pathData[i];
        let comPrevValues = comPrev.values;
        let comPrevValuesL = comPrevValues.length;
        let p0 = {
            x: comPrevValues[comPrevValuesL - 2],
            y: comPrevValues[comPrevValuesL - 1]
        };
        let p = { x: values[values.length - 2], y: values[values.length - 1] };
        let comT = { type: type, values: [] };

        switch (typeRel) {
            case "a":
                comT = transformArc(p0, values, matrix)
                break;

            default:
                // all other point based commands
                if (values.length) {
                    for (let i = 0; i < values.length; i += 2) {
                        let ptTrans = transformPoint(
                            { x: com.values[i], y: com.values[i + 1] },
                            matrix
                        );
                        comT.values[i] = ptTrans.x;
                        comT.values[i + 1] = ptTrans.y;
                    }
                }
        }

        pathDataTrans.push(comT);
    });
    return pathDataTrans;
}

/**
 * Based on: https://github.com/fontello/svgpath/blob/master/lib/ellipse.js
 * and fork: https://github.com/kpym/SVGPathy/blob/master/lib/ellipse.js
 */

function transformEllipse(rx, ry, ax, matrix) {
    const torad = Math.PI / 180;
    const epsilon = 1e-7;

    //normalize matrix object or array notations
    matrix = !Array.isArray(matrix)
        ? matrix
        : {
            a: matrix[0],
            b: matrix[1],
            c: matrix[2],
            d: matrix[3],
            e: matrix[4],
            f: matrix[5]
        };

    // We consider the current ellipse as image of the unit circle
    // by first scale(rx,ry) and then rotate(ax) ...
    // So we apply ma =  m x rotate(ax) x scale(rx,ry) to the unit circle.
    var c = Math.cos(ax * torad),
        s = Math.sin(ax * torad);
    var ma = [
        rx * (matrix.a * c + matrix.c * s),
        rx * (matrix.b * c + matrix.d * s),
        ry * (-matrix.a * s + matrix.c * c),
        ry * (-matrix.b * s + matrix.d * c)
    ];

    // ma * transpose(ma) = [ J L ]
    //                      [ L K ]
    // L is calculated later (if the image is not a circle)
    var J = ma[0] * ma[0] + ma[2] * ma[2],
        K = ma[1] * ma[1] + ma[3] * ma[3];

    // the sqrt of the discriminant of the characteristic polynomial of ma * transpose(ma)
    // this is also the geometric mean of the eigenvalues
    var D = Math.sqrt(
        ((ma[0] - ma[3]) * (ma[0] - ma[3]) + (ma[2] + ma[1]) * (ma[2] + ma[1])) *
        ((ma[0] + ma[3]) * (ma[0] + ma[3]) + (ma[2] - ma[1]) * (ma[2] - ma[1]))
    );

    // the arithmetic mean of the eigenvalues
    var JK = (J + K) / 2;

    // check if the image is (almost) a circle
    if (D <= epsilon) {
        rx = ry = Math.sqrt(JK);
        ax = 0;
        return { rx: rx, ry: ry, ax: ax };
    }

    // check if ma * transpose(ma) is (almost) diagonal
    if (Math.abs(D - Math.abs(J - K)) <= epsilon) {
        rx = Math.sqrt(J);
        ry = Math.sqrt(K);
        ax = 0;
        return { rx: rx, ry: ry, ax: ax };
    }

    // if it is not a circle, nor diagonal
    var L = ma[0] * ma[1] + ma[2] * ma[3];

    // {l1,l2} = the two eigen values of ma * transpose(ma)
    var l1 = JK + D / 2,
        l2 = JK - D / 2;

    // the x - axis - rotation angle is the argument of the l1 - eigenvector
    if (Math.abs(L) <= epsilon && Math.abs(l1 - K) <= epsilon) {
        // if (ax == 90) => ax = 0 and exchange axes
        ax = 0;
        rx = Math.sqrt(l2);
        ry = Math.sqrt(l1);
        return { rx: rx, ry: ry, ax: ax };
    }

    ax =
        Math.atan(Math.abs(L) > Math.abs(l1 - K) ? (l1 - J) / L : L / (l1 - K)) /
        torad; // the angle in degree

    // if ax > 0 => rx = sqrt(l1), ry = sqrt(l2), else exchange axes and ax += 90
    if (ax >= 0) {
        // if ax in [0,90]
        rx = Math.sqrt(l1);
        ry = Math.sqrt(l2);
    } else {
        // if ax in ]-90,0[ => exchange axes
        ax += 90;
        rx = Math.sqrt(l2);
        ry = Math.sqrt(l1);
    }

    return { rx: rx, ry: ry, ax: ax };
}


/**
* based on @cuixiping;
* https://stackoverflow.com/questions/9017100/calculate-center-of-svg-arc/12329083#12329083
*/
function svgArcToCenterParam(p0x, p0y, rx, ry, angle, largeArc, sweep, px, py) {

    const radian = (ux, uy, vx, vy) => {
        let dot = ux * vx + uy * vy;
        let mod = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
        let rad = Math.acos(dot / mod);
        if (ux * vy - uy * vx < 0) {
            rad = -rad;
        }
        return rad;
    };

    // degree to radian: if rx===ry the angle param has no effect
    let phi = rx === ry ? 0 : (+angle * Math.PI) / 180;

    let cx, cy, startAngle, deltaAngle, endAngle;
    let PI = Math.PI;
    let PIpx = PI * 2;

    if (rx == 0 || ry == 0) {
        // invalid arguments
        throw Error("rx and ry can not be 0");
    }

    // ensure rx and ry are positive
    if (rx < 0 || ry < 0) {
        [rx, ry] = [Math.abs(rx), Math.abs(ry)]
    }

    let s_phi = phi === 0 ? 0 : Math.sin(phi);
    let c_phi = phi === 0 ? 1 : Math.cos(phi);

    let hd_x = (p0x - px) / 2; // half diff of x
    let hd_y = (p0y - py) / 2; // half diff of y
    let hs_x = (p0x + px) / 2; // half sum of x
    let hs_y = (p0y + py) / 2; // half sum of y

    // F6.5.1
    let p0x_ = c_phi * hd_x + s_phi * hd_y;
    let p0y_ = c_phi * hd_y - s_phi * hd_x;

    // F.6.6 Correction of out-of-range radii
    //   Step 3: Ensure radii are large enough
    let lambda = (p0x_ * p0x_) / (rx * rx) + (p0y_ * p0y_) / (ry * ry);

    if (lambda > 1) {
        rx = rx * Math.sqrt(lambda);
        ry = ry * Math.sqrt(lambda);
    }

    let rxry = rx * ry;
    let rxp0y_ = rx * p0y_;
    let ryp0x_ = ry * p0x_;
    let sum_of_sq = rxp0y_ * rxp0y_ + ryp0x_ * ryp0x_; // sum of square
    if (!sum_of_sq) {
        throw Error("start point can not be same as end point");
    }

    let coe = Math.sqrt(Math.abs((rxry * rxry - sum_of_sq) / sum_of_sq));

    if (largeArc == sweep) {
        coe = -coe;
    }
    // F6.5.2
    let cx_ = (coe * rxp0y_) / ry;
    let cy_ = (-coe * ryp0x_) / rx;

    // F6.5.3
    cx = c_phi * cx_ - s_phi * cy_ + hs_x;
    cy = s_phi * cx_ + c_phi * cy_ + hs_y;
    let xcr1 = (p0x_ - cx_) / rx;
    let xcr2 = (p0x_ + cx_) / rx;
    let ycr1 = (p0y_ - cy_) / ry;
    let ycr2 = (p0y_ + cy_) / ry;

    // F6.5.5
    startAngle = radian(1, 0, xcr1, ycr1);

    // F6.5.6
    deltaAngle = radian(xcr1, ycr1, -xcr2, -ycr2);

    if (deltaAngle > PIpx) {
        deltaAngle -= PIpx;
    } else if (deltaAngle < 0) {
        deltaAngle += PIpx;
    }
    if (sweep == false || sweep == 0) {
        deltaAngle -= PIpx;
    }
    endAngle = startAngle + deltaAngle;
    if (endAngle > PIpx) {
        endAngle -= PIpx;
    } else if (endAngle < 0) {
        endAngle += PIpx;
    }
    let toDegFactor = 180 / PI;
    let outputObj = {
        cx: cx,
        cy: cy,
        rx: rx,
        ry: ry,
        startAngle_deg: startAngle * toDegFactor,
        startAngle: startAngle,
        deltaAngle_deg: deltaAngle * toDegFactor,
        deltaAngle: deltaAngle,
        endAngle_deg: endAngle * toDegFactor,
        endAngle: endAngle,
        clockwise: sweep == true || sweep == 1
    };

    return outputObj;
}

/**
 * This is just a port of Dmitry Baranovskiy's
 * pathToRelative/Absolute methods used in snap.svg
 * https://github.com/adobe-webplatform/Snap.svg/
 *
 * Demo: https://codepen.io/herrstrietzel/pen/poVKbgL
 */

// convert to relative commands
function pathDataToRelative(pathData, decimals = -1) {

    // pre-round coordinates to prevent distortions for lower floating point accuracy
    if (decimals > -1) {
        pathData.forEach(com => {
            com.values = com.type.toLowerCase() !== 'a' ? com.values.map(val => { return +val.toFixed(decimals) }) : com.values
        })
    }

    let M = pathData[0].values;
    let x = M[0],
        y = M[1],
        mx = x,
        my = y;

    // loop through commands
    for (let i = 1; i < pathData.length; i++) {
        let com = pathData[i];
        let { type, values } = com;
        let typeRel = type.toLowerCase();

        // is absolute
        if (type != typeRel) {
            type = typeRel;
            com.type = type;
            // check current command types
            switch (typeRel) {
                case "a":
                    values[5] = +(values[5] - x);
                    values[6] = +(values[6] - y);
                    break;
                case "v":
                    values[0] = +(values[0] - y);
                    break;
                case "m":
                    mx = values[0];
                    my = values[1];
                default:
                    // other commands
                    if (values.length) {
                        for (let v = 0; v < values.length; v++) {
                            // even value indices are y coordinates
                            values[v] = values[v] - (v % 2 ? y : x);
                        }
                    }
            }
        }
        // is already relative
        else if (type == "m") {
            mx = values[0] + x;
            my = values[1] + y;
        }
        let vLen = values.length;
        switch (type) {
            case "z":
                x = mx;
                y = my;
                break;
            case "h":
                x += values[vLen - 1];
                break;
            case "v":
                y += values[vLen - 1];
                break;
            default:
                x += values[vLen - 2];
                y += values[vLen - 1];
        }
        // round final relative values
        if (decimals > -1) {
            if (typeRel === 'a') {
                com.values = [
                    +com.values[0].toFixed(decimals + 2),
                    +com.values[1].toFixed(decimals + 2),
                    +com.values[2].toFixed(decimals + 2),
                    +com.values[3],
                    +com.values[4],
                    +com.values[5].toFixed(decimals + 1),
                    +com.values[6].toFixed(decimals + 1)
                ]

            } else {
                com.values = com.values.map((val) => {
                    return +val.toFixed(decimals);
                });
            }
        }
    }

    return pathData;
}

/**
 * apply shorthand commands if possible
 * L, L, C, Q => H, V, S, T
 * reversed method: pathDataToLonghands()
 */
function pathDataToShorthands(pathData, decimals = -1) {

    let comShort = {
        type: "M",
        values: pathData[0].values
    };
    let pathDataShorts = [comShort];
    for (let i = 1; i < pathData.length; i++) {
        let com = pathData[i];
        let { type, values } = com;
        let valuesL = values.length;
        let comPrev = pathData[i - 1];
        let valuesPrev = comPrev.values;
        let valuesPrevL = valuesPrev.length;
        let [x, y] = [values[valuesL - 2], values[valuesL - 1]];
        let cp1X, cp1Y, cp2X, cp2Y;
        let [prevX, prevY] = [
            valuesPrev[valuesPrevL - 2],
            valuesPrev[valuesPrevL - 1]
        ];
        let val0R,
            cpN1XR,
            val1R,
            cpN1YR,
            cpN1X,
            cpN1Y,
            cpN2X,
            cpN2Y,
            prevXR,
            prevYR;

        switch (type) {
            case "L":
                // round coordinates for some tolerance
                [val0R, prevXR, val1R, prevYR] = [values[0], prevX, values[1], prevY];

                if (comPrev.type !== "H" && comPrev.type !== "V") {
                    [val0R, prevXR, val1R, prevYR] = [val0R, prevXR, val1R, prevYR].map(
                        (val) => {
                            return +val.toFixed(2);
                        }
                    );
                }

                if (prevYR == val1R && prevXR !== val0R) {
                    comShort = {
                        type: "H",
                        values: [values[0]]
                    };
                } else if (prevXR == val0R && prevYR !== val1R) {
                    comShort = {
                        type: "V",
                        values: [values[1]]
                    };
                } else {
                    comShort = com;
                }
                break;
            case "Q":
                [cp1X, cp1Y] = [valuesPrev[0], valuesPrev[1]];
                [prevX, prevY] = [
                    valuesPrev[valuesPrevL - 2],
                    valuesPrev[valuesPrevL - 1]
                ];
                // Q control point
                cpN1X = prevX + (prevX - cp1X);
                cpN1Y = prevY + (prevY - cp1Y);

                /**
                 * control points can be reflected
                 * use rounded values for better tolerance
                 */
                [val0R, cpN1XR, val1R, cpN1YR] = [
                    values[0],
                    cpN1X,
                    values[1],
                    cpN1Y
                ].map((val) => {
                    return +val.toFixed(1);
                });

                if (val0R == cpN1XR && val1R == cpN1YR) {
                    comShort = {
                        type: "T",
                        values: [x, y]
                    };
                } else {
                    comShort = com;
                }
                break;
            case "C":
                [cp1X, cp1Y] = [valuesPrev[0], valuesPrev[1]];
                [cp2X, cp2Y] =
                    valuesPrevL > 2
                        ? [valuesPrev[2], valuesPrev[3]]
                        : [valuesPrev[0], valuesPrev[1]];
                [prevX, prevY] = [
                    valuesPrev[valuesPrevL - 2],
                    valuesPrev[valuesPrevL - 1]
                ];
                // C control points
                cpN1X = 2 * prevX - cp2X;
                cpN1Y = 2 * prevY - cp2Y;
                cpN2X = values[2];
                cpN2Y = values[3];

                /**
                 * control points can be reflected
                 * use rounded values for better tolerance
                 */
                [val0R, cpN1XR, val1R, cpN1YR] = [
                    values[0],
                    cpN1X,
                    values[1],
                    cpN1Y
                ].map((val) => {
                    return +val.toFixed(1);
                });

                if (val0R == cpN1XR && val1R == cpN1YR) {
                    comShort = {
                        type: "S",
                        values: [cpN2X, cpN2Y, x, y]
                    };
                } else {
                    comShort = com;
                }
                break;
            default:
                comShort = {
                    type: type,
                    values: values
                };
        }

        // round final values
        if (decimals > -1) {
            comShort.values = comShort.values.map((val) => {
                return +val.toFixed(decimals);
            });
        }

        pathDataShorts.push(comShort);
    }
    return pathDataShorts;
}



// retrieve pathdata from svg geometry elements
function getPathDataFromEl(el) {
    let pathData = [];
    let type = el.nodeName;
    let atts, attNames, d, x, y, width, height, r, rx, ry, cx, cy, x1, x2, y1, y2;

    // convert relative or absolute units 
    svgElUnitsToPixel(el)

    const getAtts = (attNames) => {
        atts = {}
        attNames.forEach(att => {
            atts[att] = +el.getAttribute(att)
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

            let points = el.getAttribute('points').replaceAll(',', ' ').split(' ').filter(Boolean)

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
            break;
    }

    return pathData;
};


/**
 * retrieve patData from primitives:
 * <circle>, <ellipse>, <rect>, <polygon>, <polyline>, <line>, 
 */

function convertShapeToPath(el, decimals = 3) {
    let pathData = getPathDataFromEl(el);

    // create path element
    let path = document.createElementNS("http://www.w3.org/2000/svg", "path");

    // get all attributes as object
    const setAttributes = (el, attributes, exclude = []) => {
        for (let key in attributes) {
            if (exclude.indexOf(key) === -1) {
                el.setAttribute(key, attributes[key]);
            }
        }
    }
    const getAttributes = (el) => {
        let attArr = [...el.attributes];
        let attObj = {};
        attArr.forEach((att) => {
            attObj[att.nodeName] = att.nodeValue;
        });
        return attObj;
    }

    let attributes = getAttributes(el);

    //exclude attributes not needed for paths
    let exclude = ["x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "points", "width", "height"];

    // copy attributes to path and set pathData
    setAttributes(path, attributes, exclude);
    let d = pathDataToD(pathData, decimals)
    path.setAttribute('d', d);
    el.replaceWith(path);
    return path;
}

function svgElUnitsToPixel(el, decimals = 5) {
    const svg = el.nodeName !== "svg" ? el.closest("svg") : el;

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
    let width = svg.getAttribute("width");
    width = width ? translateUnitToPixel(width) : 300;
    let height = svg.getAttribute("height");
    height = width ? translateUnitToPixel(height) : 150;

    //prefer viewBox values
    let vB = svg.getAttribute("viewBox");
    vB = vB
        ? vB
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
        let valAbs = val;
        if (attsH.includes(att) || attsV.includes(att)) {
            let scale = attsH.includes(att) ? scaleX : scaleY;
            scale = att === "r" && w != h ? scalRoot : scale;
            let unit = val.match(/([a-z|%]+)/gi);
            unit = unit ? unit[0] : "";
            if (val.includes("%")) {
                valAbs = parseFloat(val) * scale;
            }
            //absolute units
            else {
                valAbs = translateUnitToPixel(val);
            }
            el.setAttribute(att, +valAbs);
        }
    });
}


function convertPathData(pathData, options) {
    options = {
        ...{
            arcsToCubic: false,
            toRelative: true,
            toAbsolute: false,
            toLonghands: false,
            toShorthands: true,
            arcAccuracy: 1,
            minify: true,
            decimals: 3,
        },
        ...options,
    };

    //decimals = 3, arcsToCubic = false, arcAccuracy = 1
    let { arcsToCubic, toRelative, toAbsolute, toLonghands, toShorthands, arcAccuracy, minify, decimals } = options;

    /**
    * optimise pathData:
    * apply shorthands if possible
    * use relative commands, round pathdata
    */
    if (arcsToCubic) {
        pathData = pathDataArcToCubic(pathData, arcAccuracy)
    }

    if (toShorthands) {
        pathData = pathDataToShorthands(pathData)
    }
    if (toRelative) {
        pathData = pathDataToRelative(pathData, decimals)
    }

    return pathData

}


/**
 * serialize pathData array to
 * d attribute string
 */
function pathDataToD(pathData, decimals = -1, minify = false) {
    // implicit l command
    if (pathData[1].type === "l" && minify) {
        pathData[0].type = "m";
    }

    let d = `${pathData[0].type}${pathData[0].values.map(val => { return +val.toFixed(decimals) }).join(" ")}`;

    for (let i = 1; i < pathData.length; i++) {
        let com0 = pathData[i - 1];
        let com = pathData[i];
        let { type, values } = com;

        // minify arctos
        // yet another arc exception ... since they need more accuracy for rx, ry, x-rotation
        if (type === "a" || type === "A" && decimals > -1) {
            values = [
                +values[0].toFixed(decimals + 1),
                +values[1].toFixed(decimals + 1),
                +values[2].toFixed(decimals + 1),
                minify ? [values[3], values[4], +values[5].toFixed(decimals)].join("") : [values[3], values[4], +values[5].toFixed(decimals)].flat(),
                +values[6].toFixed(decimals)
            ];
        }

        // round
        else if (values.length && decimals > -1) {
            values = values.map((val) => {
                return typeof val === "number" ? +val.toFixed(decimals) : val;
            });
        }

        // omit type for repeated commands
        type = com0.type === com.type && com.type.toLowerCase() != "m" && minify
            ? " "
            : ((com0.type === "m" && com.type === "l") ||
                (com0.type === "M" && com.type === "l") ||
                (com0.type === "M" && com.type === "L")) &&
                minify
                ? " "
                : com.type;

        d += `${type}${values.join(" ")}`;
    }

    if (minify) {
        d = d
            .replaceAll(" 0.", " .")
            .replaceAll(" -", "-")
            .replaceAll("-0.", "-.")
            .replaceAll(" .", ".")
            .replaceAll("Z", "z");
    }
    return d;
}



/** 
 * convert arctocommands to cubic bezier
 * based on puzrin's a2c.js
 * https://github.com/fontello/svgpath/blob/master/lib/a2c.js
 * returns pathData array
*/

function pathDataArcToCubic(pathData, arcAccuracy = 1) {
    let pathDataAbs = []
    pathData.forEach((com, i) => {
        let { type, values } = com;
        let comPrev = i > 0 ? pathData[i - 1] : com;
        let valuesPrev = comPrev.values;
        let valuesPrevL = valuesPrev.length;
        let p0 = { x: valuesPrev[valuesPrevL - 2], y: valuesPrev[valuesPrevL - 1] };

        if (type.toLowerCase() === 'a') {
            let cubicArcs = arcToBezier(p0, values, arcAccuracy);
            for (let i = 0; i < cubicArcs.length; i++) {
                let cubicArc = cubicArcs[i]
                pathDataAbs.push(cubicArc);
            }
        } else {
            pathDataAbs.push(com);
        }

    })
    return pathDataAbs
}


function arcToBezier(p0, values, splitSegments = 1) {
    const TAU = Math.PI * 2;
    let [rx, ry, rotation, largeArcFlag, sweepFlag, x, y] = values;

    if (rx === 0 || ry === 0) {
        return []
    }

    let phi = rotation ? rotation * TAU / 360 : 0;
    let sinphi = phi ? Math.sin(phi) : 0
    let cosphi = phi ? Math.cos(phi) : 1
    let pxp = cosphi * (p0.x - x) / 2 + sinphi * (p0.y - y) / 2
    let pyp = -sinphi * (p0.x - x) / 2 + cosphi * (p0.y - y) / 2

    if (pxp === 0 && pyp === 0) {
        return []
    }
    rx = Math.abs(rx)
    ry = Math.abs(ry)
    let lambda =
        pxp * pxp / (rx * rx) +
        pyp * pyp / (ry * ry)
    if (lambda > 1) {
        let lambdaRt = Math.sqrt(lambda);
        rx *= lambdaRt
        ry *= lambdaRt
    }

    /** 
     * parametrize arc to 
     * get center point start and end angles
     */
    let rxsq = rx * rx,
        rysq = rx === ry ? rxsq : ry * ry

    let pxpsq = pxp * pxp,
        pypsq = pyp * pyp
    let radicant = (rxsq * rysq) - (rxsq * pypsq) - (rysq * pxpsq)

    if (radicant <= 0) {
        radicant = 0
    } else {
        radicant /= (rxsq * pypsq) + (rysq * pxpsq)
        radicant = Math.sqrt(radicant) * (largeArcFlag === sweepFlag ? -1 : 1)
    }

    let centerxp = radicant ? radicant * rx / ry * pyp : 0
    let centeryp = radicant ? radicant * -ry / rx * pxp : 0
    let centerx = cosphi * centerxp - sinphi * centeryp + (p0.x + x) / 2
    let centery = sinphi * centerxp + cosphi * centeryp + (p0.y + y) / 2

    let vx1 = (pxp - centerxp) / rx
    let vy1 = (pyp - centeryp) / ry
    let vx2 = (-pxp - centerxp) / rx
    let vy2 = (-pyp - centeryp) / ry

    // get start and end angle
    const vectorAngle = (ux, uy, vx, vy) => {
        let dot = +(ux * vx + uy * vy).toFixed(9)
        if (dot === 1 || dot === -1) {
            return dot === 1 ? 0 : Math.PI
        }
        dot = dot > 1 ? 1 : (dot < -1 ? -1 : dot)
        let sign = (ux * vy - uy * vx < 0) ? -1 : 1
        return sign * Math.acos(dot);
    }

    let ang1 = vectorAngle(1, 0, vx1, vy1),
        ang2 = vectorAngle(vx1, vy1, vx2, vy2)

    if (sweepFlag === 0 && ang2 > 0) {
        ang2 -= Math.PI * 2
    }
    else if (sweepFlag === 1 && ang2 < 0) {
        ang2 += Math.PI * 2
    }

    let ratio = +(Math.abs(ang2) / (TAU / 4)).toFixed(0)

    // increase segments for more accureate length calculations
    let segments = ratio * splitSegments;
    ang2 /= segments
    let pathDataArc = [];


    // If 90 degree circular arc, use a constant
    // https://pomax.github.io/bezierinfo/#circles_cubic
    // k=0.551784777779014
    const angle90 = 1.5707963267948966;
    const k = 0.551785
    let a = ang2 === angle90 ? k :
        (
            ang2 === -angle90 ? -k : 4 / 3 * Math.tan(ang2 / 4)
        );

    let cos2 = ang2 ? Math.cos(ang2) : 1;
    let sin2 = ang2 ? Math.sin(ang2) : 0;
    let type = 'C'

    const approxUnitArc = (ang1, ang2, a, cos2, sin2) => {
        let x1 = ang1 != ang2 ? Math.cos(ang1) : cos2;
        let y1 = ang1 != ang2 ? Math.sin(ang1) : sin2;
        let x2 = Math.cos(ang1 + ang2);
        let y2 = Math.sin(ang1 + ang2);

        return [
            { x: x1 - y1 * a, y: y1 + x1 * a },
            { x: x2 + y2 * a, y: y2 - x2 * a },
            { x: x2, y: y2 }
        ];
    }

    for (let i = 0; i < segments; i++) {
        let com = { type: type, values: [] }
        let curve = approxUnitArc(ang1, ang2, a, cos2, sin2);

        curve.forEach((pt) => {
            let x = pt.x * rx
            let y = pt.y * ry
            com.values.push(cosphi * x - sinphi * y + centerx, sinphi * x + cosphi * y + centery)
        })
        pathDataArc.push(com);
        ang1 += ang2
    }

    return pathDataArc;
}



/**
 * Standalone pathData parser
 * including normalization options
 * returns a pathData array compliant
 * with the w3C SVGPathData interface draft
 * https://svgwg.org/specs/paths/#InterfaceSVGPathData
 * Usage example:
 */

function parsePathDataNormalized(d, options = {}) {
    d = d
        // remove new lines, tabs an comma with whitespace
        .replace(/[\n\r\t|,]/g, " ")
        // pre trim left and right whitespace
        .trim()
        // add space before minus sign
        .replace(/(\d)-/g, "$1 -")
        // decompose multiple adjacent decimal delimiters like 0.5.5.5 => 0.5 0.5 0.5
        .replace(/(\.)(?=(\d+\.\d+)+)(\d+)/g, "$1$3 ");

    let pathData = [];
    let cmdRegEx = /([mlcqazvhst])([^mlcqazvhst]*)/gi;
    let commands = d.match(cmdRegEx);

    // valid command value lengths
    let comLengths = { m: 2, a: 7, c: 6, h: 1, l: 2, q: 4, s: 4, t: 2, v: 1, z: 0 };

    // offsets for absolute conversion
    let offX, offY, lastX, lastY;

    for (let c = 0; c < commands.length; c++) {
        let com = commands[c];
        let type = com.substring(0, 1);
        let typeRel = type.toLowerCase();
        let typeAbs = type.toUpperCase();
        let isRel = type === typeRel;
        let chunkSize = comLengths[typeRel];

        // split values to array
        let values = com.substring(1, com.length).trim().split(" ").filter(Boolean);

        /**
         * A - Arc commands
         * large arc and sweep flags
         * are boolean and can be concatenated like
         * 11 or 01
         * or be concatenated with the final on path points like
         * 1110 10 => 1 1 10 10
         */
        if (typeRel === "a" && values.length != comLengths.a) {
            let n = 0,
                arcValues = [];
            for (let i = 0; i < values.length; i++) {
                let value = values[i];

                // reset counter
                if (n >= chunkSize) {
                    n = 0;
                }
                // if 3. or 4. parameter longer than 1
                if ((n === 3 || n === 4) && value.length > 1) {
                    let largeArc = n === 3 ? value.substring(0, 1) : "";
                    let sweep = n === 3 ? value.substring(1, 2) : value.substring(0, 1);
                    let finalX = n === 3 ? value.substring(2) : value.substring(1);
                    let comN = [largeArc, sweep, finalX].filter(Boolean);
                    arcValues.push(comN);
                    n += comN.length;
                } else {
                    // regular
                    arcValues.push(value);
                    n++;
                }
            }
            values = arcValues.flat().filter(Boolean);
        }

        // string  to number
        values = values.map(Number);

        // if string contains repeated shorthand commands - split them
        let hasMultiple = values.length > chunkSize;
        let chunk = hasMultiple ? values.slice(0, chunkSize) : values;
        let comChunks = [{ type: type, values: chunk }];

        // has implicit or repeated commands – split into chunks
        if (hasMultiple) {
            let typeImplicit = typeRel === "m" ? (isRel ? "l" : "L") : type;
            for (let i = chunkSize; i < values.length; i += chunkSize) {
                let chunk = values.slice(i, i + chunkSize);
                comChunks.push({ type: typeImplicit, values: chunk });
            }
        }

        /**
         * convert to absolute
         * init offset from 1st M
         */
        if (c === 0) {
            offX = values[0];
            offY = values[1];
            lastX = offX;
            lastY = offY;
        }

        let typeFirst = comChunks[0].type;
        typeAbs = typeFirst.toUpperCase();

        // first M is always absolute
        isRel =
            typeFirst.toLowerCase() === typeFirst && pathData.length ? true : false;

        for (let i = 0; i < comChunks.length; i++) {
            let com = comChunks[i];
            let type = com.type;
            let values = com.values;
            let valuesL = values.length;
            let comPrev = comChunks[i - 1]
                ? comChunks[i - 1]
                : c > 0 && pathData[pathData.length - 1]
                    ? pathData[pathData.length - 1]
                    : comChunks[i];

            let valuesPrev = comPrev.values;
            let valuesPrevL = valuesPrev.length;
            isRel =
                comChunks.length > 1
                    ? type.toLowerCase() === type && pathData.length
                    : isRel;

            if (isRel) {
                com.type = comChunks.length > 1 ? type.toUpperCase() : typeAbs;

                switch (typeRel) {
                    case "a":
                        com.values = [
                            values[0],
                            values[1],
                            values[2],
                            values[3],
                            values[4],
                            values[5] + offX,
                            values[6] + offY
                        ];
                        break;

                    case "h":
                    case "v":
                        com.values = type === "h" ? [values[0] + offX] : [values[0] + offY];
                        break;

                    case "m":
                    case "l":
                    case "t":
                        com.values = [values[0] + offX, values[1] + offY];
                        break;

                    case "c":
                        com.values = [
                            values[0] + offX,
                            values[1] + offY,
                            values[2] + offX,
                            values[3] + offY,
                            values[4] + offX,
                            values[5] + offY
                        ];
                        break;

                    case "q":
                    case "s":
                        com.values = [
                            values[0] + offX,
                            values[1] + offY,
                            values[2] + offX,
                            values[3] + offY
                        ];
                        break;
                }
            }
            // is absolute
            else {
                offX = 0;
                offY = 0;
            }

            /**
             * convert shorthands
             */
            let shorthandTypes = ["H", "V", "S", "T"];

            if (shorthandTypes.includes(typeAbs)) {
                let cp1X, cp1Y, cpN1X, cpN1Y, cp2X, cp2Y;
                if (com.type === "H" || com.type === "V") {
                    com.values =
                        com.type === "H" ? [com.values[0], lastY] : [lastX, com.values[0]];
                    com.type = "L";
                } else if (com.type === "T" || com.type === "S") {
                    [cp1X, cp1Y] = [valuesPrev[0], valuesPrev[1]];
                    [cp2X, cp2Y] =
                        valuesPrevL > 2
                            ? [valuesPrev[2], valuesPrev[3]]
                            : [valuesPrev[0], valuesPrev[1]];

                    // new control point
                    cpN1X = com.type === "T" ? lastX * 2 - cp1X : lastX * 2 - cp2X;
                    cpN1Y = com.type === "T" ? lastY * 2 - cp1Y : lastY * 2 - cp2Y;

                    com.values = [cpN1X, cpN1Y, com.values].flat();
                    com.type = com.type === "T" ? "Q" : "C";
                }
            }

            // add to pathData array
            pathData.push(com);

            // update offsets
            lastX =
                valuesL > 1
                    ? values[valuesL - 2] + offX
                    : typeRel === "h"
                        ? values[0] + offX
                        : lastX;
            lastY =
                valuesL > 1
                    ? values[valuesL - 1] + offY
                    : typeRel === "v"
                        ? values[0] + offY
                        : lastY;
            offX = lastX;
            offY = lastY;
        }
    }

    /**
     * first M is always absolute/uppercase -
     * unless it adds relative linetos
     * (facilitates d concatenating)
     */
    pathData[0].type = "M";

    return pathData;
}




/** 
 * convert arctocommands to cubic bezier
 * based on puzrin's a2c.js
 * https://github.com/fontello/svgpath/blob/master/lib/a2c.js
 * returns pathData array
*/

function pathDataArcToCubic(pathData, arcAccuracy) {
    let pathDataAbs = []
    pathData.forEach((com, i) => {
        let { type, values } = com;
        let comPrev = i > 0 ? pathData[i - 1] : com;
        let valuesPrev = comPrev.values;
        let valuesPrevL = valuesPrev.length;
        let p0 = { x: valuesPrev[valuesPrevL - 2], y: valuesPrev[valuesPrevL - 1] };

        if (type.toLowerCase() === 'a') {
            let cubicArcs = arcToBezier(p0, values, arcAccuracy);
            for (let i = 0; i < cubicArcs.length; i++) {
                let cubicArc = cubicArcs[i]
                pathDataAbs.push(cubicArc);
            }
        } else {
            pathDataAbs.push(com);
        }

    })

    //console.log('arc',pathDataAbs);
    return pathDataAbs
}


function arcToBezier(p0, values, splitSegments = 1) {
    const TAU = Math.PI * 2;
    let [rx, ry, rotation, largeArcFlag, sweepFlag, x, y] = values;

    if (rx === 0 || ry === 0) {
        return []
    }

    let phi = rotation ? rotation * TAU / 360 : 0;
    let sinphi = phi ? Math.sin(phi) : 0
    let cosphi = phi ? Math.cos(phi) : 1
    let pxp = cosphi * (p0.x - x) / 2 + sinphi * (p0.y - y) / 2
    let pyp = -sinphi * (p0.x - x) / 2 + cosphi * (p0.y - y) / 2

    if (pxp === 0 && pyp === 0) {
        return []
    }
    rx = Math.abs(rx)
    ry = Math.abs(ry)
    let lambda =
        pxp * pxp / (rx * rx) +
        pyp * pyp / (ry * ry)
    if (lambda > 1) {
        let lambdaRt = Math.sqrt(lambda);
        rx *= lambdaRt
        ry *= lambdaRt
    }

    /** 
     * parametrize arc to 
     * get center point start and end angles
     */
    let rxsq = rx * rx,
        rysq = rx === ry ? rxsq : ry * ry

    let pxpsq = pxp * pxp,
        pypsq = pyp * pyp
    let radicant = (rxsq * rysq) - (rxsq * pypsq) - (rysq * pxpsq)

    if (radicant <= 0) {
        radicant = 0
    } else {
        radicant /= (rxsq * pypsq) + (rysq * pxpsq)
        radicant = Math.sqrt(radicant) * (largeArcFlag === sweepFlag ? -1 : 1)
    }

    let centerxp = radicant ? radicant * rx / ry * pyp : 0
    let centeryp = radicant ? radicant * -ry / rx * pxp : 0
    let centerx = cosphi * centerxp - sinphi * centeryp + (p0.x + x) / 2
    let centery = sinphi * centerxp + cosphi * centeryp + (p0.y + y) / 2

    let vx1 = (pxp - centerxp) / rx
    let vy1 = (pyp - centeryp) / ry
    let vx2 = (-pxp - centerxp) / rx
    let vy2 = (-pyp - centeryp) / ry

    // get start and end angle
    const vectorAngle = (ux, uy, vx, vy) => {
        let dot = +(ux * vx + uy * vy).toFixed(9)
        if (dot === 1 || dot === -1) {
            return dot === 1 ? 0 : Math.PI
        }
        dot = dot > 1 ? 1 : (dot < -1 ? -1 : dot)
        let sign = (ux * vy - uy * vx < 0) ? -1 : 1
        return sign * Math.acos(dot);
    }

    let ang1 = vectorAngle(1, 0, vx1, vy1),
        ang2 = vectorAngle(vx1, vy1, vx2, vy2)

    if (sweepFlag === 0 && ang2 > 0) {
        ang2 -= Math.PI * 2
    }
    else if (sweepFlag === 1 && ang2 < 0) {
        ang2 += Math.PI * 2
    }

    let ratio = +(Math.abs(ang2) / (TAU / 4)).toFixed(0)

    // increase segments for more accureate length calculations
    let segments = ratio * splitSegments;
    ang2 /= segments
    let pathDataArc = [];


    // If 90 degree circular arc, use a constant
    // https://pomax.github.io/bezierinfo/#circles_cubic
    // k=0.551784777779014
    const angle90 = 1.5707963267948966;
    const k = 0.551785
    let a = ang2 === angle90 ? k :
        (
            ang2 === -angle90 ? -k : 4 / 3 * Math.tan(ang2 / 4)
        );

    let cos2 = ang2 ? Math.cos(ang2) : 1;
    let sin2 = ang2 ? Math.sin(ang2) : 0;
    let type = 'C'

    const approxUnitArc = (ang1, ang2, a, cos2, sin2) => {
        let x1 = ang1 != ang2 ? Math.cos(ang1) : cos2;
        let y1 = ang1 != ang2 ? Math.sin(ang1) : sin2;
        let x2 = Math.cos(ang1 + ang2);
        let y2 = Math.sin(ang1 + ang2);

        return [
            { x: x1 - y1 * a, y: y1 + x1 * a },
            { x: x2 + y2 * a, y: y2 - x2 * a },
            { x: x2, y: y2 }
        ];
    }

    for (let i = 0; i < segments; i++) {
        let com = { type: type, values: [] }
        let curve = approxUnitArc(ang1, ang2, a, cos2, sin2);

        curve.forEach((pt) => {
            let x = pt.x * rx
            let y = pt.y * ry
            com.values.push(cosphi * x - sinphi * y + centerx, sinphi * x + cosphi * y + centery)
        })
        pathDataArc.push(com);
        ang1 += ang2
    }

    return pathDataArc;
}
