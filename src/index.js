import { startServer, scanOnly } from './server.js'

const isServerMode = process.argv.includes('--server')
const isLocalCategories = process.argv.includes('--local-categories')

// 设置全局变量表示是否为本地模式
global.IS_LOCAL_CATEGORIES = isLocalCategories

if (isServerMode) {
    startServer()
} else {
    scanOnly()
}
