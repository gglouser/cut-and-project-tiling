const WasmPackPlugin = require("@wasm-tool/wasm-pack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require("path");
const webpack = require("webpack");

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
    new CopyWebpackPlugin({
      patterns: [
        "index.html",
        "css/*",
        "docs/*",
        "images/*"
      ]
    }),

    new webpack.ProvidePlugin({
      // wasm-bindgen requires TextEncoder/TextDecoder
      // but Edge does not provide it, so use this polyfill.
      TextEncoder: ['text-encoding-utf-8', 'TextEncoder'],
      TextDecoder: ['text-encoding-utf-8', 'TextDecoder'],
    }),
  ],
};
