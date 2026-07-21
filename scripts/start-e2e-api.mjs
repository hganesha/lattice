import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDirectory = join(tmpdir(), 'lattice-e2e-data')
await rm(dataDirectory, { recursive: true, force: true })
await mkdir(dataDirectory, { recursive: true })

process.env.PORT = '8797'
process.env.LATTICE_DATA_DIR = dataDirectory
process.env.LATTICE_STUDIO_ORIGIN = 'http://127.0.0.1:5183'
await import('../apps/api/dist/server.js')
