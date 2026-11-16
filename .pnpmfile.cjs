// zod-to-ts 在运行时用 typescript 的 JS API 生成 cpp-data 里的 .ts 文件，TS 7 不再提供这套 API。
// 它把 typescript 声明成 peer，会解析到根目录的 TS 7；packageExtensions 只能加依赖、去不掉 peer，
// 所以在这里把 peer 换成它自己的 TS 6 兼容包。tsc 仍是 TS 7。
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'zod-to-ts') {
        delete pkg.peerDependencies?.typescript
        pkg.dependencies = { ...pkg.dependencies, typescript: 'npm:@typescript/typescript6@^6.0.2' }
      }
      return pkg
    },
  },
}
