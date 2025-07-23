import { PathData } from "../type";
import { pathDataArcToCubic } from "./arcToCubic";
import { pathDataToRelative } from "./toRelative";
import { pathDataToShorthands } from "./toShorthand";


export function convertPathData(pathData: PathData, options: Partial<{
    arcsToCubic: boolean,
    toRelative: boolean,
    toShorthands: boolean,
    decimals: number,
    arcAccuracy: number,
}>) {
    options = {
        ...{
            arcsToCubic: false,
            toRelative: true,
            toShorthands: true,
            decimals: 3,
            arcAccuracy: 1,
        },
        ...options,
    };

    //decimals = 3, arcsToCubic = false, arcAccuracy = 1
    let { arcsToCubic, toRelative, toShorthands, arcAccuracy, decimals } = options;

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
