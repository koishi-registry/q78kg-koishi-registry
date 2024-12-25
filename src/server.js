import express from 'express'
import cron from 'node-cron'
import { config } from './config.js'
import { checkForUpdates } from './updater.js'
import { loadFromDatabase } from './scanner.js'

export class Server {
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
        this.updateData()
        cron.schedule(config.SCAN_CRON, () => this.updateData())

        this.app.get('/index.json', (_req, res) => {
            res.json(this.data)
        })

        this.app.listen(config.SERVER_PORT, config.SERVER_HOST, () => {
            console.log(
                `服务器启动在 http://${config.SERVER_HOST}:${config.SERVER_PORT}`
            )
            console.log(`定时任务已设置: ${config.SCAN_CRON}`)
        })
    }
}

export function startServer() {
    const server = new Server()
    server.start()
}
