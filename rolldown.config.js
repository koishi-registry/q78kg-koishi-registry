import { defineConfig } from 'rolldown'
import dependencies from './package.json' with { type: 'json' }

const external = new RegExp(
  `^(node:|${[...Object.getOwnPropertyNames(dependencies.devDependencies), ...Object.getOwnPropertyNames(dependencies.dependencies)].join('|')})`
)

export default defineConfig({
  input: './src/index.ts',
  output: [{ dir: 'dist', format: 'es', minify: true }],
  external: external
})
