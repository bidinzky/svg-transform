import { PathData } from "../type";

/**
 * This is just a port of Dmitry Baranovskiy's
 * pathToRelative/Absolute methods used in snap.svg
 * https://github.com/adobe-webplatform/Snap.svg/
 *
 * Demo: https://codepen.io/herrstrietzel/pen/poVKbgL
 */
// convert to relative commands
export function pathDataToRelative(pathData: PathData, decimals = -1) {

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
