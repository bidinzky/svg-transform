import { PathData } from "../type";

/**
 * apply shorthand commands if possible
 * L, L, C, Q => H, V, S, T
 * reversed method: pathDataToLonghands()
 */
export function pathDataToShorthands(pathData: PathData, decimals = -1) {

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