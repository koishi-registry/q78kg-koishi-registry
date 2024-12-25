import { getPluginsCollection, closeDB } from './utils/db.js'
import { fetchKoishiPlugins } from './fetcher.js'
import fs from 'fs/promises'
import { checkForUpdates } from './updater.js'

export async function saveToFile(data, filename = 'public/index.json') {
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

export async function saveToDatabase(plugins) {
    const collection = await getPluginsCollection()

    for (const plugin of plugins) {
        await collection.updateOne(
            { 'package.name': plugin.package.name },
            { $set: plugin },
            { upsert: true }
        )
    }
}

export async function loadFromDatabase() {
    const collection = await getPluginsCollection()
    return await collection.find({}).toArray()
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
        await closeDB()
    }
}