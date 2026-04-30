import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const READ_LS_KEY = 'mwm_notif_read_ids'

function loadReadIds() {
  try {
    const raw = localStorage.getItem(READ_LS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch {
    return new Set()
  }
}

function saveReadIds(set) {
  localStorage.setItem(READ_LS_KEY, JSON.stringify([...set]))
}

export const useNotificationsStore = defineStore('notifications', () => {
  const auth = useAuthStore()
  const notifications = ref([])
  const loading = ref(false)
  const readIds = ref(loadReadIds())

  const unreadCount = computed(() => notifications.value.filter((n) => !n.is_read).length)

  const latest5 = computed(() =>
    [...notifications.value].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10)
  )

  async function refresh() {
    if (!auth.user?.id) return
    loading.value = true
    try {
      // 1. Fetch from notifications table (Database)
      const { data: dbNotifs, error: dbError } = await supabase
        .from('notifications')
        .select('*')
        .eq('system_user_id', auth.user.id)
        .order('created_at', { ascending: false })
        .limit(30)

      if (dbError) throw dbError

      // 2. Virtual notifications (Stock & Pending - keep these as well if helpful)
      const [lowRes, pendingRes] = await Promise.all([
        supabase
          .from('items')
          .select('id, item_name, item_code, current_stock, unit, created_at, updated_at')
          .lte('current_stock', 5)
          .order('current_stock', { ascending: true })
          .limit(10),
        supabase
          .from('order_req')
          .select('id, amount, unit, created_at, items(item_name, item_code)')
          .eq('status', 'pending')
          .eq('created_by', auth.user.id) // Only show my own pending if I'm a user? Or all if admin?
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      const list = []

      // Add DB notifications
      for (const n of dbNotifs || []) {
        list.push({
          ...n,
          is_db: true
        })
      }

      // Add Stock notifications (Virtual)
      for (const it of lowRes.data || []) {
        const stock = Number(it.current_stock ?? 0)
        const id = `stock-${it.id}`
        list.push({
          id,
          title: stock <= 2 ? 'สินค้าวิกฤต' : 'สินค้าใกล้หมด',
          message: `${it.item_name || it.item_code || 'สินค้า'} เหลือเพียง ${stock} ${it.unit || ''}`.trim(),
          created_at: it.updated_at || it.created_at,
          is_read: readIds.value.has(id),
          is_db: false
        })
      }

      // Add Pending notifications (Virtual)
      for (const o of pendingRes.data || []) {
        const id = `req-${o.id}`
        const name = o.items?.item_name || o.items?.item_code || 'สินค้า'
        list.push({
          id,
          title: 'คำขอเบิกใหม่',
          message: `${name} — จำนวน ${o.amount} ${o.unit || ''} (รออนุมัติ)`.trim(),
          created_at: o.created_at,
          is_read: readIds.value.has(id),
          is_db: false
        })
      }

      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      notifications.value = list.slice(0, 40)
    } catch (err) {
      console.error('notifications refresh:', err)
    } finally {
      loading.value = false
    }
  }

  async function markAsRead(id) {
    const n = notifications.value.find(item => item.id === id)
    if (!n) return

    if (n.is_db) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
      if (error) console.error('markAsRead error:', error)
    } else {
      const next = new Set(readIds.value)
      next.add(id)
      readIds.value = next
      saveReadIds(next)
    }
    
    // Optimistic update
    n.is_read = true
  }

  async function markAllAsRead() {
    if (!auth.user?.id) return
    
    // Mark DB notifications
    const dbIds = notifications.value.filter(n => n.is_db && !n.is_read).map(n => n.id)
    if (dbIds.length > 0) {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', dbIds)
    }

    // Mark Virtual notifications
    const next = new Set(readIds.value)
    notifications.value.forEach(n => {
      if (!n.is_db) next.add(n.id)
      n.is_read = true
    })
    readIds.value = next
    saveReadIds(next)
  }

  return { notifications, readIds, loading, unreadCount, latest5, refresh, markAsRead, markAllAsRead }
})

