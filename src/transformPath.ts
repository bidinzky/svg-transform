import { Matrix, PathData, PathElement, Point } from "./type";

/**
 * scale pathData
 */
export function transformPathData(pathData: PathData, matrix: Matrix) {
    // new pathdata
    let pathDataTrans: PathData = [];

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
        let comT: PathElement = { type: type, values: [] };

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

// transform point by 2d matrix
function transformPoint(pt: Point, matrix: Matrix) {
    let { a, b, c, d, e, f } = matrix;
    let { x, y } = pt;
    return { x: a * x + c * y + e, y: b * x + d * y + f };
}

//normalize matrix notations object, array or css matrix string
function normalizeMatrix(matrix: Matrix | string | number[]) {
    matrix =
        typeof matrix === "string"
            ? (matrix = matrix
                .replace(/^matrix\(|\)$/g, "")
                .split(",")
                .map(Number))
            : matrix;
    return !Array.isArray(matrix)
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
}


function transformArc(p0: Point, values: number[], matrix: Matrix) {
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

/**
 * Based on: https://github.com/fontello/svgpath/blob/master/lib/ellipse.js
 * and fork: https://github.com/kpym/SVGPathy/blob/master/lib/ellipse.js
 */

function transformEllipse(rx: number, ry: number, ax: number, matrix: Matrix) {
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
function svgArcToCenterParam(p0x: number, p0y: number, rx: number, ry: number, angle: number, largeArc: number, sweep: number, px: number, py: number) {

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
    if (sweep == 0) {
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
        clockwise: sweep == 1
    };

    return outputObj;
}