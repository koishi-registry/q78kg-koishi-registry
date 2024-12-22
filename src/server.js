import express from 'express'
import cron from 'node-cron'
import { config } from './config.js'
import { fetchKoishiPlugins } from './fetcher.js'
import fs from 'fs/promises'

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

async function updatePluginsData() {
    console.log('开始更新插件数据...')
    try {
        const plugins = await fetchKoishiPlugins()
        if (plugins.length) {
            const utc8Date = new Date()

            pluginsData = {
                time: utc8Date.toUTCString(),
                total: plugins.length,
                version: 1,
                objects: plugins
            }

            await saveToFile(plugins)
            console.log(`数据更新完成，共 ${plugins.length} 个插件`)
        }
    } catch (error) {
        console.error('更新插件数据时出错:', error)
    }
}

export async function scanOnly() {
    console.log('开始扫描插件数据...')
    try {
        const plugins = await fetchKoishiPlugins()
        if (plugins.length) {
            await saveToFile(plugins)
            console.log(
                `扫描完成，已生成 index.json，共 ${plugins.length} 个插件`
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
