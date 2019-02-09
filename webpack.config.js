const WasmPackPlugin = require("@wasm-tool/wasm-pack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require("path");

const dist = path.resolve(__dirname, "dist");

module.exports = {
  entry: "./js/bootstrap.js",
  output: {
    path: dist,
    filename: "bundle.js"
  },
  mode: "production",
  devServer: {
    contentBase: dist,
  },
  plugins: [
    new WasmPackPlugin({
      crateDirectory: path.resolve(__dirname, "crate")
    }),
    new CopyWebpackPlugin([
      "index.html",
      "css/*",
      "docs/*",
      "images/*"
    ])
  ],
};
