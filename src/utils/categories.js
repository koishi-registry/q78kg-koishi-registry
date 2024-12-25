import fetch from 'node-fetch'
import { config } from '../config.js'

class CategoryManager {
    constructor() {
        this.categories = null
        this.loading = null
    }

    async fetchWithRetry(url) {
        let lastError

        for (let i = 0; i < config.MAX_RETRIES; i++) {
            try {
                const response = await fetch(url, {
                    timeout: config.REQUEST_TIMEOUT
                })
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`)
                }
                return await response.json()
            } catch (error) {
                lastError = error
                console.error(`第 ${i + 1} 次获取分类数据失败:`, error)
                if (i < config.MAX_RETRIES - 1) {
                    // 等待 1 秒后重试
                    await new Promise((resolve) => setTimeout(resolve, 1000))
                }
            }
        }
        throw lastError
    }

    async loadCategories() {
        if (this.categories) {
            return this.categories
        }

        if (this.loading) {
            return this.loading
        }

        this.loading = (async () => {
            const categories = new Map()

            try {
                const categoryData = await this.fetchWithRetry(
                    config.CATEGORIES_API_URL
                )

                for (const [category, plugins] of Object.entries(
                    categoryData
                )) {
                    for (const plugin of plugins) {
                        categories.set(plugin.trim(), category)
                    }
                }
            } catch (error) {
                console.error('分类数据加载失败（已尝试所有重试）:', error)
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
