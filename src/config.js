export const config = {
    SERVER_HOST: process.env.SERVER_HOST || '0.0.0.0',
    SERVER_PORT: parseInt(process.env.SERVER_PORT || '3000'),
    SCAN_CRON: process.env.SCAN_CRON || '*/10 * * * *',

    // API 配置
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3'),
    REQUEST_TIMEOUT: parseInt(process.env.REQUEST_TIMEOUT || '10000'),
    OPTIMAL_WORKERS_MULTIPLIER: parseInt(
        process.env.OPTIMAL_WORKERS_MULTIPLIER || '5'
    ),

    // NPM 相关配置
    NPM_REGISTRY_BASE:
        process.env.NPM_REGISTRY_BASE || 'https://registry.npmmirror.com',
    NPM_PACKAGE_URL: process.env.NPM_PACKAGE_URL || 'https://www.npmjs.com',
    SEARCH_QUERY: process.env.SEARCH_QUERY || 'koishi-plugin-',
    SEARCH_SIZE: parseInt(process.env.SEARCH_SIZE || '10000'),
    VALID_PACKAGE_PATTERN: new RegExp(
        process.env.VALID_PACKAGE_PATTERN ||
            '^(?:@[^/]+\/)?koishi-plugin-[\\w-]+$'
    )
}
