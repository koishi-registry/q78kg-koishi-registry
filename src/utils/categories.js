import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function loadCategories() {
    const categories = new Map()
    const categoriesDir = path.join(__dirname, '..', 'categories')

    try {
        // 读取categories目录下的所有txt文件
        const files = await fs.readdir(categoriesDir)
        const txtFiles = files.filter((file) => file.endsWith('.txt'))

        // 处理每个分类文件
        for (const file of txtFiles) {
            const category = path.basename(file, '.txt') // 获取不带.txt的文件名作为分类名
            const content = await fs.readFile(
                path.join(categoriesDir, file),
                'utf-8'
            )

            // 按行分割并过滤空行
            const plugins = content
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line && !line.startsWith('#'))

            // 为每个插件添加分类
            for (const plugin of plugins) {
                categories.set(plugin, category)
            }
        }
    } catch (error) {
        console.error('从本地文件加载分类数据时出错:', error)
    }

    return categories
}
