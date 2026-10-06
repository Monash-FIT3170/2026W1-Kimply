const { defineConfig } = require('@meteorjs/rspack');
const path = require('path');

module.exports = defineConfig((Meteor) => {
  const rules = [
    {
      test: /\.css$/,
      use: ['postcss-loader'],
      type: 'css',
    },
  ];

  // Instrument imports/ with Istanbul so global.__coverage__ is populated
  // at runtime — V8 coverage env vars don't reach Meteor's app server process.
  if (!Meteor.isProduction) {
    rules.push({
      test: /\.(js|jsx)$/,
      include: path.resolve(__dirname, 'imports'),
      use: [
        {
          loader: require.resolve('babel-loader'),
          options: {
            presets: [['@babel/preset-react', { runtime: 'automatic' }]],
            plugins: [['istanbul', { include: ['imports/**'] }]],
          },
        },
      ],
    });
  }

  // google-auth-library is Node-only and is loaded solely by the server-side Google
  // sign-in verifier (imports/api/googleAuth.js). That module also reaches the client
  // bundle through playerAccounts.js, so resolve the library to nothing there.
  const resolve = Meteor.isClient ? { alias: { 'google-auth-library': false } } : {};

  return { module: { rules }, resolve };
});
