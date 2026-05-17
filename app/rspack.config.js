const { defineConfig } = require("@meteorjs/rspack");
const path = require("path");

module.exports = defineConfig((Meteor) => {
  const rules = [
    {
      test: /\.css$/,
      use: ["postcss-loader"],
      type: "css",
    },
  ];

  // Instrument imports/ with Istanbul so global.__coverage__ is populated
  // at runtime — V8 coverage env vars don't reach Meteor's app server process.
  if (!Meteor.isProduction) {
    rules.push({
      test: /\.(js|jsx)$/,
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
