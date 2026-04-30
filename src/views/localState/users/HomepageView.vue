<script setup>
import UserAppToolbar from '@/components/layout/UserAppToolbar.vue'
import heroImg from '@/assets/2.png'
import documentImg from '@/assets/document.png'
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

// Company Logos
import logoThaiDrill from '@/assets/thaidrill_company.png'
import logoThaiDrillLao from '@/assets/thaidrillLao_company.png'
import logoTDL_MVDC from '@/assets/tdl&mvdc_company.jpg'
import logoSunny from '@/assets/sunnycompany.png'

const auth = useAuthStore()
const route = useRoute()
const mainTab = ref('withdraw') // 'withdraw' or 'pr'
const tabs = ref('pending')
const prTab = ref('pending') // 'pending' or 'received'
const cards = ref([])
const prCards = ref([])
const loading = ref(false)
const showExpired = ref(false) // Toggle for expired items

// ─── View Control ─────────────────────────────────────────────────────────────
const isModalOpen   = ref(false)
const modalLoading  = ref(false)
const modalOrder    = ref(null)   // full order row
const modalItems    = ref([])     // order_req_items joined with items
const showPrintMenu = ref(false)
const isOrderExpired = ref(false)

// ─── Highlight Logic ──────────────────────────────────────────────────────────
const highlightId = ref(null)

// ─── Date Formatter ───────────────────────────────────────────────────────────
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date   = new Date(dateStr)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

// ─── Fetch Card List ──────────────────────────────────────────────────────────
const fetchOrders = async () => {
  if (!auth.user?.id) return
  loading.value = true
  try {
    const today = new Date().toISOString().split('T')[0]
    
    if (mainTab.value === 'withdraw') {
      let query = supabase
        .from('order_req')
        .select('*, items(item_name)')
        .eq('created_by', auth.user.id)
        .eq('status', tabs.value)
        .order('created_at', { ascending: false })

      const { data, error } = await query
      if (error) throw error

      const grouped = data.reduce((acc, item) => {
        const isExpired = !!(item.expire_date && item.expire_date < today)
        if (showExpired.value !== isExpired) return acc
        const rid = item.request_id || `single-${item.id}`
        if (!acc[rid]) {
          acc[rid] = { ...item, items_count: 0, total_amount: 0, item_names: [], is_group_expired: isExpired }
        }
        acc[rid].items_count += 1
        acc[rid].total_amount += (item.amount || 0)
        if (item.items?.item_name) acc[rid].item_names.push(item.items.item_name)
        return acc
      }, {})

      cards.value = Object.values(grouped).map(group => ({
        id:       group.id,
        request_id: group.request_id,
        title:    group.items_count > 1 ? `คำขอเบิกพัสดุ (${group.items_count} รายการ)` : (group.items?.item_name || 'คำขอเบิกพัสดุ'),
        subtitle: group.items_count > 1 
          ? group.item_names.slice(0, 2).join(', ') + (group.item_names.length > 2 ? '...' : '')
          : `จำนวน ${group.amount} ${group.unit}`,
        date:     formatDate(group.created_at),
        created_at: group.created_at,
        expire:   formatDate(group.expire_date),
        isExpired: group.expire_date && group.expire_date < today,
        img:      group.image_url || documentImg,
        status:   group.status,
        items_count: group.items_count,
        total_amount: group.total_amount
      })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    } else {
      // PR Tab Logic
      if (prTab.value === 'pending') {
        // รอการยืนยัน: job_status เป็น NULL หรือไม่ใช่ 'รับงานแล้ว'
        const { data, error } = await supabase
          .from('purchasing_req')
          .select('*, urgents(option_name)')
          .eq('created_by', auth.user.id)
          .or('job_status.is.null,job_status.neq.รับงานแล้ว')
          .order('created_at', { ascending: false })

        if (error) throw error

        // Group by pr_number
        const grouped = data.reduce((acc, item) => {
          if (!acc[item.pr_number]) {
            acc[item.pr_number] = {
              pr_number: item.pr_number,
              urgent: item.urgents?.option_name,
              created_at: item.created_at,
              status: item.job_status || 'รอการยืนยัน',
              items: [],
              isExpanded: false
            }
          }
          acc[item.pr_number].items.push(item)
          return acc
        }, {})

        prCards.value = Object.values(grouped).map(group => ({
          ...group,
          title: `PR: ${group.pr_number}`,
          subtitle: group.items.length > 1 ? `${group.items[0].details} และอื่นๆ อีก ${group.items.length - 1} รายการ` : group.items[0].details,
          date: formatDate(group.created_at)
        }))
      } else {
        // รับงานแล้ว: Fetch from purchasing_order
        const { data, error } = await supabase
          .from('purchasing_order')
          .select(`
            *,
            purchasing_req!inner(pr_number, details, amount_req, unit, created_by, urgents(option_name))
          `)
          .eq('purchasing_req.created_by', auth.user.id)
          .order('created_at', { ascending: false })

        if (error) throw error

        // Group by pr_number
        const grouped = data.reduce((acc, item) => {
          const pr_no = item.purchasing_req?.pr_number
          if (!acc[pr_no]) {
            acc[pr_no] = {
              pr_number: pr_no,
              lao_po_number: item.lao_po_number,
              status_purchase: item.status_purchase,
              urgent: item.purchasing_req?.urgents?.option_name,
              created_at: item.created_at,
              status: item.status_purchase || 'รับงานแล้ว',
              items: [],
              isExpanded: false
            }
          }
          acc[pr_no].items.push(item)
          return acc
        }, {})

        prCards.value = Object.values(grouped).map(group => ({
          ...group,
          title: `PR: ${group.pr_number}`,
          subtitle: group.items.length > 1 ? `${group.items[0].purchasing_req?.details} และอื่นๆ อีก ${group.items.length - 1} รายการ` : group.items[0].purchasing_req?.details,
          date: formatDate(group.created_at)
        }))
      }
    }
  } catch (err) {
    console.error('Error fetching data:', err.message)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // Check for query parameters from notifications
  if (route.query.highlight) {
    highlightId.value = route.query.highlight
    // If it's a notification from a PR, switch to PR tab
    // We can't know for sure if it's PR just from ID, but we can check if there are other params
    // or just assume for now as per user request
    mainTab.value = 'pr'
    prTab.value = 'received' // Most likely received/approved if notified
  }
  fetchOrders()
})
watch([mainTab, tabs, prTab, showExpired], () => fetchOrders())

// ─── Open Modal ───────────────────────────────────────────────────────────────
async function openModal(card) {
  isModalOpen.value  = true
  modalLoading.value = true
  showPrintMenu.value = false

  try {
    // 1. Fetch all items in the same request_id (or just the single one if no request_id)
    let query = supabase
      .from('order_req')
      .select(`
        *,
        requester:system_users!created_by(fullname, position, department, emp_code),
        approver:system_users!updated_by(fullname),
        items(item_name, unit, item_code)
      `)

    if (card.request_id) {
      query = query.eq('request_id', card.request_id)
    } else {
      query = query.eq('id', card.id)
    }

    const { data: orders, error: orderError } = await query.order('created_at', { ascending: true })

    if (orderError) throw orderError
    if (!orders || orders.length === 0) throw new Error('Order not found')

    modalOrder.value = orders[0] 
    
    // Check if order is expired
    const today = new Date().toISOString().split('T')[0]
    isOrderExpired.value = modalOrder.value.expire_date && modalOrder.value.expire_date < today

    // 2. Map all items to modalItems
    modalItems.value = orders.map(order => ({
      id:        order.id,
      item_code: order.items?.item_code || '-',
      item_name: order.items?.item_name || '-',
      amount:    order.amount,
      unit:      order.unit || order.items?.unit || '',
      is_return: order.is_return,
      remark:    order.remark || ''
    }))

    // 3. Generate Barcode
    await nextTick()
    if (modalOrder.value.request_id) {
      try {
        const barcodeLib = await loadJsBarcode()
        // Wait a bit to ensure the SVG is in the DOM
        setTimeout(() => {
          const barcodeElement = document.querySelector("#barcode-detail")
          if (barcodeElement) {
            barcodeLib("#barcode-detail", modalOrder.value.request_id.toString(), {
              format: "CODE128",
              width: 1.2,
              height: 35,
              displayValue: true,
              fontSize: 10,
              margin: 0
            })
          } else {
            console.warn('Barcode element #barcode-detail not found in DOM yet')
          }
        }, 200)
      } catch (err) {
        console.error('Failed to load JsBarcode in detail view:', err)
      }
    }
  } catch (err) {
    console.error('Error loading order detail:', err.message)
  } finally {
    modalLoading.value = false
  }
}

function closeModal() {
  isModalOpen.value   = false
  modalOrder.value    = null
  modalItems.value    = []
  showPrintMenu.value = false
}

// ─── Document Viewer ──────────────────────────────────────────────────────────
function openDocument() {
  const url = modalOrder.value?.document_url || modalOrder.value?.image_url
  if (url) window.open(url, '_blank')
  else alert('ไม่มีเอกสารแนบ')
}

// ─── Print / Download ─────────────────────────────────────────────────────────
function triggerPrint() {
  showPrintMenu.value = false
  nextTick(() => window.print())
}

function exportAsPdfDocument() {
  showPrintMenu.value = false
  nextTick(() => window.print())
}

function loadJsBarcode() {
  return new Promise((resolve, reject) => {
    if (window.JsBarcode) { resolve(window.JsBarcode); return }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js'
    s.onload  = () => resolve(window.JsBarcode)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getStatusLabel = (status) => ({
  pending:   'รอดำเนินการ',
  approved:  'อนุมัติแล้ว',
  rejected:  'ปฏิเสธแล้ว',
  completed: 'สำเร็จแล้ว',
  'รอการยืนยัน': 'รอการยืนยัน',
  'รับงานแล้ว': 'รับงานแล้ว'
}[status] || status)

// ─── Purpose Options ─────────────────────────────────────────────────────────
const purposeOptions = [
  { key: 'broken', label: 'ขาดไม่ได้ระดับ' },
  { key: 'pm', label: 'ทำ PM วาระ' },
  { key: 'rust', label: 'มีอาการรั่วซึม' },
  { key: 'colorFade', label: 'สึกหรอตามอายุการใช้งาน' },
  { key: 'colorMismatch', label: 'เชื่อมพอกกันสึกหรอ' },
  { key: 'cracked', label: 'มีการแตกร้าว' },
  { key: 'reserve', label: 'เป็นอะไหล่สำรอง' },
  { key: 'damageLoss', label: 'อาไหล่สูญหาย' },
  { key: 'fromAccident', label: 'จากอุบัติเหตุ' },
  { key: 'changeOther', label: 'แก้ไข/ดัดแปลง' },
  { key: 'preventAccident', label: 'ป้องกันเกิดอุบัติเหตุ' },
  { key: 'clean', label: 'ทำความสะอาด' },
  { key: 'officeTool', label: 'อุปกรณ์สำนักงาน' },
  { key: 'other1', label: 'อื่นๆ' },
  { key: 'other2', label: 'อื่นๆ' }
]

const isPurposeChecked = (label) => {
  if (!modalOrder.value?.withdraw_purpose) return false
  return modalOrder.value.withdraw_purpose.includes(label)
}

const getPurposeDetail = (label) => {
  if (!modalOrder.value?.withdraw_purpose) return ''
  // ในฐานข้อมูลอาจจะเก็บแบบ "ทำ PM วาระ: รายละเอียด"
  const parts = modalOrder.value.withdraw_purpose.split(label + ': ')
  if (parts.length > 1) return parts[1].split(',')[0]
  return ''
}

const totalAmount = () => modalItems.value.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
</script>

<template>
  <UserAppToolbar>

    <!-- ── LIST VIEW ── -->
    <div v-if="!isModalOpen">
      <!-- Hero Section -->
      <section class="relative overflow-hidden rounded-b-2xl hero-section"
               style="background: var(--color-bg-card)">
        <img :src="heroImg" alt="cover" class="hero-img">
        <div class="hero-overlay"></div>
        <div class="absolute inset-0 flex items-center justify-center gap-4 mt-12 animate-pulse">
          <router-link to="/u/create" class="hero-btn">
            + สร้างคำขอเบิก
          </router-link>
          <router-link to="/u/create-pr" class="hero-btn !bg-blue-600 !text-white">
            + สร้างคำขอ PR
          </router-link>
        </div>
      </section>

      <!-- Content Section -->
      <section class="max-w-screen-lg mx-auto px-4 md:px-6 mt-6 pb-8">

        <!-- Main Tabs -->
        <div class="flex items-center gap-2 mb-6 border-b border-gray-100 dark:border-gray-800">
          <button @click="mainTab = 'withdraw'" 
                  class="pb-3 px-4 text-[15px] font-bold transition-all relative"
                  :class="mainTab === 'withdraw' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'">
            รายการคำขอเบิกพัสดุ
            <div v-if="mainTab === 'withdraw'" class="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-full"></div>
          </button>
          <button @click="mainTab = 'pr'" 
                  class="pb-3 px-4 text-[15px] font-bold transition-all relative"
                  :class="mainTab === 'pr' ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'">
            รายการเปิด PR
            <div v-if="mainTab === 'pr'" class="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 rounded-full"></div>
          </button>
        </div>

        <div class="section-title mb-4">
          {{ mainTab === 'withdraw' ? 'คำขอเบิกพัสดุของฉัน' : 'คำขอ PR ของฉัน' }}
        </div>

        <!-- Tab Toggle Switch (Withdraw) -->
        <div v-if="mainTab === 'withdraw'" class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div class="tab-switch-wrap !mb-0">
            <div class="tab-switch">
              <div class="tab-switch-track" :class="tabs === 'completed' ? 'track-right' : 'track-left'"></div>
              <button @click="tabs='pending'" class="tab-switch-btn" :class="{ 'tab-active': tabs==='pending' }">
                <span class="tab-dot dot-warning"></span>
                รอการอนุมัติ
              </button>
              <button @click="tabs='completed'" class="tab-switch-btn" :class="{ 'tab-active': tabs==='completed' }">
                <span class="tab-dot dot-success"></span>
                สำเร็จแล้ว
              </button>
            </div>
          </div>

          <!-- Expired Filter Toggle -->
          <button @click="showExpired = !showExpired" 
                  class="flex items-center gap-2 px-4 py-2 rounded-xl border transition-all"
                  :class="showExpired ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'"
                  style="font-size: 13px; font-weight: 600;">
            <i class="fa-solid fa-clock-rotate-left"></i>
            {{ showExpired ? 'แสดงรายการที่ยังไม่หมดอายุ' : 'แสดงรายการที่หมดอายุแล้ว' }}
          </button>
        </div>

        <!-- Tab Toggle Switch (PR) -->
        <div v-if="mainTab === 'pr'" class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div class="tab-switch-wrap !mb-0">
            <div class="tab-switch">
              <div class="tab-switch-track" :class="prTab === 'received' ? 'track-right' : 'track-left'"></div>
              <button @click="prTab='pending'" class="tab-switch-btn" :class="{ 'tab-active': prTab==='pending' }">
                <span class="tab-dot dot-warning"></span>
                รอการยืนยัน
              </button>
              <button @click="prTab='received'" class="tab-switch-btn" :class="{ 'tab-active': prTab==='received' }">
                <span class="tab-dot dot-success"></span>
                รับงานแล้ว
              </button>
            </div>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="flex justify-center items-center py-20">
          <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>

        <!-- Empty -->
        <div v-else-if="(mainTab === 'withdraw' && cards.length === 0) || (mainTab === 'pr' && prCards.length === 0)" 
             class="flex flex-col items-center justify-center py-20 text-gray-400 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-gray-200 dark:border-slate-800">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <span v-if="mainTab === 'withdraw'">
            <span v-if="showExpired">ไม่มีรายการที่หมดอายุ</span>
            <span v-else>ไม่มีรายการ{{ tabs === 'pending' ? 'รอการอนุมัติ' : 'ที่สำเร็จแล้ว' }}</span>
          </span>
          <span v-else>
            ไม่มีรายการ{{ prTab === 'pending' ? 'รอการยืนยัน' : 'รับงานแล้ว' }}
          </span>
        </div>

        <!-- Cards Grid (Withdraw) -->
        <div v-else-if="mainTab === 'withdraw'" class="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
          <div v-for="c in cards" :key="c.id" class="req-card" 
               :class="{ 'opacity-75 grayscale-[0.5]': c.isExpired }"
               @click="openModal(c)">
            <div class="card-img-wrap">
              <img :src="c.img" class="card-img" alt="">
              <div class="card-img-overlay"></div>
              <span class="card-date-badge">{{ c.date }}</span>
              <div v-if="c.isExpired" class="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] z-10">
                <span class="px-3 py-1 rounded-lg bg-red-600 text-white text-[12px] font-bold shadow-lg">หมดอายุแล้ว</span>
              </div>
            </div>
            <div class="card-body">
              <div class="card-body-top">
                <div class="card-title">{{ c.title }}</div>
                <span class="card-status-badge" :class="{ 'status-completed': c.status === 'completed' }">
                  {{ getStatusLabel(c.status) }}
                </span>
              </div>
              <div class="card-subtitle">{{ c.subtitle }}</div>
              <div class="card-footer">
                <span class="card-expire-label">หมดอายุ</span>
                <span class="card-expire-date rounded-lg bg-red-100 text-red-600 dark:bg-red-800/50 dark:text-red-500 px-2 text-[11px]">{{ c.expire }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Cards List (PR) - Grouped View -->
        <div v-else-if="mainTab === 'pr'" class="flex flex-col gap-4">
          <div v-for="c in prCards" :key="c.pr_number" 
               class="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden transition-all">
            
            <!-- PR Group Header (Long Card) -->
            <div @click="c.isExpanded = !c.isExpanded" 
                 class="flex flex-col md:flex-row md:items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
              
              <!-- Icon/Badge -->
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center border border-blue-100 dark:border-blue-800/30">
                  <i class="fa-solid fa-file-invoice text-xl text-blue-500"></i>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="font-bold text-gray-800 dark:text-gray-100 text-[16px]">{{ c.title }}</h3>
                    <div v-if="c.urgent" class="px-2 py-0.5 rounded bg-red-500 text-white text-[10px] font-bold flex items-center gap-1">
                      <i class="fa-solid fa-bolt"></i>
                      {{ c.urgent }}
                    </div>
                  </div>
                  <div class="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-2">
                    <i class="fa-regular fa-calendar"></i>
                    {{ c.date }}
                    <span class="mx-1">•</span>
                    <span>{{ c.items.length }} รายการ</span>
                  </div>
                </div>
              </div>

              <!-- Details & Status -->
              <div class="flex-grow min-w-0 md:px-4">
                <p class="text-gray-500 dark:text-gray-400 text-sm truncate">{{ c.subtitle }}</p>
              </div>

              <!-- Status & Actions -->
              <div class="flex items-center justify-between md:justify-end gap-4 mt-2 md:mt-0">
                <div class="flex flex-col items-end gap-1">
                  <span class="card-status-badge !m-0" :class="prTab === 'received' ? 'status-completed' : 'bg-orange-100 text-orange-600'">
                    {{ c.status }}
                  </span>
                  <div v-if="c.lao_po_number" class="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                    PO: {{ c.lao_po_number }}
                  </div>
                </div>
                <i class="fa-solid fa-chevron-down text-gray-400 transition-transform duration-300" 
                   :class="{ 'rotate-180': c.isExpanded }"></i>
              </div>
            </div>

            <!-- PR Items List (Accordion Content) -->
            <div v-show="c.isExpanded" class="border-t border-gray-50 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950/30">
              <div class="p-4 space-y-3">
                <div v-for="(item, idx) in c.items" :key="idx" 
                     class="flex items-start gap-4 p-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-sm">
                  <div class="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-[12px] font-bold text-gray-400">
                    {{ idx + 1 }}
                  </div>
                  <div class="flex-grow min-w-0">
                    <div class="flex justify-between items-start mb-1">
                      <h4 class="font-bold text-gray-800 dark:text-gray-100 text-sm">{{ prTab === 'received' ? item.purchasing_req?.details : item.details }}</h4>
                      <div class="text-[12px] font-bold text-blue-600">
                        {{ prTab === 'received' ? item.purchasing_req?.amount_req : item.amount_req }} {{ prTab === 'received' ? item.purchasing_req?.unit : item.unit }}
                      </div>
                    </div>
                    <div class="flex items-center gap-4 text-[11px] text-gray-400">
                      <span v-if="item.air_code || item.purchasing_req?.air_code">
                        <i class="fa-solid fa-tag mr-1"></i>
                        {{ item.air_code || item.purchasing_req?.air_code }}
                      </span>
                      <span v-if="prTab === 'received' && item.status_purchase">
                        <i class="fa-solid fa-truck-ramp-box mr-1"></i>
                        {{ item.status_purchase }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ── DETAIL VIEW (Full Page) ── -->
    <div v-else class="min-h-full bg-gray-100 dark:bg-slate-950 py-6 px-4">
      
      <!-- ── Action Bar ── -->
      <div class="max-w-[960px] mx-auto flex items-center justify-between mb-4 print:hidden">
        <button
          @click="closeModal"
          class="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300 text-[14px] font-semibold hover:bg-gray-50 dark:hover:bg-slate-800 transition-all shadow-sm"
        >
          <i class="fa-solid fa-chevron-left text-[12px]"></i>
          ย้อนกลับ
        </button>

        <div class="flex items-center gap-2">
          <div class="relative">
            <button
              @click="showPrintMenu = !showPrintMenu"
              class="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white text-[14px] font-bold shadow-md shadow-teal-500/25 transition-all active:scale-[0.98]"
            >
              <i class="fa-solid fa-print"></i>
              พิมพ์-ดาวน์โหลด
              <i class="fa-solid fa-chevron-down text-[10px]" :class="{ 'rotate-180': showPrintMenu }"></i>
            </button>

            <!-- Dropdown -->
            <Transition name="dropdown-pop">
              <div v-if="showPrintMenu"
                   class="absolute top-full mt-2 right-0 w-56 rounded-xl border border-gray-200 dark:border-slate-700
                          bg-white dark:bg-slate-800 shadow-xl overflow-hidden z-20">
                <button @click="triggerPrint" class="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors text-left">
                  <span class="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center"><i class="fa-solid fa-print text-blue-600 text-[12px]"></i></span> พิมพ์เอกสาร (Print)
                </button>
                <div class="h-px bg-gray-100 dark:bg-slate-700 mx-3"></div>
                <button @click="exportAsPdfDocument" class="w-full flex items-center gap-3 px-4 py-3 text-[13px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700/60 transition-colors text-left">
                  <span class="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center"><i class="fa-solid fa-file-pdf text-red-600 text-[12px]"></i></span> บันทึกเป็น PDF
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-if="modalLoading" class="flex justify-center items-center py-24">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
      </div>

      <!-- Paper Template (Read Only) -->
      <div v-else-if="modalOrder" class="paper-scroll-wrap scrollbar-overlay-x">
        <div class="paper-sheet bg-white text-gray-900 shadow-xl rounded-lg overflow-hidden font-['Niramit',sans-serif] text-[9px] relative" style="color: #111;">
          <!-- Expired Watermark -->
          <div v-if="isOrderExpired" 
               class="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none select-none overflow-hidden">
            <div class="transform -rotate-45 text-[100px] font-black text-red-500/20 border-[15px] border-red-500/10 px-12 py-4 rounded-3xl uppercase tracking-[15px] whitespace-nowrap">
              หมดอายุแล้ว
            </div>
          </div>

          <div id="print-area-detail" class="p-6 pb-4 pt-4">
          
          <!-- Header Row -->
          <div class="relative flex items-stretch gap-3 mb-0">
            <!-- Left: Logos + MR/วันที่ -->
            <div class="flex-1 min-w-0 flex flex-col z-10">
              <div class="flex items-center gap-3">
                <div class="w-[55px] h-[36px] overflow-hidden flex items-center justify-center bg-white">
                  <img :src="logoThaiDrill" alt="ThaiDrill" class="max-w-full max-h-full object-contain" />
                </div>
                <div class="w-[69px] h-[59px] overflow-hidden flex items-center justify-center bg-white">
                  <img :src="logoThaiDrillLao" alt="ThaiDrill Lao" class="max-w-full max-h-full object-contain" />
                </div>
                <div class="w-[60px] h-[32px] overflow-hidden flex items-center justify-center bg-white p-0.5">
                  <img :src="logoTDL_MVDC" alt="TDLAO & MVDC" class="max-w-full max-h-full object-contain" />
                </div>
                <div class="w-[45px] h-[45px] overflow-hidden flex items-center justify-center bg-white p-0.5">
                  <img :src="logoSunny" alt="SUNNY" class="max-w-full max-h-full object-contain" />
                </div>
              </div>

              <div class="mt-1 space-y-2">
                <div class="flex items-end gap-2">
                  <span class="font-semibold whitespace-nowrap text-[9px] pb-0.5">เลขที่ MR</span>
                  <div class="flex-1 max-w-[189px] border-b border-gray-400 text-[9px] px-1 pb-0.5 min-h-[16px]">{{ modalOrder.mr_number || '-' }}</div>
                </div>
                <div class="flex items-end gap-2">
                  <span class="font-semibold whitespace-nowrap text-[9px] pb-0.5">วันที่เบิก</span>
                  <div class="border-b border-gray-400 text-[9px] px-1 w-52 pb-0.5 min-h-[16px]">{{ formatDate(modalOrder.created_at) }}</div>
                </div>
              </div>

              <div class="flex items-end gap-5 mt-auto pt-1 text-[9px]">
                <label class="flex items-center gap-1.5"><input type="checkbox" disabled :checked="modalOrder.withdraw_type_for_sale" class="w-3 h-3" /> เบิกเพื่อขาย</label>
                <label class="flex items-center gap-1.5"><input type="checkbox" disabled :checked="modalOrder.withdraw_type_new" class="w-3 h-3" /> เบิกใหม่</label>
                <div class="flex items-end gap-1.5">
                  <span class="whitespace-nowrap pb-0.5">ทดแทนของเก่า : สาเหตุ</span>
                  <div class="border-b border-gray-400 text-[9px] px-1 pb-0.5 flex-1 min-w-[276px] min-h-[16px]">{{ modalOrder.note?.split('\nสาเหตุทดแทน: ')[1] || '-' }}</div>
                </div>
              </div>
            </div>

            <!-- Title (Center) -->
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
              <h1 class="text-[18px] font-bold tracking-wide" style="color: #111;">ใบเบิกพัสดุ</h1>
            </div>

            <!-- Right: FM Code + Company Checkbox -->
            <div class="shrink-0 z-10">
              <div class="text-[9px] text-gray-500 mb-0.2 text-right">FM-MT-ST01-02 REV 03 - 01/04/2026</div>
              <div class="border border-gray-400 p-0.5 text-[9px] min-w-[150px]">
                <div v-for="(label, idx) in ['รถเจาะไทย','ซั่นนี่ เฟอติไลเซอร์','ปุ๋ยรากหญ้า','ทีดี ฟิกซ์','ทีดี คอนแทรคเตอร์','ไทยดริว ลาว','ซันนี่ แมชีนเนอรี่']" :key="idx"
                  class="flex items-center gap-1.5 leading-[1.2]">
                  <input type="radio" disabled :checked="modalOrder.company === label" class="w-2 h-2" />
                  <span>{{ label }}</span>
                </div>
                <div class="flex items-center gap-1 mt-0.2 pt-0.3 border-t border-gray-300">
                  <span class="text-[10px]">CONST CENTER</span>
                  <div class="flex gap-1 ml-1">
                    <div v-for="i in 5" :key="i" class="w-3 h-3 border border-gray-400 text-center text-[9px]">-</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Machinery Info -->
          <div class="flex flex-wrap items-end gap-x-4 gap-y-2 mb-1 mt-2 text-[9px]">
            <div class="flex items-end gap-1">
              <span class="font-semibold whitespace-nowrap pb-0.5">รหัสใบสั่งช่อม</span>
              <div class="border-b border-gray-400 min-w-[110px] min-h-[16px] px-1 pb-0.5">{{ modalOrder.fixed_bill_number || '-' }}</div>
            </div>
            <div class="flex items-end gap-1">
              <span class="whitespace-nowrap pb-0.5">หมายเลขเครื่องจักร</span>
              <div class="border-b border-gray-400 min-w-[110px] min-h-[16px] px-1 pb-0.5">{{ modalOrder.note?.split('\nสาเหตุทดแทน: ')[0]?.replace('หมายเลขเครื่องจักร: ', '') || '-' }}</div>
            </div>
            <div class="flex items-end gap-1">
              <span class="whitespace-nowrap pb-0.5">มิเตอร์ (ชม.)</span>
              <div class="border-b border-gray-400 min-w-[80px] min-h-[16px] px-1 pb-0.5">{{ modalOrder.metter_hour || '-' }}</div>
            </div>
            <div class="flex items-end gap-1">
              <span class="whitespace-nowrap pb-0.5">มิเตอร์ (กม.)</span>
              <div class="border-b border-gray-400 min-w-[80px] min-h-[16px] px-1 pb-0.5">{{ modalOrder.metter_kilometter || '-' }}</div>
            </div>
          </div>

          <!-- Purpose -->
          <div class="border border-gray-300 rounded p-1 mb-1">
            <div class="font-semibold mb-1 text-[9px]">จุดประสงค์การเบิก</div>
            <div class="grid grid-cols-5 gap-x-2 gap-y-1 text-[9px]">
              <div v-for="col in 5" :key="col" class="space-y-1">
                <div v-for="opt in purposeOptions.slice((col-1)*3, col*3)" :key="opt.key" class="flex items-end gap-1.5 min-h-[18px]">
                  <input type="checkbox" disabled :checked="isPurposeChecked(opt.label)" class="w-2.5 h-2.5 mb-1" />
                  <span class="whitespace-nowrap pb-0.5">{{ opt.label }}</span>
                  <div v-if="opt.key === 'pm' || opt.key.startsWith('other')" class="border-b border-gray-300 flex-1 min-w-[20px] px-1 pb-0.5 h-[16px]">
                    {{ getPurposeDetail(opt.label) }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Items Table -->
          <table class="w-full border-collapse text-[9px] mb-0.5">
            <thead>
              <tr>
                <th rowspan="2" class="border border-gray-400 py-1 px-1 text-center text-[10px] w-5 bg-gray-300 align-middle">ลำดับ</th>
                <th rowspan="2" class="border border-gray-400 py-1 px-1 text-center text-[10px] w-21 bg-gray-300 align-middle">รหัสสินค้า</th>
                <th rowspan="2" class="border border-gray-400 py-1 px-1 text-center text-[10px] w-29 bg-gray-300 align-middle">รายการ</th>
                <th colspan="2" class="border border-gray-400 py-1 px-1 text-center text-[10px] w-26 bg-gray-300 align-middle">จำนวน (เบิก)</th>
                <th colspan="2" class="border border-gray-400 py-1 px-1 text-center text-[10px] w-28 bg-gray-300 align-middle">จำนวนเงิน</th>
                <th rowspan="2" class="border border-gray-400 py-1 px-1 text-center text-[10px] w-10 bg-gray-300 align-middle">คืน</th>  
                <th rowspan="2" class="border border-gray-400 py-1 px-1 text-center text-[10px] w-10 bg-gray-300 align-middle">ไม่คืน</th>
                <th rowspan="2" class="border border-gray-400 py-1 px-1 text-center text-[10px] w-20 bg-gray-300 align-middle">หมายเหตุ</th>
              </tr>
              <tr>
                <th class="border border-gray-400 px-1 py-1 text-center text-[9px] w-12 bg-gray-300 align-middle">จำนวน</th>
                <th class="border border-gray-400 px-1 py-1 text-center text-[9px] w-12 bg-gray-300 align-middle">หน่วย</th>
                <th class="border border-gray-400 px-1 py-1 text-center text-[9px] w-12 bg-gray-300 align-middle">ราคา / หน่วย</th>
                <th class="border border-gray-400 px-1 py-1 text-center text-[9px] w-12 bg-gray-300 align-middle">รวม</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, idx) in modalItems" :key="idx">
                <td class="border border-gray-400 px-1 py-1.5 text-center align-middle">{{ idx + 1 }}</td>
                <td class="border border-gray-400 px-1 py-1.5 text-center font-mono align-middle">{{ item.item_code }}</td>
                <td class="border border-gray-400 px-1 py-1.5 text-center align-middle">{{ item.item_name }}</td>
                <td class="border border-gray-400 px-1 py-1.5 text-center font-bold align-middle">{{ item.amount }}</td>
                <td class="border border-gray-400 px-1 py-1.5 text-center align-middle">{{ item.unit }}</td>
                <td class="border border-gray-400 px-1 py-1.5 text-center text-gray-400 align-middle">-</td>
                <td class="border border-gray-400 px-1 py-1.5 text-center text-gray-400 align-middle">-</td>
                <td class="border border-gray-400 px-1 py-1.5 text-center align-middle"><input type="checkbox" disabled :checked="item.is_return === true" class="w-3 h-3" /></td>
                <td class="border border-gray-400 px-1 py-1.5 text-center align-middle"><input type="checkbox" disabled :checked="item.is_return === false" class="w-3 h-3" /></td>
                <td class="border border-gray-400 px-1 py-1.5 text-center align-middle">{{ item.remark || '-' }}</td>
              </tr>
              <tr v-for="n in Math.max(0, 4 - modalItems.length)" :key="'empty-' + n">
                <td v-for="i in 10" :key="i" class="border border-gray-400 px-1 py-2">&nbsp;</td>
              </tr>
              <tr class="bg-gray-50 font-semibold">
                <td colspan="3" class="border border-gray-400 px-1 py-1 text-center bg-gray-200 align-middle">รวม</td>
                <td class="border border-gray-400 px-1 py-1 text-center text-blue-700 font-bold align-middle">{{ totalAmount() }}</td>
                <td colspan="6" class="border border-gray-400 bg-gray-200"></td>
              </tr>
            </tbody>
          </table>

          <!-- Signatories -->
          <table class="w-full border-collapse text-[9px] mb-1">
            <thead>
              <tr>
                <th v-for="h in ['ผู้เบิก','ผู้อนุมัติ','ผู้รับ','ผู้ตรวจสอบ/หน.พัสดุ']" :key="h" class="border border-gray-400 px-1 py-1.5 text-center bg-gray-300 w-1/4 align-middle">{{ h }}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="border border-gray-400 px-1 py-0 text-[11px]" style="height:45px;">{{ modalOrder.requester?.fullname || '' }}</td>
                <td class="border border-gray-400 px-1 py-0 text-[11px]" style="height:45px;">{{ modalOrder.status === 'completed' ? (modalOrder.approver?.fullname || '') : '' }}</td> 
                <td class="border border-gray-400 px-1 py-0 text-[11px]" style="height:45px;">{{ modalOrder.receive_by || '' }}</td> 
                <td class="border border-gray-400 px-1 py-0 text-[11px]" style="height:45px;">{{ modalOrder.inspector_by || '' }}</td> 
              </tr>
              <tr>
                <td class="border border-gray-400 px-1 py-1.5 text-center font-semibold align-middle min-h-[25px]">({{ modalOrder.requester?.fullname || '-' }})</td>
                <td class="border border-gray-400 px-1 py-1.5 text-center align-middle min-h-[25px]">({{ modalOrder.status === 'completed' ? (modalOrder.approver?.fullname || '....................................') : '....................................' }})</td>
                <td class="border border-gray-400 px-1 py-1.5 text-center align-middle min-h-[25px]">({{ modalOrder.receive_by || '....................................' }})</td>
                <td class="border border-gray-400 px-1 py-1.5 text-center align-middle min-h-[25px]">({{ modalOrder.inspector_by || '....................................' }})</td>
              </tr>
              <tr>
                <td class="border border-gray-400 px-1 py-1.5 text-[8px] text-gray-500 text-center align-middle">วันที่ {{ formatDate(modalOrder.created_at) }}</td>
                <td v-for="i in 3" :key="i" class="border border-gray-400 px-1 py-1.5 text-[8px] text-gray-500 text-center align-middle">วันที่ ....................................</td>
              </tr>
            </tbody>
          </table>

            <!-- Footer / Barcode -->
            <div class="flex items-end justify-between mt-2">
              <div class="text-[10px] font-bold border-b border-black pb-0.5 inline-block">หมายเหตุ : กรณีเบิกใช้งานช่อมต้องแนบใบแจ้งช่อมทุกครั้ง</div>
              <div class="flex flex-col items-center">
                <svg id="barcode-detail"></svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  </UserAppToolbar>
</template>

<style scoped>
a { text-decoration: none; }

/* ── Hero ── */
.hero-section { height: 250px; }
@media (min-width: 768px) { .hero-section { height: 300px; } }
.hero-img { width: 100%; height: 100%; object-fit: cover; opacity: 0.75; display: block; }
.hero-overlay {
  position: absolute; inset: 0;
  background: linear-gradient(160deg, rgba(15,23,42,0.35) 0%, rgba(15,23,42,0.55) 100%);
}
.hero-btn {
  padding: 10px 28px; border-radius: 9999px;
  background: rgba(255,255,255,0.92); backdrop-filter: blur(8px);
  font-size: 14px; font-weight: 600; color: #0F172A;
  letter-spacing: 0.01em; transition: background 0.2s, transform 0.15s;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
}
.hero-btn:hover { background: #ffffff; transform: translateY(-1px); }

/* ── Section Title ── */
.section-title { font-size: 17px; font-weight: 700; margin-bottom: 14px; color: var(--color-text-primary); letter-spacing: -0.01em; }

/* ── Tabs ── */
.tab-switch-wrap { margin-bottom: 18px; }
.tab-switch { position: relative; display: inline-flex; align-items: center; background: var(--color-bg-base); border: 1px solid var(--color-border); border-radius: 9999px; padding: 3px; gap: 0; }
.tab-switch-track { position: absolute; top: 3px; bottom: 3px; border-radius: 9999px; background: var(--color-bg-card); box-shadow: 0 1px 4px rgba(0,0,0,0.10); border: 1px solid var(--color-border); transition: left 0.25s cubic-bezier(0.4,0,0.2,1), width 0.25s cubic-bezier(0.4,0,0.2,1); pointer-events: none; z-index: 0; }
.tab-switch-btn { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 6px; padding: 7px 18px; border-radius: 9999px; border: none; background: transparent; font-size: 13px; font-weight: 500; color: var(--color-text-muted); cursor: pointer; transition: color 0.2s; white-space: nowrap; }
.tab-switch-btn.tab-active { color: var(--color-text-primary); font-weight: 600; }
.tab-switch-track.track-left { left: 3px; width: calc(50% - 3px); }
.tab-switch-track.track-right { left: calc(50%); width: calc(50% - 3px); }
.tab-dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.dot-warning { background: #F59E0B; }
.dot-success { background: #16A34A; }

/* ── Cards ── */
.req-card { border-radius: 16px; border: 1px solid var(--color-border); background: var(--color-bg-card); overflow: hidden; transition: box-shadow 0.22s, transform 0.22s; cursor: pointer; }
.req-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.10); transform: translateY(-3px); }
.dark .req-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.35); }
.card-img-wrap { position: relative; height: 148px; overflow: hidden; }
@media (min-width: 768px) { .card-img-wrap { height: 164px; } }
.card-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s ease, filter 0.4s ease; filter: blur(1.5px); }
.req-card:hover .card-img { transform: scale(1.03); filter: grayscale(50%) blur(1.3px); }
.card-img-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 40%, rgba(15,23,42,0.45) 100%); pointer-events: none; }
.card-date-badge { position: absolute; top: 10px; right: 10px; font-size: 11px; font-weight: 500; padding: 3px 10px; border-radius: 9999px; background: rgba(255,255,255,0.88); color: #334155; backdrop-filter: blur(4px); letter-spacing: 0.01em; }
.card-body { padding: 14px 16px 16px; }
.card-body-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; gap: 8px; }
.card-title { font-size: 14px; font-weight: 700; color: var(--color-text-primary); letter-spacing: -0.01em; }
.card-status-badge { font-size: 10px; font-weight: 600; padding: 2px 9px; border-radius: 9999px; background: #FEF3C7; color: #92400E; white-space: nowrap; letter-spacing: 0.02em; }
.dark .card-status-badge { background: #451A03; color: #FCD34D; }
.card-status-badge.status-completed { background: #DCFCE7; color: #166534; }
.dark .card-status-badge.status-completed { background: #064E3B; color: #4ADE80; }
.card-subtitle { font-size: 13px; color: #2563EB; font-weight: 500; margin-bottom: 10px; }
.card-footer { display: flex; align-items: center; gap: 5px; padding-top: 10px; border-top: 1px solid var(--color-border); }
.card-expire-label { font-size: 11px; color: var(--color-text-muted); }

/* ── Info Field ── */
.info-field {
  width: 100%;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1.5px solid #BFDBFE;
  background: #EFF6FF;
  font-size: 13px;
  font-weight: 500;
  color: #1E40AF;
  min-height: 34px;
}
.dark .info-field {
  border-color: #1E3A5F;
  background: #0F2744;
  color: #93C5FD;
}

/* ── Modal Transition ── */
.modal-fade-enter-active,
.modal-fade-leave-active { transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; transform: scale(0.97); }

/* ── Dropdown Transition ── */
.dropdown-pop-enter-active,
.dropdown-pop-leave-active { transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1); }
.dropdown-pop-enter-from,
.dropdown-pop-leave-to { opacity: 0; transform: translateY(8px) scale(0.96); }

.paper-scroll-wrap {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  overflow-x: auto;
  overflow-x: overlay;
  overflow-y: visible;
  padding-bottom: 0;
  scrollbar-gutter: auto;
  -webkit-overflow-scrolling: touch;
}

.paper-sheet {
  width: 960px;
  min-width: 960px;
  margin: 0 auto;
}

@media (max-width: 960px) {
  .paper-scroll-wrap {
    border-radius: 12px;
  }

  .paper-sheet {
    margin: 0;
  }
}

/* ── Print styles ── */
@media print {
  @page {
    size: A4;
    margin: 15mm; /* กำหนดขอบกระดาษพื้นฐาน 15mm */
  }

  .print\:hidden {
    display: none !important;
  }

  /* ปรับแต่งพื้นที่พิมพ์ */
  #print-area-detail {
    position: static !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
    display: block !important;
    box-shadow: none !important;
  }

  .paper-scroll-wrap {
    overflow: visible !important;
    max-width: none !important;
    padding-bottom: 0 !important;
  }

  .paper-sheet {
    width: auto !important;
    min-width: 0 !important;
    margin: 0 !important;
    box-shadow: none !important;
    border-radius: 0 !important;
  }

  /* บังคับให้พื้นหลังตารางแสดงผล */
  .bg-gray-300 {
    background-color: #d1d5db !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  
  .bg-gray-200 {
    background-color: #e5e7eb !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>

<style>
/* Global print styles */
@media print {
  header.sticky, 
  nav, 
  .print\:hidden {
    display: none !important;
  }

  body {
    visibility: hidden;
    background: white !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  #app, #app > main {
    visibility: visible !important;
    display: block !important;
  }

  #print-area-detail,
  #print-area-detail * {
    visibility: visible !important;
  }

  /* จัดการความกว้างของตารางให้เต็มหน้ากระดาษ */
  table {
    width: 100% !important;
    border-collapse: collapse !important;
  }

  /* บังคับให้ Checkbox แสดงผล (เนื่องจากเบราว์เซอร์บางตัวซ่อน disabled checkbox ตอนปริ้น) */
  input[type="checkbox"]:disabled,
  input[type="radio"]:disabled {
    -webkit-appearance: none;
    appearance: none;
    border: 1px solid #333 !important;
    width: 12px;
    height: 12px;
    position: relative;
    background: white !important;
    visibility: visible !important;
  }

  input[type="checkbox"]:checked:disabled::after,
  input[type="radio"]:checked:disabled::after {
    content: '✔';
    position: absolute;
    top: -2px;
    left: 1px;
    font-size: 10px;
    color: black;
  }
}
</style>
