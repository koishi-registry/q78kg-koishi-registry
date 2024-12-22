export const config = {
  SERVER_HOST: "0.0.0.0",
  SERVER_PORT: 3000,
  SCAN_CRON: "*/10 * * * *",

  // API 配置
  MAX_RETRIES: 3,
  REQUEST_TIMEOUT: 10000,
  OPTIMAL_WORKERS_MULTIPLIER: 5,

  // NPM 相关配置
  NPM_REGISTRY_BASE: "https://registry.npmmirror.com",
  NPM_PACKAGE_URL: "https://www.npmjs.com",
  SEARCH_QUERY: "koishi-plugin-",
  SEARCH_SIZE: 10000,
  VALID_PACKAGE_PATTERN: /^(?:@[^/]+\/)?koishi-plugin-[\w-]+$/,

  // 已验证的发布者
  VERIFIED_PUBLISHERS: ['shigma'],
};
