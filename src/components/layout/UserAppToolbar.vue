<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import ProfileDropdown from '@/components/ui/ProfileDropdown.vue'
import NotificationDropdown from '@/components/ui/NotificationDropdown.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import ProfileEditSidebar from '@/components/layout/ProfileEditSidebar.vue'

// 1. Core Stores & Refs
const auth = useAuthStore()
const route = useRoute()
const isDark = ref(false)
const isMenuOpen = ref(false)
const showConfirmLogout = ref(false)
const showEditProfile = ref(false)
const profileImg = ref('')

// 2. Computed Properties
const fullname = computed(() => auth.user?.fullname || '-')
const empCode = computed(() => auth.user?.emp_code || '')
const currentPath = computed(() => route.path)

// 3. Methods
function closeMenu() { isMenuOpen.value = false }

function loadProfileImage() {
  if (auth.user) {
    profileImg.value = localStorage.getItem(`profile_img_${auth.user.id}`) || ''
  }
}

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('mwm_theme', isDark.value ? 'dark' : 'light')
}

function handleLogout() {
  isMenuOpen.value = false
  showConfirmLogout.value = true
}

function confirmLogout() {
  showConfirmLogout.value = false
  auth.logout()
}

// 4. Lifecycle Hooks
onMounted(() => {
  isDark.value = document.documentElement.classList.contains('dark')
  loadProfileImage()
})
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden bg-[var(--color-bg-base)]">
    <header class="w-full shrink-0 z-40 shadow-sm print:hidden" style="background: var(--color-bg-card)">
      <div class="max-w-screen-xl mx-auto px-3 md:px-6">
      <div class="h-14 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <button class="md:hidden w-9 h-9 rounded-lg grid place-items-center hover:bg-gray-100 dark:hover:bg-slate-700"
                  @click="isMenuOpen = true">
            <i class="fa-solid fa-bars text-[16px]" style="color: var(--color-text-primary)"></i>
          </button>
          <span class="hidden md:inline-flex w-9 h-9 rounded-lg items-center justify-center bg-blue-600/15 dark:bg-blue-500/20">
            <i class="fa-solid fa-cubes text-[16px] text-blue-600 dark:text-blue-400"></i>
          </span>
          <div class="text-[15px] font-semibold" style="color: var(--color-text-primary)">Warehouse Management</div>
        </div>
        <nav class="hidden md:flex items-center gap-1">
          <router-link to="/u/home"
             class="px-4 py-2 rounded-full text-[13px] font-medium transition-colors"
             :class="currentPath === '/u/home' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-slate-700'"
             :style="currentPath === '/u/home' ? '' : 'color: var(--color-text-secondary)'">
            Home
          </router-link>
          <router-link to="/u/create"
             class="px-4 py-2 rounded-full text-[13px] font-medium transition-colors"
             :class="currentPath === '/u/create' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-slate-700'"
             :style="currentPath === '/u/create' ? '' : 'color: var(--color-text-secondary)'">
            เบิกพัสดุ
          </router-link>
          <router-link to="/u/create-pr"
             class="px-4 py-2 rounded-full text-[13px] font-medium transition-colors"
             :class="currentPath === '/u/create-pr' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-slate-700'"
             :style="currentPath === '/u/create-pr' ? '' : 'color: var(--color-text-secondary)'">
            คำขอ PR
          </router-link>
          <router-link to="/u/history"
             class="px-4 py-2 rounded-full text-[13px] font-medium transition-colors"
             :class="currentPath === '/u/history' ? 'bg-blue-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-slate-700'"
             :style="currentPath === '/u/history' ? '' : 'color: var(--color-text-secondary)'">
            ประวัติการดำเนินการ
          </router-link>
        </nav>
        <div class="flex items-center gap-1 md:gap-2">
          <button @click="toggleTheme"
                  class="w-9 h-9 rounded-full grid place-items-center hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                  style="color: var(--color-text-secondary)">
            <i :class="isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon'" class="text-[16px]"></i>
          </button>

          <NotificationDropdown />

          <ProfileDropdown />
        </div>
      </div>
    </div>
    </header>
    
    <main class="flex-1 relative scroll-smooth scrollbar-overlay-container" style="overflow-y: overlay; overflow-x: hidden;">
      <div class="w-full h-full">
        <slot />
      </div>
    </main>
  </div>

  <transition name="fade">
    <div v-if="isMenuOpen" class="fixed inset-0 z-50 md:hidden" @keyup.esc="closeMenu">
      <div class="absolute inset-0 bg-black/40" @click="closeMenu"></div>
      <div class="absolute left-0 top-0 h-full w-72 max-w-[80vw] shadow-2xl flex flex-col"
           style="background: var(--color-bg-card)">
        <button class="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 z-10" @click="closeMenu">
          <i class="fa-solid fa-xmark text-lg" style="color: var(--color-text-muted)"></i>
        </button>
        <div class="px-5 py-6 border-b flex flex-col items-center" style="border-color: var(--color-border)">
          <div class="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 p-1 mb-3">
            <div class="w-full h-full rounded-full bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden">
              <img v-if="profileImg" :src="profileImg" class="w-full h-full object-cover" />
              <span v-else class="text-2xl font-bold bg-gradient-to-br from-blue-500 to-indigo-500 bg-clip-text text-transparent">
                {{ fullname.charAt(0) }}
              </span>
            </div>
          </div>
          <div class="text-center">
            <div class="text-[15px] font-bold" style="color: var(--color-text-primary)">{{ fullname }}</div>
            <div class="text-[12px]" style="color: var(--color-text-muted)">{{ empCode }}</div>
          </div>
        </div>
        <nav class="flex-1 overflow-y-auto p-3">
          <ul class="space-y-1">
            <li>
              <router-link to="/u/home" @click="closeMenu"
                class="flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-colors"
                :class="currentPath === '/u/home' 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-[var(--color-text-secondary)]'"
              >
                <i class="fa-solid fa-house"></i>
                หน้าหลัก
              </router-link>
            </li>
            <li>
              <router-link to="/u/create" @click="closeMenu"
                           class="flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-colors"
                           :class="currentPath === '/u/create' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-[var(--color-text-secondary)]'"
                           :style="currentPath === '/u/create' ? '' : 'color: var(--color-text-secondary)'">
                <i class="fa-solid fa-file-pen"></i>
                สร้างใบเบิกพัสดุ
              </router-link>
            </li>
            <li>
              <router-link to="/u/create-pr" @click="closeMenu"
                           class="flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-colors"
                           :class="currentPath === '/u/create-pr' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-[var(--color-text-secondary)]'"
                           :style="currentPath === '/u/create-pr' ? '' : 'color: var(--color-text-secondary)'">
                <i class="fa-solid fa-file-invoice"></i>
                สร้างใบคำขอสั่งซื้อ (PR)
              </router-link>
            </li>
            <li>
              <router-link to="/u/history" @click="closeMenu"
                           class="flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] transition-colors"
                           :class="currentPath === '/u/history' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-[var(--color-text-secondary)]'"
                           :style="currentPath === '/u/history' ? '' : 'color: var(--color-text-secondary)'">
                <i class="fa-solid fa-clock-rotate-left"></i>
                ประวัติ
              </router-link>
            </li>
          </ul>
          <hr class="my-3" style="border-color: var(--color-border)" />
          <ul class="space-y-1">
            <li>
              <button @click="toggleTheme"
                      class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[14px] hover:bg-gray-100 dark:hover:bg-slate-700"
                      style="color: var(--color-text-secondary)">
                <div class="flex items-center gap-3">
                  <i :class="isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon'"></i>
                  {{ isDark ? 'โหมดสว่าง' : 'โหมดมืด' }}
                </div>
                <div class="w-8 h-4 rounded-full relative transition-colors"
                     :class="isDark ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'">
                  <div class="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all"
                       :style="isDark ? 'left: 18px' : 'left: 2px'"></div>
                </div>
              </button>
            </li>
            <li>
              <button @click="isMenuOpen = false; showEditProfile = true"
                      class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] hover:bg-gray-100 dark:hover:bg-slate-700"
                      style="color: var(--color-text-secondary)">
                <i class="fa-solid fa-user-pen"></i>
                แก้ไขข้อมูลโปรไฟล์
              </button>
            </li>
            <li>
              <button @click="handleLogout"
                      class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[14px] text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                <i class="fa-solid fa-right-from-bracket"></i>
                ออกจากระบบ
              </button>
            </li>
          </ul>
        </nav>
        <div class="px-4 py-3 border-t text-center text-[10px] cursor-alias"
             style="border-color: var(--color-border); color: var(--color-text-muted)">
          Powered by <span class="font-bold italic animate-pulse hover:text-[50px] transition-all duration-500">DMIS</span>
        </div>
      </div>
    </div>
  </transition>

  <!-- Logout Confirmation -->
  <ConfirmDialog 
    :show="showConfirmLogout"
    title="ออกจากระบบ"
    message="คุณต้องการออกจากระบบจริงๆใช่หรือไม่?"
    confirmText="ใช่ และ ออก"
    cancelText="ยกเลิก"
    type="danger"
    @confirm="confirmLogout"
    @cancel="showConfirmLogout = false"
  />

  <!-- Edit Profile Sidebar -->
  <ProfileEditSidebar 
    :show="showEditProfile"
    @close="showEditProfile = false"
    @updated="loadProfileImage"
  />
</template>

<style scoped>
a { text-decoration: none; }
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
