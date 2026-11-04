/**
 * Raster tile passthrough. TILE_UPSTREAM_URL is an XYZ template; `{key}` is
 * replaced with TILE_API_KEY. Default: OSM (fine for development only — the OSM
 * tile policy forbids heavy use; see SETUP.md).
 */
export function createTiles(env, fetchFn) {
  const template = env.TILE_UPSTREAM_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  const userAgent = env.TILE_USER_AGENT || 'light-my-way-proxy (+https://github.com/EgecanOzcakar/light-my-way)'

  return async function tile(z, x, y) {
    const url = template
      .replace('{z}', z)
      .replace('{x}', x)
      .replace('{y}', y)
      .replace('{key}', env.TILE_API_KEY ?? '')
    const res = await fetchFn(url, { headers: { 'user-agent': userAgent } })
    return {
      status: res.status,
      type: res.headers.get('content-type') || 'image/png',
      body: Buffer.from(await res.arrayBuffer()),
    }
  }
}
