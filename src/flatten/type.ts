export type PathElement = {
        type: string;
        values: number[];
    };

export type PathData = PathElement[];

export type Point = {
    x: number;
    y: number;
}

export type Matrix = {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
}