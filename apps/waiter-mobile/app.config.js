module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    eas: {
      projectId:
        process.env.EXPO_PUBLIC_EAS_PROJECT_ID || config.extra?.eas?.projectId,
    },
  },
});
