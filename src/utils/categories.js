import fetch from 'node-fetch'
import { config } from '../config.js'
import fs from 'fs/promises'
import path from 'path'

export async function loadCategories() {
    const categories = new Map()

    // 本地获取模式
    if (global.IS_LOCAL_CATEGORIES) {
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
            console.log('使用本地文件加载分类数据')
            return categories
        } catch (error) {
            console.error('从本地文件加载分类数据时出错:', error)
            return categories
        }
    }

    // API 模式
    if (!config.CATEGORIES_API_BASE) {
        console.warn(
            '警告: 未配置分类API地址 (CATEGORIES_API_BASE)，将无法获取插件分类信息'
        )
        return categories
    }

    try {
        // 获取所有分类列表
        const categoriesResponse = await fetch(`${config.CATEGORIES_API_BASE}/`)
        if (!categoriesResponse.ok) {
            throw new Error(
                `API请求失败: ${categoriesResponse.status} ${categoriesResponse.statusText}`
            )
        }
        const { categories: categoryList } = await categoriesResponse.json()

        // 获取每个分类下的插件
        for (const category of categoryList) {
            const pluginsResponse = await fetch(
                `${config.CATEGORIES_API_BASE}/${category}/`
            )
            if (!pluginsResponse.ok) {
                console.warn(
                    `获取 ${category} 分类数据失败: ${pluginsResponse.status} ${pluginsResponse.statusText}`
                )
                continue
            }
            const { plugins } = await pluginsResponse.json()

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
