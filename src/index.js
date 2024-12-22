import { startServer, scanOnly } from './server.js'

const isServerMode = process.argv.includes('--server')

if (isServerMode) {
    startServer()
} else {
    scanOnly()
}
