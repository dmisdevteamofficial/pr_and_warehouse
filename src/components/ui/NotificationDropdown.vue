<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useRouter } from 'vue-router'

const store = useNotificationsStore()
const router = useRouter()
const open = ref(false)

let pollTimer

function timeAgo(isoString) {
  const diff = Math.floor((Date.now() - new Date(isoString)) / 60000)
  if (diff < 1) return 'เมื่อกี้'
  if (diff < 60) return `${diff} นาทีที่แล้ว`
  if (diff < 1440) return `${Math.floor(diff / 60)} ชั่วโมงที่แล้ว`
  return `${Math.floor(diff / 1440)} วันที่แล้ว`
}

function handleClickOutside() {
  open.value = false
}

function toggleOpen() {
  open.value = !open.value
  if (open.value) store.refresh()
}

async function handleNotificationClick(n) {
  await store.markAsRead(n.id)
  open.value = false

  // Logic to navigate based on notification content
  if (n.title.includes('PR') || n.message.toLowerCase().includes('pr')) {
    // If it's a PR notification, go to Homepage (or PR tab in history)
    // The user specifically mentioned Homepage to show the approved item
    router.push({ path: '/u/home', query: { highlight: n.id } })
  } else if (n.id.startsWith('req-')) {
    // Virtual req notification
    router.push({ path: '/u/history', query: { tab: 'withdraw' } })
  } else if (n.id.startsWith('stock-')) {
    // Stock notification (admin might go to inventory, user just sees it)
    // For now just stay or go to home
  }
}

onMounted(() => {
  store.refresh()
  pollTimer = setInterval(() => store.refresh(), 60000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="relative" v-click-outside="handleClickOutside">
    <button
      @click="toggleOpen"
      class="relative w-9 h-9 rounded-full grid place-items-center hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
      style="color: var(--color-text-secondary)"
    >
      <i class="fa-solid fa-bell text-[16px]"></i>
      <span
        v-if="store.unreadCount > 0"
        class="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold border-2 border-[var(--color-bg-card)]"
      >
        {{ store.unreadCount > 99 ? '99+' : store.unreadCount }}
      </span>
    </button>

    <div
      v-if="open"
      class="absolute right-0 top-full mt-2 w-80 max-h-[min(480px,80vh)] flex flex-col rounded-2xl border shadow-xl z-50 overflow-hidden"
      style="background: var(--color-bg-card); border-color: var(--color-border)"
    >
      <div class="flex items-center justify-between px-4 py-3.5 border-b shrink-0 bg-gray-50/50 dark:bg-slate-800/50" style="border-color: var(--color-border)">
        <span class="font-bold text-[14px]" style="color: var(--color-text-primary)">การแจ้งเตือน</span>
        <button
          v-if="store.unreadCount > 0"
          type="button"
          @click="store.markAllAsRead()"
          class="text-[12px] text-blue-600 dark:text-blue-400 font-semibold hover:underline"
        >
          อ่านทั้งหมด
        </button>
      </div>

      <div v-if="store.loading && store.notifications.length === 0" class="px-4 py-12 text-center text-[13px]" style="color: var(--color-text-muted)">
        <i class="fa-solid fa-spinner fa-spin text-xl mb-2 block"></i>
        กำลังโหลด...
      </div>
      <div v-else-if="store.notifications.length === 0" class="px-4 py-12 text-center text-[13px]" style="color: var(--color-text-muted)">
        <i class="fa-solid fa-bell-slash text-2xl mb-2 opacity-20 block"></i>
        ไม่มีการแจ้งเตือนในขณะนี้
      </div>
      <ul v-else class="overflow-y-auto flex-1 min-h-0 scrollbar-thin">
        <li
          v-for="n in store.notifications"
          :key="n.id"
          @click="handleNotificationClick(n)"
          class="px-4 py-3.5 cursor-pointer border-b last:border-b-0 transition-all hover:bg-gray-50 dark:hover:bg-slate-800/80 group"
          :class="!n.is_read ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''"
          style="border-bottom-color: var(--color-border)"
        >
          <div class="flex gap-3">
            <div class="w-2 h-2 rounded-full mt-1.5 shrink-0 transition-transform group-hover:scale-125"
                 :class="!n.is_read ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-transparent'"></div>
            <div class="flex-1 min-w-0">
              <p class="text-[13px] font-bold leading-snug" :class="!n.is_read ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'">
                {{ n.title }}
              </p>
              <p class="text-[12px] mt-1 leading-relaxed line-clamp-2" :class="!n.is_read ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-500'">
                {{ n.message }}
              </p>
              <p class="text-[10px] mt-1.5 font-medium uppercase tracking-wider" style="color: var(--color-text-muted)">
                {{ timeAgo(n.created_at) }}
              </p>
            </div>
          </div>
        </li>
      </ul>
      
      <div v-if="store.notifications.length > 0" class="p-2 border-t text-center" style="border-color: var(--color-border)">
        <button @click="open = false; router.push('/u/history')" 
                class="w-full py-2 text-[12px] font-bold text-gray-500 hover:text-blue-600 transition-colors">
          ดูประวัติทั้งหมด
        </button>
      </div>
    </div>
  </div>
</template>
