import { createServer } from 'node:http'
import { createApp, mockStatus } from './app.js'

const port = Number(process.env.PORT) || 8787
createServer(createApp()).listen(port, () => {
  const mocked = Object.entries(mockStatus(process.env))
    .filter(([, m]) => m)
    .map(([k]) => k)
  console.log(`light-my-way proxy on :${port}${mocked.length ? ` — MOCK DATA for: ${mocked.join(', ')}` : ''}`)
})
