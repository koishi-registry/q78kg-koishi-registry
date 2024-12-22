import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const categoriesPath = path.join(__dirname, '..', 'categories')

export async function loadCategories() {
    const categories = new Map()

    try {
        // 读取 categories 目录下的所有文件
        const files = await fs.readdir(categoriesPath)

        // 处理每个分类文件
        for (const file of files) {
            if (!file.endsWith('.txt')) continue

            const categoryName = path.basename(file, '.txt')
            const content = await fs.readFile(
                path.join(categoriesPath, file),
                'utf-8'
            )

            // 将文件内容按行分割并去除空行
            const plugins = content
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line)

            // 为每个插件名添加分类
            for (const plugin of plugins) {
                categories.set(plugin, categoryName)
            }
        }
    } catch (error) {
        console.error('加载分类文件时出错:', error)
    }

    return categories
}
