const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const ACCESS = 'duck-admin-access', REFRESH = 'duck-admin-refresh'
const sessionStore = () => localStorage.getItem(REFRESH) || localStorage.getItem(ACCESS) ? localStorage : sessionStorage
export const session = {
  get: () => localStorage.getItem(ACCESS) || sessionStorage.getItem(ACCESS),
  getRefresh: () => localStorage.getItem(REFRESH) || sessionStorage.getItem(REFRESH),
  set: (accessToken:string,refreshToken:string,remember:boolean) => {
    session.clear()
    const store=remember?localStorage:sessionStorage
    store.setItem(ACCESS,accessToken);store.setItem(REFRESH,refreshToken)
  },
  setAccess: (accessToken:string) => sessionStore().setItem(ACCESS,accessToken),
  clear: () => {
    localStorage.removeItem(ACCESS);localStorage.removeItem(REFRESH)
    sessionStorage.removeItem(ACCESS);sessionStorage.removeItem(REFRESH)
  },
}
let refreshPromise:Promise<boolean>|null=null
async function renewAccess(){
  const refreshToken=session.getRefresh()
  if(!refreshToken)return false
  if(!refreshPromise)refreshPromise=(async()=>{
    const response=await fetch(`${BASE}/admin/auth/refresh`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken})})
    if(!response.ok){session.clear();return false}
    const data=await response.json() as {accessToken:string}
    session.setAccess(data.accessToken);return true
  })().catch(()=>false).finally(()=>{refreshPromise=null})
  return refreshPromise
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response = await fetch(`${BASE}/admin${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(session.get() ? { Authorization: `Bearer ${session.get()}` } : {}), ...options.headers } })
  if(response.status===401&&!path.startsWith('/auth/')&&await renewAccess()){
    response=await fetch(`${BASE}/admin${path}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.get()}`,...options.headers}})
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.message || 'Falha na solicitação.')
  return body
}
export async function login(email: string, password: string, remember: boolean) {
  const data = await api<{accessToken:string;refreshToken:string;admin:Admin}>('/auth/login',{method:'POST',body:JSON.stringify({email,password})})
  session.set(data.accessToken,data.refreshToken,remember);return data.admin
}
export const money = (cents: number) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export type Admin={id:string;name:string;email:string;role:string}
