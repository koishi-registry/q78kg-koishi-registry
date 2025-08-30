import { startServer } from './server'
import { scanOnly } from './scanner'

const isServerMode = process.argv.includes('--server')

if (isServerMode) {
  startServer()
} else {
  scanOnly()
}
