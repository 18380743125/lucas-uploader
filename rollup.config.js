import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

/**
 * 默认导出一个数组，数组的每一个对象都是一个单独的导出文件配置，详细可查：https://www.rollupjs.com/guide/big-list-of-options
 */
export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.js',
        format: 'iife',
        name: 'Lucas',
        sourcemap: true
      },
      {
        file: 'dist/index.mjs',
        format: 'esm',
        sourcemap: true
      },
      {
        file: 'dist/index.cjs',
        format: 'cjs',
        exports: 'auto',
        sourcemap: true
      }
    ],
    plugins: [
      // ts 支持
      typescript({ sourceMap: true }),
      // 路径补全
      resolve(),
      // CommonJS 转换
      commonjs()
    ],
    onwarn: (warning, warn) => {
      // 关键优化：兼容所有系统的路径分隔符，并匹配关键文件名
      if (warning.code === 'CIRCULAR_DEPENDENCY' && /uploader.*task\.ts/.test(warning.message)) {
        return;
      }
      warn(warning);
    }
  }
];
