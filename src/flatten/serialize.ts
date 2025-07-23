import type { PathData } from "./type";

/**
 * serialize pathData array to
 * d attribute string
 */
export function serializePathData(pathData: PathData, decimals = -1) {
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
                values[3],
                values[4],
                +values[5].toFixed(decimals),
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
        type = com.type;

        d += `${type}${values.join(" ")}`;
    }
    return d;
}

