import { getPluginsCollection } from './db.js'

// 在数据库中存储计数器的集合名称和文档ID
const COUNTER_COLLECTION = 'system_settings'
const COUNTER_DOCUMENT_ID = 'update_counter'

/**
 * 从数据库获取更新计数器
 * @returns {Promise<number>} 当前更新计数
 */
export async function readUpdateCounter() {
    try {
        console.log('正在从数据库获取更新计数...')
        
        // 获取系统设置集合
        const collection = await getPluginsCollection(COUNTER_COLLECTION)
        
        // 查询计数器文档
        const counterDoc = await collection.findOne({ _id: COUNTER_DOCUMENT_ID })
        
        if (counterDoc && typeof counterDoc.count === 'number') {
            console.log(`从数据库获取的更新计数: ${counterDoc.count}`)
            return counterDoc.count
        } else {
            console.log('数据库中没有找到计数器记录，将使用默认值 0')
            return 0
        }
    } catch (error) {
        console.warn('读取更新计数器失败:', error.message)
        return 0
    }
}

/**
 * 将计数器保存到数据库
 * @param {number} count 当前计数
 * @returns {Promise<number>} 保存后的计数
 */
export async function saveUpdateCounter(count) {
    try {
        // 获取系统设置集合
        const collection = await getPluginsCollection(COUNTER_COLLECTION)
        
        // 更新或创建计数器文档
        await collection.updateOne(
            { _id: COUNTER_DOCUMENT_ID },
            { 
                $set: { 
                    count: count,
                    lastUpdated: new Date(),
                    // 添加一个标记字段，表明这不是插件文档
                    isSystemSetting: true
                } 
            },
            { upsert: true }
        )
        
        console.log(`更新计数器已保存到数据库: ${count}`)
        return count
    } catch (error) {
        console.error('保存更新计数器失败:', error.message)
        return count
    }
}

/**
 * 增加更新计数
 * @returns {Promise<number>} 更新后的计数
 */
export async function incrementUpdateCounter() {
    try {
        // 获取系统设置集合
        const collection = await getPluginsCollection(COUNTER_COLLECTION)
        
        // 使用原子操作增加计数
        const result = await collection.findOneAndUpdate(
            { _id: COUNTER_DOCUMENT_ID },
            { 
                $inc: { count: 1 },
                $set: { 
                    lastUpdated: new Date(),
                    // 添加一个标记字段，表明这不是插件文档
                    isSystemSetting: true
                }
            },
            { 
                upsert: true,
                returnDocument: 'after'
            }
        )
        
        const newCount = result.value?.count || 1
        console.log(`增量更新计数已更新: ${newCount}`)
        return newCount
    } catch (error) {
        console.error('增加更新计数器失败:', error.message)
        const currentCount = await readUpdateCounter()
        return currentCount + 1
    }
}

/**
 * 重置更新计数器
 * @returns {Promise<number>} 重置后的计数 (0)
 */
export async function resetUpdateCounter() {
    return await saveUpdateCounter(0)
}
