import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import https from 'node:https'
import querystring from 'node:querystring'

function trcloudLogin(username, password) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({ username, password, cmd: 'login' })

    const options = {
      hostname: 'thaidrill.trcloud.co',
      path: '/application/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Origin: 'https://thaidrill.trcloud.co',
        Referer: 'https://thaidrill.trcloud.co/application/'
      }
    }

    const req = https.request(options, (res) => {
      const cookies = res.headers['set-cookie'] || []
      if (cookies.length === 0) {
        reject(new Error('Login failed: ไม่ได้รับ cookie กลับมา'))
        return
      }
      const cookieString = cookies.map((c) => c.split(';')[0]).join('; ')
      console.log('✅ TRCloud Login สำเร็จ')
      resolve(cookieString)
    })

    req.on('error', reject)
    req.write(postData)
    req.end()
  })
}

/** Merge two cookie header strings into one (later wins per key). */
function mergeCookieHeaders(a, b) {
  const cookieMap = new Map()
  ;[a, b]
    .filter(Boolean)
    .join('; ')
    .split('; ')
    .forEach((pair) => {
      const [k, ...v] = pair.split('=')
      if (k?.trim()) cookieMap.set(k.trim(), v.join('='))
    })
  return [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const useTrcloudLoginCookie = env.TRCLOUD_USE_LOGIN_COOKIE === 'true'
  const staticCookie = (env.TRCLOUD_COOKIE || '').trim()

  let trcloudCookie = staticCookie

  if (useTrcloudLoginCookie) {
    try {
      trcloudCookie = await trcloudLogin(env.TRCLOUD_USERNAME, env.TRCLOUD_PASSWORD)
      console.log('🍪 Cookie (login):', trcloudCookie.slice(0, 80) + (trcloudCookie.length > 80 ? '…' : ''))
    } catch (err) {
      console.error('❌ TRCloud Login Error:', err.message)
      if (!staticCookie) {
        console.warn('⚠️ ไม่มี TRCLOUD_COOKIE สำรอง — proxy จะไม่ส่ง session')
      }
    }
  } else if (staticCookie) {
    console.log('ℹ️ TRCloud proxy ใช้ TRCLOUD_COOKIE จาก .env')
  } else {
    console.warn('⚠️ ไม่มี TRCLOUD_COOKIE และปิด login — API อาจตอบ mismatch')
  }

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      proxy: {
        '/trcloud-api': {
          target: 'https://thaidrill.trcloud.co',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/trcloud-api/, ''),
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              const setCookie = proxyRes.headers['set-cookie']
              if (setCookie) {
                const newCookies = setCookie.map((c) => c.split(';')[0]).join('; ')
                trcloudCookie = mergeCookieHeaders(trcloudCookie, newCookies)
              }
            })

            proxy.on('proxyReq', (proxyReq, req) => {
              proxyReq.removeHeader('cookie')
              const clientCookie = String(req.headers['x-trcloud-cookie'] || '').trim()
              proxyReq.removeHeader('x-trcloud-cookie')
              const cookieToSend = clientCookie || trcloudCookie
              if (cookieToSend) {
                proxyReq.setHeader('Cookie', cookieToSend)
              }
              proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest')
              proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
              proxyReq.setHeader('Origin', 'https://thaidrill.trcloud.co')
              proxyReq.setHeader('Referer', 'https://thaidrill.trcloud.co/application/')
            })
          }
        },
        '/api/trcloud': {
          target: 'https://thaidrill.trcloud.co/application',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/trcloud/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('cookie')
              const cookieToSend = trcloudCookie
              if (cookieToSend) {
                proxyReq.setHeader('Cookie', cookieToSend)
              }
              proxyReq.setHeader('X-Requested-With', 'XMLHttpRequest')
              proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
              proxyReq.setHeader('Origin', 'https://thaidrill.trcloud.co')
              proxyReq.setHeader('Referer', 'https://thaidrill.trcloud.co/application/')
            })
          }
        }
      }
    }
  }
})
