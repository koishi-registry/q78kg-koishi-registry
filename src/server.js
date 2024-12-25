import express from 'express'
import cron from 'node-cron'
import { config } from './config.js'
import {
    fetchKoishiPlugins,
    fetchWithRetry,
    fetchPackageDetails,
    fetchInsecurePackages
} from './fetcher.js'
import fs from 'fs/promises'
import { getPluginsCollection, closeDB } from './utils/db.js'
import { loadCategories } from './utils/categories.js'
import semver from 'semver'

class Server {
    constructor() {
        this.app = express()
        this.data = {
            time: '',
            total: 0,
            version: 1,
            objects: []
        }
    }

    async updateData() {
        console.log('正在从数据库更新数据...')
        try {
            const updatedCount = await checkForUpdates()
            const plugins = await loadFromDatabase()

            this.data = {
                time: new Date().toUTCString(),
                total: plugins.length,
                version: 1,
                objects: plugins
            }

            console.log(
                `数据更新完成，更新了 ${updatedCount} 个插件，总共 ${plugins.length} 个插件`
            )
        } catch (error) {
            console.error('更新数据时出错:', error)
        }
    }

    start() {
        // 首次更新数据
        this.updateData()

        // 设置定时任务
        cron.schedule(config.SCAN_CRON, () => this.updateData())

        // API 路由
        this.app.get('/index.json', (_req, res) => {
            res.json(this.data)
        })

        // 启动服务器
        this.app.listen(config.SERVER_PORT, config.SERVER_HOST, () => {
            console.log(
                `服务器启动在 http://${config.SERVER_HOST}:${config.SERVER_PORT}`
            )
            console.log(`定时任务已设置: ${config.SCAN_CRON}`)
        })
    }
}

async function saveToFile(data, filename = 'public/index.json') {
    const output = {
        time: new Date().toUTCString(),
        total: data.length,
        version: 1,
        objects: data
    }

    await fs.mkdir('public', { recursive: true })
    await fs.writeFile(filename, JSON.stringify(output, null, 2), 'utf-8')
    console.log(`数据已保存到文件: ${filename}`)
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

    try {
        const [searchData, existingPlugins, categories, insecurePackages] =
            await Promise.all([
                fetchWithRetry(`${config.NPM_SEARCH_URL}?${params}`),
                collection
                    .find(
                        {},
                        {
                            projection: {
                                'package.name': 1,
                                'package.version': 1,
                                insecure: 1
                            }
                        }
                    )
                    .toArray(),
                loadCategories(),
                fetchInsecurePackages()
            ])

        const existingVersions = new Map(
            existingPlugins.map((plugin) => [
                plugin.package.name,
                {
                    version: plugin.package.version,
                    insecure: plugin.insecure
                }
            ])
        )

        const packagesToUpdate = []

        // 检查需要更新的包
        for (const result of searchData.objects || []) {
            if (!config.VALID_PACKAGE_PATTERN.test(result.package?.name))
                continue

            const name = result.package.name
            const latestVersion =
                result.package.dist?.tags?.latest || result.package.version
            const existing = existingVersions.get(name)

            // 如果包不存在，版本更新，或安全状态可能改变，则需要更新
            if (
                !existing ||
                semver.gt(latestVersion, existing.version) ||
                existing.insecure !== insecurePackages.has(name)
            ) {
                packagesToUpdate.push({
                    name,
                    version: latestVersion,
                    result
                })
            }
        }

        // 检查数据库中的包是否需要更新安全状态
        for (const [name, info] of existingVersions) {
            if (
                !packagesToUpdate.some((p) => p.name === name) &&
                info.insecure !== insecurePackages.has(name)
            ) {
                packagesToUpdate.push({
                    name,
                    version: info.version,
                    result: { downloads: { all: 0 } } // 最小化必要信息
                })
            }
        }

        if (packagesToUpdate.length === 0) {
            console.log('没有需要更新的包')
            return 0
        }

        // 并行获取详细信息，使用预加载的分类和不安全包信息
        const updatesPromises = packagesToUpdate.map(async (p) => {
            const category = categories.get(p.name) || 'other'
            const pluginData = await fetchPackageDetails(
                p.name,
                {
                    ...p.result,
                    category,
                    downloads: p.result.downloads || { all: 0 }
                },
                insecurePackages
            )
            return pluginData
        })

        const updates = (await Promise.all(updatesPromises)).filter(Boolean)

        if (updates.length > 0) {
            // 批量更新数据库
            const bulkOps = updates.map((update) => ({
                updateOne: {
                    filter: { 'package.name': update.package.name },
                    update: { $set: update },
                    upsert: true
                }
            }))
            await collection.bulkWrite(bulkOps)

            // 添加详细的包更新信息
            console.log(`更新了 ${updates.length} 个包:`)
            updates.forEach((update) => {
                const existing = existingVersions.get(update.package.name)
                const action = existing ? '更新' : '新增'
                const securityChange =
                    existing && existing.insecure !== update.insecure
                        ? `(安全状态: ${existing.insecure ? '不安全->安全' : '安全->不安全'})`
                        : ''
                console.log(
                    `- ${action}: ${update.package.name}@${update.package.version}` +
                        `${existing?.version ? ` (原版本: ${existing.version})` : ''}` +
                        `${securityChange}`
                )
            })
        } else {
            console.log('没有有效的包需要更新')
        }

        return updates.length
    } catch (error) {
        console.error('更新数据时出错:', error)
        throw error
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
    } finally {
        // 扫描完成后关闭数据库连接
        await closeDB()
    }
}

export function startServer() {
    const server = new Server()
    server.start()
}
