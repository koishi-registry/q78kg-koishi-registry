import esbuild from 'esbuild'

const options = {
    entryPoints: ['./src/index.js'],
    bundle: true,
    outfile: 'dist/index.mjs',
    minify: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    packages: 'external',
}

await esbuild.build(options)