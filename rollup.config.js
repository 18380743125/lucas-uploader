import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { defineConfig } from 'rollup';
import { terser } from 'rollup-plugin-terser';

export default defineConfig([
  {
    input: 'src/index.ts',
    output: [
      // {
      //   file: 'dist/index.js',
      //   format: 'iife',
      //   name: 'Lucas',
      //   sourcemap: false
      // },
      {
        file: 'dist/index.mjs',
        format: 'esm',
        sourcemap: false
      }
      // {
      //   file: 'dist/index.cjs',
      //   format: 'cjs',
      //   exports: 'auto',
      //   sourcemap: false
      // }
    ],
    plugins: [
      // ts 支持
      typescript({ declaration: true, declarationDir: 'dist', rootDir: 'src', sourceMap: false }),
      // 路径补全
      resolve(),
      // CommonJS 转换
      commonjs(),
      terser({
        compress: {
          drop_console: true,
          pure_funcs: ['console.log']
        },
        format: {
          comments: false
        }
      })
    ],
    onwarn: (warning, warn) => {
      // 关键优化：兼容所有系统的路径分隔符，并匹配关键文件名
      if (warning.code === 'CIRCULAR_DEPENDENCY' && /uploader.*task\.ts/.test(warning.message)) {
        return;
      }
      warn(warning);
    }
  }
]);
