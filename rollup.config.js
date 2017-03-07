import nodeResolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'
import buble from 'rollup-plugin-buble'

export default {
  entry: 'src/main.js',
  dest: 'docs/main.js',
  plugins: [
    nodeResolve({browser: true}),
    commonjs(),
    buble({ exclude: [ 'node_modules/**' ] })
  ],
  format: 'es'
}
