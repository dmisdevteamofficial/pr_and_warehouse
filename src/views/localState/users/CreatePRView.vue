<script setup>
import UserAppToolbar from '@/components/layout/UserAppToolbar.vue'
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()

const loading = ref(false)
const saving = ref(false)

// Select options
const urgents = ref([])
const purchaseTeams = ref([])

const form = ref({
  pr_number: '',
  urgent_id: '',
  purchase_team_id: '',
  air_code: '',
  items: []
})

function addItem() {
  // Collapse previous item if it has data
  if (form.value.items.length > 0) {
    const lastItem = form.value.items[form.value.items.length - 1]
    if (lastItem.details && lastItem.amount_req && lastItem.unit) {
      lastItem.isExpanded = false
    }
  }

  form.value.items.push({
    details: '',
    amount_req: 1,
    unit: '',
    isExpanded: true
  })
}

function toggleItem(index) {
  form.value.items[index].isExpanded = !form.value.items[index].isExpanded
}

function removeItem(index) {
  if (form.value.items.length > 1) {
    form.value.items.splice(index, 1)
  }
}

async function fetchOptions() {
  console.log('Fetching options started...')
  loading.value = true
  try {
    // Attempt to fetch from Supabase (MWM Project)
    const [
      { data: urgentsData, error: urgentsError },
      { data: teamsData, error: teamsError }
    ] = await Promise.all([
      supabase.from('urgents').select('*').order('created_at', { ascending: true }),
      supabase.from('purchasing_team').select('*').order('team_name', { ascending: true })
    ])
    
    console.log('Urgents result:', { data: urgentsData, error: urgentsError })
    console.log('Teams result:', { data: teamsData, error: teamsError })

    if (urgentsError) console.error('Urgents fetch error:', urgentsError)
    if (teamsError) console.error('Teams fetch error:', teamsError)

    // Fallback mock data if tables are empty or error occurs
    if (urgentsData && urgentsData.length > 0) {
      urgents.value = urgentsData
      console.log('Using real urgents data')
    } else {
      console.log('Using mock urgents data')
      urgents.value = [
        { id: '00000000-0000-0000-0000-000000000001', option_name: 'ทั่วไป (Mock)' },
        { id: '00000000-0000-0000-0000-000000000002', option_name: 'ด่วน (Mock)' },
        { id: '00000000-0000-0000-0000-000000000003', option_name: 'ด่วนที่สุด (Mock)' }
      ]
    }
    
    if (teamsData && teamsData.length > 0) {
      purchaseTeams.value = teamsData
      console.log('Using real teams data')
    } else {
      console.log('Using mock teams data')
      purchaseTeams.value = [
        { id: '10000000-0000-0000-0000-000000000001', team_name: 'ทีม 1 (Mock)' },
        { id: '10000000-0000-0000-0000-000000000002', team_name: 'ทีม 2 (Mock)' },
        { id: '10000000-0000-0000-0000-000000000003', team_name: 'ทีม 3 (Mock)' }
      ]
    }
    
    // Set defaults
    if (urgents.value.length > 0) form.value.urgent_id = urgents.value[0].id
    if (purchaseTeams.value.length > 0) form.value.purchase_team_id = purchaseTeams.value[0].id
    
  } catch (err) {
    console.error('Error fetching options:', err)
  } finally {
    loading.value = false
  }
}

async function handleSubmit() {
  if (saving.value) return
  
  // Basic validation
  if (!form.value.pr_number || !form.value.urgent_id || !form.value.purchase_team_id) {
    ui.showToast('กรุณากรอกข้อมูลส่วนหัวให้ครบถ้วน', 'error')
    return
  }

  // Items validation
  const hasInvalidItems = form.value.items.some(item => !item.details || !item.amount_req || !item.unit)
  if (hasInvalidItems) {
    ui.showToast('กรุณากรอกรายละเอียดรายการสินค้าให้ครบถ้วนทุกรายการ', 'error')
    return
  }

  saving.value = true
  try {
    const payload = form.value.items.map(item => ({
      pr_number: form.value.pr_number,
      urgent_id: form.value.urgent_id,
      purchase_team_id: form.value.purchase_team_id,
      details: item.details,
      amount_req: Number(item.amount_req),
      unit: item.unit,
      air_code: form.value.air_code || null,
      created_by: auth.user?.id,
      updated_by: auth.user?.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }))

    const { error } = await supabase.from('purchasing_req').insert(payload)

    if (error) throw error

    ui.showToast('บันทึกคำขอ PR สำเร็จ', 'success')
    router.push('/u/history')
  } catch (err) {
    console.error('Error saving PR:', err)
    ui.showToast('บันทึกไม่สำเร็จ: ' + err.message, 'error')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  fetchOptions()
  addItem() // Add first item automatically
})
</script>

<template>
  <UserAppToolbar>
    <div class="max-w-3xl mx-auto px-4 py-8 pb-24">
      <!-- Header Section -->
      <div class="mb-8">
        <h1 class="text-2xl font-bold mb-2 flex items-center gap-3" style="color: var(--color-text-primary)">
          <span class="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center">
            <i class="fa-solid fa-file-invoice text-blue-600"></i>
          </span>
          สร้างคำขอสั่งซื้อ (PR)
        </h1>
        <p class="text-[14px]" style="color: var(--color-text-muted)">
          กรอกรายละเอียดข้อมูลพัสดุที่ต้องการสั่งซื้อให้ครบถ้วน
        </p>
      </div>

      <!-- Form Card -->
      <div class="rounded-2xl shadow-sm border p-6 md:p-8 transition-all" 
           style="background: var(--color-bg-card); border-color: var(--color-border)">
        
        <div v-if="loading" class="py-20 flex flex-col items-center justify-center gap-4">
          <i class="fa-solid fa-circle-notch animate-spin text-3xl text-blue-600"></i>
          <p style="color: var(--color-text-muted)">กำลังโหลดข้อมูล...</p>
        </div>

        <form v-else @submit.prevent="handleSubmit" class="space-y-6">
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- PR Number -->
            <div class="space-y-2">
              <label class="text-[14px] font-medium block" style="color: var(--color-text-secondary)">
                เลขที่ PR <span class="text-red-500">*</span>
              </label>
              <div class="relative group">
                <i class="fa-solid fa-hashtag absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                <input v-model="form.pr_number" type="text" required
                  placeholder="เช่น PR26041102"
                  class="w-full pl-11 pr-4 py-3 rounded-xl border transition-all outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                  style="background: var(--color-bg-base); border-color: var(--color-border); color: var(--color-text-primary)" />
              </div>
            </div>

            <!-- Urgent Level -->
            <div class="space-y-2">
              <label class="text-[14px] font-medium block" style="color: var(--color-text-secondary)">
                ระดับความเร่งด่วน <span class="text-red-500">*</span>
              </label>
              <div class="relative group">
                <i class="fa-solid fa-bolt absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                <select v-model="form.urgent_id" required
                  class="w-full pl-11 pr-10 py-3 rounded-xl border appearance-none transition-all outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                  style="background: var(--color-bg-base); border-color: var(--color-border); color: var(--color-text-primary)">
                  <option v-for="u in urgents" :key="u.id" :value="u.id">{{ u.option_name }}</option>
                </select>
                <i class="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[12px]"></i>
              </div>
            </div>
          </div>

          <!-- Purchase Team -->
          <div class="space-y-2">
            <label class="text-[14px] font-medium block" style="color: var(--color-text-secondary)">
              ทีมจัดซื้อ <span class="text-red-500">*</span>
            </label>
            <div class="relative group">
              <i class="fa-solid fa-users-gear absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
              <select v-model="form.purchase_team_id" required
                class="w-full pl-11 pr-10 py-3 rounded-xl border appearance-none transition-all outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                style="background: var(--color-bg-base); border-color: var(--color-border); color: var(--color-text-primary)">
                <option v-for="t in purchaseTeams" :key="t.id" :value="t.id">{{ t.team_name }}</option>
              </select>
              <i class="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[12px]"></i>
            </div>
          </div>

          <!-- Items List -->
          <div class="space-y-4">
            <div v-for="(item, index) in form.items" :key="index" 
                 class="relative rounded-xl border-2 border-dashed transition-all"
                 :style="{ 
                   borderColor: item.isExpanded ? 'var(--color-border)' : 'var(--color-border)', 
                   background: 'var(--color-bg-base)',
                   padding: item.isExpanded ? '1rem' : '0.75rem'
                 }">
              
              <!-- Item Header -->
              <div class="flex items-center justify-between cursor-pointer group/header" @click="toggleItem(index)">
                <div class="flex items-center gap-3">
                  <span class="text-[12px] font-bold px-2 py-0.5 rounded-md bg-blue-600/10 text-blue-600">
                    #{{ index + 1 }}
                  </span>
                  <div v-if="!item.isExpanded" class="flex items-center gap-2 overflow-hidden">
                    <span class="text-[13px] font-medium truncate max-w-[150px] md:max-w-[300px]" style="color: var(--color-text-primary)">
                      {{ item.details || '(ยังไม่ได้ระบุรายละเอียด)' }}
                    </span>
                    <span v-if="item.amount_req" class="text-[12px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
                      {{ item.amount_req }} {{ item.unit }}
                    </span>
                  </div>
                  <span v-else class="text-[13px] font-bold" style="color: var(--color-text-primary)">
                    รายละเอียดรายการสินค้า
                  </span>
                </div>

                <div class="flex items-center gap-2">
                  <button v-if="form.items.length > 1" @click.stop="removeItem(index)" type="button"
                          class="text-red-400 hover:text-red-500 p-1.5 transition-colors" title="ลบรายการ">
                    <i class="fa-solid fa-trash-can text-[14px]"></i>
                  </button>
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors group-hover/header:bg-gray-100 dark:group-hover/header:bg-gray-800">
                    <i class="fa-solid transition-transform duration-300" 
                       :class="[item.isExpanded ? 'fa-chevron-up' : 'fa-chevron-down', 'text-[12px] text-gray-400']"></i>
                  </div>
                </div>
              </div>

              <!-- Item Body (Accordion Content) -->
              <div v-if="item.isExpanded" class="mt-4 space-y-4 pt-4 border-t border-dashed" style="border-color: var(--color-border)">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <!-- Details -->
                  <div class="md:col-span-2 space-y-1.5">
                    <label class="text-[13px] font-medium block" style="color: var(--color-text-secondary)">
                      รายละเอียดสินค้า <span class="text-red-500">*</span>
                    </label>
                    <div class="relative group">
                      <i class="fa-solid fa-align-left absolute left-4 top-3.5 text-gray-400 group-focus-within:text-blue-500 transition-colors text-[14px]"></i>
                      <textarea v-model="item.details" rows="2" required
                        placeholder="กรอกรายละเอียดพัสดุที่ต้องการสั่งซื้อ..."
                        class="w-full pl-11 pr-4 py-2.5 rounded-xl border transition-all outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 resize-none text-[14px]"
                        style="background: var(--color-bg-card); border-color: var(--color-border); color: var(--color-text-primary)"></textarea>
                    </div>
                  </div>

                  <!-- Amount -->
                  <div class="space-y-1.5">
                    <label class="text-[13px] font-medium block" style="color: var(--color-text-secondary)">
                      จำนวนที่ขอ <span class="text-red-500">*</span>
                    </label>
                    <div class="relative group">
                      <i class="fa-solid fa-cart-flatbed absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors text-[14px]"></i>
                      <input v-model.number="item.amount_req" type="number" min="1" required
                        class="w-full pl-11 pr-4 py-2.5 rounded-xl border transition-all outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-[14px]"
                        style="background: var(--color-bg-card); border-color: var(--color-border); color: var(--color-text-primary)" />
                    </div>
                  </div>

                  <!-- Unit -->
                  <div class="space-y-1.5">
                    <label class="text-[13px] font-medium block" style="color: var(--color-text-secondary)">
                      หน่วย <span class="text-red-500">*</span>
                    </label>
                    <div class="relative group">
                      <i class="fa-solid fa-scale-unbalanced absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors text-[14px]"></i>
                      <input v-model="item.unit" type="text" required
                        placeholder="เช่น ชิ้น, กล่อง, เมตร"
                        class="w-full pl-11 pr-4 py-2.5 rounded-xl border transition-all outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 text-[14px]"
                        style="background: var(--color-bg-card); border-color: var(--color-border); color: var(--color-text-primary)" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Add Item Button -->
            <button @click="addItem" type="button"
                    class="w-full py-3 rounded-xl border-2 border-dashed border-blue-500/30 text-blue-600 font-bold hover:bg-blue-600/5 transition-all flex items-center justify-center gap-2 text-[14px]">
              <i class="fa-solid fa-plus"></i> เพิ่มรายการสินค้าใหม่
            </button>
          </div>

          <!-- Air Code -->
          <div class="space-y-2">
            <label class="text-[14px] font-medium block" style="color: var(--color-text-secondary)">
              รหัสแอร์ (Air Code)
            </label>
            <div class="relative group">
              <i class="fa-solid fa-plane-arrival absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
              <input v-model="form.air_code" type="text"
                placeholder="กรอกรหัสแอร์ (ถ้ามี)"
                class="w-full pl-11 pr-4 py-3 rounded-xl border transition-all outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500"
                style="background: var(--color-bg-base); border-color: var(--color-border); color: var(--color-text-primary)" />
            </div>
          </div>

          <!-- Submit Button -->
          <div class="pt-4">
            <button type="submit" :disabled="saving"
              class="w-full py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-[16px] shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none flex items-center justify-center gap-2">
              <i v-if="saving" class="fa-solid fa-circle-notch animate-spin"></i>
              <i v-else class="fa-solid fa-paper-plane"></i>
              {{ saving ? 'กำลังบันทึก...' : 'ส่งคำขอสั่งซื้อ' }}
            </button>
          </div>

        </form>
      </div>
    </div>
  </UserAppToolbar>
</template>

<style scoped>
/* Chrome, Safari, Edge, Opera */
input::-webkit-outer-spin-button,
input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* Firefox */
input[type=number] {
  -moz-appearance: textfield;
}

select {
  background-image: none;
}
</style>
