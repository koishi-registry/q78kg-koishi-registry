import fs from 'fs/promises'
import path from 'path'

class CategoryManager {
    constructor() {
        this.categories = null
        this.loading = null
    }

    async loadCategories() {
        // 如果已经加载过，直接返回缓存的数据
        if (this.categories) {
            return this.categories
        }

        // 如果正在加载中，等待加载完成
        if (this.loading) {
            return this.loading
        }

        // 开始加载
        this.loading = (async () => {
            const categories = new Map()

            try {
                const categoriesPath = path.join(process.cwd(), 'categories')
                const files = await fs.readdir(categoriesPath)

                for (const file of files) {
                    if (file.endsWith('.txt')) {
                        const category = file.slice(0, -4)
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
            } catch (error) {
                console.error('分类数据加载出错:', error)
            }

            this.categories = categories
            return categories
        })()

        return this.loading
    }

    async getCategory(packageName) {
        const categories = await this.loadCategories()
        return categories.get(packageName) || 'other'
    }
}

// 创建单例
const categoryManager = new CategoryManager()

// 导出新的接口
export const loadCategories = () => categoryManager.loadCategories()
export const getCategory = (packageName) =>
    categoryManager.getCategory(packageName)
