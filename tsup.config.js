import {defineConfig} from "tsup";

export default defineConfig({
    entry: ["./src/index.ts"],
    format: ["esm", "iife"],
    sourcemap: true,
    dts: true,
    clean: true,
    minify: true
})