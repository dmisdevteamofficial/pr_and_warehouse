<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(true)
const saving = ref(false)
const currentCookie = ref(null)
const cookieHistory = ref([])
const newCookieValue = ref('')

function formatDateTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH')
}

function truncateText(text, maxLength = 50) {
  if (!text) return '-'
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

async function fetchData() {
  loading.value = true
  try {
    if (!auth.user?.id) {
      router.push('/')
      return
    }

    const { data: userData, error: userError } = await supabase
      .from('system_users')
      .select('*')
      .eq('id', auth.user.id)
      .single()

    if (userError || !userData) {
      router.push('/')
      return
    }

    if (!['admin_store', 'super_admin'].includes(userData.role)) {
      router.push('/')
      return
    }

    const { data: currentData, error: currentError } = await supabase
      .from('trcloud_session')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (!currentError && currentData.length > 0) {
      const current = currentData[0]
      const { data: updaterData } = await supabase
        .from('system_users')
        .select('fullname')
        .eq('id', current.updated_by)
        .single()
      currentCookie.value = {
        ...current,
        _updater: updaterData || null
      }
    }

    const { data: historyData, error: historyError } = await supabase
      .from('trcloud_session')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(5)

    if (!historyError && historyData.length > 0) {
      const updaterIds = [...new Set(historyData.map(r => r.updated_by).filter(Boolean))]
      const updaterById = {}
      if (updaterIds.length) {
        const { data: updaters } = await supabase
          .from('system_users')
          .select('id, fullname')
          .in('id', updaterIds)
        if (updaters) {
          for (const u of updaters) {
            updaterById[u.id] = u
          }
        }
      }
      cookieHistory.value = historyData.map(row => ({
        ...row,
        _updater: row.updated_by ? updaterById[row.updated_by] : null
      }))
    }
  } catch (err) {
    console.error('Fetch error:', err)
  } finally {
    loading.value = false
  }
}

async function saveNewCookie() {
  if (!newCookieValue.value.trim()) {
    alert('กรุณาใส่ cookie ใหม่')
    return
  }

  saving.value = true
  try {
    await supabase
      .from('trcloud_session')
      .update({ is_active: false })
      .eq('is_active', true)

    const { error } = await supabase
      .from('trcloud_session')
      .insert({
        cookie_value: newCookieValue.value.trim(),
        updated_by: auth.user.id,
        is_active: true
      })

    if (error) throw error

    newCookieValue.value = ''
    alert('บันทึก cookie ใหม่สำเร็จ')
    await fetchData()
  } catch (err) {
    alert('บันทึกไม่สำเร็จ: ' + err.message)
  } finally {
    saving.value = false
  }
}

onMounted(fetchData)
</script>

<template>
  <div>
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-[20px] font-semibold" style="color: var(--color-text-primary)">จัดการ Cookie TRCloud</h1>
        <p class="text-[13px] mt-0.5" style="color: var(--color-text-muted)">อัปเดต cookie สำหรับเชื่อมต่อกับ TRCloud API</p>
      </div>
    </div>

    <div class="space-y-6">
      <div class="p-4 rounded-xl border" style="background: var(--color-bg-card); border-color: var(--color-border)">
        <h2 class="text-[14px] font-semibold mb-4" style="color: var(--color-text-primary)">Cookie ที่กำลังใช้งาน</h2>
        <div v-if="loading" class="text-[13px]" style="color: var(--color-text-muted)">กำลังโหลด...</div>
        <div v-else-if="!currentCookie" class="text-[13px]" style="color: var(--color-text-muted)">ไม่มี cookie ที่ใช้งานอยู่</div>
        <div v-else class="space-y-3">
          <div class="text-[13px]">
            <span class="font-medium" style="color: var(--color-text-primary)">อัปเดตเมื่อ:</span>
            <span class="ml-2" style="color: var(--color-text-secondary)">{{ formatDateTime(currentCookie.updated_at) }}</span>
          </div>
          <div class="text-[13px]">
            <span class="font-medium" style="color: var(--color-text-primary)">อัปเดตโดย:</span>
            <span class="ml-2" style="color: var(--color-text-secondary)">{{ currentCookie._updater?.fullname || '-' }}</span>
          </div>
          <div class="text-[13px]">
            <span class="font-medium" style="color: var(--color-text-primary)">Cookie:</span>
            <div class="mt-2 p-3 rounded-lg border text-[12px] break-all" style="border-color: var(--color-border); background: var(--color-bg-body); color: var(--color-text-muted)">
              {{ currentCookie.cookie_value }}
            </div>
          </div>
        </div>
      </div>

      <div class="p-4 rounded-xl border" style="background: var(--color-bg-card); border-color: var(--color-border)">
        <h2 class="text-[14px] font-semibold mb-4" style="color: var(--color-text-primary)">บันทึก Cookie ใหม่</h2>
        <div class="space-y-4">
          <div>
            <label class="text-[13px] font-medium block mb-2" style="color: var(--color-text-primary)">Cookie String</label>
            <textarea
              v-model="newCookieValue"
              rows="4"
              class="w-full px-3 py-2 border rounded-lg text-[13px] focus:outline-none focus:ring-1"
              style="border-color: var(--color-border); background: var(--color-bg-body); color: var(--color-text-primary)"
              placeholder="วาง cookie string ที่คัดลอกจาก TRCloud..."
            ></textarea>
          </div>
          <button
            @click="saveNewCookie"
            :disabled="saving"
            class="px-4 py-2 rounded-lg text-[13px] font-medium border bg-white dark:bg-gray-800 dark:text-white hover:bg-gray-50 transition-all disabled:opacity-50"
            style="border-color: var(--color-border); color: var(--color-text-primary)"
          >
            {{ saving ? 'กำลังบันทึก...' : 'บันทึก cookie ใหม่' }}
          </button>
        </div>
      </div>

      <div class="rounded-xl border overflow-hidden" style="background: var(--color-bg-card); border-color: var(--color-border)">
        <div class="px-4 py-3 border-b" style="border-color: var(--color-border)">
          <h2 class="text-[14px] font-semibold" style="color: var(--color-text-primary)">ประวัติ 5 รายการล่าสุด</h2>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-[13px]">
            <thead>
              <tr style="border-bottom: 1px solid var(--color-border)">
                <th class="text-left px-4 py-3 font-medium whitespace-nowrap" style="color: var(--color-text-muted)">Cookie (ย่อ)</th>
                <th class="text-left px-4 py-3 font-medium whitespace-nowrap" style="color: var(--color-text-muted)">อัปเดตเมื่อ</th>
                <th class="text-left px-4 py-3 font-medium whitespace-nowrap" style="color: var(--color-text-muted)">อัปเดตโดย</th>
                <th class="text-left px-4 py-3 font-medium whitespace-nowrap" style="color: var(--color-text-muted)">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in cookieHistory"
                :key="row.id"
                class="border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
                style="border-color: var(--color-border)"
              >
                <td class="px-4 py-3" style="color: var(--color-text-primary)">{{ truncateText(row.cookie_value) }}</td>
                <td class="px-4 py-3 whitespace-nowrap" style="color: var(--color-text-secondary)">{{ formatDateTime(row.updated_at) }}</td>
                <td class="px-4 py-3 whitespace-nowrap" style="color: var(--color-text-secondary)">{{ row._updater?.fullname || '-' }}</td>
                <td class="px-4 py-3">
                  <span
                    class="px-2 py-0.5 rounded-full text-[11px] border"
                    :class="row.is_active ? 'bg-green-50 text-green-700 border-green-100' : 'bg-gray-50 text-gray-700 border-gray-100'"
                  >
                    {{ row.is_active ? 'ใช้งานอยู่' : 'เก่า' }}
                  </span>
                </td>
              </tr>
              <tr v-if="loading">
                <td colspan="4" class="px-4 py-8 text-center" style="color: var(--color-text-muted)">กำลังโหลด...</td>
              </tr>
              <tr v-else-if="!loading && cookieHistory.length === 0">
                <td colspan="4" class="px-4 py-8 text-center" style="color: var(--color-text-muted)">ไม่มีประวัติ</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
input:focus,
textarea:focus {
  border-color: var(--color-primary) !important;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}
</style>
