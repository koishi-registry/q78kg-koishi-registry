import fetch from 'node-fetch'
import { config } from '../config'

class CategoryManager {
  categories: Map<string, string> | null
  loading: Promise<Map<string, string>> | null
  constructor() {
    this.categories = null
    this.loading = null
  }

  async fetchWithRetry(url: string): Promise<Record<string, string[]>> {
    let lastError: any

    for (let i = 0; i < config.MAX_RETRIES; i++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(
          () => controller.abort(),
          config.REQUEST_TIMEOUT
        )
        const response = await fetch(url, {
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        return (await response.json()) as Record<string, string[]>
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

  async loadCategories(): Promise<Map<string, string>> {
    // 如果已经有缓存的分类数据，直接返回
    if (this.categories) {
      return this.categories
    }

    // 如果正在加载，等待加载完成并返回结果
    if (this.loading) {
      return this.loading
    }

    // 开始新的加载过程
    this.loading = this.fetchCategories()
    try {
      this.categories = await this.loading
      return this.categories
    } finally {
      this.loading = null
    }
  }

  // 将实际的获取分类逻辑抽取到单独的方法
  async fetchCategories(): Promise<Map<string, string>> {
    const categories = new Map<string, string>()

    try {
      const categoryData = await this.fetchWithRetry(config.CATEGORIES_API_URL)

      for (const [category, plugins] of Object.entries(categoryData)) {
        for (const plugin of plugins) {
          categories.set(plugin.trim(), category)
        }
      }
    } catch (error) {
      console.error('分类数据加载失败（已尝试所有重试）:', error)
    }

    return categories
  }

  async getCategory(packageName: string): Promise<string> {
    const categories = await this.loadCategories()
    return categories.get(packageName) || 'other'
  }
}

// 创建单例
const categoryManager = new CategoryManager()

// 导出新的接口
export const loadCategories = () => categoryManager.loadCategories()
export const getCategory = (packageName: string) =>
  categoryManager.getCategory(packageName)
