import type { Point, PathData, PathElement } from "../type";

/** 
 * convert arctocommands to cubic bezier
 * based on puzrin's a2c.js
 * https://github.com/fontello/svgpath/blob/master/lib/a2c.js
 * returns pathData array
*/
export function pathDataArcToCubic(pathData: PathData, arcAccuracy = 1) {
    let pathDataAbs: PathData = []
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


function arcToBezier(p0: Point, values: number[], splitSegments = 1) {
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
    let pathDataArc: PathData = [];


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
        let com: PathElement = { type: type, values: [] };
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

