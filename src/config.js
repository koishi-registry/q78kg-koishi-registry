// 定义默认配置
const defaults = {
    SERVER_HOST: '0.0.0.0',
    SERVER_PORT: '3000',
    SCAN_CRON: '*/10 * * * *',
    MAX_RETRIES: '3',
    REQUEST_TIMEOUT: '10000',
    OPTIMAL_WORKERS_MULTIPLIER: '5',
    NPM_REGISTRY_BASE: 'https://registry.npmmirror.com',
    NPM_PACKAGE_URL: 'https://www.npmjs.com',
    SEARCH_QUERY: 'koishi-plugin-',
    SEARCH_SIZE: '10000',
    VALID_PACKAGE_PATTERN:
        '^(?:@[^/]+\/koishi-plugin-|@koishijs\/plugin-|koishi-plugin-)[\\w-]+$',
    CATEGORIES_API_BASE: 'https://km-api.cyans.me/api/categories',
    NPM_SEARCH_URL: 'https://registry.npmmirror.com/-/v1/search',
    KOISHI_VERSION_REQUIREMENT: '^4.0.0',
    MONGODB_URI: 'mongodb://localhost:27017',
    MONGODB_DB: 'koishi_registry',
}

// 导出最终配置
export const config = {
    // 服务器配置
    SERVER_HOST: process.env.SERVER_HOST || defaults.SERVER_HOST,
    SERVER_PORT: parseInt(process.env.SERVER_PORT || defaults.SERVER_PORT),
    SCAN_CRON: process.env.SCAN_CRON || defaults.SCAN_CRON,

    // API 配置
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES || defaults.MAX_RETRIES),
    REQUEST_TIMEOUT: parseInt(
        process.env.REQUEST_TIMEOUT || defaults.REQUEST_TIMEOUT
    ),
    OPTIMAL_WORKERS_MULTIPLIER: parseInt(
        process.env.OPTIMAL_WORKERS_MULTIPLIER ||
            defaults.OPTIMAL_WORKERS_MULTIPLIER
    ),

    // NPM 相关配置
    NPM_REGISTRY_BASE:
        process.env.NPM_REGISTRY_BASE || defaults.NPM_REGISTRY_BASE,
    NPM_PACKAGE_URL: process.env.NPM_PACKAGE_URL || defaults.NPM_PACKAGE_URL,
    SEARCH_QUERY: process.env.SEARCH_QUERY || defaults.SEARCH_QUERY,
    SEARCH_SIZE: parseInt(process.env.SEARCH_SIZE || defaults.SEARCH_SIZE),
    VALID_PACKAGE_PATTERN: new RegExp(
        process.env.VALID_PACKAGE_PATTERN || defaults.VALID_PACKAGE_PATTERN
    ),

    // 分类 API 配置
    CATEGORIES_API_BASE:
        process.env.CATEGORIES_API_BASE || defaults.CATEGORIES_API_BASE,

    // NPM API 相关
    NPM_SEARCH_URL: process.env.NPM_SEARCH_URL || defaults.NPM_SEARCH_URL,
    KOISHI_VERSION_REQUIREMENT:
        process.env.KOISHI_VERSION_REQUIREMENT ||
        defaults.KOISHI_VERSION_REQUIREMENT,

    // MongoDB 配置
    MONGODB_URI: process.env.MONGODB_URI || defaults.MONGODB_URI,
    MONGODB_DB: process.env.MONGODB_DB || defaults.MONGODB_DB,
}
