import fetch from 'node-fetch'
import { config } from '../config.js'

export async function loadCategories() {
    const categories = new Map()

    try {
        // 获取所有分类列表
        const response = await fetch(config.CATEGORIES_API_BASE)
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }
        const { categories: categoryList } = await response.json()

        // 获取每个分类下的插件
        for (const category of categoryList) {
            const categoryResponse = await fetch(`${config.CATEGORIES_API_BASE}/${category}/`)
            if (!categoryResponse.ok) {
                console.error(`获取分类 ${category} 失败:`, categoryResponse.status)
                continue
            }
            const { plugins } = await categoryResponse.json()

            // 为每个插件添加分类
            for (const plugin of plugins) {
                categories.set(plugin, category)
            }
        }
    } catch (error) {
        console.error('从API加载分类数据时出错:', error)
    }

    return categories
}
