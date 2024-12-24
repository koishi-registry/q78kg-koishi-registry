import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017'
const dbName = process.env.MONGODB_DB || 'koishi_registry'

let client
let db

export async function connectDB() {
    try {
        client = new MongoClient(uri)
        await client.connect()
        db = client.db(dbName)
        console.log('数据库连接成功')
        return db
    } catch (error) {
        console.error('数据库连接失败:', error)
        throw error
    }
}

export async function getPluginsCollection() {
    if (!db) {
        await connectDB()
    }
    return db.collection('plugins')
}

export async function closeDB() {
    if (client) {
        await client.close()
        console.log('数据库连接已关闭')
    }
}
