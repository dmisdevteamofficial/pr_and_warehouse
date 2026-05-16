let cachedCookie = null
let cachedTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000

async function getLatestCookie(env) {
  const now = Date.now()
  if (cachedCookie && now - cachedTimestamp < CACHE_TTL_MS) {
    return cachedCookie
  }

  const supabaseUrl = env.SUPABASE_URL
  const supabaseKey = env.SUPABASE_ANON_KEY

  const response = await fetch(
    `${supabaseUrl}/rest/v1/trcloud_session?is_active=eq.true&order=updated_at.desc&limit=1`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  )

  if (!response.ok) {
    throw new Error('Failed to fetch cookie from Supabase')
  }

  const data = await response.json()
  if (data.length > 0) {
    cachedCookie = data[0].cookie_value
    cachedTimestamp = now
    return cachedCookie
  }

  return null
}

function clearCache() {
  cachedCookie = null
  cachedTimestamp = 0
}

async function forwardRequest(env, request, path, cookie) {
  const trcloudBaseUrl = env.TRCLOUD_BASE_URL
  const url = new URL(request.url)
  const targetUrl = `${trcloudBaseUrl}/${path}${url.search}`

  const newHeaders = new Headers(request.headers)
  newHeaders.set('Origin', new URL(trcloudBaseUrl).origin)
  newHeaders.set('Referer', `${trcloudBaseUrl}/`)
  newHeaders.set('X-Requested-With', 'XMLHttpRequest')
  newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')

  if (cookie) {
    newHeaders.set('Cookie', cookie)
  }

  const modifiedRequest = new Request(targetUrl, {
    method: request.method,
    headers: newHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : null,
    redirect: 'follow',
  })

  return fetch(modifiedRequest)
}

export async function onRequest(context) {
  const { request, env, params } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }

  const path = params.path ? params.path.join('/') : ''

  try {
    let cookie = await getLatestCookie(env)
    let response = await forwardRequest(env, request, path, cookie)

    if (response.ok) {
      const text = await response.text()
      if (text.includes('mismatched')) {
        clearCache()
        cookie = await getLatestCookie(env)
        response = await forwardRequest(env, request, path, cookie)
      } else {
        const newResponse = new Response(text, response)
        newResponse.headers.set('Access-Control-Allow-Origin', '*')
        newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
        return newResponse
      }
    }

    const newResponse = new Response(response.body, response)
    newResponse.headers.set('Access-Control-Allow-Origin', '*')
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
    return newResponse
  } catch (error) {
    console.error('TRCloud proxy error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }
}
