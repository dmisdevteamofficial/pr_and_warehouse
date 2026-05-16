import { createRouter, createWebHashHistory } from 'vue-router'
import LoginView from '@/views/LoginView.vue'
import DashboardView from '@/views/DashboardView.vue'
import ItemListView from '@/views/ItemListView.vue'
import InventoryImportsView from '@/views/InventoryImportsView.vue'
import InventoryhistoryLisView from '@/views/InventoryhistoryLisView.vue'
import OrderListView from '@/views/OrderListView.vue'
import TransactionsListView from '@/views/TransactionsListView.vue'
import HistoryListView from '@/views/historyListView.vue'
import EmployeeLisView from '@/views/EmployeeLisView.vue'
import SystemusersLisView from '@/views/SystemusersLisView.vue'
import UserLogsLisView from '@/views/userLogsLisView.vue'
import ImportMoreListView from '@/views/ImportMoreListView.vue'
import SummaryDetailView from '@/views/summary_detailView.vue'
import InspectionView from '@/views/inspectionView.vue'
import HomepageView from '@/views/localState/users/HomepageView.vue'
import CreateOrderView from '@/views/localState/users/CreateOrderView.vue'
import CreatePRView from '@/views/localState/users/CreatePRView.vue'
import HistoryView from '@/views/localState/users/HistoryView.vue'
import WithdrawFormView from '@/views/localState/users/WithdrawFormView.vue'
import PrAdminView from '@/views/PrSystem/AdminView.vue'
import AdminCookieView from '@/views/PrSystem/AdminCookieView.vue'
// PrSystem Views
import SystemadminLisView from '@/views/PrSystem/Views/SystemadminLisView.vue'
import AdminLogsView from '@/views/PrSystem/Views/adminLogsView.vue'

const routes = [
  { path: '/', component: LoginView, meta: { requiresAuth: false } },
  { path: '/dashboard', component: DashboardView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/reports', component: SummaryDetailView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/item-list', component: ItemListView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/inventory-imports', component: InventoryImportsView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/inventory-history', component: InventoryhistoryLisView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/order-list', component: OrderListView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/withdraw', component: TransactionsListView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/history', component: HistoryListView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/employees', component: EmployeeLisView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/system-users', component: SystemusersLisView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/logs', component: UserLogsLisView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/imports', component: ImportMoreListView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/return', component: InspectionView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/return-history', component: InspectionView, meta: { requiresAuth: true, isAdmin: true } },
  { path: '/u/home', component: HomepageView, meta: { requiresAuth: true } },
  { path: '/u/create', component: CreateOrderView, meta: { requiresAuth: true } },
  { path: '/u/create-pr', component: CreatePRView, meta: { requiresAuth: true } },
  { path: '/u/history', component: HistoryView, meta: { requiresAuth: true } },
  { path: '/u/withdraw', component: WithdrawFormView, meta: { requiresAuth: true } },
  { path: '/pr/admin', component: PrAdminView, meta: { requiresAuth: true, isSuperAdmin: true } },
  // PrSystem Routes
  { path: '/pr/system-admins', component: SystemadminLisView, meta: { requiresAuth: true, isSuperAdmin: true, isAdmin: true } },
  { path: '/pr/logs-usage', component: AdminLogsView, meta: { requiresAuth: true, isSuperAdmin: true, isAdmin: true } },
  { path: '/admin/cookie', component: AdminCookieView, meta: { requiresAuth: true, isAdmin: true } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to) => {
  const sessionStr = localStorage.getItem('mwm_session')
  const user = sessionStr ? JSON.parse(sessionStr) : null

  // 1. ถ้าหน้าต้องการ Auth แต่ไม่มี Session
  if (to.meta.requiresAuth && !user) {
    return '/'
  }

  // 2. ถ้าเข้าหน้า Admin (isAdmin: true) แต่ไม่ใช่ admin_store/super_admin
  if (to.meta.isAdmin && !['admin_store', 'super_admin'].includes(user?.role)) {
    return '/u/home'
  }

  // 2.1 ถ้าเข้าหน้า Super Admin แต่ไม่ใช่ super_admin
  if (to.meta.isSuperAdmin && user?.role !== 'super_admin') {
    return user?.role === 'admin_store' ? '/dashboard' : '/u/home'
  }

  // 3. ถ้าเข้าหน้า Login ทั้งที่มี Session แล้ว
  if (to.path === '/' && user) {
    if (user.role === 'super_admin') return '/pr/admin'
    if (user.role === 'admin_store') return '/dashboard'
    return '/u/home'
  }
})

export default router
