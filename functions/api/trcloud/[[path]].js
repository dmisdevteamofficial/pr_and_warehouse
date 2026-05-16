let cachedCookie = null
let cachedTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000

async function getLatestCookie(env) {
  const now = Date.now()
  if (cachedCookie && now - cachedTimestamp < CACHE_TTL_MS) {
    return cachedCookie
  }

  const url = `${env.SUPABASE_URL}/rest/v1/trcloud_session?is_active=eq.true&order=updated_at.desc&limit=1&select=cookie_value`
  const res = await fetch(url, {
    headers: {
      'apikey': env.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
    }
  })

  const body = await res.text()

  if (!res.ok) {
    throw new Error(`Supabase error ${res.status}: ${body} | URL used: ${url.substring(0, 80)}`)
  }

  const data = JSON.parse(body)

  if (!data || data.length === 0) {
    throw new Error(`No cookie found in trcloud_session table. Response: ${body}`)
  }

  cachedCookie = data[0].cookie_value
  cachedTimestamp = now
  return cachedCookie
}

function clearCache() {
  cachedCookie = null
  cachedTimestamp = 0
}

async function forwardRequest(env, request, pathStr, cookie) {
  const trcloudBaseUrl = env.TRCLOUD_BASE_URL
  const url = new URL(request.url)
  const targetURL = `${trcloudBaseUrl}/${pathStr}${url.search}`

  console.log('path received:', pathStr)
  console.log('targetURL:', targetURL)

  const newHeaders = new Headers(request.headers)
  newHeaders.set('Origin', new URL(trcloudBaseUrl).origin)
  newHeaders.set('Referer', `${trcloudBaseUrl}/`)
  newHeaders.set('X-Requested-With', 'XMLHttpRequest')
  newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')

  if (cookie) {
    newHeaders.set('Cookie', cookie)
  }

  const modifiedRequest = new Request(targetURL, {
    method: request.method,
    headers: newHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : null,
    redirect: 'follow',
  })

  return fetch(modifiedRequest)
}

export async function onRequest(context) {
  try {
    const { request, env, params } = context

    const missing = []
    if (!env.SUPABASE_URL) missing.push('SUPABASE_URL')
    if (!env.SUPABASE_ANON_KEY) missing.push('SUPABASE_ANON_KEY')
    if (!env.TRCLOUD_BASE_URL) missing.push('TRCLOUD_BASE_URL')
    if (missing.length > 0) {
      return Response.json(
        {
          error: 'Missing env vars',
          missing
        },
        {
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*'
          }
        }
      )
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    const pathSegments = params.path
    const pathStr = Array.isArray(pathSegments)
      ? pathSegments.join('/')
      : (pathSegments || '')

    let cookie = await getLatestCookie(env)
    let response = await forwardRequest(env, request, pathStr, cookie)

    if (response.ok) {
      const text = await response.text()
      if (text.includes('mismatched')) {
        clearCache()
        cookie = await getLatestCookie(env)
        response = await forwardRequest(env, request, pathStr, cookie)
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
  } catch (err) {
    return Response.json(
      {
        error: err.message,
        stack: err.stack,
        type: err.constructor.name
      },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*'
        }
      }
    )
  }
}
