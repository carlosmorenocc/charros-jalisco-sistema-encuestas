import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ManualContactDrawer from './ManualContactDrawer'
import MembershipEditor from './MembershipEditor'
import { authClient } from './auth/authClient'
import { createApiClient, resolveApiBaseUrl } from './lib/apiClient'
import { loadDemoModule } from './data/demoLoader'
import {
  canDeleteContacts,
  canCreateContacts,
  canEditContacts,
  canExportData,
  canRestoreContacts,
  hasPermission,
  PERMISSIONS,
} from './lib/permissions'
import { commercialStageCode, currentSeasonMembership, fromApiContact, fromApiInteraction, fromApiMembership, fromApiSale, fromApiTask, fromApiUser, membershipStatusForContact, subscriberStatusCode, toApiContactPayload, toApiMembershipPayload } from './lib/dataAdapters'
import { downloadExecutiveDashboardPdf } from './lib/dashboardPdf'
import { buildManualRegistrationPayload } from './lib/manualEntry'
import { normalizeMembershipPricingCatalog, normalizeMembershipPricingQuote } from './lib/membershipPricing'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Reporte Dirección', icon: 'chart' },
  { id: 'portfolio', label: 'Cartera y Renovaciones', icon: 'people' },
  { id: 'prospects', label: 'Prospectos', icon: 'target' },
  { id: 'followup', label: 'Seguimiento', icon: 'check' },
  { id: 'sales', label: 'Ventas', icon: 'wallet' },
]

const MORE_ITEMS = [
  { id: 'campaigns', label: 'Campañas y envíos', icon: 'send' },
  { id: 'rewards', label: 'Recompensas', icon: 'star' },
  { id: 'catalogs', label: 'Catálogos', icon: 'layers' },
]

const currency = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})
const integer = new Intl.NumberFormat('es-MX')

let configuredApiBaseUrl = ''
let apiConfigurationError = ''
try {
  configuredApiBaseUrl = resolveApiBaseUrl()
} catch (error) {
  apiConfigurationError = error.message
}

const startupConfigurationError = authClient.configurationError || apiConfigurationError

function localInputDate(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return offsetDate.toISOString().slice(0, 10)
}

function localDateTimeInput(date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return offsetDate.toISOString().slice(0, 16)
}

function localDayBounds(date = new Date()) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return { from: start.toISOString(), to: end.toISOString() }
}

function localDateBoundary(value, endOfDay = false) {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0)
  return date.toISOString()
}

function periodBounds(period, fromDate, toDate) {
  if (period === 'all' && !fromDate && !toDate) return {}
  if (fromDate || toDate || period === 'custom') {
    return {
      from: localDateBoundary(fromDate),
      to: localDateBoundary(toDate, true),
    }
  }
  const now = new Date()
  if (period === 'today') return localDayBounds(now)
  const start = new Date(now)
  if (period === 'week') start.setDate(now.getDate() - 6)
  else start.setDate(1)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  return { from: start.toISOString(), to: end.toISOString() }
}

function selectedPeriodLabel(period, fromDate, toDate, now = new Date()) {
  const date = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  const month = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' })
  if (period === 'today') return date.format(now)
  if (period === 'month' && !fromDate && !toDate) return month.format(now)
  if (period === 'all' && !fromDate && !toDate) return 'todo el tiempo'
  const bounds = periodBounds(period, fromDate, toDate)
  const start = bounds.from ? new Date(bounds.from) : null
  const end = bounds.to ? new Date(bounds.to) : null
  if (start && end) return `${date.format(start)} al ${date.format(end)}`
  if (start) return `desde ${date.format(start)}`
  if (end) return `hasta ${date.format(end)}`
  return 'seleccionado'
}

export function salesForDashboard(sales, { executiveName, from, to } = {}) {
  const fromTime = from ? new Date(from).getTime() : null
  const toTime = to ? new Date(to).getTime() : null
  return sales.filter((sale) => {
    if (executiveName && sale.owner !== executiveName) return false
    const occurredAt = new Date(sale.soldAt || sale.occurredAt || 0).getTime()
    if ((fromTime !== null || toTime !== null) && !Number.isFinite(occurredAt)) return false
    if (fromTime !== null && occurredAt < fromTime) return false
    if (toTime !== null && occurredAt > toTime) return false
    return !['Cancelada', 'Reembolsada'].includes(sale.commercialStatus)
  })
}

export function buildSaleItems({ kind, zone, quantity, unitPrice, promotion2x1, discountCode, discountName, pricingMode, chargedUnits, bonusUnits }) {
  const product = kind === 'renewal' ? 'RENOVACIÓN DE ABONO' : 'ABONO NUEVO'
  const discountSuffix = discountCode ? ` · DESCUENTO ${discountName || discountCode} [${discountCode}]` : ''
  if (pricingMode === 'two_for_one') {
    return [
      { product: `${product}${discountSuffix} · PROMOCIÓN 2X1 (CON CARGO)`, zone, quantity: chargedUnits, unitPrice },
      ...(bonusUnits ? [{ product: `${product}${discountSuffix} · PROMOCIÓN 2X1 (BONIFICADO)`, zone, quantity: bonusUnits, unitPrice: 0 }] : []),
    ]
  }
  if (!promotion2x1) return [{ product: `${product}${discountSuffix}`, zone: zone || undefined, quantity, unitPrice }]
  const fallbackChargedUnits = Math.ceil(quantity / 2)
  const fallbackBonusUnits = quantity - fallbackChargedUnits
  return [
    { product: `${product} · PROMOCIÓN 2X1 (CON CARGO)`, zone, quantity: fallbackChargedUnits, unitPrice },
    ...(fallbackBonusUnits ? [{ product: `${product} · PROMOCIÓN 2X1 (BONIFICADO)`, zone, quantity: fallbackBonusUnits, unitPrice: 0 }] : []),
  ]
}

function Icon({ name, size = 18, strokeWidth = 1.8 }) {
  const paths = {
    chart: <><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M3 19h17"/></>,
    people: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    check: <><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
    wallet: <><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6"/><path d="M16 13h2"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    star: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2l-5-4.9 6.9-1Z"/>,
    upload: <><path d="M12 16V3"/><path d="m7 8 5-5 5 5"/><path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4"/></>,
    layers: <><path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 12 10 5 10-5"/><path d="m2 17 10 5 10-5"/></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    down: <path d="m6 9 6 6 6-6"/>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    filter: <path d="M4 4h16l-6 7v6l-4 2v-8Z"/>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    close: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1Z"/>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    note: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7L20 14"/><path d="M20 7v4h-4"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-6"/></>,
  }
  return (
    <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name] || paths.note}
    </svg>
  )
}

function StatusPill({ children, tone }) {
  const inferred = tone || getTone(children)
  return <span className={`status-pill status-pill--${inferred}`}><span className="status-dot" />{children}</span>
}

function getTone(value) {
  const text = String(value).toLowerCase()
  if (/(pagado|abonado actual|respondió|completada|finalizada|sí)/.test(text)) return 'success'
  if (/(vencida|eliminado|no interesado|incorrecto|no consta)/.test(text)) return 'danger'
  if (/(interesado|apartado|parcial|seguimiento|en curso)/.test(text)) return 'gold'
  if (/(por renovar|contactado|pendiente)/.test(text)) return 'blue'
  return 'neutral'
}

function PrimaryButton({ children, icon = 'plus', className = '', ...props }) {
  return <button className={`button button--primary ${className}`} {...props}><Icon name={icon} size={17} />{children}</button>
}

function SecondaryButton({ children, icon, className = '', ...props }) {
  return <button className={`button button--secondary ${className}`} {...props}>{icon && <Icon name={icon} size={17} />}{children}</button>
}

function EmptyState({ title, body }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="search" size={22} /></div><strong>{title}</strong><p>{body}</p></div>
}

export async function revokeSessionSafely(api, clearSession) {
  try {
    await api.logout()
    clearSession('signed-out')
    return true
  } catch (error) {
    if (error?.status === 401) {
      clearSession('unauthorized')
      return true
    }
    throw error
  }
}

function normalizeContactPatchValue(field, value) {
  if (value === undefined || value === null) return value ?? null
  const normalized = String(value).trim()
  if (!normalized) return null
  if (field === 'email') return normalized.toLocaleLowerCase('es-MX')
  if (field === 'phone') {
    let digits = normalized.replace(/\D+/g, '')
    if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2)
    if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3)
    return digits
  }
  return normalized
}

export function contactMatchesPatch(contact, patch) {
  const entries = Object.entries(patch || {})
  return Boolean(contact) && entries.length > 0 && entries.every(([field, expected]) => (
    Object.prototype.hasOwnProperty.call(contact, field)
      && normalizeContactPatchValue(field, contact[field]) === normalizeContactPatchValue(field, expected)
  ))
}

export async function verifyPersistedContactPatch(api, id, patch) {
  try {
    const response = await api.contact(id)
    return contactMatchesPatch(response.data, patch) ? response.data : null
  } catch {
    return null
  }
}

export async function updateContactWithVerification(api, id, patch, rowVersion) {
  let originalError
  try {
    const response = await api.updateContact(id, patch, rowVersion)
    if (!response?.data || typeof response.data !== 'object') throw new Error('El servidor no devolvió el contacto actualizado.')
    return fromApiContact(response.data)
  } catch (error) {
    originalError = error
  }
  const verified = await verifyPersistedContactPatch(api, id, patch)
  if (verified) {
    try { return fromApiContact(verified) } catch { /* La confirmación también debe ser hidratable. */ }
  }
  throw originalError
}

async function loadAllSales(api, filters = {}) {
  const pageSize = 100
  const first = await api.sales({ ...filters, page: 1, pageSize })
  const items = [...(Array.isArray(first.data) ? first.data : first.data?.items || [])]
  const totalPages = Math.max(1, Number(first.meta?.totalPages || 1))
  for (let page = 2; page <= totalPages; page += 1) {
    const response = await api.sales({ ...filters, page, pageSize })
    items.push(...(Array.isArray(response.data) ? response.data : response.data?.items || []))
  }
  return { data: items, meta: { ...first.meta, total: items.length } }
}

async function loadAllTasks(api, filters = {}) {
  const pageSize = 100
  const first = await api.tasks({ ...filters, page: 1, pageSize })
  const items = [...(Array.isArray(first.data) ? first.data : first.data?.items || [])]
  const totalPages = Math.max(1, Number(first.meta?.totalPages || 1))
  for (let page = 2; page <= totalPages; page += 1) {
    const response = await api.tasks({ ...filters, page, pageSize })
    items.push(...(Array.isArray(response.data) ? response.data : response.data?.items || []))
  }
  return { data: items, meta: { ...first.meta, total: items.length } }
}

function App() {
  const [activePage, setActivePage] = useState(() => window.location.hash.replace('#/', '') || 'dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [user, setUser] = useState(null)
  const [contacts, setContacts] = useState([])
  const [contactRevision, setContactRevision] = useState(0)
  const [dashboardRevision, setDashboardRevision] = useState(0)
  const [unassignedContacts, setUnassignedContacts] = useState([])
  const [unassignedTotal, setUnassignedTotal] = useState(0)
  const [tasks, setTasks] = useState([])
  const [followupCounts, setFollowupCounts] = useState(null)
  const [interactions, setInteractions] = useState([])
  const [sales, setSales] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [dashboardSummary, setDashboardSummary] = useState(null)
  const [availableExecutives, setAvailableExecutives] = useState([])
  const [configurationFixtures, setConfigurationFixtures] = useState({})
  const [membershipPricingCatalog, setMembershipPricingCatalog] = useState(null)
  const [bootState, setBootState] = useState(startupConfigurationError ? 'error' : 'loading')
  const [bootError, setBootError] = useState(startupConfigurationError)
  const [loginNotice, setLoginNotice] = useState('')
  const [sessionDeadline, setSessionDeadline] = useState('')
  const [authRevision, setAuthRevision] = useState(0)
  const [drawer, setDrawer] = useState(null)
  const [saleClosure, setSaleClosure] = useState(null)
  const [toast, setToast] = useState('')
  const latestContactRequest = useRef(0)
  const latestDashboardRequest = useRef(0)
  const latestDrawerRequest = useRef(0)

  const clearPrivateState = useCallback((reason = 'signed-out') => {
    latestContactRequest.current += 1
    latestDashboardRequest.current += 1
    latestDrawerRequest.current += 1
    setUser(null)
    setContacts([])
    setContactRevision(0)
    setDashboardRevision(0)
    setUnassignedContacts([])
    setUnassignedTotal(0)
    setTasks([])
    setFollowupCounts(null)
    setInteractions([])
    setSales([])
    setCampaigns([])
    setDashboardSummary(null)
    setAvailableExecutives([])
    setConfigurationFixtures({})
    setMembershipPricingCatalog(null)
    setDrawer(null)
    setSaleClosure(null)
    setToast('')
    setUserOpen(false)
    setMoreOpen(false)
    setMobileOpen(false)
    setSessionDeadline('')
    setActivePage('dashboard')
    setBootError('')
    setLoginNotice(reason === 'idle'
      ? 'La sesión se cerró por inactividad. Ingresa nuevamente.'
      : reason === 'unauthorized'
        ? 'La sesión expiró o dejó de ser válida. Ingresa nuevamente.'
        : '')
    setBootState('signed-out')
  }, [])

  const api = useMemo(() => configuredApiBaseUrl ? createApiClient({
    baseUrl: configuredApiBaseUrl,
    getCsrfToken: authClient.getCsrfToken,
    onUnauthorized: () => authClient.clearSession('unauthorized'),
    onActivity: () => authClient.touchSession(),
  }) : null, [])

  useEffect(() => authClient.subscribe(({ reason, session }) => {
    setSessionDeadline(session?.idleExpiresAt || '')
    if (!session) clearPrivateState(reason)
  }), [clearPrivateState])

  useEffect(() => {
    if (authClient.isDemo || bootState !== 'ready' || !sessionDeadline) return undefined
    const remaining = new Date(sessionDeadline).getTime() - Date.now()
    if (remaining <= 0) {
      authClient.clearSession('idle')
      return undefined
    }
    const timeout = window.setTimeout(() => authClient.clearSession('idle'), remaining)
    return () => window.clearTimeout(timeout)
  }, [bootState, sessionDeadline])

  useEffect(() => {
    if (!authClient.isDemo || startupConfigurationError) return
    let active = true
    async function loadDemo() {
      try {
        if (!loadDemoModule) throw new Error('Los datos demo no están disponibles en producción.')
        const fixtures = await loadDemoModule()
        if (!active) return
        setUser(fixtures.demoUser)
        setContacts(fixtures.demoContacts)
        const demoUnassigned = fixtures.demoContacts.filter((contact) => contact.executive === 'Sin asignar')
        setUnassignedContacts(demoUnassigned)
        setUnassignedTotal(demoUnassigned.length)
        setTasks(fixtures.demoTasks)
        setInteractions(fixtures.demoInteractions)
        setSales(fixtures.demoSales)
        setCampaigns(fixtures.demoCampaigns)
        setConfigurationFixtures(fixtures.demoConfigurations)
        setMembershipPricingCatalog(normalizeMembershipPricingCatalog(fixtures.demoMembershipPricingCatalog))
        setDashboardSummary(fixtures.demoDashboard)
        setAvailableExecutives(fixtures.demoExecutiveOptions)
        setBootState('ready')
      } catch (error) {
        if (!active) return
        setBootError(error.message)
        setBootState('error')
      }
    }
    loadDemo()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (authClient.isDemo || !api || startupConfigurationError) return
    let active = true
    async function boot() {
      try {
        const { data: session } = await api.session()
        if (!active) return
        authClient.setSession(session)
        const currentUser = fromApiUser(session.user)
        const mayUseExecutiveDirectory = hasPermission(currentUser, PERMISSIONS.CONTACT_ASSIGN)
          || hasPermission(currentUser, PERMISSIONS.DASHBOARD_READ)
        const executiveRequest = mayUseExecutiveDirectory
          ? api.executives({ active: true }).catch(() => ({ data: [] }))
          : Promise.resolve({ data: [] })
        const today = localDayBounds()
        const now = new Date().toISOString()
        const [summaryResponse, allOpenResponse, todayOpenResponse, todayCompletedResponse, overdueResponse, salesResponse, executiveResponse, unassignedResponse, interactionResponse, pricingCatalogResponse] = await Promise.all([
          api.dashboard({ season: 'LMP-2026-27', ...periodBounds('month') }),
          loadAllTasks(api, { taskState: 'open', sort: 'dueAt', order: 'asc' }),
          api.tasks({ ...today, taskState: 'open', page: 1, pageSize: 100 }),
          api.tasks({ ...today, taskState: 'completed', page: 1, pageSize: 100 }),
          api.tasks({ taskState: 'open', to: now, sort: 'dueAt', order: 'desc', page: 1, pageSize: 100 }),
          loadAllSales(api, { season: 'LMP-2026-27' }),
          executiveRequest,
          api.contacts({ assignment: 'unassigned', page: 1, pageSize: 100 }),
          api.allInteractions({ page: 1, pageSize: 50 }),
          api.membershipPricingCatalog().catch(() => ({ data: null })),
        ])
        if (!active) return
        const { data: summaryData } = summaryResponse
        const allOpenData = allOpenResponse.data
        const todayOpenData = Array.isArray(todayOpenResponse.data) ? todayOpenResponse.data : todayOpenResponse.data?.items || []
        const todayCompletedData = Array.isArray(todayCompletedResponse.data) ? todayCompletedResponse.data : todayCompletedResponse.data?.items || []
        const overdueTaskData = Array.isArray(overdueResponse.data) ? overdueResponse.data : overdueResponse.data?.items || []
        const salesData = salesResponse.data
        const executiveData = executiveResponse.data
        setUser(currentUser)
        setDashboardSummary(summaryData)
        setMembershipPricingCatalog(normalizeMembershipPricingCatalog(pricingCatalogResponse))
        const combinedTasks = [...allOpenData, ...todayCompletedData, ...overdueTaskData]
        setTasks([...new Map(combinedTasks.map((item) => [item.id, item])).values()].map(fromApiTask))
        setFollowupCounts({
          scheduled: Number(todayOpenResponse.meta?.total || 0) + Number(todayCompletedResponse.meta?.total || 0),
          pending: Number(todayOpenResponse.meta?.total || 0),
          completed: Number(todayCompletedResponse.meta?.total || 0),
          overdue: Number(overdueResponse.meta?.total || 0),
        })
        setSales((Array.isArray(salesData) ? salesData : salesData?.items || []).map(fromApiSale))
        setAvailableExecutives((Array.isArray(executiveData) ? executiveData : executiveData?.items || []).map((item) => ({ id: item.id, displayName: item.displayName || item.name })))
        const unassignedData = Array.isArray(unassignedResponse.data) ? unassignedResponse.data : unassignedResponse.data?.items || []
        setUnassignedContacts(unassignedData.map(fromApiContact))
        setUnassignedTotal(Number(unassignedResponse.meta?.total || 0))
        const interactionData = Array.isArray(interactionResponse.data) ? interactionResponse.data : interactionResponse.data?.items || []
        setInteractions(interactionData.map(fromApiInteraction))
        setLoginNotice('')
        setBootState('ready')
      } catch (error) {
        if (!active) return
        if (error.status === 403) {
          setBootError('Tu sesión es válida, pero no cuenta con permisos para abrir este módulo.')
          setBootState('error')
          return
        }
        if (error.status === 401) {
          setBootState('signed-out')
          return
        }
        setBootError(error.message || 'No fue posible iniciar el CRM.')
        setBootState('error')
      }
    }
    boot()
    return () => { active = false }
  }, [api, authRevision])

  useEffect(() => {
    const onHashChange = () => setActivePage(window.location.hash.replace('#/', '') || 'dashboard')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(''), 3500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  function navigate(id) {
    window.location.hash = `/${id}`
    setActivePage(id)
    setMobileOpen(false)
    setMoreOpen(false)
  }

  async function login(credentials) {
    if (!api) throw new Error('El cliente del API no está configurado.')
    const { data: session } = await api.login(credentials)
    authClient.setSession(session)
    setLoginNotice('')
    setBootError('')
    setBootState('loading')
    setAuthRevision((current) => current + 1)
  }

  async function logout() {
    if (authClient.isDemo || !api || !authClient.getSession()) return
    try {
      await revokeSessionSafely(api, (reason) => authClient.clearSession(reason))
    } catch {
      setUserOpen(false)
      setToast('No fue posible cerrar la sesión. Tu acceso continúa activo; inténtalo nuevamente.')
    }
  }

  async function authorizeDashboardPdf(filters) {
    if (authClient.isDemo) return
    await api.recordDashboardPdfRequest(filters)
  }

  async function saveContact(payload) {
    try {
      const fullPayload = toApiContactPayload(payload)
      let apiPayload = fullPayload
      if (payload.id) {
        const formToApi = {
          firstName: 'firstName', lastName: 'lastName', email: 'email', phone: 'phone',
          municipality: 'municipality', stage: 'commercialStage', preferredChannel: 'preferredChannel',
          note: 'summaryNotes', type: 'subscriberStatus', executiveId: 'executiveId', consent: 'consentStatus',
        }
        const allowedFields = new Set(['firstName', 'lastName', 'email', 'phone', 'municipality', 'commercialStage', 'preferredChannel', 'summaryNotes'])
        if (hasPermission(user, PERMISSIONS.MEMBERSHIP_WRITE)) allowedFields.add('subscriberStatus')
        if (hasPermission(user, PERMISSIONS.CONTACT_ASSIGN)) allowedFields.add('executiveId')
        if (hasPermission(user, PERMISSIONS.CONTACT_WRITE_ALL)) allowedFields.add('consentStatus')
        apiPayload = Object.fromEntries(
          (payload.changedFields || [])
            .map((field) => formToApi[field])
            .filter((field) => field && allowedFields.has(field))
            .map((field) => [field, fullPayload[field]]),
        )
        if (!Object.keys(apiPayload).length) {
          setDrawer(null)
          setToast('No había cambios por guardar.')
          return
        }
      } else if (!hasPermission(user, PERMISSIONS.CONTACT_WRITE_ALL)) {
        apiPayload.executiveId = user.id
      }
      if (authClient.isDemo) {
        if (payload.id) setContacts((current) => current.map((item) => item.id === payload.id ? fromApiContact({ ...item, ...apiPayload, displayName: `${payload.firstName} ${payload.lastName}`, seatCount: item.seats, seasonsCount: item.seasons }) : item))
        else {
          const { nextDemoContactId } = await loadDemoModule()
          const id = nextDemoContactId(contacts.length)
          setContacts((current) => [fromApiContact({ ...apiPayload, id, displayName: `${apiPayload.firstName} ${apiPayload.lastName}`, seatCount: 0, seasonsCount: 0, rowVersion: 1 }), ...current])
        }
      } else if (payload.id) {
        const contact = await updateContactWithVerification(api, payload.id, apiPayload, payload.rowVersion)
        setContacts((current) => current.map((item) => item.id === payload.id ? contact : item))
      } else {
        const { data } = await api.createContact(apiPayload)
        setContacts((current) => [fromApiContact(data), ...current])
      }
      setContactRevision((current) => current + 1)
      setDashboardRevision((current) => current + 1)
      setDrawer(null)
      setToast(payload.id ? 'Se guardó satisfactoriamente.' : 'El contacto se creó correctamente.')
      return true
    } catch (error) {
      setToast(error.message || 'No fue posible guardar el contacto.')
      throw error
    }
  }

  async function saveManualRegistration(draft, idempotencyKey) {
    const payload = buildManualRegistrationPayload(draft, {
      actorId: user.id,
      mayAssignContact: hasPermission(user, PERMISSIONS.CONTACT_ASSIGN),
      mayAssignTask: hasPermission(user, PERMISSIONS.TASK_WRITE_ALL),
    })
    let result
    if (authClient.isDemo) {
      const { nextDemoContactId, nextDemoRecordId } = await loadDemoModule()
      const membershipSeats = payload.membership?.seatCount || 0
      const executiveName = availableExecutives.find((item) => item.id === payload.contact.executiveId)?.displayName
        || (payload.contact.executiveId === user.id ? user.name : 'Sin asignar')
      const contact = {
        ...payload.contact,
        id: nextDemoContactId(contacts.length),
        displayName: `${payload.contact.firstName} ${payload.contact.lastName}`,
        summaryNotes: payload.initialObservation.notes,
        consentStatus: payload.consent.status,
        executiveName,
        managedSeatCount: membershipSeats,
        seatCount: ['current_subscriber', 'new_subscriber'].includes(payload.contact.subscriberStatus) ? membershipSeats : 0,
        seasonsCount: payload.membership ? 1 : 0,
        rowVersion: 1,
      }
      const initialInteraction = {
        id: nextDemoRecordId('interaction', interactions.length),
        contactId: contact.id,
        contactName: contact.displayName,
        actorName: user.name,
        occurredAt: new Date().toISOString(),
        channel: 'other',
        outcome: 'manual_registration',
        notes: payload.initialObservation.notes,
        isHumanContact: false,
      }
      const nextTask = payload.nextTask ? {
        ...payload.nextTask,
        id: nextDemoRecordId('task', tasks.length),
        contactId: contact.id,
        contactName: contact.displayName,
        assigneeName: availableExecutives.find((item) => item.id === payload.nextTask.assignedTo)?.displayName || user.name,
        status: 'pending',
        rowVersion: 1,
      } : null
      result = { contact, membership: payload.membership, initialInteraction, nextTask, replayed: false }
      setContacts((current) => [fromApiContact(contact), ...current])
      setInteractions((current) => [fromApiInteraction(initialInteraction), ...current])
      setDashboardSummary((current) => current ? {
        ...current,
        totalContacts: Number(current.totalContacts || 0) + 1,
        renewing: Number(current.renewing || 0) + (contact.subscriberStatus === 'renewing' ? 1 : 0),
        newSubscribers: Number(current.newSubscribers || 0) + (contact.subscriberStatus === 'new_subscriber' ? 1 : 0),
        currentSubscribers: Number(current.currentSubscribers || 0) + (contact.subscriberStatus === 'current_subscriber' ? 1 : 0),
        activeSeats: Number(current.activeSeats || 0) + Number(contact.seatCount || 0),
        unassigned: Number(current.unassigned || 0) + (!contact.executiveId ? 1 : 0),
      } : current)
    } else {
      const response = await api.createManualRegistration(payload, idempotencyKey)
      result = response.data
      if (result?.contact) {
        const normalizedContact = fromApiContact(result.contact)
        setContacts((current) => [normalizedContact, ...current.filter((item) => item.id !== normalizedContact.id)])
      }
      if (result?.initialInteraction) {
        const normalized = fromApiInteraction({
          ...result.initialInteraction,
          contactName: result.initialInteraction.contactName || result.contact?.displayName || `${result.contact?.firstName || ''} ${result.contact?.lastName || ''}`.trim(),
          actorName: result.initialInteraction.actorName || user.name,
        })
        setInteractions((current) => [normalized, ...current.filter((item) => item.id !== normalized.id)])
      }
      try {
        const unassignedResponse = await api.contacts({ assignment: 'unassigned', page: 1, pageSize: 100 })
        const unassignedData = Array.isArray(unassignedResponse.data) ? unassignedResponse.data : unassignedResponse.data?.items || []
        setUnassignedContacts(unassignedData.map(fromApiContact))
        setUnassignedTotal(Number(unassignedResponse.meta?.total || 0))
      } catch {
        // El alta ya fue atómica; las vistas se volverán a consultar por revisión.
      }
    }
    if (result?.nextTask) {
      const normalized = fromApiTask({
        ...result.nextTask,
        contactName: result.nextTask.contactName || result.contact?.displayName || `${result.contact?.firstName || ''} ${result.contact?.lastName || ''}`.trim(),
        assigneeName: result.nextTask.assigneeName || availableExecutives.find((item) => item.id === result.nextTask.assignedTo)?.displayName || user.name,
      })
      const today = localDayBounds()
      const dueTime = new Date(result.nextTask.dueAt).getTime()
      const dueToday = dueTime >= new Date(today.from).getTime() && dueTime <= new Date(today.to).getTime()
      const overdue = dueTime < Date.now()
      setTasks((current) => [normalized, ...current.filter((item) => item.id !== normalized.id)])
      setFollowupCounts((current) => current ? {
        ...current,
        scheduled: current.scheduled + (dueToday ? 1 : 0),
        pending: current.pending + (dueToday ? 1 : 0),
        overdue: current.overdue + (overdue ? 1 : 0),
      } : current)
    }
    setContactRevision((current) => current + 1)
    setDashboardRevision((current) => current + 1)
    const resumeSale = Boolean(drawer?.resumeSale && result?.contact)
    setDrawer(null)
    if (resumeSale) {
      setSaleClosure({ contact: fromApiContact(result.contact), stage: 'Apartado' })
      navigate('sales')
    }
    setToast(resumeSale ? 'Contacto creado. Completa ahora el número de orden y los datos de la venta.' : result?.replayed ? 'El alta ya se había procesado; la cartera se actualizó sin duplicar.' : 'El registro se creó correctamente y la cartera fue actualizada.')
    return result
  }

  async function addSalePayment(sale, payment) {
    if (authClient.isDemo) throw new Error('Los pagos solo pueden modificarse con datos reales.')
    await api.addPayment(sale.id, payment)
    const refreshed = await loadAllSales(api, { season: 'LMP-2026-27' })
    setSales(refreshed.data.map(fromApiSale))
    setDashboardRevision((current) => current + 1)
    setToast('El cobro quedó registrado y los indicadores fueron actualizados.')
  }

  async function createSale(payload) {
    if (authClient.isDemo) throw new Error('Las ventas solo pueden guardarse con datos reales.')
    await api.createSale(payload)
    const refreshed = await loadAllSales(api, { season: 'LMP-2026-27' })
    setSales(refreshed.data.map(fromApiSale))
    setContactRevision((current) => current + 1)
    setDashboardRevision((current) => current + 1)
    setSaleClosure(null)
    setToast('La venta y su cobro inicial quedaron registrados.')
  }

  async function correctSale(sale, payload) {
    if (authClient.isDemo) throw new Error('Las ventas solo pueden corregirse con datos reales.')
    await api.correctSale(sale.id, payload)
    const refreshed = await loadAllSales(api, { season: 'LMP-2026-27' })
    setSales(refreshed.data.map(fromApiSale))
    setContactRevision((current) => current + 1)
    setDashboardRevision((current) => current + 1)
    setToast('La corrección quedó registrada y los indicadores fueron actualizados.')
  }

  async function cancelSale(sale, reason) {
    if (authClient.isDemo) throw new Error('Las ventas solo pueden anularse con datos reales.')
    await api.cancelSale(sale.id, reason)
    const refreshed = await loadAllSales(api, { season: 'LMP-2026-27' })
    setSales(refreshed.data.map(fromApiSale))
    setContactRevision((current) => current + 1)
    setDashboardRevision((current) => current + 1)
    setToast(`La orden ${sale.externalOrderNumber || sale.id} quedó anulada y los indicadores fueron actualizados.`)
  }

  async function openContact(contactOrId, options = {}) {
    const id = typeof contactOrId === 'string' ? contactOrId : contactOrId?.id
    if (!id) return
    const includeDeleted = options.includeDeleted ?? Boolean(typeof contactOrId === 'object' && contactOrId?.deletedAt)
    const requestId = latestDrawerRequest.current + 1
    latestDrawerRequest.current = requestId
    try {
      let detailedContact
      let memberships
      if (authClient.isDemo) {
        detailedContact = typeof contactOrId === 'object' ? contactOrId : contacts.find((item) => item.id === id)
        memberships = detailedContact?.memberships || (detailedContact?.currentMembership ? [detailedContact.currentMembership] : [])
      } else {
        const [contactResponse, membershipsResponse] = await Promise.all([
          api.contact(id, includeDeleted ? { includeDeleted: true } : undefined),
          includeDeleted ? Promise.resolve({ data: [] }) : api.memberships(id),
        ])
        detailedContact = contactResponse.data
        memberships = Array.isArray(membershipsResponse.data) ? membershipsResponse.data : membershipsResponse.data?.items || []
      }
      if (!detailedContact) throw new Error('No encontramos el contacto coincidente.')
      const normalizedMemberships = memberships.map(fromApiMembership).filter(Boolean)
      const membership = currentSeasonMembership(normalizedMemberships)
      const contact = { ...fromApiContact(detailedContact), currentMembership: membership }
      if (requestId !== latestDrawerRequest.current) return
      setContacts((current) => current.map((item) => item.id === id ? { ...item, ...contact } : item))
      setDrawer({ mode: 'edit', contact, memberships: normalizedMemberships, membership, kind: contact.kind, focusMembership: Boolean(options.focusMembership) })
    } catch (error) {
      if (requestId !== latestDrawerRequest.current) return
      setToast(error.message || 'No fue posible abrir el contacto existente.')
    }
  }

  async function openExistingContact(id) {
    await openContact(id)
  }

  async function saveMembership(contact, membership, draft) {
    const membershipStatus = membershipStatusForContact(contact)
    if (!membershipStatus) throw new Error('Los prospectos no pueden recibir abonos hasta cambiar su clasificación.')
    const payload = toApiMembershipPayload(draft, { contact, membership })
    try {
      let refreshedContact
      let refreshedMemberships
      if (authClient.isDemo) {
        const fixtures = await loadDemoModule()
        const pricing = normalizeMembershipPricingQuote(fixtures.quoteDemoMembershipPricing(payload))
        const saved = fromApiMembership({
          ...(membership || {}),
          ...payload,
          ...pricing,
          id: membership?.id || `demo-membership-${contact.id}`,
          contactId: contact.id,
          membershipSection: payload.section,
          membershipStatus,
          seasonCode: payload.seasonCode || membership?.seasonCode || 'LMP-2026-27',
          units: payload.units.map((unit, index) => ({ ...(membership?.units?.[index] || {}), ...unit })),
          rowVersion: Number(membership?.rowVersion || 0) + 1,
        })
        refreshedMemberships = [saved, ...(contact.memberships || []).filter((item) => item.id !== saved.id)]
        refreshedContact = { ...contact, seats: saved.seatCount, currentMembership: saved }
      } else {
        if (membership) await api.updateMembership(membership.id, payload, membership.rowVersion)
        else await api.createMembership(contact.id, payload)
        const [contactResponse, membershipsResponse] = await Promise.all([api.contact(contact.id), api.memberships(contact.id)])
        refreshedMemberships = (Array.isArray(membershipsResponse.data) ? membershipsResponse.data : membershipsResponse.data?.items || []).map(fromApiMembership).filter(Boolean)
        refreshedContact = { ...fromApiContact(contactResponse.data), currentMembership: currentSeasonMembership(refreshedMemberships) }
      }
      const contactCurrentMembership = refreshedContact.currentMembership || currentSeasonMembership(refreshedMemberships)
      const refreshedMembership = membership
        ? refreshedMemberships.find((item) => item.id === membership.id) || membership
        : refreshedMemberships[0] || null
      setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, ...refreshedContact, currentMembership: contactCurrentMembership } : item))
      setDrawer((current) => current?.contact?.id === contact.id ? {
        ...current,
        contact: { ...current.contact, ...refreshedContact, currentMembership: contactCurrentMembership },
        memberships: refreshedMemberships,
        membership: refreshedMembership,
        focusMembership: false,
      } : current)
      setContactRevision((current) => current + 1)
      setDashboardRevision((current) => current + 1)
      setToast(membership ? 'Los abonos y butacas se actualizaron correctamente.' : 'Los abonos y butacas se agregaron correctamente.')
      return refreshedMembership
    } catch (error) {
      setToast(error.message || 'No fue posible guardar los abonos.')
      throw error
    }
  }

  async function createInteraction(contact, payload) {
    try {
      let created
      if (authClient.isDemo) {
        const { nextDemoRecordId } = await loadDemoModule()
        created = { ...payload, id: nextDemoRecordId('interaction', interactions.length), contactName: contact.name, actorName: user.name }
      } else {
        const response = await api.createInteraction(contact.id, payload)
        created = { ...response.data, contactName: response.data?.contactName || contact.name, actorName: response.data?.actorName || user.name }
      }
      setInteractions((current) => [fromApiInteraction(created), ...current])
      setContactRevision((current) => current + 1)
      setDashboardRevision((current) => current + 1)
      setToast('La interacción se registró correctamente.')
      return created
    } catch (error) {
      setToast(error.message || 'No fue posible registrar la interacción.')
      throw error
    }
  }

  async function createTask(contact, payload) {
    try {
      let created
      const assigneeName = availableExecutives.find((item) => item.id === payload.assignedTo)?.displayName || (payload.assignedTo === user.id ? user.name : 'Responsable asignado')
      if (authClient.isDemo) {
        const { nextDemoRecordId } = await loadDemoModule()
        created = { ...payload, id: nextDemoRecordId('task', tasks.length), contactName: contact.name, assigneeName, status: 'pending' }
      } else {
        const response = await api.createTask(contact.id, payload)
        created = { ...response.data, contactName: response.data?.contactName || contact.name, assigneeName: response.data?.assigneeName || assigneeName }
      }
      const normalizedTask = fromApiTask(created)
      const today = localDayBounds()
      const dueTime = new Date(created.dueAt).getTime()
      const dueToday = dueTime >= new Date(today.from).getTime() && dueTime <= new Date(today.to).getTime()
      const overdue = dueTime < Date.now()
      setTasks((current) => [normalizedTask, ...current.filter((item) => item.id !== normalizedTask.id)])
      setFollowupCounts((current) => current ? {
        ...current,
        scheduled: current.scheduled + (dueToday ? 1 : 0),
        pending: current.pending + (dueToday ? 1 : 0),
        overdue: current.overdue + (overdue ? 1 : 0),
      } : current)
      setContactRevision((current) => current + 1)
      setDashboardRevision((current) => current + 1)
      setToast('La tarea se programó correctamente.')
      return created
    } catch (error) {
      setToast(error.message || 'No fue posible programar la tarea.')
      throw error
    }
  }

  async function completeTask(task) {
    try {
      let updated
      if (authClient.isDemo) updated = { ...task, status: 'Completada', rowVersion: Number(task.rowVersion || 0) + 1 }
      else {
        const response = await api.updateTask(task.id, { status: 'completed' }, task.rowVersion)
        updated = fromApiTask({ ...response.data, contactName: response.data?.contactName || task.contact, assigneeName: response.data?.assigneeName || task.owner })
      }
      setTasks((current) => current.map((item) => item.id === task.id ? updated : item))
      const today = localDayBounds()
      const dueTime = new Date(task.dueAt || 0).getTime()
      const dueToday = dueTime >= new Date(today.from).getTime() && dueTime <= new Date(today.to).getTime()
      setFollowupCounts((current) => current ? {
        ...current,
        pending: Math.max(0, current.pending - (dueToday ? 1 : 0)),
        overdue: Math.max(0, current.overdue - (task.status === 'Vencida' ? 1 : 0)),
        completed: current.completed + (dueToday ? 1 : 0),
      } : current)
      setContactRevision((current) => current + 1)
      setDashboardRevision((current) => current + 1)
      setToast('La tarea se marcó como completada.')
      return updated
    } catch (error) {
      setToast(error.message || 'No fue posible completar la tarea.')
      throw error
    }
  }

  async function softDeleteContact(contact, reason) {
    try {
      if (!authClient.isDemo) await api.deleteContact(contact.id, { reason, rowVersion: contact.rowVersion })
      setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, deletedAt: new Date().toISOString() } : item))
      setTasks((current) => current.filter((item) => item.contactId ? item.contactId !== contact.id : item.contact !== contact.name))
      setInteractions((current) => current.filter((item) => item.contactId ? item.contactId !== contact.id : item.contact !== contact.name))
      setUnassignedContacts((current) => current.filter((item) => item.id !== contact.id))
      if (!contact.executiveId) setUnassignedTotal((current) => Math.max(0, current - 1))
      setFollowupCounts(null)
      setContactRevision((current) => current + 1)
      setDashboardRevision((current) => current + 1)
      setDrawer(null)
      setToast('El contacto se eliminó de forma lógica y puede restaurarse por auditoría.')
    } catch (error) {
      setToast(error.message || 'No fue posible eliminar el contacto.')
    }
  }

  async function restoreContact(contact) {
    try {
      if (!authClient.isDemo) {
        const { data } = await api.restoreContact(contact.id, contact.rowVersion)
        setContacts((current) => current.map((item) => item.id === contact.id ? fromApiContact(data) : item))
      } else {
        setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, deletedAt: null } : item))
      }
      setContactRevision((current) => current + 1)
      setDashboardRevision((current) => current + 1)
      setDrawer(null)
      setToast('El contacto se restauró correctamente y volvió a su cartera.')
    } catch (error) {
      setToast(error.message || 'No fue posible restaurar el contacto.')
    }
  }

  async function exportContacts(filters = {}) {
    try {
      if (authClient.isDemo) {
        setToast('Modo demostración: no se descargan datos reales.')
        return
      }
      const { blob, filename } = await api.exportContacts(filters)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setToast('La exportación autorizada se descargó correctamente.')
    } catch (error) {
      setToast(error.message || 'No fue posible exportar los contactos.')
    }
  }

  async function exportSubscriberDetail(filters = {}) {
    if (authClient.isDemo) throw new Error('Modo demostracion: no se descargan datos reales.')
    const { blob, filename } = await api.exportSubscriberDetail(filters)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    return filename
  }


  const loadContacts = useCallback(async (filters) => {
    if (authClient.isDemo) return { page: 1, pageSize: 0, total: 0, totalPages: 1 }
    const requestId = latestContactRequest.current + 1
    latestContactRequest.current = requestId
    const { data, meta } = await api.contacts(filters)
    if (requestId === latestContactRequest.current) {
      const normalized = (Array.isArray(data) ? data : data?.items || []).map(fromApiContact)
      setContacts((current) => normalized.map((contact) => {
        const cached = current.find((item) => item.id === contact.id)?.currentMembership
        return !Object.prototype.hasOwnProperty.call(contact, 'currentMembership') && cached ? { ...contact, currentMembership: cached } : contact
      }))
    }
    return meta
  }, [api])

  const loadDashboard = useCallback(async (filters) => {
    if (authClient.isDemo) return true
    const requestId = latestDashboardRequest.current + 1
    latestDashboardRequest.current = requestId
    const { data } = await api.dashboard(filters)
    if (requestId !== latestDashboardRequest.current) return false
    setDashboardSummary(data)
    return true
  }, [api])

  const quoteMembershipPricing = useCallback(async (params) => {
    if (authClient.isDemo) {
      const fixtures = await loadDemoModule()
      return normalizeMembershipPricingQuote(fixtures.quoteDemoMembershipPricing(params))
    }
    return normalizeMembershipPricingQuote(await api.membershipPricingQuote(params))
  }, [api])

  if (bootState === 'loading') return <LoadingScreen />
  if (bootState === 'signed-out') return <LoginScreen onLogin={login} notice={loginNotice} />
  if (bootState === 'error') return <ErrorScreen message={bootError} onRetry={() => window.location.reload()} />

  const context = {
    contacts,
    contactRevision,
    dashboardRevision,
    unassignedContacts,
    unassignedTotal,
    tasks,
    followupCounts,
    interactions,
    sales,
    dashboardSummary,
    pricingCatalog: membershipPricingCatalog,
    onQuoteMembershipPricing: quoteMembershipPricing,
    isDemo: authClient.isDemo,
    availableExecutives,
    campaigns,
    configurationFixtures,
    user,
    onEdit: openContact,
    onCreate: (kind = 'portfolio', options = {}) => setDrawer({ mode: 'create', kind, ...options }),
    onNotify: setToast,
    onExport: exportContacts,
    onLoadContacts: loadContacts,
    onLoadDashboard: loadDashboard,
    onAuthorizeDashboardPdf: authorizeDashboardPdf,
    onExportSubscriberDetail: exportSubscriberDetail,
    onCreateInteraction: createInteraction,
    onCreateTask: createTask,
    onCompleteTask: completeTask,
    onAddPayment: addSalePayment,
    onCreateSale: createSale,
    onCorrectSale: correctSale,
    onCancelSale: cancelSale,
    saleClosure,
    onClearSaleClosure: () => setSaleClosure(null),
    onRequestSaleClosure: (contact, stage) => {
      setDrawer(null)
      setSaleClosure({ contact, stage })
      navigate('sales')
    },
    onNavigate: navigate,
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar al contenido principal</a>
      <header className="topbar">
        <button className="mobile-menu-button" aria-label="Abrir navegación" aria-expanded={mobileOpen} onClick={() => setMobileOpen((value) => !value)}>
          <Icon name={mobileOpen ? 'close' : 'menu'} size={22} />
        </button>
        <button className="brand" onClick={() => navigate('dashboard')} aria-label="Ir al Reporte Dirección">
          <img src="/charros-logo.jpeg" alt="Charros de Jalisco" />
          <span className="brand-copy"><strong>CRM Abonados</strong><small>LMP 2026–2027</small></span>
        </button>

        <nav className={`main-nav ${mobileOpen ? 'main-nav--open' : ''}`} aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={activePage === item.id ? 'nav-item nav-item--active' : 'nav-item'} aria-current={activePage === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>
              <Icon name={item.icon} size={17} />
              {item.label}
            </button>
          ))}
          <div className="nav-dropdown">
            <button className={MORE_ITEMS.some((item) => item.id === activePage) ? 'nav-item nav-item--active' : 'nav-item'} aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((value) => !value)}>
              <Icon name="layers" size={17} />Más<Icon name="down" size={14} />
            </button>
            {moreOpen && (
              <div className="dropdown-menu dropdown-menu--nav" role="menu">
                {MORE_ITEMS.map((item) => (
                  <button key={item.id} role="menuitem" onClick={() => navigate(item.id)}><span className="dropdown-icon"><Icon name={item.icon} size={17} /></span>{item.label}</button>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="topbar-actions">
          <div className="user-menu-wrap">
            <button className="user-button" aria-expanded={userOpen} onClick={() => setUserOpen((value) => !value)}>
              <span className="avatar">{initials(user?.name || 'Usuario')}</span>
              <span className="user-copy"><strong>{user?.name}</strong><small>{user?.role || 'Usuario'}</small></span>
              <Icon name="down" size={14} />
            </button>
            {userOpen && (
              <div className="dropdown-menu dropdown-menu--user">
                <div className="user-summary"><strong>{user?.name}</strong><span>{user?.email}</span></div>
                <button onClick={logout}><Icon name="logout" size={17} />Cerrar sesión</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex="-1">
        {activePage === 'dashboard' && <DashboardPage {...context} />}
        {activePage === 'portfolio' && <ContactsPage {...context} kind="portfolio" />}
        {activePage === 'prospects' && <ContactsPage {...context} kind="prospect" />}
        {activePage === 'followup' && <FollowupPage {...context} />}
        {activePage === 'sales' && <SalesPage {...context} />}
        {MORE_ITEMS.some((item) => item.id === activePage) && <MorePage {...context} page={activePage} />}
      </main>

      {drawer?.mode === 'create' ? (
        <ManualContactDrawer
          key={`new-${drawer.kind}`}
          kind={drawer.kind}
          user={user}
          executiveOptions={availableExecutives}
          onClose={() => setDrawer(null)}
          onSave={saveManualRegistration}
          onOpenExisting={openExistingContact}
        />
      ) : drawer ? (
        <ContactDrawer
          key={drawer.contact?.id}
          drawer={drawer}
          user={user}
          onClose={() => setDrawer(null)}
          onSave={saveContact}
          onDelete={softDeleteContact}
          onRestore={restoreContact}
          onCreateInteraction={createInteraction}
          onCreateTask={createTask}
          onRequestSaleClosure={context.onRequestSaleClosure}
          onSaveMembership={saveMembership}
          pricingCatalog={membershipPricingCatalog}
          onQuoteMembershipPricing={quoteMembershipPricing}
          executiveOptions={availableExecutives}
        />
      ) : null}
      {toast && <div className="toast" role="status"><span><Icon name="check" size={18} /></span>{toast}</div>}
    </div>
  )
}

export function LoadingScreen() {
  return <main className="gate-screen"><div className="gate-card" role="status" aria-live="polite"><div className="loading-brand"><img src="/charros-logo.jpeg" alt="Charros de Jalisco" /></div><div className="spinner" /><h1>Cargando CRM…</h1><p>Validando la sesión segura y actualizada.</p></div></main>
}

export function LoginScreen({ onLogin, notice }) {
  const [credentials, setCredentials] = useState({ email: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (submitting) return
    if (!credentials.email.trim() || !credentials.password) {
      setError('Captura tu correo corporativo y contraseña.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await onLogin({ email: credentials.email.trim().toLowerCase(), password: credentials.password })
    } catch (loginError) {
      setCredentials((current) => ({ ...current, password: '' }))
      setError(loginError.message || 'No fue posible iniciar sesión.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="gate-screen">
      <div className="gate-card gate-card--login">
        <img className="gate-logo" src="/charros-logo.jpeg" alt="Charros de Jalisco" />
        <span className="eyebrow">Plataforma interna</span>
        <h1>CRM Abonados</h1>
        <p>Ingresa con las credenciales administrativas autorizadas para continuar.</p>
        {notice && <p className="login-notice" role="status">{notice}</p>}
        <form className="login-form" onSubmit={submit} aria-describedby={error ? 'login-error' : undefined}>
          <label className="field"><span>Correo corporativo</span><input type="email" name="email" autoComplete="username" inputMode="email" required autoFocus value={credentials.email} onChange={(event) => setCredentials((current) => ({ ...current, email: event.target.value }))} placeholder="nombre@charrosjalisco.com" /></label>
          <label className="field"><span>Contraseña</span><input type="password" name="password" autoComplete="current-password" required value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} /></label>
          {error && <p id="login-error" className="form-error" role="alert">{error}</p>}
          <PrimaryButton type="submit" icon="shield" disabled={submitting} aria-busy={submitting}>{submitting ? 'Validando…' : 'Iniciar sesión'}</PrimaryButton>
        </form>
        <small>Acceso restringido · La sesión expira por inactividad</small>
      </div>
    </main>
  )
}

function ErrorScreen({ message, onRetry }) {
  return <main className="gate-screen"><div className="gate-card"><div className="gate-error">!</div><h1>No pudimos abrir el CRM</h1><p>{message}</p><SecondaryButton icon="refresh" onClick={onRetry}>Intentar de nuevo</SecondaryButton></div></main>
}

function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <div className="page-header">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

function GlobalFilters({ executiveOptions = [], filters, onChange, disabled = false }) {
  return (
    <div className="global-filters" aria-label="Filtros del reporte">
      <label><span>Temporada</span><select disabled={disabled} value={filters.season} onChange={(event) => onChange({ ...filters, season: event.target.value })}><option value="LMP-2026-27">LMP 2026-2027</option></select></label>
      <label><span>Periodo</span><select disabled={disabled} value={filters.period} onChange={(event) => onChange({ ...filters, period: event.target.value, fromDate: '', toDate: '' })}><option value="today">Hoy</option><option value="week">Semanal</option><option value="month">Mensual</option><option value="all">Todo el tiempo</option>{filters.period === 'custom' && <option value="custom">Rango de fechas</option>}</select></label>
      <label><span>Desde</span><input disabled={disabled} type="date" value={filters.fromDate} max={filters.toDate || undefined} onChange={(event) => onChange({ ...filters, period: 'custom', fromDate: event.target.value })}/></label>
      <label><span>Hasta</span><input disabled={disabled} type="date" value={filters.toDate} min={filters.fromDate || undefined} onChange={(event) => onChange({ ...filters, period: 'custom', toDate: event.target.value })}/></label>
      <label><span>Ejecutivo</span><select disabled={disabled} value={filters.executiveId} onChange={(event) => onChange({ ...filters, executiveId: event.target.value })}><option value="">Todos</option>{executiveOptions.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
      {disabled && <small className="demo-filter-note">Filtros disponibles con el API corporativo.</small>}
    </div>
  )
}

function MetricCard({ label, value, detail, trend, icon, tone = 'blue' }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon metric-icon--${tone}`}><Icon name={icon} size={20} /></div>
      <div className="metric-copy"><span>{label}</span><strong>{value}</strong><small className={trend?.startsWith('+') ? 'positive' : ''}>{trend && <b>{trend}</b>} {detail}</small></div>
    </article>
  )
}

function SegmentedMetricCard({ label, options, selected, onSelect, detail, icon, tone = 'green' }) {
  const active = options.find((option) => option.id === selected) || options[0]
  return (
    <article className="metric-card metric-card--segmented">
      <div className={`metric-icon metric-icon--${tone}`}><Icon name={icon} size={20} /></div>
      <div className="metric-copy"><span>{label}</span><strong>{integer.format(active.value || 0)}</strong><small>{detail}</small></div>
      <div className="metric-segments" role="group" aria-label={`Segmentación de ${label}`}>
        {options.map((option) => <button type="button" key={option.id} className={selected === option.id ? 'active' : ''} aria-pressed={selected === option.id} onClick={() => onSelect(option.id)}>{option.label}</button>)}
      </div>
    </article>
  )
}

function DashboardPage({ contacts, tasks, followupCounts, sales, dashboardSummary, dashboardRevision, isDemo, user, availableExecutives, onNavigate, onNotify, onLoadDashboard, onAuthorizeDashboardPdf, onExportSubscriberDetail }) {
  const [reportFilters, setReportFilters] = useState({ season: 'LMP-2026-27', period: 'month', fromDate: '', toDate: '', executiveId: '' })
  const [loadedFilterKey, setLoadedFilterKey] = useState(isDemo ? 'LMP-2026-27|month|||' : '')
  const [pdfState, setPdfState] = useState({ status: 'idle', message: '' })
  const [subscriberMetricMode, setSubscriberMetricMode] = useState('new')
  const [seatMetricMode, setSeatMetricMode] = useState('new')
  contacts = contacts.filter((contact) => !contact.deletedAt)
  const selectedExecutiveName = availableExecutives.find((item) => item.id === reportFilters.executiveId)?.displayName
  const demoContactsInScope = isDemo && selectedExecutiveName ? contacts.filter((contact) => contact.executive === selectedExecutiveName) : contacts
  const selectedBounds = periodBounds(reportFilters.period, reportFilters.fromDate, reportFilters.toDate)
  const dashboardSalesInScope = salesForDashboard(sales, {
    executiveName: selectedExecutiveName,
    from: selectedBounds.from,
    to: selectedBounds.to,
  })
  const demoNewSubscribers = isDemo ? demoContactsInScope.filter((contact) => {
    if (contact.type !== 'Abonado nuevo' || !contact.renewalDate) return false
    const occurredAt = new Date(contact.renewalDate).getTime()
    if (!Number.isFinite(occurredAt)) return false
    if (selectedBounds.from && occurredAt < new Date(selectedBounds.from).getTime()) return false
    if (selectedBounds.to && occurredAt > new Date(selectedBounds.to).getTime()) return false
    return true
  }) : []
  const demoNewSeats = isDemo ? demoContactsInScope.reduce((total, contact) => total + (contact.newSeatEvents || []).filter((value) => {
    const occurredAt = new Date(value).getTime()
    if (!Number.isFinite(occurredAt)) return false
    if (selectedBounds.from && occurredAt < new Date(selectedBounds.from).getTime()) return false
    if (selectedBounds.to && occurredAt > new Date(selectedBounds.to).getTime()) return false
    return true
  }).length, 0) : 0
  const inSelectedPeriod = (value) => {
    const occurredAt = new Date(value).getTime()
    if (!Number.isFinite(occurredAt)) return false
    if (selectedBounds.from && occurredAt < new Date(selectedBounds.from).getTime()) return false
    if (selectedBounds.to && occurredAt > new Date(selectedBounds.to).getTime()) return false
    return true
  }
  const demoRenewedSubscribers = isDemo ? demoContactsInScope.filter((contact) => {
    if (contact.type !== 'Abonado actual' || contact.isCommitmentOnly) return false
    if (!selectedBounds.from && !selectedBounds.to) return true
    return contact.renewalDate && inSelectedPeriod(contact.renewalDate)
  }).length : 0
  const demoRenewedSeats = isDemo ? demoContactsInScope.reduce((total, contact) => {
    if (contact.type !== 'Abonado actual' || contact.isCommitmentOnly) return total
    const events = contact.renewedSeatEvents?.length
      ? contact.renewedSeatEvents
      : Array.from({ length: Number(contact.seats || 0) }, () => contact.renewalDate)
    return total + events.filter(inSelectedPeriod).length
  }, 0) : 0
  const demoMembershipSegments = isDemo ? demoContactsInScope.reduce((totals, contact) => {
    Object.entries(contact.membershipSegments || {}).forEach(([segment, count]) => { totals[segment] = (totals[segment] || 0) + Number(count || 0) })
    return totals
  }, {}) : {}
  const summary = isDemo ? {
    ...(dashboardSummary || {}),
    totalContacts: demoContactsInScope.length,
    currentSubscribers: demoContactsInScope.filter((contact) => ['Abonado actual', 'Abonado nuevo'].includes(contact.type) && !contact.isCommitmentOnly).length,
    activeSeats: demoContactsInScope.filter((contact) => ['Abonado actual', 'Abonado nuevo'].includes(contact.type)).reduce((sum, contact) => sum + Number(contact.seats || 0), 0),
    renewing: demoContactsInScope.filter((contact) => contact.type === 'Por renovar').length,
    newSubscribers: demoNewSubscribers.length,
    newSeats: demoNewSeats,
    renewedSubscribers: demoRenewedSubscribers,
    renewedSeats: demoRenewedSeats,
    prospects: demoContactsInScope.filter((contact) => contact.type === 'Prospecto').length,
    membershipSegments: demoMembershipSegments,
    notContacted: demoContactsInScope.filter((contact) => ['Sin contactar', 'Por contactar'].includes(contact.stage)).length,
    unassigned: demoContactsInScope.filter((contact) => contact.executive === 'SIN ASIGNAR').length,
    confirmedSales: dashboardSalesInScope.length,
    salesAmount: dashboardSalesInScope.reduce((sum, sale) => sum + Number(sale.total || 0), 0),
    collectedAmount: dashboardSalesInScope.reduce((sum, sale) => sum + Number(sale.paid || 0), 0),
  } : (dashboardSummary || {})
  const salesTotal = dashboardSalesInScope.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const totalContacts = Math.max(1, Number(summary.totalContacts || contacts.length || 1))
  const funnelRows = [
    ['Contactos en alcance', Number(summary.totalContacts || 0), 100, 'blue'],
    ['Abonados actuales', Number(summary.currentSubscribers || 0), Number(summary.currentSubscribers || 0) / totalContacts * 100, 'green'],
    ['Por renovar', Number(summary.renewing || 0), Number(summary.renewing || 0) / totalContacts * 100, 'gold'],
    ['Abonados nuevos', Number(summary.newSubscribers || 0), Number(summary.newSubscribers || 0) / totalContacts * 100, 'violet'],
    ['Prospectos', Number(summary.prospects || 0), Number(summary.prospects || 0) / totalContacts * 100, 'gold'],
  ]
  const segmentIsPeriod = reportFilters.period !== 'all' || Boolean(reportFilters.fromDate || reportFilters.toDate)
  const displayedSegments = segmentIsPeriod ? (summary.periodMembershipSegments || {}) : (summary.membershipSegments || {})
  const segmentRows = [
    ['Compromisos', Number(displayedSegments.Compromisos || 0), '#a33b46'],
    ['VIP', Number(displayedSegments.VIP || 0), '#d5a228'],
    ['Preferente', Number(displayedSegments.Preferente || 0), '#2a73b7'],
    ['General', Number(displayedSegments.General || 0), '#2c9b70'],
  ]
  const segmentTotal = segmentRows.reduce((sum, [, value]) => sum + value, 0)
  const newSubscriberPeriodLabel = selectedPeriodLabel(reportFilters.period, reportFilters.fromDate, reportFilters.toDate)
  const subscriberMetricOptions = [
    { id: 'new', label: 'Nuevos', value: summary.newSubscribers },
    { id: 'renewed', label: 'Renovados', value: summary.renewedSubscribers },
    { id: 'total', label: 'N + R', value: Number(summary.newSubscribers || 0) + Number(summary.renewedSubscribers || 0) },
  ]
  const seatMetricOptions = [
    { id: 'new', label: 'Nuevos', value: summary.newSeats },
    { id: 'renewed', label: 'Renovados', value: summary.renewedSeats },
    { id: 'total', label: 'N + R', value: Number(summary.newSeats || 0) + Number(summary.renewedSeats || 0) },
  ]
  let segmentCursor = 0
  const segmentGradient = segmentTotal ? `conic-gradient(${segmentRows.map(([, value, color]) => {
    const start = segmentCursor
    segmentCursor += value / segmentTotal * 100
    return `${color} ${start}% ${segmentCursor}%`
  }).join(', ')})` : 'conic-gradient(#d8dde4 0 100%)'
  const operationCounts = followupCounts || {
    scheduled: tasks.length,
    pending: tasks.filter((task) => task.status === 'Pendiente' || task.status === 'En curso').length,
    completed: tasks.filter((task) => task.status === 'Completada').length,
    overdue: tasks.filter((task) => task.status === 'Vencida').length,
  }
  const filterKey = `${reportFilters.season}|${reportFilters.period}|${reportFilters.fromDate}|${reportFilters.toDate}|${reportFilters.executiveId}`
  const reportIsReady = Boolean(dashboardSummary) && (isDemo || loadedFilterKey === filterKey)
  const executiveName = availableExecutives.find((item) => item.id === reportFilters.executiveId)?.displayName || 'Todos los ejecutivos'
  useEffect(() => {
    setPdfState({ status: 'idle', message: '' })
    if (isDemo) {
      setLoadedFilterKey(filterKey)
      return undefined
    }
    let active = true
    setLoadedFilterKey('')
    onLoadDashboard({ season: reportFilters.season, executiveId: reportFilters.executiveId || undefined, ...periodBounds(reportFilters.period, reportFilters.fromDate, reportFilters.toDate) })
      .then((applied) => { if (active && applied !== false) setLoadedFilterKey(filterKey) })
      .catch((error) => { if (active) onNotify(error.message || 'No fue posible actualizar el reporte.') })
    return () => { active = false }
  }, [dashboardRevision, filterKey, isDemo, onLoadDashboard, onNotify, reportFilters.executiveId, reportFilters.fromDate, reportFilters.period, reportFilters.season, reportFilters.toDate])

  async function downloadDashboardPdf() {
    if (!reportIsReady || pdfState.status === 'generating') return
    setPdfState({ status: 'generating', message: 'Generando reporte PDF…' })
    try {
      if (!isDemo) {
        await onAuthorizeDashboardPdf({
          season: reportFilters.season,
          executiveId: reportFilters.executiveId || undefined,
          ...periodBounds(reportFilters.period, reportFilters.fromDate, reportFilters.toDate),
        })
      }
      await downloadExecutiveDashboardPdf({
        summary: {
          totalContacts: summary.totalContacts,
          currentSubscribers: summary.currentSubscribers,
          activeSeats: summary.activeSeats,
          renewing: summary.renewing,
          newSubscribers: summary.newSubscribers,
          newSeats: summary.newSeats,
          renewedSubscribers: summary.renewedSubscribers,
          renewedSeats: summary.renewedSeats,
          prospects: summary.prospects,
          membershipSegments: displayedSegments,
          salesAmount: salesTotal,
          humanInteractions: summary.humanInteractions,
          campaignMessages: summary.campaignMessages,
          unassigned: summary.unassigned,
        },
        operation: operationCounts,
        filters: { ...reportFilters, executiveName },
        isDemo,
      })
      setPdfState({ status: 'success', message: 'Reporte PDF descargado.' })
    } catch (error) {
      setPdfState({ status: 'error', message: error.message || 'No fue posible generar el reporte PDF.' })
    }
  }

  async function downloadSubscriberDetail() {
    if (!reportIsReady || pdfState.status === 'generating') return
    setPdfState({ status: 'generating', message: 'Generando reporte detallado...' })
    try {
      await onExportSubscriberDetail({
        season: reportFilters.season,
        executiveId: reportFilters.executiveId || undefined,
      })
      setPdfState({ status: 'success', message: 'Reporte detallado descargado.' })
    } catch (error) {
      setPdfState({ status: 'error', message: error.message || 'No fue posible descargar el reporte detallado.' })
    }
  }

  const reportActions = (
    <>
      <span className="updated-badge"><span />{reportIsReady ? 'Periodo actualizado' : 'Actualizando periodo…'}</span>
      {reportIsReady && (
        <details className="report-download-menu">
          <summary className="button button--secondary" aria-label="Abrir opciones de descarga"><Icon name="download" size={17} />Descargar <Icon name="chevron" size={14} /></summary>
          <div className="report-download-options">
            <button type="button" disabled={pdfState.status === 'generating'} onClick={downloadDashboardPdf}><Icon name="document" size={17} /><span><strong>Reporte ejecutivo PDF</strong><small>Resumen visual del periodo</small></span></button>
            {canExportData(user) && <button type="button" disabled={pdfState.status === 'generating'} onClick={downloadSubscriberDetail}><Icon name="people" size={17} /><span><strong>Detalle de titulares</strong><small>Zonas, butacas y ordenes vigentes</small></span></button>}
          </div>
        </details>
      )}
      {pdfState.message && <span className={`pdf-status pdf-status--${pdfState.status}`} role={pdfState.status === 'error' ? 'alert' : 'status'} aria-live="polite">{pdfState.message}</span>}
    </>
  )
  return (
    <div className="page-wrap">
      <PageHeader eyebrow="Vista ejecutiva" title="Reporte Dirección" description={<>Seguimiento de venta y renovación de abonados <strong className="charros-name">Charros de Jalisco</strong></>} actions={reportActions} />
      <GlobalFilters executiveOptions={availableExecutives} filters={reportFilters} onChange={setReportFilters} />

      <section className="metrics-grid" aria-label="Indicadores principales">
        <MetricCard label="Abonados actuales" value={integer.format(summary.currentSubscribers || 0)} detail="Titulares Identificados" icon="people" />
        <MetricCard label="Abonos Activos" value={integer.format(summary.activeSeats || 0)} detail="Butacas Individuales" icon="layers" tone="violet" />
        <MetricCard label="Por renovar" value={integer.format(summary.renewing || 0)} detail="Personas por renovar sus abonos" icon="refresh" tone="gold" />
        <SegmentedMetricCard label="Titulares" options={subscriberMetricOptions} selected={subscriberMetricMode} onSelect={setSubscriberMetricMode} detail={`Periodo: ${newSubscriberPeriodLabel}`} icon="chart" tone="green" />
        <SegmentedMetricCard label="Abonos" options={seatMetricOptions} selected={seatMetricMode} onSelect={setSeatMetricMode} detail={`Butacas individuales · Periodo: ${newSubscriberPeriodLabel}`} icon="layers" tone="violet" />
        <MetricCard label="Venta documentada" value={currency.format(salesTotal)} detail="periodo seleccionado" icon="wallet" tone="blue" />
      </section>

      <section className="dashboard-grid">
        <article className="panel panel--wide">
          <div className="panel-heading"><div><span className="panel-kicker">COMPOSICIÓN OPERATIVA</span><h2>Foto actual de la cartera</h2></div><span className="small-chip">{integer.format(summary.totalContacts || 0)} registros</span></div>
          <div className="funnel">
            {funnelRows.map(([label, value, width, tone]) => (
              <div className="funnel-row" key={label}><div className="funnel-label"><span>{label}</span><strong>{value}</strong></div><div className="progress-track"><span className={`progress-fill progress-fill--${tone}`} style={{ width: `${width}%` }} /></div></div>
            ))}
          </div>
        </article>

        <article className="panel panel--wide">
          <div className="panel-heading"><div><span className="panel-kicker">{segmentIsPeriod ? 'SEGMENTACIÓN DEL PERIODO' : 'SEGMENTACIÓN DE LA CARTERA'}</span><h2>Abonos por segmento</h2></div><span className="small-chip">{integer.format(segmentTotal)} abonos</span></div>
          <div className="donut-layout"><div className="donut segment-donut" style={{background: segmentGradient}}><div><strong>{integer.format(segmentTotal)}</strong><span>{segmentIsPeriod ? 'abonos del periodo' : 'abonos activos'}</span></div></div><div className="donut-legend">{segmentRows.map(([label, value, color]) => <div key={label}><i className="legend-dot" style={{background: color}}/><span>{label}</span><strong>{integer.format(value)}</strong></div>)}</div></div>
        </article>

        <article className="panel operation-card">
          <div className="panel-heading"><div><span className="panel-kicker">OPERACIÓN GLOBAL DE HOY</span><h2>Seguimientos</h2></div><button className="text-button" onClick={() => onNavigate('followup')}>Ver operación <Icon name="arrow" size={15} /></button></div>
          <div className="operation-total"><strong>{operationCounts.scheduled}</strong><span>acciones programadas</span><small>operación del día</small></div>
          <div className="operation-stats">
            <div><span className="operation-dot operation-dot--blue" /><strong>{operationCounts.pending}</strong><small>Pendientes</small></div>
            <div><span className="operation-dot operation-dot--green" /><strong>{operationCounts.completed}</strong><small>Completadas</small></div>
            <div><span className="operation-dot operation-dot--red" /><strong>{operationCounts.overdue}</strong><small>Vencidas</small></div>
          </div>
          {tasks[0] ? <div className="next-action"><span className="mini-avatar">{initials(tasks[0].contact)}</span><div><small>Siguiente · {tasks[0].time}</small><strong>{tasks[0].contact}</strong><span>{tasks[0].action}</span></div><Icon name="chevron" size={17} /></div> : <div className="next-action"><span className="mini-avatar">✓</span><div><small>Agenda al día</small><strong>Sin acciones pendientes</strong><span>No hay acciones programadas para este corte.</span></div></div>}
        </article>
      </section>

    </div>
  )
}

function ContactsPage({ kind, contacts, contactRevision, user, availableExecutives, isDemo, onEdit, onCreate, onExport, onLoadContacts }) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('Todos')
  const [stage, setStage] = useState('Todas')
  const [owner, setOwner] = useState('Todos')
  const [channel, setChannel] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [dateField, setDateField] = useState('lastContact')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [meta, setMeta] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [showDeleted, setShowDeleted] = useState(false)
  const [sort, setSort] = useState('updatedAt')
  const [order, setOrder] = useState('desc')
  const isPortfolio = kind === 'portfolio'

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => window.clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    setPage(1)
  }, [kind, debouncedSearch, status, stage, owner, channel, from, to, dateField, pageSize, showDeleted, sort, order])

  const serverQuery = useMemo(() => ({
    segment: isPortfolio ? undefined : kind,
    page,
    pageSize,
    search: debouncedSearch || undefined,
    subscriberStatus: status === 'Todos' ? undefined : subscriberStatusCode(status),
    commercialStage: stage === 'Todas' ? undefined : commercialStageCode(stage),
    assignment: owner === '__unassigned__' ? 'unassigned' : owner === '__assigned__' ? 'assigned' : undefined,
    executiveId: !['Todos', '__unassigned__', '__assigned__'].includes(owner) ? owner : undefined,
    lastChannel: channel || undefined,
    from: localDateBoundary(from),
    to: localDateBoundary(to, true),
    dateField: from || to ? dateField : undefined,
    deletedOnly: showDeleted ? true : undefined,
    sort,
    order,
  }), [isPortfolio, kind, page, pageSize, debouncedSearch, status, stage, owner, channel, from, to, dateField, showDeleted, sort, order])

  useEffect(() => {
    if (isDemo) return undefined
    let active = true
    setLoading(true)
    setLoadError('')
    onLoadContacts(serverQuery)
      .then((nextMeta) => { if (active) setMeta({ page: 1, pageSize, total: 0, totalPages: 1, ...nextMeta }) })
      .catch((error) => { if (active) setLoadError(error.message || 'No fue posible cargar los contactos.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [contactRevision, isDemo, onLoadContacts, pageSize, reloadToken, serverQuery])

  const source = contacts.filter((contact) => (isPortfolio || contact.kind === kind) && Boolean(contact.deletedAt) === showDeleted)
  const filtered = isDemo ? source.filter((contact) => {
    const query = search.toLowerCase()
    const ownerName = availableExecutives.find((item) => item.id === owner)?.displayName
    return (!query || `${contact.name} ${contact.email} ${contact.phone} ${contact.id}`.toLowerCase().includes(query))
      && (status === 'Todos' || contact.type === status)
      && (stage === 'Todas' || contact.stage === stage)
      && (owner === 'Todos' || (owner === '__unassigned__' && contact.executive === 'Sin asignar') || contact.executive === ownerName)
      && (!channel || contact.lastHumanContactChannel === channel || ({ Llamada: 'phone', WhatsApp: 'whatsapp', Correo: 'email', Presencial: 'in_person', Otro: 'other' })[contact.channel] === channel)
  }).sort((left, right) => {
    const values = {
      name: [left.name, right.name],
      status: [left.type, right.type],
      lastContact: [left.lastContact, right.lastContact],
      nextFollowUp: [left.nextTask, right.nextTask],
      updatedAt: [left.updatedAt || '', right.updatedAt || ''],
    }[sort] || ['', '']
    return String(values[0]).localeCompare(String(values[1]), 'es-MX') * (order === 'asc' ? 1 : -1)
  }) : source
  const total = isDemo ? filtered.length : Number(meta.total || 0)
  const totalPages = isDemo ? 1 : Math.max(1, Number(meta.totalPages || 1))
  const stats = isPortfolio
    ? [['Registros en página', filtered.length], ['Abonados actuales', filtered.filter((item) => item.type === 'Abonado actual').length], ['Por renovar', filtered.filter((item) => item.type === 'Por renovar').length], ['Sin siguiente tarea', filtered.filter((item) => item.nextTask === 'Sin tarea').length]]
    : [['Registros en página', filtered.length], ['Contactados', filtered.filter((item) => item.stage === 'Contactado').length], ['Con interés', filtered.filter((item) => item.stage === 'Interesado').length], ['Sin asignar', filtered.filter((item) => item.executive === 'Sin asignar').length]]

  function clearFilters() {
    setSearch(''); setStatus('Todos'); setStage('Todas'); setOwner('Todos'); setChannel(''); setFrom(''); setTo(''); setDateField('lastContact'); setSort('updatedAt'); setOrder('desc'); setPage(1)
  }

  function toggleSort(field) {
    if (sort === field) setOrder((current) => current === 'asc' ? 'desc' : 'asc')
    else { setSort(field); setOrder(field === 'name' || field === 'status' ? 'asc' : 'desc') }
  }

  function sortableHeader(label, field) {
    const active = sort === field
    return <th aria-sort={active ? order === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" className={active ? 'sort-button sort-button--active' : 'sort-button'} onClick={() => toggleSort(field)}>{label}<span aria-hidden="true">{active ? order === 'asc' ? '↑' : '↓' : '↕'}</span></button></th>
  }

  function applyQuickView(view) {
    if (view === 'Mi cartera') setOwner(user.id)
    if (view === 'Hoy') { const today = localInputDate(new Date()); setFrom(today); setTo(today); setDateField('nextFollowUp') }
    if (view === 'Vencidos') { setFrom(''); setTo(localInputDate(new Date())); setDateField('nextFollowUp') }
    if (view === 'Sin contactar') setStage('Por contactar')
    if (view === 'Sin asignar') setOwner('__unassigned__')
  }

  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow={isPortfolio ? 'Gestión de abonados' : 'Desarrollo comercial'}
        title={isPortfolio ? 'Cartera y Renovaciones' : 'Prospectos'}
        description={isPortfolio ? 'Personas, abonos y seguimiento comercial sin duplicar información.' : 'Convierte interés en oportunidades con un siguiente paso siempre visible.'}
        actions={<>{canExportData(user) && !showDeleted && <SecondaryButton icon="download" onClick={() => onExport({ ...serverQuery, page: undefined, pageSize: undefined })}>Exportar</SecondaryButton>}{canCreateContacts(user) && <PrimaryButton onClick={() => onCreate(kind)}>Nuevo {isPortfolio ? 'contacto' : 'prospecto'}</PrimaryButton>}</>}
      />

      <section className="inline-stats" aria-label="Resumen de la página actual">
        {stats.map(([label, value], index) => <div key={label} className={index === 3 ? 'stat-alert' : ''}><span>{label}</span><strong>{value}</strong></div>)}
      </section>

      <section className="panel list-panel" aria-busy={loading}>
        <div className="toolbar">
          <label className="search-field"><span className="sr-only">Buscar contactos</span><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, teléfono, correo, ID u observaciones…" /></label>
          <div className="toolbar-filters">
            <label><span className="sr-only">Estatus</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Todos</option>{isPortfolio ? <><option>Abonado actual</option><option>Por renovar</option><option>Abonado nuevo</option><option>Exabonado</option></> : <option>Prospecto</option>}</select></label>
            <label><span className="sr-only">Etapa</span><select value={stage} onChange={(event) => setStage(event.target.value)}><option>Todas</option><option>Por contactar</option><option>Contactado</option><option>Seguimiento</option><option>Interesado</option><option>Apartado</option></select></label>
            <label><span className="sr-only">Ejecutivo</span><select value={owner} onChange={(event) => setOwner(event.target.value)}><option>Todos</option><option value="__assigned__">Con ejecutivo</option><option value="__unassigned__">Sin asignar</option>{!availableExecutives.some((item) => item.id === user.id) && user.roleCode === 'executive' && <option value={user.id}>{user.name}</option>}{availableExecutives.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
            <label><span className="sr-only">Canal del último contacto</span><select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">Todos los canales</option><option value="phone">Llamada</option><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="in_person">Presencial</option><option value="other">Otro</option></select></label>
            <label className="date-filter"><span>Desde</span><input aria-label="Fecha desde" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label className="date-filter"><span>Hasta</span><input aria-label="Fecha hasta" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
            {(from || to) && <label><span className="sr-only">Campo de fecha</span><select value={dateField} onChange={(event) => setDateField(event.target.value)}><option value="lastContact">Último contacto</option><option value="nextFollowUp">Próximo seguimiento</option><option value="updatedAt">Última edición</option></select></label>}
          </div>
        </div>
        <div className="active-filters"><span>Vistas rápidas:</span>{['Mi cartera', 'Hoy', 'Vencidos', 'Sin contactar', 'Sin asignar'].map((view) => <button key={view} onClick={() => applyQuickView(view)}>{view}</button>)}{canRestoreContacts(user) && <button className={showDeleted ? 'quick-view-active' : ''} onClick={() => setShowDeleted((value) => !value)}>{showDeleted ? 'Volver a activos' : 'Eliminados'}</button>}{(search || status !== 'Todos' || stage !== 'Todas' || owner !== 'Todos' || channel || from || to || sort !== 'updatedAt' || order !== 'desc') && <button className="clear-filter" onClick={clearFilters}>Limpiar filtros <Icon name="close" size={13}/></button>}</div>
        {loadError && <div className="load-error" role="alert"><Icon name="refresh" size={17}/><span>{loadError}</span><button onClick={() => setReloadToken((current) => current + 1)}>Reintentar</button></div>}
        <div className="table-scroll">
          <table className="data-table contact-table">
            <thead><tr>{sortableHeader('Contacto', 'name')}{sortableHeader('Estatus', 'status')}{isPortfolio && <th>Abonos</th>}<th>Etapa comercial</th>{isPortfolio && <th>Temporadas</th>}{sortableHeader('Último contacto', 'lastContact')}<th>Canal</th>{sortableHeader('Próxima acción', 'nextFollowUp')}<th>Ejecutivo</th><th>Observaciones</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>{filtered.map((contact) => <ContactRow key={contact.id} contact={contact} isPortfolio={isPortfolio} onEdit={onEdit} />)}</tbody>
          </table>
          {loading && <div className="list-loading" role="status"><span className="spinner"/>Cargando contactos…</div>}
          {!loading && !filtered.length && <EmptyState title="No encontramos coincidencias" body="Prueba quitando uno o más filtros de la lista." />}
        </div>
        <div className="table-footer"><span>Mostrando {filtered.length} de {integer.format(total)} registros</span><div className="pagination"><button disabled={page <= 1 || loading} aria-label="Página anterior" onClick={() => setPage((current) => Math.max(1, current - 1))}><Icon name="chevron" size={15}/></button><span className="page-label">Página {page} de {totalPages}</span><button disabled={page >= totalPages || loading} aria-label="Página siguiente" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}><Icon name="chevron" size={15}/></button></div><label>Filas <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option>25</option><option>50</option><option>100</option></select></label></div>
      </section>
    </div>
  )
}

function ContactRow({ contact, isPortfolio, onEdit }) {
  return (
    <tr>
      <td><button className="contact-button" onClick={() => onEdit(contact)}><span className="contact-avatar">{contact.initials || initials(contact.name)}</span><span><strong>{contact.name}</strong><small>{contact.email}</small><small>{contact.phone}</small></span></button></td>
      <td><StatusPill>{contact.type}</StatusPill></td>
      {isPortfolio && <td><MembershipCell contact={contact} onEdit={onEdit}/></td>}
      <td><StatusPill>{contact.stage}</StatusPill></td>
      {isPortfolio && <td><strong>{contact.seasons || contact.declaredSeasons || '—'}</strong>{contact.seasons > 0 ? <small className="subvalue">verificadas</small> : contact.declaredSeasons != null ? <small className="subvalue">declaradas</small> : null}</td>}
      <td><span className={contact.lastContact?.includes('Sin ') ? 'muted danger-text' : ''}>{contact.lastContact}</span></td>
      <td>{contact.channel}</td>
      <td><span className={contact.nextTask?.includes('Vencida') ? 'danger-text' : ''}>{contact.nextTask}</span></td>
      <td><div className="owner-cell">{contact.executive !== 'Sin asignar' && <span className="owner-avatar">{initials(contact.executive)}</span>}<span>{contact.executive}</span></div></td>
      <td><span className={contact.note ? 'note-preview' : 'muted'} title={contact.note || undefined}>{contact.note || 'Sin observaciones'}</span></td>
      <td><button className="icon-button" aria-label={`Editar ${contact.name}`} onClick={() => onEdit(contact)}><Icon name="more" size={19} /></button></td>
    </tr>
  )
}

function MembershipCell({ contact, onEdit }) {
  const loaded = Object.prototype.hasOwnProperty.call(contact, 'currentMembership')
  const membership = contact.currentMembership
  const seats = membership?.units?.map((unit) => unit.seatIdentifier).filter(Boolean) || []
  const action = membership ? 'Editar' : 'Agregar'
  return (
    <div className="membership-cell">
      {membership ? <><strong>{membership.localityName || 'Localidad pendiente'}</strong><small>{membership.membershipSection || 'Sección pendiente'} · {membership.seatCount} {membership.seatCount === 1 ? 'abono' : 'abonos'}</small><small title={seats.join(', ') || undefined}>{seats.length ? seats.join(', ') : 'Butacas pendientes'}</small>{membership.netAmount != null && <><span className="membership-net-value">Importe neto: {currency.format(membership.netAmount)}</span><span className="membership-commercial-value">Valor comercial: {currency.format(membership.commercialValue)} · Descuento: {currency.format(membership.discountAmount || 0)}</span></>}</> : loaded ? <><strong>Sin capturar</strong><small>Temporada actual</small></> : contact.seats > 0 ? <><strong>{contact.seats} {contact.seats === 1 ? 'abono registrado' : 'abonos registrados'}</strong><small>Abre para consultar el detalle</small></> : <><strong>Sin capturar</strong><small>Temporada actual</small></>}
      <button type="button" onClick={() => onEdit(contact, { focusMembership: true })} aria-label={`${action} abonos de ${contact.name}`}>{action}</button>
    </div>
  )
}

function FollowupPage({ tasks, interactions, unassignedContacts, unassignedTotal, followupCounts, user, onCompleteTask }) {
  const [tab, setTab] = useState('tasks')
  const visibleTasks = tab === 'overdue' ? tasks.filter((task) => task.status === 'Vencida') : tasks
  const unassigned = unassignedContacts.filter((contact) => !contact.deletedAt)
  const completedCount = tasks.filter((task) => task.status === 'Completada').length
  const overdueCount = tasks.filter((task) => task.status === 'Vencida').length
  const pendingCount = tasks.filter((task) => task.status === 'Pendiente' || task.status === 'En curso' || task.status === 'Vencida').length
  const scheduledCount = tasks.length
  const exactUnassignedCount = unassignedTotal || unassigned.length
  return (
    <div className="page-wrap">
      <PageHeader eyebrow="Centro de seguimiento" title="Operación diaria" description="Tareas, interacciones y excepciones reunidas para que nada se quede sin atender." />
      <section className="operation-summary">
        <div><span className="summary-icon summary-icon--blue"><Icon name="calendar" /></span><span><small>Programadas</small><strong>{scheduledCount}</strong></span><em>{pendingCount} pendientes</em></div>
        <div><span className="summary-icon summary-icon--green"><Icon name="check" /></span><span><small>Completadas</small><strong>{completedCount}</strong></span><em>{scheduledCount ? Math.round(completedCount / scheduledCount * 100) : 0}% de avance</em></div>
        <div><span className="summary-icon summary-icon--red"><Icon name="clock" /></span><span><small>Vencidas</small><strong>{overdueCount}</strong></span><em>Requieren atención</em></div>
        <div><span className="summary-icon summary-icon--gold"><Icon name="people" /></span><span><small>Sin asignar</small><strong>{exactUnassignedCount}</strong></span><em>Distribuir cartera</em></div>
      </section>
      <section className="panel followup-panel">
        <div className="tabs" role="tablist" aria-label="Secciones de seguimiento">
          <button role="tab" aria-selected={tab === 'tasks'} className={tab === 'tasks' ? 'tab-active' : ''} onClick={() => setTab('tasks')}>Mis tareas <span>{pendingCount}</span></button>
          <button role="tab" aria-selected={tab === 'log'} className={tab === 'log' ? 'tab-active' : ''} onClick={() => setTab('log')}>Bitácora</button>
          <button role="tab" aria-selected={tab === 'overdue'} className={tab === 'overdue' ? 'tab-active' : ''} onClick={() => setTab('overdue')}>Vencidos y sin asignar <span className="tab-alert">{overdueCount + exactUnassignedCount}</span></button>
        </div>
        {tab === 'log' ? <InteractionLog interactions={interactions} /> : <TaskList tasks={visibleTasks} overdue={tab === 'overdue'} unassigned={unassigned} user={user} onCompleteTask={onCompleteTask} />}
      </section>
    </div>
  )
}

function TaskList({ tasks, overdue, unassigned, user, onCompleteTask }) {
  const todayLabel = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const [updatingTaskId, setUpdatingTaskId] = useState('')
  async function complete(task) {
    if (updatingTaskId) return
    setUpdatingTaskId(task.id)
    try { await onCompleteTask(task) } catch { /* El contenedor muestra el error global. */ }
    finally { setUpdatingTaskId('') }
  }
  function mayComplete(task) {
    if (task.status === 'Completada' || task.status === 'Cancelada') return false
    if (hasPermission(user, PERMISSIONS.TASK_WRITE_ALL)) return true
    return hasPermission(user, PERMISSIONS.TASK_WRITE_ASSIGNED) && task.assignedTo === user.id
  }
  return (
    <>
      <div className="toolbar followup-toolbar"><div className="date-nav"><strong><Icon name="calendar" size={17}/>{todayLabel}</strong></div></div>
      <div className="table-scroll"><table className="data-table task-table"><thead><tr><th>Hora</th><th>Contacto</th><th>Acción</th><th>Responsable</th><th>Prioridad</th><th>Estatus</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>
        {tasks.map((task) => <tr key={task.id}><td><strong className={task.status === 'Vencida' ? 'danger-text' : ''}>{task.time}</strong></td><td><div className="person-cell"><span className="mini-avatar">{initials(task.contact)}</span><strong>{task.contact}</strong></div></td><td>{task.action}</td><td>{task.owner}</td><td><span className={`priority priority--${task.priority.toLowerCase()}`}>{task.priority}</span></td><td><StatusPill>{task.status}</StatusPill></td><td>{mayComplete(task) && <button type="button" className="complete-task-button" disabled={Boolean(updatingTaskId)} onClick={() => complete(task)}><Icon name="check" size={14}/>{updatingTaskId === task.id ? 'Guardando…' : 'Completar'}</button>}</td></tr>)}
        {overdue && unassigned.map((contact) => <tr key={contact.id}><td><strong className="danger-text">Sin fecha</strong></td><td><div className="person-cell"><span className="mini-avatar">{contact.initials}</span><strong>{contact.name}</strong></div></td><td>Asignar responsable y siguiente paso</td><td className="danger-text">Sin asignar</td><td><span className="priority priority--alta">Alta</span></td><td><StatusPill tone="danger">Requiere atención</StatusPill></td><td /></tr>)}
      </tbody></table></div>
    </>
  )
}

function InteractionLog({ interactions }) {
  return (
    <div className="interaction-layout">
      <div className="timeline">
        {interactions.map((item) => <article className="timeline-item" key={item.id}><div className="timeline-marker"><Icon name={item.type === 'Correo' ? 'mail' : 'phone'} size={16}/></div><div className="timeline-content"><div><strong>{item.contact}</strong><StatusPill>{item.result}</StatusPill><time>{item.when}</time></div><p>{item.detail}</p><small>{item.type} · Registró {item.owner}</small></div></article>)}
        {!interactions.length && <EmptyState title="La bitácora global aún no está cargada" body="Abre un contacto para consultar sus interacciones o registra la primera gestión." />}
      </div>
      <aside className="activity-note"><span className="summary-icon summary-icon--blue"><Icon name="note"/></span><h3>Una bitácora confiable</h3><p>Los envíos de campaña se conservan por separado. Solo llamadas, mensajes con respuesta y gestiones del equipo actualizan el último contacto humano.</p></aside>
    </div>
  )
}

function initialSaleDraft() {
  return { externalOrderNumber: '', contactId: '', executiveId: '', kind: 'new', closeStage: 'reserved', localityCode: '', discountCode: '', zone: '', promotion2x1: false, quantity: 1, unitPrice: '', soldAt: new Date().toISOString().slice(0, 10), paymentAmount: '', paymentMethod: 'Transferencia', paymentReference: '', notes: '', correctionReason: '', additionalHolders: [], seatDetails: [] }
}

function SalesPage({ sales, contacts, isDemo, user, availableExecutives, pricingCatalog, onQuoteMembershipPricing, onAddPayment, onCreateSale, onCorrectSale, onCancelSale, onCreate, saleClosure, onClearSaleClosure }) {
  const [search, setSearch] = useState('')
  const [payment, setPayment] = useState('Todos los pagos')
  const [owner, setOwner] = useState('Todos los ejecutivos')
  const [kind, setKind] = useState('Todos los movimientos')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [paymentSale, setPaymentSale] = useState(null)
  const [paymentDraft, setPaymentDraft] = useState({ amount: '', method: 'Transferencia', paidAt: new Date().toISOString().slice(0, 10), reference: '' })
  const [paymentError, setPaymentError] = useState('')
  const [savingPayment, setSavingPayment] = useState(false)
  const [saleOpen, setSaleOpen] = useState(false)
  const [editingSale, setEditingSale] = useState(null)
  const [saleError, setSaleError] = useState('')
  const [savingSale, setSavingSale] = useState(false)
  const [cancellingSale, setCancellingSale] = useState(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [cancellationError, setCancellationError] = useState('')
  const [savingCancellation, setSavingCancellation] = useState(false)
  const [contactSearch, setContactSearch] = useState('')
  const [saleDraft, setSaleDraft] = useState(initialSaleDraft)
  const [saleQuote, setSaleQuote] = useState(null)
  const [saleQuoteState, setSaleQuoteState] = useState('idle')
  const [saleQuoteError, setSaleQuoteError] = useState('')
  const saleQuoteRequest = useRef(0)
  const saleLocalities = pricingCatalog?.localities || []
  const saleDiscounts = pricingCatalog?.discounts || []
  const contactOptions = [...new Map([
    ...contacts.map((contact) => [contact.id, { id: contact.id, name: contact.name }]),
    ...sales.filter((sale) => sale.contactId).map((sale) => [sale.contactId, { id: sale.contactId, name: sale.contact }]),
    ...sales.flatMap((sale) => (sale.holderAssignments || []).map((holder) => [holder.contactId, { id: holder.contactId, name: holder.contactName || 'Titular asociado' }])),
  ]).values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const filteredContactOptions = contactOptions.filter((contact) => !contactSearch.trim() || contact.name.toLowerCase().includes(contactSearch.trim().toLowerCase()))
  useEffect(() => {
    if (!saleClosure?.contact?.id) return
    setEditingSale(null)
    setSaleDraft((current) => ({ ...current,
      contactId: saleClosure.contact.id,
      executiveId: saleClosure.contact.executiveId || current.executiveId,
      kind: saleClosure.contact.type === 'Por renovar' || saleClosure.contact.type === 'Abonado actual' ? 'renewal' : 'new',
      closeStage: saleClosure.stage === 'Ganado' ? 'won' : 'reserved',
      zone: saleClosure.contact.zone === 'Sin definir' ? '' : saleClosure.contact.zone || '',
      quantity: Number(saleClosure.contact.seats || 1),
    }))
    setContactSearch(saleClosure.contact.name || '')
    setSaleError('')
    setSaleOpen(true)
  }, [saleClosure])
  const owners = [...new Set(sales.map((sale) => sale.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'))
  const kinds = [...new Set(sales.map((sale) => sale.kind).filter((value) => value && value !== '—'))].sort((a, b) => a.localeCompare(b, 'es'))
  const filteredSales = sales.filter((sale) => {
    const query = search.trim().toLowerCase()
    const occurredAt = sale.occurredAt ? new Date(sale.occurredAt).getTime() : NaN
    return (!query || `${sale.externalOrderNumber || ''} ${sale.id} ${sale.contact} ${sale.zone}`.toLowerCase().includes(query))
      && (payment === 'Todos los pagos' || sale.status === payment)
      && (owner === 'Todos los ejecutivos' || sale.owner === owner)
      && (kind === 'Todos los movimientos' || sale.kind === kind)
      && (!from || (Number.isFinite(occurredAt) && occurredAt >= new Date(`${from}T00:00:00`).getTime()))
      && (!to || (Number.isFinite(occurredAt) && occurredAt <= new Date(`${to}T23:59:59.999`).getTime()))
  })
  const metricSales = filteredSales.filter((sale) => !['Cancelada', 'Reembolsada'].includes(sale.commercialStatus))
  const total = metricSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0)
  const paid = metricSales.reduce((sum, sale) => sum + Number(sale.paid || 0), 0)
  const seats = metricSales.reduce((sum, sale) => sum + Number(sale.seats || 0), 0)
  const partialCount = metricSales.filter((sale) => sale.status === 'Parcial').length
  const collectedPercentage = total > 0 ? Math.round((paid / total) * 100) : 0
  const draftQuantity = Number(saleDraft.quantity || 0)
  const draftUnitPrice = Number(saleDraft.unitPrice || 0)
  const draftChargedUnits = saleQuote?.chargedUnits ?? draftQuantity
  const draftDocumentedTotal = saleQuote?.netAmount ?? (draftChargedUnits * draftUnitPrice)
  useEffect(() => {
    saleQuoteRequest.current += 1
    const requestId = saleQuoteRequest.current
    setSaleQuote(null)
    setSaleQuoteError('')
    if (!saleDraft.localityCode || !saleDraft.discountCode || !Number.isInteger(draftQuantity) || draftQuantity < 1 || !onQuoteMembershipPricing) {
      setSaleQuoteState('idle')
      return undefined
    }
    setSaleQuoteState('loading')
    const timeout = window.setTimeout(async () => {
      try {
        const quote = await onQuoteMembershipPricing({ localityCode: saleDraft.localityCode, discountCode: saleDraft.discountCode, seatCount: draftQuantity })
        if (requestId !== saleQuoteRequest.current) return
        setSaleQuote(quote)
        setSaleDraft((current) => ({ ...current, unitPrice: quote.pricingMode === 'two_for_one' ? quote.netAmount / quote.chargedUnits : quote.netAmount / draftQuantity, promotion2x1: quote.pricingMode === 'two_for_one' }))
        setSaleQuoteState('ready')
      } catch (error) {
        if (requestId !== saleQuoteRequest.current) return
        setSaleQuoteState('error')
        setSaleQuoteError(error?.message || 'No fue posible calcular el descuento.')
      }
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [saleDraft.localityCode, saleDraft.discountCode, draftQuantity, onQuoteMembershipPricing])
  function closeSaleDrawer() {
    setSaleOpen(false)
    setEditingSale(null)
    onClearSaleClosure()
  }
  function updateSaleSeatDetail(index, field, value) {
    setSaleDraft((current) => {
      const quantity = Math.max(1, Number(current.quantity || 1))
      const seatDetails = Array.from({ length: quantity }, (_, itemIndex) => current.seatDetails[itemIndex] || {
        unitNumber: itemIndex + 1, seatIdentifier: '', jerseySize: '', personalization: '',
      })
      seatDetails[index] = { ...seatDetails[index], unitNumber: index + 1, [field]: value }
      return { ...current, seatDetails }
    })
  }
  function openSaleCorrection(sale) {
    const items = Array.isArray(sale.items) ? sale.items : []
    const chargedItem = items.find((item) => Number(item.unitPrice || 0) > 0) || items[0] || {}
    const rawZone = chargedItem.zone || String(sale.zone || '').replace(/\s*·\s*Promoción 2x1$/i, '')
    const locality = saleLocalities.find((item) => item.displayName === rawZone)
      || saleLocalities.find((item) => rawZone.toLowerCase().includes(item.displayName.toLowerCase()))
    const promotion2x1 = items.some((item) => String(item.product || '').toUpperCase().includes('2X1')) || sale.promotion === 'Promoción 2x1'
    const recordedDiscountCode = String(chargedItem.product || '').match(/DESCUENTO .* \[([^\]]+)\]/i)?.[1]
    const discountCode = saleDiscounts.some((item) => item.code === recordedDiscountCode)
      ? recordedDiscountCode
      : promotion2x1 && saleDiscounts.some((item) => item.code === 'july25') ? 'july25' : 'regular'
    setEditingSale(sale)
    setContactSearch(sale.contact || '')
    setSaleDraft({
      externalOrderNumber: sale.externalOrderNumber || '',
      contactId: sale.contactId || '',
      executiveId: sale.executiveId || '',
      kind: sale.saleType || (sale.kind === 'Renovación' ? 'renewal' : 'new'),
      closeStage: sale.status === 'reserved' || sale.commercialStatus === 'Apartada' ? 'reserved' : 'won',
      localityCode: locality?.code || '',
      discountCode,
      zone: locality?.displayName || rawZone || '',
      promotion2x1,
      quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || sale.seats || 1,
      unitPrice: Number(chargedItem.unitPrice ?? locality?.listUnitPrice ?? 0),
      soldAt: sale.soldAt ? new Date(sale.soldAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      paymentAmount: '', paymentMethod: 'Transferencia', paymentReference: '',
      notes: sale.notes || '', correctionReason: '',
      additionalHolders: (sale.holderAssignments || []).filter((holder) => !holder.isPrimary).map((holder) => ({ contactId: holder.contactId, quantity: Number(holder.quantity) })),
      seatDetails: (sale.holderAssignments || []).flatMap((holder) => holder.seatDetails || []).map((seat, index) => ({ ...seat, unitNumber: index + 1 })),
    })
    setSaleError('')
    setSaleOpen(true)
  }
  async function submitPayment(event) {
    event.preventDefault()
    const amount = Number(paymentDraft.amount)
    const balance = Math.max(0, Number(paymentSale.total || 0) - Number(paymentSale.paid || 0))
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) {
      setPaymentError(`Captura un importe mayor a $0 y no superior a ${currency.format(balance)}.`)
      return
    }
    setSavingPayment(true); setPaymentError('')
    try {
      await onAddPayment(paymentSale, { ...paymentDraft, amount, paidAt: new Date(`${paymentDraft.paidAt}T12:00:00`).toISOString() })
      setPaymentSale(null)
    } catch (error) { setPaymentError(error.message || 'No fue posible registrar el cobro.') }
    finally { setSavingPayment(false) }
  }
  async function submitSale(event) {
    event.preventDefault()
    const quantity = Number(saleDraft.quantity); const unitPrice = Number(saleDraft.unitPrice); const paymentAmount = Number(saleDraft.paymentAmount || 0)
    const promotion2x1 = saleQuote?.pricingMode === 'two_for_one'
    const items = buildSaleItems({ kind: saleDraft.kind, zone: saleDraft.zone, quantity, unitPrice, promotion2x1, discountCode: saleQuote?.discountCode, discountName: saleQuote?.discountName, pricingMode: saleQuote?.pricingMode, chargedUnits: saleQuote?.chargedUnits, bonusUnits: saleQuote?.bonusUnits })
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const additionalHolderQuantity = saleDraft.additionalHolders.reduce((sum, holder) => sum + Number(holder.quantity || 0), 0)
    const holderIds = [saleDraft.contactId, ...saleDraft.additionalHolders.map((holder) => holder.contactId)]
    const invalidHolderDistribution = saleDraft.additionalHolders.some((holder) => !holder.contactId || !Number.isInteger(Number(holder.quantity)) || Number(holder.quantity) < 1)
      || new Set(holderIds).size !== holderIds.length || additionalHolderQuantity >= quantity
    if (!saleDraft.externalOrderNumber.trim() || !saleDraft.contactId || !saleDraft.executiveId || !saleDraft.localityCode || !saleDraft.discountCode || saleQuoteState !== 'ready' || !saleQuote || !Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0 || invalidHolderDistribution || (!editingSale && (paymentAmount < 0 || paymentAmount > totalAmount))) {
      setSaleError('Completa número de orden, titular, ejecutivo, zona, descuento y cantidad; espera a que termine la cotización antes de guardar.')
      return
    }
    if (editingSale && saleDraft.correctionReason.trim().length < 5) {
      setSaleError('Describe el motivo de la corrección con al menos 5 caracteres.')
      return
    }
    if (editingSale && Number(editingSale.paid || 0) > totalAmount) {
      setSaleError(`El total corregido no puede ser menor a lo ya cobrado (${currency.format(editingSale.paid)}).`)
      return
    }
    setSavingSale(true); setSaleError('')
    try {
      const holderAssignments = [{ contactId: saleDraft.contactId, quantity: quantity - additionalHolderQuantity, isPrimary: true }, ...saleDraft.additionalHolders.map((holder) => ({ contactId: holder.contactId, quantity: Number(holder.quantity), isPrimary: false }))]
      const seatDetails = Array.from({ length: quantity }, (_, index) => ({ unitNumber: index + 1, seatIdentifier: saleDraft.seatDetails[index]?.seatIdentifier || undefined, jerseySize: saleDraft.seatDetails[index]?.jerseySize || undefined, personalization: saleDraft.seatDetails[index]?.personalization || undefined }))
      const hasSeatDetails = seatDetails.some((seat) => seat.seatIdentifier || seat.jerseySize || seat.personalization)
      const payload = { externalOrderNumber: saleDraft.externalOrderNumber.trim(), saleType: saleDraft.kind, closeStage: saleDraft.closeStage, contactId: saleDraft.contactId, executiveId: saleDraft.executiveId, seasonCode: 'LMP-2026-27', status: saleDraft.closeStage === 'won' ? 'confirmed' : 'reserved', soldAt: new Date(`${saleDraft.soldAt}T12:00:00`).toISOString(), currency: 'MXN', notes: [promotion2x1 ? 'Promoción 2x1 aplicada automáticamente desde el catálogo oficial.' : '', saleDraft.notes].filter(Boolean).join(' ') || undefined, items, pricing: { localityCode: saleDraft.localityCode, discountCode: saleDraft.discountCode, seatCount: quantity }, holderAssignments, ...(hasSeatDetails ? { seatDetails } : {}) }
      if (editingSale) await onCorrectSale(editingSale, { ...payload, reason: saleDraft.correctionReason.trim() })
      else await onCreateSale({ ...payload, payments: paymentAmount > 0 ? [{ amount: paymentAmount, method: saleDraft.paymentMethod, paidAt: new Date(`${saleDraft.soldAt}T12:00:00`).toISOString(), reference: saleDraft.paymentReference || undefined }] : [] })
      closeSaleDrawer()
    } catch (error) { setSaleError(error.message || 'No fue posible crear la venta.') }
    finally { setSavingSale(false) }
  }

  async function submitCancellation(event) {
    event.preventDefault()
    const reason = cancellationReason.trim()
    if (reason.length < 5) {
      setCancellationError('Describe el motivo de la anulación con al menos 5 caracteres.')
      return
    }
    setSavingCancellation(true); setCancellationError('')
    try {
      await onCancelSale(cancellingSale, reason)
      setCancellingSale(null); setCancellationReason('')
    } catch (error) {
      setCancellationError(error.message || 'No fue posible anular la venta.')
    } finally { setSavingCancellation(false) }
  }
  return (
    <div className="page-wrap">
      <PageHeader eyebrow="Control comercial" title="Ventas" description="Movimientos, pagos y abonos vinculados al contacto responsable." actions={hasPermission(user, PERMISSIONS.SALES_WRITE) && <button type="button" className="button button--primary" onClick={() => { setEditingSale(null); setSaleDraft(initialSaleDraft()); setContactSearch(''); setSaleOpen(true); setSaleError('') }}>Nueva venta</button>} />
      <section className="sales-metrics"><div><span>Venta en corte cargado</span><strong>{currency.format(total)}</strong><small>Temporada LMP 2026–2027</small></div><div><span>Cobrado en el corte</span><strong>{currency.format(paid)}</strong><small>{collectedPercentage}% del total cargado</small></div><div><span>Saldo en el corte</span><strong>{currency.format(Math.max(0, total - paid))}</strong><small>{partialCount} movimientos parciales</small></div><div><span>Abonos asociados</span><strong>{seats}</strong><small>{filteredSales.length} movimientos cargados</small></div></section>
      <section className="panel list-panel"><div className="toolbar"><label className="search-field"><span className="sr-only">Buscar venta</span><Icon name="search" size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar orden, contacto o zona…"/></label><div className="toolbar-filters"><select aria-label="Estatus de pago" value={payment} onChange={(event) => setPayment(event.target.value)}><option>Todos los pagos</option><option>Pendiente</option><option>Parcial</option><option>Pagado</option></select><select aria-label="Ejecutivo" value={owner} onChange={(event) => setOwner(event.target.value)}><option>Todos los ejecutivos</option>{owners.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Tipo de movimiento" value={kind} onChange={(event) => setKind(event.target.value)}><option>Todos los movimientos</option>{kinds.map((value) => <option key={value}>{value}</option>)}</select><label className="compact-date"><span>Desde</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label><label className="compact-date"><span>Hasta</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></label></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Número de orden</th><th>Fecha</th><th>Contacto</th><th>Zona</th><th>Abonos</th><th>Total</th><th>Cobrado</th><th>Ejecutivo</th><th>Pago</th><th>Estado comercial</th>{hasPermission(user, PERMISSIONS.SALES_WRITE) && <th>Acción</th>}</tr></thead><tbody>{filteredSales.map((sale) => <tr key={sale.id}><td><strong className="link-value">{sale.externalOrderNumber || sale.id}</strong></td><td>{sale.date}</td><td><strong>{sale.contact}</strong></td><td>{sale.zone}</td><td>{sale.seats}</td><td><strong>{currency.format(sale.total)}</strong></td><td>{currency.format(sale.paid)}</td><td>{sale.owner}</td><td><StatusPill>{sale.status}</StatusPill></td><td>{sale.commercialStatus || '—'}</td>{hasPermission(user, PERMISSIONS.SALES_WRITE) && <td><div className="sale-row-actions">{!['Cancelada', 'Reembolsada'].includes(sale.commercialStatus) && (sale.paid < sale.total ? <button type="button" className="text-button" onClick={() => { setPaymentSale(sale); setPaymentDraft({ amount: '', method: 'Transferencia', paidAt: new Date().toISOString().slice(0, 10), reference: '' }); setPaymentError('') }}>Registrar cobro</button> : <span>Liquidado</span>)}{!['Cancelada', 'Reembolsada'].includes(sale.commercialStatus) && <><button type="button" className="text-button" onClick={() => openSaleCorrection(sale)}>Corregir venta</button><button type="button" className="text-button text-button--danger" onClick={() => { setCancellingSale(sale); setCancellationReason(''); setCancellationError('') }}>Anular venta</button></>}</div></td>}</tr>)}</tbody></table>{!filteredSales.length && <EmptyState title="Sin movimientos" body="No hay ventas que coincidan con los filtros seleccionados." />}</div><div className="table-footer"><span>{filteredSales.length} de {sales.length} movimientos cargados</span><small>Los indicadores y la tabla responden a los filtros. Las anulaciones, correcciones y pagos conservan historial de auditoría.</small></div></section>
      {cancellingSale && <div className="drawer-backdrop" role="presentation"><aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="cancel-sale-title"><header className="drawer-header"><div><span className="eyebrow">Anulación auditada</span><h2 id="cancel-sale-title">Anular orden {cancellingSale.externalOrderNumber || cancellingSale.id}</h2><p>Dejará de contar en Ventas, Abonos activos y Segmentación. El historial original permanecerá disponible para auditoría.</p></div><button type="button" className="icon-button" aria-label="Cerrar" disabled={savingCancellation} onClick={() => setCancellingSale(null)}>×</button></header><form onSubmit={submitCancellation}><div className="drawer-body"><label className="field"><span>Motivo de la anulación *</span><textarea autoFocus required minLength="5" maxLength="500" rows="4" value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} placeholder="Ej. Registro duplicado del mismo cliente."/></label>{cancellationError && <p className="manual-submit-error" role="alert">{cancellationError}</p>}</div><footer className="drawer-footer"><button type="button" className="button button--secondary" disabled={savingCancellation} onClick={() => setCancellingSale(null)}>Conservar venta</button><button type="submit" className="button button--danger" disabled={savingCancellation}>{savingCancellation ? 'Anulando…' : 'Confirmar anulación'}</button></footer></form></aside></div>}
      {paymentSale && <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingPayment) setPaymentSale(null) }}><aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="payment-title"><header className="drawer-header"><div><span className="eyebrow">Control de cobranza</span><h2 id="payment-title">Registrar cobro</h2><p>{paymentSale.contact} · Saldo {currency.format(Math.max(0, paymentSale.total - paymentSale.paid))}</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setPaymentSale(null)}>×</button></header><form onSubmit={submitPayment}><div className="drawer-body"><div className="form-grid"><label className="field"><span>Importe recibido *</span><input autoFocus type="number" min="0.01" step="0.01" value={paymentDraft.amount} onChange={(event) => setPaymentDraft((current) => ({ ...current, amount: event.target.value }))}/></label><label className="field"><span>Método *</span><select value={paymentDraft.method} onChange={(event) => setPaymentDraft((current) => ({ ...current, method: event.target.value }))}><option>Transferencia</option><option>Tarjeta</option><option>Efectivo</option><option>Depósito</option><option>Otro</option></select></label><label className="field"><span>Fecha *</span><input type="date" value={paymentDraft.paidAt} onChange={(event) => setPaymentDraft((current) => ({ ...current, paidAt: event.target.value }))}/></label><label className="field"><span>Referencia</span><input maxLength="160" value={paymentDraft.reference} onChange={(event) => setPaymentDraft((current) => ({ ...current, reference: event.target.value }))}/></label></div>{paymentError && <p className="manual-submit-error" role="alert">{paymentError}</p>}</div><footer className="drawer-footer"><button type="button" className="button button--secondary" onClick={() => setPaymentSale(null)}>Cancelar</button><button type="submit" className="button button--primary" disabled={savingPayment}>{savingPayment ? 'Guardando…' : 'Guardar cobro'}</button></footer></form></aside></div>}
      {saleOpen && <div className="drawer-backdrop" role="presentation"><aside className="drawer drawer--manual" role="dialog" aria-modal="true" aria-labelledby="sale-title"><header className="drawer-header"><div><span className="eyebrow">{editingSale ? 'Corrección auditada' : 'Alta guiada'}</span><h2 id="sale-title">{editingSale ? 'Corregir venta' : 'Nueva venta'}</h2><p>{editingSale ? 'Modifica los datos comerciales. La venta original y sus cobros se conservarán en el historial.' : 'La orden, sus abonos y el cobro inicial quedarán vinculados al titular.'}</p></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={closeSaleDrawer}>×</button></header><form onSubmit={submitSale}><div className="drawer-body"><div className="form-grid">
        <label className="field"><span>Número de orden *</span><input autoFocus required maxLength="80" value={saleDraft.externalOrderNumber} onChange={(event) => setSaleDraft((current) => ({ ...current, externalOrderNumber: event.target.value }))} placeholder="Ej. 26000123"/><small>Identificador único de la venta.</small></label>
        <label className="field"><span>Cierre *</span><select value={saleDraft.closeStage} onChange={(event) => setSaleDraft((current) => ({ ...current, closeStage: event.target.value }))}><option value="reserved">Apartado</option><option value="won">Ganado</option></select></label>
        <label className="field field--full"><span>Buscar titular</span><input value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} placeholder="Escribe nombre o apellido…"/><small>Filtra el acervo completo de contactos, incluidos prospectos.</small></label>
        <label className="field field--full"><span>Titular *</span><select value={saleDraft.contactId} onChange={(event) => setSaleDraft((current) => ({ ...current, contactId: event.target.value }))}><option value="">Selecciona una persona</option>{filteredContactOptions.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select><small>¿No existe? <button type="button" className="text-button" onClick={() => { setSaleOpen(false); onClearSaleClosure(); onCreate('prospect', { resumeSale: true }) }}>Crear contacto nuevo y continuar la venta</button></small></label>
        <details className="field field--full holder-distribution"><summary>Distribuir la orden entre varios titulares</summary><p>Opcional. Si no agregas personas, todos los abonos pertenecerán al titular principal.</p><div className="holder-primary"><strong>Titular principal</strong><span>{Math.max(0, Number(saleDraft.quantity || 0) - saleDraft.additionalHolders.reduce((sum, holder) => sum + Number(holder.quantity || 0), 0))} abonos</span></div>{saleDraft.additionalHolders.map((holder, index) => <div className="holder-row" key={`holder-${index}`}><label className="field"><span>Titular adicional *</span><select value={holder.contactId} onChange={(event) => setSaleDraft((current) => ({ ...current, additionalHolders: current.additionalHolders.map((item, itemIndex) => itemIndex === index ? { ...item, contactId: event.target.value } : item) }))}><option value="">Selecciona una persona</option>{contactOptions.filter((contact) => contact.id !== saleDraft.contactId).map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}</select></label><label className="field"><span>Abonos *</span><input type="number" min="1" max={Math.max(1, Number(saleDraft.quantity || 1) - 1)} value={holder.quantity} onChange={(event) => setSaleDraft((current) => ({ ...current, additionalHolders: current.additionalHolders.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value } : item) }))}/></label><button type="button" className="text-button text-button--danger" onClick={() => setSaleDraft((current) => ({ ...current, additionalHolders: current.additionalHolders.filter((_, itemIndex) => itemIndex !== index) }))}>Quitar</button></div>)}<button type="button" className="button button--secondary" disabled={Number(saleDraft.quantity || 0) < 2} onClick={() => setSaleDraft((current) => ({ ...current, additionalHolders: [...current.additionalHolders, { contactId: '', quantity: 1 }] }))}>Agregar titular</button></details>
        <label className="field"><span>Tipo *</span><select value={saleDraft.kind} onChange={(event) => setSaleDraft((current) => ({ ...current, kind: event.target.value }))}><option value="new">Abono nuevo</option><option value="renewal">Renovación</option></select></label>
        <label className="field"><span>Ejecutivo *</span><select value={saleDraft.executiveId} onChange={(event) => setSaleDraft((current) => ({ ...current, executiveId: event.target.value }))}><option value="">Selecciona</option>{availableExecutives.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
        <label className="field"><span>Fecha *</span><input type="date" value={saleDraft.soldAt} onChange={(event) => setSaleDraft((current) => ({ ...current, soldAt: event.target.value }))}/></label>
        <label className="field"><span>Zona *</span><select value={saleDraft.localityCode} onChange={(event) => { const locality = saleLocalities.find((item) => item.code === event.target.value); setSaleDraft((current) => ({ ...current, localityCode: event.target.value, zone: locality?.displayName || '', unitPrice: '', promotion2x1: false })) }}><option value="">Selecciona una zona</option>{saleLocalities.map((item) => <option key={item.code} value={item.code}>{item.displayName}</option>)}</select></label>
        <label className="field"><span>Descuento o campaña *</span><select value={saleDraft.discountCode} onChange={(event) => setSaleDraft((current) => ({ ...current, discountCode: event.target.value }))}><option value="">Selecciona conscientemente</option>{saleDiscounts.map((item) => <option key={item.code} value={item.code}>{item.displayName}</option>)}</select><small>Usa las mismas reglas oficiales del abono del contacto.</small></label>
        <label className="field"><span>Cantidad de abonos *</span><input type="number" min="1" max="20" value={saleDraft.quantity} onChange={(event) => setSaleDraft((current) => ({ ...current, quantity: event.target.value }))}/></label>
        <label className="field"><span>Precio con descuento por unidad *</span><input type="number" min="0" step="0.01" readOnly value={saleDraft.unitPrice}/><small>{saleQuoteState === 'loading' ? 'Calculando con el catálogo…' : saleQuoteState === 'error' ? saleQuoteError : saleQuote ? `${saleQuote.discountName} · Lista ${currency.format(saleQuote.commercialValue)} · Descuento ${currency.format(saleQuote.discountAmount)} · Total ${currency.format(draftDocumentedTotal)}${saleQuote.pricingMode === 'two_for_one' ? ` · ${saleQuote.chargedUnits} con cargo + ${saleQuote.bonusUnits} bonificados` : ''}` : 'Selecciona zona, descuento y cantidad.'}</small></label>
        <details className="field field--full seat-secondary-details"><summary>Datos secundarios por butaca</summary><p>Opcional. Puedes guardar la orden sin completar butaca, talla o personalización.</p><div className="seat-secondary-grid">{Array.from({ length: Math.max(1, Number(saleDraft.quantity || 1)) }, (_, index) => { const detail = saleDraft.seatDetails[index] || {}; return <fieldset key={`sale-seat-${index + 1}`}><legend>Abono {index + 1}</legend><label className="field"><span>Butaca</span><input maxLength="100" value={detail.seatIdentifier || ''} onChange={(event) => updateSaleSeatDetail(index, 'seatIdentifier', event.target.value)} placeholder="Ej. 112-A-7"/></label><label className="field"><span>Talla de jersey</span><select value={detail.jerseySize || ''} onChange={(event) => updateSaleSeatDetail(index, 'jerseySize', event.target.value)}><option value="">Sin definir</option><option>S</option><option>M</option><option>L</option><option>XL</option><option>2XL</option></select></label><label className="field field--full"><span>Personalización-butaca</span><input maxLength="120" value={detail.personalization || ''} onChange={(event) => updateSaleSeatDetail(index, 'personalization', event.target.value)} placeholder="Opcional"/></label></fieldset> })}</div></details>
        {!editingSale && <><label className="field"><span>Cobro inicial</span><input type="number" min="0" step="0.01" value={saleDraft.paymentAmount} onChange={(event) => setSaleDraft((current) => ({ ...current, paymentAmount: event.target.value }))}/><small>Puede ser $0, apartado o liquidación. Saldo: {currency.format(Math.max(0, draftDocumentedTotal - Number(saleDraft.paymentAmount || 0)))}</small></label><label className="field"><span>Método</span><select value={saleDraft.paymentMethod} onChange={(event) => setSaleDraft((current) => ({ ...current, paymentMethod: event.target.value }))}><option>Transferencia</option><option>Tarjeta</option><option>Efectivo</option><option>Depósito</option><option>Otro</option></select></label><label className="field"><span>Referencia del cobro</span><input value={saleDraft.paymentReference} onChange={(event) => setSaleDraft((current) => ({ ...current, paymentReference: event.target.value }))}/></label></>}
        <label className="field field--full"><span>Notas</span><textarea rows="3" value={saleDraft.notes} onChange={(event) => setSaleDraft((current) => ({ ...current, notes: event.target.value }))}/></label>
        {editingSale && <label className="field field--full"><span>Motivo de la corrección *</span><textarea autoFocus required minLength="5" maxLength="500" rows="3" value={saleDraft.correctionReason} onChange={(event) => setSaleDraft((current) => ({ ...current, correctionReason: event.target.value }))} placeholder="Describe qué dato estaba incorrecto y por qué se corrige."/><small>Quedará registrado en la bitácora de auditoría. Los cobros existentes no se modifican.</small></label>}
        </div>{saleError && <p className="manual-submit-error" role="alert">{saleError}</p>}</div><footer className="drawer-footer"><button type="button" className="button button--secondary" onClick={closeSaleDrawer}>Cancelar</button><button type="submit" className="button button--primary" disabled={savingSale}>{savingSale ? 'Guardando…' : editingSale ? 'Guardar corrección' : saleDraft.closeStage === 'won' ? 'Registrar venta ganada' : 'Registrar apartado'}</button></footer></form></aside></div>}
    </div>
  )
}

function MorePage({ page, isDemo, campaigns, configurationFixtures }) {
  const config = {
    campaigns: { eyebrow: 'Comunicación responsable', title: 'Campañas y envíos', description: 'Audiencias, consentimiento y resultados separados del contacto humano.', icon: 'send' },
    rewards: { eyebrow: 'Fidelidad', title: 'Recompensas', description: 'Hitos, beneficios y canjes de abonados en una vista controlada.', icon: 'star' },
    catalogs: { eyebrow: 'Configuración', title: 'Catálogos', description: 'Estatus, canales, zonas, productos y precios versionados por temporada.', icon: 'layers' },
  }[page]
  return (
    <div className="page-wrap">
      <PageHeader eyebrow={config.eyebrow} title={config.title} description={config.description} />
      {page === 'campaigns' ? <CampaignsTable campaigns={campaigns} /> : <ConfigurationPanel content={configurationFixtures[page] || []} config={config} isDemo={isDemo} />}
    </div>
  )
}

function CampaignsTable({ campaigns }) {
  return <section className="panel list-panel"><div className="notice notice--important"><Icon name="shield" size={19}/><div><strong>Envíos todavía no habilitados</strong><p>El módulo no habilita envíos hasta conectar un API que valide el consentimiento de cada destinatario.</p></div></div>{campaigns.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Campaña</th><th>Enviados</th><th>Entregados</th><th>Respuestas</th><th>Tasa de respuesta</th><th>Estatus</th></tr></thead><tbody>{campaigns.map((campaign) => <tr key={campaign.name}><td><strong>{campaign.name}</strong></td><td>{campaign.sent.toLocaleString('es-MX')}</td><td>{campaign.delivered.toLocaleString('es-MX')}</td><td>{campaign.responses}</td><td>{campaign.delivered ? ((campaign.responses / campaign.delivered) * 100).toFixed(1) : '0.0'}%</td><td><StatusPill>{campaign.status}</StatusPill></td></tr>)}</tbody></table></div> : <EmptyState title="Sin campañas conectadas" body="El módulo está preparado, pero el API aún no publica un listado de campañas." />}</section>
}

function ConfigurationPanel({ content, config, isDemo }) {
  return <div className="configuration-grid"><section className="panel config-list"><div className="panel-heading"><div><span className="panel-kicker">{isDemo ? 'VISTA PREVIA' : 'FASE POSTERIOR'}</span><h2>{isDemo ? 'Elementos ilustrativos' : 'Sin función operativa en esta entrega'}</h2></div></div>{content.map(([name, detail, status]) => <button type="button" disabled key={name} aria-label={`${name}: función no disponible en esta entrega`}><span className="config-icon"><Icon name={config.icon}/></span><span><strong>{name}</strong><small>{detail}</small></span><StatusPill>{status}</StatusPill></button>)}{!content.length && <EmptyState title="Módulo pendiente" body="Esta primera entrega no consulta ni modifica datos para esta sección." />}</section><aside className="panel config-help"><span className="summary-icon summary-icon--blue"><Icon name={config.icon}/></span><h2>Alcance futuro</h2><p>Esta es únicamente una propuesta visual. Antes de activarla se deberán definir sus reglas, endpoints, permisos y eventos de auditoría.</p><ul><li>Sin acciones activas en esta versión</li><li>Sin almacenamiento local en el navegador</li><li>Implementación sujeta a aprobación</li></ul></aside></div>
}

function ContactDrawer({ drawer, user, onClose, onSave, onDelete, onRestore, onCreateInteraction, onCreateTask, onRequestSaleClosure, onSaveMembership, pricingCatalog, onQuoteMembershipPricing, executiveOptions = [] }) {
  const existing = drawer.contact || {}
  const memberships = (drawer.memberships || []).filter((item) => item.seasonCode === 'LMP-2026-27')
  const initialMembership = drawer.membership || currentSeasonMembership(memberships)
  const [selectedMembershipId, setSelectedMembershipId] = useState(initialMembership?.id || 'new')
  const membership = selectedMembershipId === 'new'
    ? null
    : memberships.find((item) => item.id === selectedMembershipId) || initialMembership || null
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [contactMethodError, setContactMethodError] = useState('')
  const [savingContact, setSavingContact] = useState(false)
  const [membershipSaving, setMembershipSaving] = useState(false)
  const [actionSaving, setActionSaving] = useState('')
  const [actionError, setActionError] = useState('')
  const headingRef = useRef(null)
  const [interactionDraft, setInteractionDraft] = useState({ channel: 'phone', outcome: '', notes: '', isHumanContact: true })
  const [taskDraft, setTaskDraft] = useState({ assignedTo: existing.executiveId || user.id, dueAt: localDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)), priority: 'normal', description: '' })
  const nameParts = String(existing.name || '').trim().split(/\s+/)
  const initialForm = {
    id: existing.id,
    rowVersion: existing.rowVersion,
    firstName: existing.firstName || nameParts.slice(0, -1).join(' ') || nameParts[0] || '',
    lastName: existing.lastName || (nameParts.length > 1 ? nameParts.at(-1) : ''),
    email: existing.email || '',
    phone: existing.phone || '',
    type: existing.type || (drawer.kind === 'prospect' ? 'Prospecto' : 'Por renovar'),
    stage: existing.stage || 'Sin contactar',
    seasons: existing.seasons ?? 0,
    declaredSeasons: existing.declaredSeasons,
    seats: existing.seats ?? 1,
    zone: existing.zone || 'Sin definir',
    municipality: existing.municipality || '',
    executive: existing.executive || 'Sin asignar',
    executiveId: existing.executiveId || '',
    consent: existing.consent || 'No consta',
    note: existing.note || '',
    lastContact: existing.lastContact || 'Sin contacto humano',
    nextTask: existing.nextTask || 'Sin tarea',
    channel: existing.channel || '—',
    preferredChannel: existing.preferredChannel || '',
    businessSourceLabel: existing.businessSourceLabel || 'No consta',
  }
  const [form, setForm] = useState(initialForm)
  const editing = drawer.mode === 'edit'
  const deleted = Boolean(existing.deletedAt)
  const mayEdit = !deleted && (editing ? canEditContacts(user, existing) : canCreateContacts(user))
  const mayDelete = !deleted && canDeleteContacts(user)
  const mayRestore = deleted && canRestoreContacts(user)
  const mayAssign = hasPermission(user, PERMISSIONS.CONTACT_ASSIGN)
  const mayChangeSubscriberStatus = hasPermission(user, PERMISSIONS.MEMBERSHIP_WRITE)
  const mayChangeConsent = hasPermission(user, PERMISSIONS.CONTACT_WRITE_ALL)
  const mayManageMembership = editing && !deleted && hasPermission(user, PERMISSIONS.MEMBERSHIP_WRITE)
  const mayLogInteraction = editing && !deleted && canEditContacts(user, existing) && hasPermission(user, PERMISSIONS.INTERACTION_WRITE)
  const mayCreateTask = editing && !deleted && canEditContacts(user, existing)
    && (hasPermission(user, PERMISSIONS.TASK_WRITE_ALL) || hasPermission(user, PERMISSIONS.TASK_WRITE_ASSIGNED))
  const mayAssignTask = hasPermission(user, PERMISSIONS.TASK_WRITE_ALL)

  useEffect(() => {
    if (!drawer.focusMembership) headingRef.current?.focus()
  }, [drawer.focusMembership])

  useEffect(() => {
    const available = memberships.some((item) => item.id === selectedMembershipId)
    if (selectedMembershipId !== 'new' && !available) {
      setSelectedMembershipId(initialMembership?.id || 'new')
    }
  }, [initialMembership?.id, memberships, selectedMembershipId])

  useEffect(() => {
    function handleKeyDown(event) { if (event.key === 'Escape' && !savingContact && !membershipSaving && !actionSaving) onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [actionSaving, membershipSaving, onClose, savingContact])

  function update(field, value) {
    if (field === 'email' || field === 'phone') setContactMethodError('')
    setForm((current) => ({ ...current, [field]: value }))
  }
  async function submit(event) {
    event.preventDefault()
    if (savingContact || membershipSaving) return
    if (!form.email.trim() && !form.phone.trim()) {
      setContactMethodError('Captura al menos un correo o un teléfono para continuar.')
      return
    }
    setContactMethodError('')
    const changedFields = Object.keys(form).filter((field) => form[field] !== initialForm[field])
    if (editing && changedFields.includes('stage') && ['Apartado', 'Ganado'].includes(form.stage)) {
      const remainingChanges = changedFields.filter((field) => field !== 'stage')
      if (remainingChanges.length) {
        setContactMethodError('Guarda primero los demás cambios; después selecciona Apartado o Ganado para completar la venta.')
        return
      }
      onRequestSaleClosure(existing, form.stage)
      return
    }
    setSavingContact(true)
    try {
      await onSave({ ...form, changedFields })
    } catch {
      // El contenedor conserva el panel abierto y muestra el error global.
    } finally {
      setSavingContact(false)
    }
  }

  async function registerInteraction() {
    if (actionSaving) return
    if (!interactionDraft.outcome.trim() || !interactionDraft.notes.trim()) {
      setActionError('Captura el resultado y las notas de la interacción.')
      return
    }
    setActionSaving('interaction')
    setActionError('')
    try {
      await onCreateInteraction(existing, { ...interactionDraft, outcome: interactionDraft.outcome.trim(), notes: interactionDraft.notes.trim(), occurredAt: new Date().toISOString() })
      setInteractionDraft({ channel: 'phone', outcome: '', notes: '', isHumanContact: true })
    } catch {
      setActionError('No fue posible registrar la interacción. Revisa los datos e intenta nuevamente.')
    } finally {
      setActionSaving('')
    }
  }

  async function scheduleTask() {
    if (actionSaving) return
    if (!taskDraft.assignedTo || !taskDraft.dueAt || !taskDraft.description.trim()) {
      setActionError('Captura responsable, fecha y descripción de la tarea.')
      return
    }
    setActionSaving('task')
    setActionError('')
    try {
      await onCreateTask(existing, { ...taskDraft, assignedTo: mayAssignTask ? taskDraft.assignedTo : user.id, dueAt: new Date(taskDraft.dueAt).toISOString(), description: taskDraft.description.trim(), status: 'pending' })
      setTaskDraft((current) => ({ ...current, dueAt: localDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)), description: '' }))
    } catch {
      setActionError('No fue posible programar la tarea. Revisa los datos e intenta nuevamente.')
    } finally {
      setActionSaving('')
    }
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !savingContact && !membershipSaving && !actionSaving) onClose() }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" aria-busy={savingContact || membershipSaving || Boolean(actionSaving)}>
        <header className="drawer-header"><div><span className="eyebrow">{editing ? `ID ${existing.id}` : 'Nuevo registro'}</span><h2 id="drawer-title" ref={headingRef} tabIndex="-1">{editing ? existing.name : drawer.kind === 'prospect' ? 'Crear prospecto' : 'Crear contacto'}</h2></div><button className="icon-button" aria-label="Cerrar panel" disabled={savingContact || membershipSaving || Boolean(actionSaving)} onClick={onClose}><Icon name="close" size={21}/></button></header>
        <form onSubmit={submit}>
          <div className="drawer-body">
            {editing && <div className="contact-summary"><span className="large-avatar">{existing.initials || initials(existing.name)}</span><div><StatusPill>{existing.type}</StatusPill><span><Icon name="clock" size={14}/>Última gestión: {existing.lastContact}</span></div></div>}
            {deleted && <div className="notice notice--important"><Icon name="trash"/><div><strong>Registro eliminado</strong><p>Está visible únicamente para revisión y restauración autorizada.</p></div></div>}
            {!mayEdit && !deleted && <div className="notice"><Icon name="shield"/><div><strong>Vista de solo lectura</strong><p>Solo puedes editar contactos asignados a tu usuario o aquellos habilitados por tus permisos.</p></div></div>}
            <fieldset disabled={!mayEdit}>
              <legend>Datos del contacto</legend>
              <div className="form-grid">
                <label className="field"><span>Nombre(s) *</span><input required value={form.firstName} onChange={(event) => update('firstName', event.target.value)} placeholder="Nombre(s)"/></label>
                <label className="field"><span>Apellidos *</span><input required value={form.lastName} onChange={(event) => update('lastName', event.target.value)} placeholder="Apellidos"/></label>
                <label className="field"><span>Correo corporativo o personal</span><input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="nombre@correo.com" aria-invalid={Boolean(contactMethodError)} aria-describedby="contact-method-help"/></label>
                <label className="field"><span>Teléfono</span><input value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="33 0000 0000" aria-invalid={Boolean(contactMethodError)} aria-describedby="contact-method-help"/></label>
                <p id="contact-method-help" className={contactMethodError ? 'form-error field--full' : 'field-help field--full'} role={contactMethodError ? 'alert' : undefined}>{contactMethodError || 'Captura al menos correo o teléfono.'}</p>
                <label className="field field--full"><span>Municipio</span><input value={form.municipality} onChange={(event) => update('municipality', event.target.value)} placeholder="Municipio de residencia"/></label>
              </div>
            </fieldset>
            <fieldset disabled={!mayEdit}>
              <legend>Clasificación comercial</legend>
              <div className="form-grid">
                <label className="field"><span>Estatus de abonado</span><select disabled={editing && !mayChangeSubscriberStatus} value={form.type} onChange={(event) => update('type', event.target.value)}><option>Prospecto</option><option>Abonado actual</option><option>Por renovar</option><option>Abonado nuevo</option><option>Exabonado</option></select>{editing && !mayChangeSubscriberStatus && <small>Se actualiza desde membresías.</small>}</label>
                <label className="field"><span>Etapa comercial</span><select value={form.stage} onChange={(event) => update('stage', event.target.value)}><option>Sin contactar</option><option>Por contactar</option><option>Contactado</option><option>Seguimiento</option><option>Interesado</option><option>Apartado</option><option>Ganado</option><option>Perdido</option></select></label>
                {editing && <><div className="field"><span>Temporadas verificadas</span><output className="derived-value">{form.seasons || 'No consta'}</output><small>Calculadas desde membresías.</small></div><div className="field"><span>Temporadas declaradas</span><output className="derived-value">{form.declaredSeasons ?? 'No consta'}</output><small>Dato informado durante el alta.</small></div><div className="field"><span>Cantidad de abonos gestionados</span><output className="derived-value">{form.seats}</output><small>Incluye abonos activos y por renovar.</small></div><div className="field"><span>Origen comercial</span><output className="derived-value">{form.businessSourceLabel}</output><small>Capturado en el alta manual.</small></div></>}
                <label className="field"><span>Canal preferido</span><select value={form.preferredChannel} onChange={(event) => update('preferredChannel', event.target.value)}><option value="">Sin definir</option><option value="phone">Llamada</option><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="in_person">Presencial</option><option value="other">Otro</option></select></label>
                <label className="field"><span>Ejecutivo</span>{mayAssign ? <select value={form.executiveId} onChange={(event) => update('executiveId', event.target.value)}><option value="">Sin asignar</option>{form.executiveId && !executiveOptions.some((item) => item.id === form.executiveId) && <option value={form.executiveId}>{form.executive}</option>}{executiveOptions.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select> : <output className="derived-value">{editing ? form.executive : user.name}</output>} {!mayAssign && <small>{editing ? 'Requiere permiso de asignación.' : 'El alta se asignará automáticamente a tu cartera.'}</small>}</label>
                <label className="field field--full"><span>Consentimiento de contacto</span><select disabled={editing && !mayChangeConsent} value={form.consent} onChange={(event) => update('consent', event.target.value)}><option>Sí</option><option>No</option><option>No consta</option></select><small>{editing && !mayChangeConsent ? 'Solo Supervisor o Administrador puede modificar este dato.' : 'La fecha y la fuente del cambio se registran en el servidor.'}</small></label>
              </div>
            </fieldset>
            {editing && <section className="associated-sales" aria-labelledby="associated-sales-title"><div className="membership-orders-heading"><div><span className="eyebrow">Fuente comercial</span><h3 id="associated-sales-title">Órdenes asociadas</h3></div></div>{existing.associatedOrders?.length ? <div className="associated-sales-list">{existing.associatedOrders.map((order) => <article key={`${order.saleId}-${order.orderNumber}`}><div><strong>Orden {order.orderNumber}</strong><StatusPill>{order.status === 'reserved' ? 'Apartado' : order.status === 'confirmed' ? 'Ganado' : order.status}</StatusPill></div><span>{order.quantity} {Number(order.quantity) === 1 ? 'abono' : 'abonos'} · {order.segment || order.zone || 'Sin segmento'}{order.isPrimary ? ' · Titular principal' : ''}</span></article>)}</div> : <div className="manual-inline-note"><strong>Sin orden de venta asociada</strong><span>Este contacto no modifica los indicadores de venta hasta registrar una orden.</span></div>}</section>}
            {editing && membershipStatusForContact(existing) && <section className="membership-orders" aria-labelledby="membership-orders-title">
              <div className="membership-orders-heading"><div><span className="eyebrow">Detalle operativo</span><h3 id="membership-orders-title">Abonos del contacto</h3></div>{mayManageMembership && <button type="button" className="button button--secondary" disabled={membershipSaving} onClick={() => onRequestSaleClosure(existing, 'Apartado')}><Icon name="plus" size={16}/>Registrar otra orden</button>}</div>
              {memberships.length > 0 && <label className="field"><span>Orden de abonos</span><select disabled={membershipSaving} value={selectedMembershipId} onChange={(event) => setSelectedMembershipId(event.target.value)}>{selectedMembershipId === 'new' && <option value="new">Nueva orden</option>}{memberships.map((item, index) => <option key={item.id} value={item.id}>Orden {memberships.length - index} · {item.seatCount} {item.seatCount === 1 ? 'abono' : 'abonos'} · {item.localityName || item.membershipSection || 'Sin localidad'}</option>)}</select><small>{memberships.length} {memberships.length === 1 ? 'orden registrada' : 'órdenes registradas'} para la temporada actual.</small></label>}
              {membership ? <MembershipEditor key={membership.id} membership={membership} pricingCatalog={pricingCatalog} onQuote={onQuoteMembershipPricing} canEdit={mayManageMembership} focusOnMount={drawer.focusMembership} onSave={async (draft) => { const saved = await onSaveMembership(existing, membership, draft); setSelectedMembershipId(saved?.id || membership.id) }} onSavingChange={setMembershipSaving}/> : <div className="manual-inline-note"><strong>Sin detalle auxiliar</strong><span>Registra o completa la orden desde Ventas; los indicadores no se alimentan desde este apartado.</span></div>}
            </section>}
            <fieldset disabled={!mayEdit}>
              <legend>Seguimiento</legend>
              <label className="field"><span>Observación resumida</span><textarea rows="4" maxLength="500" value={form.note} onChange={(event) => update('note', event.target.value)} placeholder="Anota contexto útil para la siguiente gestión."/><small>{form.note.length}/500 caracteres</small></label>
            </fieldset>
            {(mayLogInteraction || mayCreateTask) && <section className="contact-actions" aria-labelledby="contact-actions-title"><div className="contact-actions-heading"><span className="eyebrow">Acciones operativas</span><h3 id="contact-actions-title">Registrar seguimiento</h3></div>{mayLogInteraction && <details><summary><Icon name="phone" size={17}/>Registrar interacción</summary><div className="action-form-grid"><label className="field"><span>Canal</span><select value={interactionDraft.channel} onChange={(event) => setInteractionDraft((current) => ({ ...current, channel: event.target.value }))}><option value="phone">Llamada</option><option value="whatsapp">WhatsApp</option><option value="email">Correo</option><option value="in_person">Presencial</option><option value="other">Otro</option></select></label><label className="field"><span>Resultado *</span><input value={interactionDraft.outcome} onChange={(event) => setInteractionDraft((current) => ({ ...current, outcome: event.target.value }))} maxLength="100" placeholder="Ej. Solicitó cotización"/></label><label className="field field--full"><span>Notas *</span><textarea rows="3" maxLength="5000" value={interactionDraft.notes} onChange={(event) => setInteractionDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Detalle verificable de la gestión."/></label><label className="check-field field--full"><input type="checkbox" checked={interactionDraft.isHumanContact} onChange={(event) => setInteractionDraft((current) => ({ ...current, isHumanContact: event.target.checked }))}/><span>Esta gestión cuenta como contacto humano</span></label><div className="action-submit field--full"><SecondaryButton type="button" icon="check" disabled={Boolean(actionSaving)} onClick={registerInteraction}>{actionSaving === 'interaction' ? 'Registrando…' : 'Registrar interacción'}</SecondaryButton></div></div></details>}{mayCreateTask && <details><summary><Icon name="calendar" size={17}/>Programar tarea</summary><div className="action-form-grid"><label className="field"><span>Responsable *</span>{mayAssignTask ? <select value={taskDraft.assignedTo} onChange={(event) => setTaskDraft((current) => ({ ...current, assignedTo: event.target.value }))}>{!executiveOptions.some((item) => item.id === user.id) && <option value={user.id}>{user.name}</option>}{executiveOptions.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select> : <output className="derived-value">{user.name}</output>}</label><label className="field"><span>Fecha y hora *</span><input type="datetime-local" value={taskDraft.dueAt} onChange={(event) => setTaskDraft((current) => ({ ...current, dueAt: event.target.value }))}/></label><label className="field"><span>Prioridad</span><select value={taskDraft.priority} onChange={(event) => setTaskDraft((current) => ({ ...current, priority: event.target.value }))}><option value="low">Baja</option><option value="normal">Media</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><label className="field field--full"><span>Descripción *</span><textarea rows="3" maxLength="2000" value={taskDraft.description} onChange={(event) => setTaskDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Siguiente paso concreto."/></label><div className="action-submit field--full"><SecondaryButton type="button" icon="calendar" disabled={Boolean(actionSaving)} onClick={scheduleTask}>{actionSaving === 'task' ? 'Programando…' : 'Programar tarea'}</SecondaryButton></div></div></details>}{actionError && <p className="form-error" role="alert">{actionError}</p>}</section>}
            {confirmDelete && <div className="delete-confirm" role="alert"><div><Icon name="trash" size={19}/><span><strong>¿Eliminar este contacto?</strong><small>El registro se ocultará, pero conservará su historial para restauración y auditoría.</small></span></div><label className="field delete-reason"><span>Motivo de la eliminación *</span><textarea required minLength="5" rows="2" value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Describe brevemente el motivo."/></label><div><SecondaryButton type="button" onClick={() => setConfirmDelete(false)}>Cancelar</SecondaryButton><button disabled={deleteReason.trim().length < 5} type="button" className="button button--danger" onClick={() => onDelete(existing, deleteReason.trim())}><Icon name="trash" size={16}/>Confirmar eliminación</button></div></div>}
          </div>
          <footer className="drawer-footer">
            {editing && mayDelete && !confirmDelete ? <button type="button" className="delete-button" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16}/>Eliminar</button> : mayRestore ? <button type="button" className="restore-button" onClick={() => onRestore(existing)}><Icon name="refresh" size={16}/>Restaurar contacto</button> : <span />}
            <div><SecondaryButton type="button" disabled={savingContact || membershipSaving} onClick={onClose}>Cancelar</SecondaryButton>{mayEdit && <PrimaryButton type="submit" icon="check" disabled={savingContact || membershipSaving}>{savingContact ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear contacto'}</PrimaryButton>}</div>
          </footer>
        </form>
      </aside>
    </div>
  )
}

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

export default App
