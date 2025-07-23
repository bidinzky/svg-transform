/**
 * Standalone pathData parser
 * returns a pathData array compliant
 * with the w3C SVGPathData interface draft
 * https://svgwg.org/specs/paths/#InterfaceSVGPathData
 * Usage example:
 */

import { PathData } from "./type";

export function parsePathDataNormalized(d: string) {
    d = d
        // remove new lines, tabs an comma with whitespace
        .replace(/[\n\r\t|,]/g, " ")
        // pre trim left and right whitespace
        .trim()
        // add space before minus sign
        .replace(/(\d)-/g, "$1 -")
        // decompose multiple adjacent decimal delimiters like 0.5.5.5 => 0.5 0.5 0.5
        .replace(/(\.)(?=(\d+\.\d+)+)(\d+)/g, "$1$3 ");

    let pathData: PathData = [];
    let cmdRegEx = /([mlcqazvhst])([^mlcqazvhst]*)/gi;
    let commands = d.match(cmdRegEx);

    if (null === commands) {
        return pathData;
    }

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
        let values: string[] | number[] = com.substring(1, com.length).trim().split(" ").filter(Boolean);

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
                arcValues: string[] = [];
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
                    arcValues.push(...comN);
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
                    ? type.toLowerCase() === type && pathData.length > 0
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