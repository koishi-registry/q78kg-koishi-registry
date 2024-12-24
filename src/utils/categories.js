import fs from 'fs/promises'
import path from 'path'

export async function loadCategories() {
    const categories = new Map()

    try {
        const categoriesPath = path.join(process.cwd(), 'categories')
        const files = await fs.readdir(categoriesPath)

        for (const file of files) {
            if (file.endsWith('.txt')) {
                const category = file.slice(0, -4) // 移除 .txt 后缀
                const content = await fs.readFile(
                    path.join(categoriesPath, file),
                    'utf-8'
                )
                const plugins = content
                    .split('\n')
                    .filter((line) => line.trim())

                for (const plugin of plugins) {
                    categories.set(plugin.trim(), category)
                }
            }
        }
        console.log('加载分类数据')
    } catch (error) {
        console.error('加载分类数据时出错:', error)
    }

    return categories
}
