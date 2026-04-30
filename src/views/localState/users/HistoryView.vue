<script setup>
import UserAppToolbar from '@/components/layout/UserAppToolbar.vue'
import { ref, onMounted, nextTick, computed } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

// Company Logos
import logoThaiDrill from '@/assets/thaidrill_company.png'
import logoThaiDrillLao from '@/assets/thaidrillLao_company.png'
import logoTDL_MVDC from '@/assets/tdl&mvdc_company.jpg'
import logoSunny from '@/assets/sunnycompany.png'

const auth = useAuthStore()
const loading = ref(false)
const history = ref([])
const prOrders = ref([])
const poOrders = ref([])
const searchText = ref('')
const mainTab = ref('withdraw') // 'withdraw' or 'pr'
const prTab = ref('pending') // 'pending' or 'received'
const expandedPrs = ref(new Set()) // Track expanded PR numbers

function togglePrExpansion(prNumber) {
  if (expandedPrs.value.has(prNumber)) {
    expandedPrs.value.delete(prNumber)
  } else {
    expandedPrs.value.add(prNumber)
  }
}

// ─── View Control ─────────────────────────────────────────────────────────────
const isModalOpen   = ref(false)
const modalLoading  = ref(false)
const modalOrder    = ref(null)   // full order row
const modalItems    = ref([])     // order_req_items joined with items
const showPrintMenu = ref(false)

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date   = new Date(dateStr)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

const fetchHistory = async () => {
  if (!auth.user?.id) return
  loading.value = true
  try {
    const [
      { data: ordersData, error: ordersError },
      { data: prData, error: prError },
      { data: poData, error: poError }
    ] = await Promise.all([
      supabase
        .from('order_req')
        .select('*, items(item_name)')
        .eq('created_by', auth.user.id)
        .eq('status', 'completed')
        .order('updated_at', { ascending: false }),
      supabase
        .from('purchasing_req')
        .select('*, urgents(option_name)')
        .eq('created_by', auth.user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('purchasing_order')
        .select(`
          *,
          purchasing_req!inner(pr_number, details, amount_req, unit, created_by, urgents(option_name))
        `)
        .eq('purchasing_req.created_by', auth.user.id)
        .order('created_at', { ascending: false })
    ])
    
    if (ordersError) throw ordersError
    if (prError) throw prError
    if (poError) throw poError

    // Grouping by request_id (Withdraw)
    const groupedWithdraw = (ordersData || []).reduce((acc, item) => {
      const rid = item.request_id || `single-${item.id}`
      if (!acc[rid]) {
        acc[rid] = {
          ...item,
          items_count: 0,
          item_names: []
        }
      }
      acc[rid].items_count += 1
      if (item.items?.item_name) acc[rid].item_names.push(item.items.item_name)
      return acc
    }, {})

    history.value = Object.values(groupedWithdraw).map(group => ({
      ...group,
      title: group.items_count > 1 ? `ใบเบิกพัสดุ #${group.request_id} (${group.items_count} รายการ)` : (group.items?.item_name || 'ใบเบิกพัสดุ'),
      subtitle: group.items_count > 1 
        ? group.item_names.slice(0, 2).join(', ') + (group.item_names.length > 2 ? '...' : '')
        : `จำนวน ${group.amount} ${group.unit}`
    }))

    prOrders.value = prData || []
    poOrders.value = poData || []
  } catch (err) {
    console.error('Error fetching history:', err.message)
  } finally {
    loading.value = false
  }
}

const prHistoryGroups = computed(() => {
  if (prTab.value === 'pending') {
    const grouped = prOrders.value.reduce((acc, item) => {
      // กรองเฉพาะที่ยังไม่ได้รับงาน (pending)
      if (item.job_status === 'รับงานแล้ว') return acc

      if (!acc[item.pr_number]) {
        acc[item.pr_number] = {
          pr_number: item.pr_number,
          urgent: item.urgents?.option_name,
          created_at: item.created_at,
          status: item.job_status || 'รอการยืนยัน',
          items: []
        }
      }
      acc[item.pr_number].items.push(item)
      return acc
    }, {})
    return Object.values(grouped).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  } else {
    const grouped = poOrders.value.reduce((acc, item) => {
      const pr_no = item.purchasing_req?.pr_number
      if (!acc[pr_no]) {
        acc[pr_no] = {
          pr_number: pr_no,
          lao_po_number: item.lao_po_number,
          status_purchase: item.status_purchase,
          urgent: item.purchasing_req?.urgents?.option_name,
          created_at: item.created_at,
          status: item.status_purchase || 'รับงานแล้ว',
          items: []
        }
      }
      acc[pr_no].items.push(item)
      return acc
    }, {})
    return Object.values(grouped).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }
})

const filteredHistoryGroups = computed(() => {
  const key = searchText.value.trim().toLowerCase()
  if (mainTab.value === 'withdraw') {
    if (!key) return history.value
    return history.value.filter((item) => {
      const title = String(item.title || '').toLowerCase()
      const subtitle = String(item.subtitle || '').toLowerCase()
      const requestId = String(item.request_id || '').toLowerCase()
      const mrNumber = String(item.mr_number || '').toLowerCase()
      return title.includes(key) || subtitle.includes(key) || requestId.includes(key) || mrNumber.includes(key)
    })
  } else {
    if (!key) return prHistoryGroups.value
    return prHistoryGroups.value.filter((group) => {
      const prNumber = String(group.pr_number || '').toLowerCase()
      const poNumber = String(group.lao_po_number || '').toLowerCase()
      const itemText = group.items
        .map((item) => {
          if (prTab.value === 'pending') {
            return `${item.details} ${item.unit}`
          } else {
            return `${item.purchasing_req?.details} ${item.purchasing_req?.unit} ${item.lao_po_number}`
          }
        })
        .join(' ')
        .toLowerCase()
      return prNumber.includes(key) || poNumber.includes(key) || itemText.includes(key)
    })
  }
})

// ─── Open Modal ───────────────────────────────────────────────────────────────
async function openModal(item) {
  isModalOpen.value  = true
  modalLoading.value = true
  showPrintMenu.value = false

  try {
    let query = supabase
      .from('order_req')
      .select(`
        *,
        requester:system_users!created_by(fullname, position, department, emp_code),
        approver:system_users!updated_by(fullname),
        items(item_name, unit, item_code)
      `)

    if (item.request_id) {
      query = query.eq('request_id', item.request_id)
    } else {
      query = query.eq('id', item.id)
    }

    const { data: orders, error: orderError } = await query.order('created_at', { ascending: true })

    if (orderError) throw orderError
    if (!orders || orders.length === 0) throw new Error('Order not found')

    modalOrder.value = orders[0] 

    modalItems.value = orders.map(order => ({
      id:        order.id,
      item_code: order.items?.item_code || '-',
      item_name: order.items?.item_name || '-',
      amount:    order.amount,
      unit:      order.unit || order.items?.unit || '',
      is_return: order.is_return,
      remark:    order.remark || ''
    }))

    await nextTick()
    if (modalOrder.value.request_id) {
      try {
        const barcodeLib = await loadJsBarcode()
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
          }
        }, 200)
      } catch (err) {
        console.error('Failed to load JsBarcode:', err)
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
  const parts = modalOrder.value.withdraw_purpose.split(label + ': ')
  if (parts.length > 1) return parts[1].split(',')[0]
  return ''
}

const totalAmount = () => modalItems.value.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)

onMounted(fetchHistory)
</script>

<template>
  <UserAppToolbar>
    <!-- ── LIST VIEW ── -->
    <div v-if="!isModalOpen">
      <section class="max-w-screen-lg mx-auto px-4 md:px-6 mt-6 pb-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 class="text-2xl font-bold text-gray-800 dark:text-gray-100">ประวัติการใช้งาน</h2>
          
          <!-- Main Tabs -->
          <div class="flex p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-fit">
            <button 
              @click="mainTab = 'withdraw'"
              class="px-4 py-2 rounded-lg text-sm font-bold transition-all"
              :class="mainTab === 'withdraw' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
            >
              ประวัติการเบิก
            </button>
            <button 
              @click="mainTab = 'pr'"
              class="px-4 py-2 rounded-lg text-sm font-bold transition-all"
              :class="mainTab === 'pr' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'"
            >
              รายการขอซื้อ
            </button>
          </div>
        </div>

        <!-- Sub Tabs for PR -->
        <div v-if="mainTab === 'pr'" class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
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

        <!-- Search Box -->
        <div class="relative mb-6">
          <i class="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
          <input 
            v-model="searchText"
            type="text" 
            :placeholder="mainTab === 'withdraw' ? 'ค้นหา Request ID, MR, ชื่อสินค้า...' : (prTab === 'pending' ? 'ค้นหาเลขที่ PR หรือรายละเอียดสินค้า...' : 'ค้นหาเลขที่ PR, PO หรือรายละเอียดสินค้า...')"
            class="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
          >
        </div>
        
        <div v-if="loading" class="flex justify-center items-center py-20">
          <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>

        <div v-else-if="filteredHistoryGroups.length === 0" class="flex flex-col items-center justify-center py-20 text-gray-400">
          <i class="fa-solid fa-clock-rotate-left text-[48px] mb-4 opacity-20"></i>
          <span>{{ mainTab === 'withdraw' ? 'ไม่มีประวัติการเบิก' : 'ไม่มีรายการขอซื้อ' }}</span>
        </div>

        <div v-else class="grid grid-cols-1 gap-4">
          <template v-if="mainTab === 'withdraw'">
            <div v-for="item in filteredHistoryGroups" :key="item.id" 
                 @click="openModal(item)"
                 class="bg-white dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm flex items-center justify-between cursor-pointer hover:border-blue-500 transition-colors">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                  <i class="fa-solid fa-box text-blue-600 dark:text-blue-400"></i>
                </div>
                <div>
                  <div class="text-[14px] font-bold text-gray-800 dark:text-gray-100">{{ item.title }}</div>
                  <div class="text-[12px] text-gray-500">{{ item.subtitle }}</div>
                </div>
              </div>
              <div class="text-right">
                <div class="text-[12px] text-gray-400">เสร็จสิ้นเมื่อ</div>
                <div class="text-[13px] font-medium text-gray-700 dark:text-gray-200">{{ formatDate(item.updated_at) }}</div>
              </div>
            </div>
          </template>

          <template v-else>
            <!-- PR History List -->
            <div v-for="group in filteredHistoryGroups" :key="group.pr_number" 
                 class="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div @click="togglePrExpansion(group.pr_number)"
                   class="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                    <i class="fa-solid fa-cart-shopping text-orange-600 dark:text-orange-400"></i>
                  </div>
                  <div>
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-[14px] font-bold text-gray-800 dark:text-gray-100">PR: {{ group.pr_number }}</span>
                      <span v-if="group.urgent" class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 uppercase">
                        {{ group.urgent }}
                      </span>
                    </div>
                    <div class="text-[12px] text-gray-500">
                      {{ group.items.length }} รายการ • {{ formatDate(group.created_at) }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-4">
                  <div class="text-right hidden sm:block">
                    <div class="text-[11px] text-gray-400 uppercase font-bold mb-1">Status</div>
                    <div class="text-[12px] font-bold" 
                         :class="prTab === 'pending' ? 'text-orange-500' : 'text-green-500'">
                      {{ group.status }}
                    </div>
                  </div>
                  <i class="fa-solid fa-chevron-down text-gray-400 transition-transform duration-300"
                     :class="{ 'rotate-180': expandedPrs.has(group.pr_number) }"></i>
                </div>
              </div>

              <!-- PR Items List (Accordion Content) -->
              <div v-show="expandedPrs.has(group.pr_number)" class="bg-gray-50/50 dark:bg-slate-950/30 border-t border-gray-100 dark:border-gray-800">
                <div class="p-4 space-y-2">
                  <div v-for="(item, idx) in group.items" :key="idx" 
                       class="flex items-start gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 shadow-sm">
                    <div class="w-7 h-7 rounded-lg bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-[11px] font-bold text-gray-400 shrink-0">
                      {{ idx + 1 }}
                    </div>
                    <div class="flex-grow min-w-0">
                      <div class="flex justify-between items-start gap-4">
                        <div class="min-w-0">
                          <h4 class="font-bold text-gray-800 dark:text-gray-100 text-[13px] mb-0.5 truncate">
                            {{ prTab === 'pending' ? item.details : item.purchasing_req?.details }}
                          </h4>
                          <p v-if="prTab === 'received' && item.lao_po_number" class="text-[11px] text-blue-600 font-bold mb-1">
                            PO: {{ item.lao_po_number }}
                          </p>
                          <p v-if="item.air_code || (prTab === 'received' && item.purchasing_req?.air_code)" class="text-[11px] text-blue-500 font-medium">
                            <i class="fa-solid fa-plane-arrival mr-1"></i>
                            {{ prTab === 'pending' ? item.air_code : item.purchasing_req?.air_code }}
                          </p>
                        </div>
                        <div class="text-[13px] font-bold text-blue-600 whitespace-nowrap">
                          {{ prTab === 'pending' ? item.amount_req : item.purchasing_req?.amount_req }} 
                          {{ prTab === 'pending' ? item.unit : item.purchasing_req?.unit }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
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
        <div class="paper-sheet bg-white text-gray-900 shadow-xl rounded-lg overflow-hidden font-['Niramit',sans-serif] text-[9px]" style="color: #111;">
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
                <td class="border border-gray-400 px-1 py-0 text-[11px]" style="height:45px;">{{ modalOrder.approver?.fullname || '' }}</td> 
                <td class="border border-gray-400 px-1 py-0 text-[11px]" style="height:45px;">{{ modalOrder.receive_by || '' }}</td> 
                <td class="border border-gray-400 px-1 py-0 text-[11px]" style="height:45px;">{{ modalOrder.inspector_by || '' }}</td> 
              </tr>
              <tr>
                <td class="border border-gray-400 px-1 py-1.5 text-center font-semibold align-middle min-h-[25px]">({{ modalOrder.requester?.fullname || '-' }})</td>
                <td class="border border-gray-400 px-1 py-1.5 text-center align-middle min-h-[25px]">({{ modalOrder.approver?.fullname || '....................................' }})</td>
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

.section-title {
  color: var(--color-text-primary);
}

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
    margin: 15mm;
  }

  .print\:hidden {
    display: none !important;
  }

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
}
</style>
