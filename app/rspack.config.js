const { defineConfig } = require("@meteorjs/rspack");
const path = require("path");

module.exports = defineConfig((Meteor) => {
  const rules = [
    {
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: ["@svgr/webpack"],
    },
    {
      test: /\.css$/,
      use: ["postcss-loader"],
      type: "css",
    },
  ];

  if (!Meteor.isProduction) {
    rules.push({
      test: /\.js$/,
      include: path.resolve(__dirname, "imports"),
      use: [
        {
          loader: "babel-loader",
          options: {
            plugins: [["istanbul", { include: ["imports/**"] }]],
          },
        },
      ],
    });
  }

  return { module: { rules } };
});
