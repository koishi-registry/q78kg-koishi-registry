import express from 'express'
import cron from 'node-cron'
import { config } from './config.js'
import { fetchKoishiPlugins } from './fetcher.js'
import fs from 'fs/promises'
import { getPluginsCollection } from './db.js'

const app = express()
let pluginsData = {
    time: '',
    total: 0,
    version: 1,
    objects: []
}

async function saveToFile(data, filename = 'public/index.json') {
    const utc8Date = new Date()

    const output = {
        time: utc8Date.toUTCString(),
        total: data.length,
        version: 1,
        objects: data
    }

    await fs.mkdir('public', { recursive: true })
    await fs.writeFile(filename, JSON.stringify(output, null, 2), 'utf-8')
}

async function saveToDatabase(plugins) {
    const collection = await getPluginsCollection()

    for (const plugin of plugins) {
        await collection.updateOne(
            { 'package.name': plugin.package.name },
            { $set: plugin },
            { upsert: true }
        )
    }
}

async function loadFromDatabase() {
    const collection = await getPluginsCollection()
    return await collection.find({}).toArray()
}

async function checkForUpdates() {
    const collection = await getPluginsCollection()
    const params = new URLSearchParams({
        text: config.SEARCH_QUERY,
        size: config.SEARCH_SIZE,
        from: 0
    })

    const searchData = await fetchWithRetry(`${NPM_SEARCH_URL}?${params}`)
    const updates = []

    for (const result of searchData.objects || []) {
        if (!config.VALID_PACKAGE_PATTERN.test(result.package?.name)) continue

        const existingPlugin = await collection.findOne({
            'package.name': result.package.name,
            'package.version': result.package.version
        })

        if (!existingPlugin) {
            const pluginData = await fetchPackageDetails(result.package.name, {
                ...result,
                category: await getCategoryForPackage(result.package.name),
                downloads: result.downloads || { all: 0 }
            })
            if (pluginData) {
                updates.push(pluginData)
            }
        }
    }

    if (updates.length > 0) {
        await saveToDatabase(updates)
    }

    return updates.length
}

async function updatePluginsData() {
    console.log('开始更新插件数据...')
    try {
        const updatedCount = await checkForUpdates()
        const plugins = await loadFromDatabase()

        if (plugins.length) {
            const utc8Date = new Date()
            pluginsData = {
                time: utc8Date.toUTCString(),
                total: plugins.length,
                version: 1,
                objects: plugins
            }

            await saveToFile(plugins)
            console.log(
                `数据更新完成，更新了 ${updatedCount} 个插件，总共 ${plugins.length} 个插件`
            )
        }
    } catch (error) {
        console.error('更新插件数据时出错:', error)
    }
}

export async function scanOnly() {
    console.log('开始扫描插件数据...')
    try {
        const collection = await getPluginsCollection()
        const existingCount = await collection.countDocuments()

        if (existingCount === 0) {
            console.log('数据库为空，执行全量扫描...')
            const plugins = await fetchKoishiPlugins()
            if (plugins.length) {
                await saveToDatabase(plugins)
                await saveToFile(plugins)
                console.log(`扫描完成，已保存 ${plugins.length} 个插件`)
            }
        } else {
            console.log('执行增量更新...')
            const updatedCount = await checkForUpdates()
            const allPlugins = await loadFromDatabase()
            await saveToFile(allPlugins)
            console.log(
                `更新完成，更新了 ${updatedCount} 个插件，总共 ${allPlugins.length} 个插件`
            )
        }
    } catch (error) {
        console.error('扫描插件数据时出错:', error)
    }
}

export function startServer() {
    // 首次更新数据
    updatePluginsData()

    // 设置定时任务
    cron.schedule(config.SCAN_CRON, updatePluginsData)

    // API 路由
    app.get('/index.json', (_req, res) => {
        res.json(pluginsData)
    })

    // 启动服务器
    app.listen(config.SERVER_PORT, config.SERVER_HOST, () => {
        console.log(
            `服务器启动在 http://${config.SERVER_HOST}:${config.SERVER_PORT}`
        )
        console.log(`定时任务已设置: ${config.SCAN_CRON}`)
    })
}
