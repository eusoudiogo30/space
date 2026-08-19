import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { api, login, money, session, type Admin } from './api'
import { Icon, type IconName } from './Icon'

// Notificações e Antifraude foram tiradas da navegação a pedido — as páginas continuam existindo
// (rotas abaixo) para não perder o controle de fraude, só não aparecem mais no menu lateral.
const menu=[['/','Dashboard','dashboard'],['/usuarios','Usuários','users'],['/depositos','Depósitos','deposit'],['/saques','Saques','withdrawal'],['/afiliados','Afiliados','affiliate'],['/bonus-taxas','Bônus e taxas','gift'],['/economia','Economia','coins'],['/dificuldade-space','Dificuldade — Space','sliders'],['/configuracoes','Configurações gerais','settings'],['/gateway','Gateway & RTP','gateway']] as [string,string,IconName][]
const dateFmt=(v:unknown)=>v?new Date(String(v)).toLocaleString('pt-BR'):'—'
const STATUS_SUCCESS=['CONFIRMED','ACTIVE','COMPLETED','PAID','AVAILABLE','FINISHED','APPROVED','ATIVO','SIM']
const STATUS_DANGER=['FAILED','BLOCKED','CANCELED','CANCELLED','REJECTED','REFUNDED','RETAINED','DISPUTED','INVALIDATED','INACTIVE','BLOQUEADO','NÃO']
const statusClass=(value:string)=>{const v=value.toUpperCase();if(STATUS_SUCCESS.includes(v))return 'status-success';if(STATUS_DANGER.includes(v))return 'status-danger';if(['PENDING','PROCESSING','ABANDONED','OPEN'].includes(v))return 'status-warning';return 'status-neutral'}
function Status({value}:{value:string}){return <span className={`status ${statusClass(value)}`}>{value}</span>}

// Global save confirmation — every admin action that changes something calls notify() after a
// successful save, so there's always a clear, hard-to-miss confirmation on screen, not just a
// small inline message next to the button.
let toastSetter:((msg:string)=>void)|null=null
function notify(message:string){toastSetter?.(message)}
function ToastHost(){
  const [msg,setMsg]=useState('')
  useEffect(()=>{toastSetter=setMsg;return()=>{toastSetter=null}},[])
  useEffect(()=>{if(!msg)return;const t=setTimeout(()=>setMsg(''),3200);return()=>clearTimeout(t)},[msg])
  if(!msg)return null
  return <div className="toast-confirm"><Icon name="check-circle" size={16}/>{msg}</div>
}

function Login({onLogin}:{onLogin:(a:Admin)=>void}) {
  const [error,setError]=useState(''),[loading,setLoading]=useState(false)
  const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setLoading(true);const f=new FormData(e.currentTarget);try{onLogin(await login(String(f.get('email')),String(f.get('password'))))}catch(x){setError(x instanceof Error?x.message:'Erro')}finally{setLoading(false)}}
  return <main className="login"><section><div className="brand"><img src="/logo-topo.png" alt="Space Adventure" className="brand-logo"/><span>Admin</span></div><h1>Bem-vindo de volta</h1><p>Acesse o painel operacional.</p><form onSubmit={submit}><label>E-mail<input name="email" type="email" required/></label><label>Senha<input name="password" type="password" minLength={8} required/></label>{error&&<div className="error">{error}</div>}<button disabled={loading}>{loading?'Entrando…':'Entrar no painel'}</button></form></section></main>
}
function Layout({admin,onLogout}:{admin:Admin;onLogout:()=>void}) {
  const [unread,setUnread]=useState(0)
  useEffect(()=>{
    const load=()=>api<{unread:number}>('/notifications?read=false').then(d=>setUnread(d.unread)).catch(()=>{})
    load(); const timer=setInterval(load,30000); return ()=>clearInterval(timer)
  },[])
  const visibleMenu=admin.role==='SUPER_ADMIN'?[...menu,['/auditoria','Auditoria','list'] as [string,string,IconName]]:menu
  return <div className="layout"><ToastHost/><aside><div className="brand"><img src="/logo-topo.png" alt="Space Adventure" className="brand-logo"/><span>Admin</span></div><nav>{visibleMenu.map(([to,label,icon])=><NavLink key={to} to={to} end={to==='/'}><i><Icon name={icon} size={17}/></i>{label}{to==='/notificacoes'&&unread>0&&<em className="nav-badge">{unread}</em>}</NavLink>)}</nav><div className="account"><span>{admin.name[0]}</span><div><b>{admin.name}</b><small>{admin.role}</small></div><button onClick={onLogout} aria-label="Sair"><Icon name="logout" size={16}/></button></div></aside><main className="content"><Routes>
    <Route path="/" element={<Dashboard/>}/>
    <Route path="/usuarios" element={<UsersPage/>}/>
    <Route path="/depositos" element={<FinancePage title="Depósitos" endpoint="/deposits" statuses={['PENDING','PROCESSING','CONFIRMED','REFUNDED','FAILED','CANCELED']} isWithdrawal={false}/>}/>
    <Route path="/saques" element={<FinancePage title="Saques" endpoint="/withdrawals" statuses={['PENDING','APPROVED','PROCESSING','COMPLETED','REJECTED','FAILED','CANCELED','REFUNDED']} isWithdrawal/>}/>
    <Route path="/afiliados" element={<AffiliatesPage canEdit={admin.role==='SUPER_ADMIN'||admin.role==='ADMIN'}/>}/>
    <Route path="/bonus-taxas" element={<BonusPage canEdit={admin.role==='SUPER_ADMIN'||admin.role==='ADMIN'}/>}/>
    <Route path="/economia" element={<EconomyPage/>}/>
    <Route path="/notificacoes" element={<NotificationsPage onChange={n=>setUnread(n)}/>}/>
    <Route path="/dificuldade-space" element={<SpaceDifficultyPage canEdit={admin.role==='SUPER_ADMIN'||admin.role==='ADMIN'}/>}/>
    <Route path="/configuracoes" element={<SettingsPage canEdit={admin.role==='SUPER_ADMIN'||admin.role==='ADMIN'}/>}/>
    <Route path="/gateway" element={<GatewayPage canEdit={admin.role==='SUPER_ADMIN'}/>}/>
    <Route path="/antifraude" element={<FraudPage canEdit={admin.role==='SUPER_ADMIN'||admin.role==='ADMIN'}/>}/>
    <Route path="/auditoria" element={<AuditLogPage/>}/>
  </Routes></main></div>
}
function Header({title,subtitle,children}:{title:string;subtitle:string;children?:ReactNode}){return <header><div><h1>{title}</h1><p>{subtitle}</p></div>{children}</header>}

// ---------- Dashboard ----------
type ChartRow={bucket:string;deposits?:number;withdrawals?:number;wagered?:number;paid?:number;rounds?:number;referrals?:number;newAffiliates?:number}
type DashboardData={
  users:number;activeUsers:number;games:number;finished:number;newUsers:number;completionRate:number;
  coinsDistributed:number;fraudAlerts:number;averageScore:number;highestScore:number;
  totalDeposits:number;pendingDeposits:number;depositsCount:number;
  totalWithdrawals:number;pendingWithdrawals:number;withdrawalsCount:number;
  totalWagered:number;totalPaid:number;grossProfit:number;actualRtp:number;rounds:number;
  charts:{financial:ChartRow[];games:ChartRow[]};
  recentDeposits:{id:string;amount:number;status:string;createdAt:string;user?:{name:string;email:string|null}}[];
  recentUsers:{name:string;email:string|null;createdAt:string;isActive:boolean}[];
}
// Catmull-Rom-to-Bezier smoothing (tension 1/6) — turns a plain point-to-point polyline into a
// curved SVG path without needing a charting library.
function smoothPath(points:[number,number][]):string{
  if(points.length<2)return points.length?`M ${points[0]![0]},${points[0]![1]}`:''
  let d=`M ${points[0]![0]},${points[0]![1]}`
  for(let i=0;i<points.length-1;i++){
    const p0=points[i-1]||points[i]!,p1=points[i]!,p2=points[i+1]!,p3=points[i+2]||p2
    const c1x=p1[0]+(p2[0]-p0[0])/6,c1y=p1[1]+(p2[1]-p0[1])/6
    const c2x=p2[0]-(p3[0]-p1[0])/6,c2y=p2[1]-(p3[1]-p1[1])/6
    d+=` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`
  }
  return d
}
const CHART_W=600,CHART_H=170,CHART_PAD=8
function CurveChart({rows,aKey,bKey,aLabel,bLabel,labelFn,aFormat=money,bFormat=money}:{rows:ChartRow[];aKey:keyof ChartRow;bKey:keyof ChartRow;aLabel:string;bLabel:string;labelFn:(bucket:string)=>string;aFormat?:(v:number)=>string;bFormat?:(v:number)=>string}){
  const [hover,setHover]=useState<number|null>(null)
  const max=Math.max(1,...rows.flatMap(r=>[Number(r[aKey])||0,Number(r[bKey])||0]))
  const n=rows.length
  const stepX=n>1?CHART_W/(n-1):CHART_W
  const toY=(v:number)=>CHART_H-CHART_PAD-(v/max)*(CHART_H-CHART_PAD*2)
  const aPoints:[number,number][]=rows.map((r,i)=>[i*stepX,toY(Number(r[aKey])||0)])
  const bPoints:[number,number][]=rows.map((r,i)=>[i*stepX,toY(Number(r[bKey])||0)])
  const aPath=smoothPath(aPoints),bPath=smoothPath(bPoints)
  const labelEvery=Math.max(1,Math.ceil(n/6))
  const onMove=(e:ReactMouseEvent<SVGSVGElement>)=>{
    const rect=e.currentTarget.getBoundingClientRect()
    const relX=((e.clientX-rect.left)/rect.width)*CHART_W
    const idx=n>1?Math.round(relX/stepX):0
    setHover(Math.max(0,Math.min(n-1,idx)))
  }
  const active=hover!==null?rows[hover]:undefined
  const tooltipLeft=hover!==null?Math.min(85,Math.max(15,n>1?(hover/(n-1))*100:50)):50
  return <div className="curve-chart">
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" className="curve-chart__svg"
      onMouseMove={onMove} onMouseLeave={()=>setHover(null)}>
      <path d={`${aPath} L ${(n-1)*stepX},${CHART_H} L 0,${CHART_H} Z`} className="curve-chart__area curve-chart__area--a"/>
      <path d={`${bPath} L ${(n-1)*stepX},${CHART_H} L 0,${CHART_H} Z`} className="curve-chart__area curve-chart__area--b"/>
      <path d={bPath} className="curve-chart__line curve-chart__line--b" fill="none"/>
      <path d={aPath} className="curve-chart__line curve-chart__line--a" fill="none"/>
      {hover!==null&&<line x1={hover*stepX} x2={hover*stepX} y1={0} y2={CHART_H} className="curve-chart__hover-line"/>}
      {hover!==null&&<circle cx={aPoints[hover]![0]} cy={aPoints[hover]![1]} r={4} className="curve-chart__dot curve-chart__dot--a"/>}
      {hover!==null&&<circle cx={bPoints[hover]![0]} cy={bPoints[hover]![1]} r={4} className="curve-chart__dot curve-chart__dot--b"/>}
    </svg>
    {active&&<div className="curve-chart__tooltip" style={{left:`${tooltipLeft}%`}}>
      <b>{labelFn(active.bucket)}</b>
      <span className="curve-chart__tooltip-a">{aLabel}: {aFormat(Number(active[aKey])||0)}</span>
      <span className="curve-chart__tooltip-b">{bLabel}: {bFormat(Number(active[bKey])||0)}</span>
    </div>}
    <div className="curve-chart__labels">
      {rows.map((r,i)=>(i%labelEvery===0||i===n-1)&&<span key={r.bucket} style={{left:`${n>1?(i/(n-1))*100:50}%`}}>{labelFn(r.bucket)}</span>)}
    </div>
  </div>
}
function Dashboard(){
  const [data,setData]=useState<DashboardData|null>(null),[period,setPeriod]=useState('today')
  useEffect(()=>{api<DashboardData>(`/dashboard?period=${period}`).then(setData)},[period])
  const cards=data?[
    ['Jogadores',data.users.toLocaleString('pt-BR'),'users'],['Novos usuários',data.newUsers.toLocaleString('pt-BR'),'user-plus'],
    ['Total depositado',money(data.totalDeposits),'deposit',1],['Depósitos pendentes',String(data.pendingDeposits),'clock'],
    ['Total sacado',money(data.totalWithdrawals),'withdrawal',-1],['Saques pendentes',String(data.pendingWithdrawals),'clock'],
    ['Total apostado',money(data.totalWagered),'game',1],['Total pago em prêmios',money(data.totalPaid),'coins',-1],
    ['Lucro bruto',money(data.grossProfit),'check-circle',data.grossProfit>=0?1:-1],['RTP real',`${data.actualRtp.toLocaleString('pt-BR')}%`,'percent'],
    ['Rodadas finalizadas',data.rounds.toLocaleString('pt-BR'),'trophy'],['Alertas de fraude',String(data.fraudAlerts),'alert-triangle',data.fraudAlerts>0?-1:undefined],
  ] as [string,string,IconName,(1|-1|undefined)?][]:[]
  const bucketLabel=(iso:string)=>period==='today'?new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit'}):new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})
  return <><Header title="Visão geral" subtitle="Indicadores reais da operação."><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="today">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option></select></Header>
    <div className="cards">{cards.map(([l,v,i,sign])=><article key={String(l)}><i><Icon name={i} size={17}/></i><small>{l}</small><strong className={sign===1?'amount-positive':sign===-1?'amount-negative':''}>{data?v:'—'}</strong></article>)}</div>
    {data&&<section className="chart-grid">
      <article className="panel chart-panel"><div className="panel-heading"><h2>Fluxo financeiro</h2><p>Depósitos confirmados e saques concluídos.</p></div>
        <div className="legend"><span><i className="deposit-dot"/>Depósitos</span><span><i className="withdrawal-dot"/>Saques</span></div>
        <CurveChart rows={data.charts.financial} aKey="deposits" bKey="withdrawals" aLabel="Depósitos" bLabel="Saques" labelFn={bucketLabel}/>
      </article>
      <article className="panel chart-panel"><div className="panel-heading"><h2>Desempenho das jogadas</h2><p>Valores apostados e prêmios pagos.</p></div>
        <div className="legend"><span><i className="wager-dot"/>Apostado</span><span><i className="paid-dot"/>Pago</span></div>
        <CurveChart rows={data.charts.games} aKey="wagered" bKey="paid" aLabel="Apostado" bLabel="Pago" labelFn={bucketLabel}/>
      </article>
    </section>}
    {data&&<section className="dashboard-tables">
      <article className="panel"><div className="panel-heading"><h2>Depósitos recentes</h2><p>Últimas solicitações registradas.</p></div>
        <div className="table-wrap"><table><thead><tr><th>Usuário</th><th>Valor</th><th>Status</th><th>Data</th></tr></thead><tbody>
        {data.recentDeposits.map(d=><tr key={d.id}><td>{d.user?.name||'—'}<small>{d.user?.email||''}</small></td><td>{money(d.amount)}</td><td><Status value={d.status}/></td><td>{dateFmt(d.createdAt)}</td></tr>)}
        {!data.recentDeposits.length&&<tr><td colSpan={4} className="empty">Nenhum depósito.</td></tr>}
        </tbody></table></div>
      </article>
      <article className="panel"><div className="panel-heading"><h2>Novos usuários</h2><p>Cadastros mais recentes da plataforma.</p></div>
        <div className="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Status</th><th>Cadastro</th></tr></thead><tbody>
        {data.recentUsers.map((u,i)=><tr key={i}><td>{u.name}</td><td>{u.email}</td><td><Status value={u.isActive?'Ativo':'Bloqueado'}/></td><td>{dateFmt(u.createdAt)}</td></tr>)}
        {!data.recentUsers.length&&<tr><td colSpan={4} className="empty">Nenhum usuário.</td></tr>}
        </tbody></table></div>
      </article>
    </section>}
  </>
}

// ---------- Dificuldade — Space Adventure ----------
type SpaceDifficulty={preset:string;minFallMs:number;maxFallMs:number;spawnGapMs:number;rampWindowMs:number;rockFrequency:number;coinFrequency:number;boostFrequency:number;boostDurationMs:number;maximumScore:number;hitRadius:number;hitRadiusY:number;freeRtpPercentage:number;shipSpeed:number;multiplierPerFloor:number;boostRockFrequency:number;updatedAt:string}
const spaceDifficultyPresets:{key:string;name:string;level:string;color:string;description:string;profile:Omit<SpaceDifficulty,'preset'|'updatedAt'|'freeRtpPercentage'|'shipSpeed'|'multiplierPerFloor'|'boostRockFrequency'>}[]=[
  {key:'easy',name:'Fácil',level:'RISCO BAIXO',color:'#42ca9c',description:'Poucas pedras, muitas moedas. Queda lenta e a velocidade quase não aumenta durante o voo.',profile:{minFallMs:1200,maxFallMs:2000,spawnGapMs:750,rampWindowMs:120000,rockFrequency:18,coinFrequency:72,boostFrequency:10,boostDurationMs:3500,maximumScore:10000,hitRadius:0.13,hitRadiusY:0.10}},
  {key:'medium',name:'Médio',level:'RISCO EQUILIBRADO',color:'#4fc7ff',description:'Mistura equilibrada de pedras e moedas, com aumento de velocidade moderado ao longo do voo.',profile:{minFallMs:950,maxFallMs:1650,spawnGapMs:620,rampWindowMs:60000,rockFrequency:42,coinFrequency:46,boostFrequency:12,boostDurationMs:3000,maximumScore:10000,hitRadius:0.11,hitRadiusY:0.08}},
  {key:'hard',name:'Difícil',level:'RISCO ALTO',color:'#ffb545',description:'Muito mais pedras que moedas, e a velocidade sobe rápido logo nos primeiros segundos do voo.',profile:{minFallMs:650,maxFallMs:1400,spawnGapMs:480,rampWindowMs:20000,rockFrequency:65,coinFrequency:25,boostFrequency:10,boostDurationMs:2000,maximumScore:10000,hitRadius:0.09,hitRadiusY:0.07}},
  {key:'very_hard',name:'Muito Difícil',level:'RISCO MUITO ALTO',color:'#ff8a4a',description:'Quase só pedra na tela, queda bem rápida e velocidade máxima atingida em poucos segundos.',profile:{minFallMs:500,maxFallMs:1100,spawnGapMs:380,rampWindowMs:10000,rockFrequency:75,coinFrequency:17,boostFrequency:8,boostDurationMs:1500,maximumScore:10000,hitRadius:0.08,hitRadiusY:0.06}},
  {key:'extreme',name:'Extra Difícil',level:'RISCO EXTREMO',color:'#ff5c7a',description:'Já começa na velocidade máxima, praticamente sem rampa de aceleração — quase tudo é pedra desde o primeiro segundo.',profile:{minFallMs:380,maxFallMs:800,spawnGapMs:300,rampWindowMs:3000,rockFrequency:82,coinFrequency:12,boostFrequency:6,boostDurationMs:1200,maximumScore:10000,hitRadius:0.07,hitRadiusY:0.055}},
]
function SpaceDifficultyPage({canEdit}:{canEdit:boolean}){
  const [setting,setSetting]=useState<SpaceDifficulty|null>(null),[message,setMessage]=useState('')
  const reload=()=>api<{setting:SpaceDifficulty}>('/space-difficulty').then(d=>setSetting(d.setting))
  useEffect(()=>{reload()},[])
  if(!setting)return <div className="empty">Carregando…</div>
  const activePreset=spaceDifficultyPresets.find(p=>Object.entries(p.profile).every(([k,v])=>Math.abs((setting as any)[k]-v)<0.0001))?.key
  const applyPreset=async(preset:typeof spaceDifficultyPresets[number])=>{
    setMessage('Salvando…')
    try{
      const data=await api<{setting:SpaceDifficulty}>('/space-difficulty',{method:'PUT',body:JSON.stringify({preset:preset.key,...preset.profile,reason:`Aplicação do nível predefinido ${preset.name}`})})
      setSetting(data.setting);setMessage(`Nível ${preset.name} aplicado.`);notify(`Dificuldade do Space Adventure alterada para ${preset.name}.`)
    }catch(e){setMessage(e instanceof Error?e.message:'Erro ao salvar.')}
  }
  const save=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget)
    const rockFrequency=Number(f.get('rockFrequency')),coinFrequency=Number(f.get('coinFrequency')),boostFrequency=Number(f.get('boostFrequency'))
    if(rockFrequency+coinFrequency+boostFrequency!==100){setMessage('A soma de pedras, moedas e boosts precisa ser exatamente 100%.');return}
    const payload={
      preset:'manual',
      minFallMs:Math.round(Number(f.get('minFallMs'))*1000),maxFallMs:Math.round(Number(f.get('maxFallMs'))*1000),spawnGapMs:Math.round(Number(f.get('spawnGapMs'))*1000),
      rampWindowMs:Number(f.get('rampWindowMs'))*1000,
      rockFrequency,coinFrequency,boostFrequency,
      boostDurationMs:Math.round(Number(f.get('boostDurationMs'))*1000),maximumScore:Number(f.get('maximumScore')),
      hitRadius:Number(f.get('hitRadius'))/100,hitRadiusY:Number(f.get('hitRadiusY'))/100,
      reason:'Ajuste manual da dificuldade do Space Adventure',
    }
    setMessage('Salvando…')
    try{const data=await api<{setting:SpaceDifficulty}>('/space-difficulty',{method:'PUT',body:JSON.stringify(payload)});setSetting(data.setting);setMessage('Ajuste manual salvo.');notify('Dificuldade do Space Adventure atualizada.')}
    catch(err){setMessage(err instanceof Error?err.message:'Erro ao salvar.')}
  }
  const saveFreeRtp=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget)
    const boostRockFrequency=Number(f.get('boostRockFrequency'))
    if(boostRockFrequency+setting.coinFrequency+setting.boostFrequency>100){setMessage('Pedras perto de boost + moedas + boosts não pode passar de 100%.');return}
    const payload={
      preset:setting.preset,minFallMs:setting.minFallMs,maxFallMs:setting.maxFallMs,spawnGapMs:setting.spawnGapMs,rampWindowMs:setting.rampWindowMs,
      rockFrequency:setting.rockFrequency,coinFrequency:setting.coinFrequency,boostFrequency:setting.boostFrequency,
      boostDurationMs:setting.boostDurationMs,maximumScore:setting.maximumScore,hitRadius:setting.hitRadius,hitRadiusY:setting.hitRadiusY,
      freeRtpPercentage:Number(f.get('freeRtpPercentage')),
      shipSpeed:Number(f.get('shipSpeed')),
      multiplierPerFloor:Number(f.get('multiplierPerFloor'))/100,
      boostRockFrequency,
      reason:'Ajuste do RTP e parâmetros do voo grátis / influenciador',
    }
    setMessage('Salvando…')
    try{const data=await api<{setting:SpaceDifficulty}>('/space-difficulty',{method:'PUT',body:JSON.stringify(payload)});setSetting(data.setting);setMessage('Parâmetros salvos.');notify('RTP e parâmetros do voo grátis atualizados.')}
    catch(err){setMessage(err instanceof Error?err.message:'Erro ao salvar.')}
  }
  return <><Header title="Dificuldade — Space Adventure" subtitle="Mistura de pedras/moedas, velocidade de queda e ritmo de aceleração."/>
    <section className="panel">
      <div className="panel-heading"><h2>Níveis predefinidos</h2><p>Cada nível define a proporção de pedras x moedas x boosts, a velocidade de queda e quão rápido o voo acelera. O RTP e o selo de Influenciador aplicam só um ajuste fino por cima disso.</p></div>
      <div className="preset-grid">
        {spaceDifficultyPresets.map(p=><article key={p.key} className={`preset-card ${activePreset===p.key?'active':''}`} style={{'--preset-color':p.color} as CSSProperties}>
          <header><span className="preset-level"><i/>{p.level}</span>{activePreset===p.key&&<em><Icon name="check-circle" size={12}/>ATIVO</em>}</header>
          <h3>{p.name}</h3><p>{p.description}</p>
          <div className="preset-mix">
            <div className="preset-mix__bar">
              <i style={{width:`${p.profile.rockFrequency}%`}} className="preset-mix__rock" title={`Pedra ${p.profile.rockFrequency}%`}/>
              <i style={{width:`${p.profile.coinFrequency}%`}} className="preset-mix__coin" title={`Moeda ${p.profile.coinFrequency}%`}/>
              <i style={{width:`${p.profile.boostFrequency}%`}} className="preset-mix__boost" title={`Boost ${p.profile.boostFrequency}%`}/>
            </div>
            <div className="preset-mix__legend">
              <span><i className="preset-mix__rock"/>Pedra {p.profile.rockFrequency}%</span>
              <span><i className="preset-mix__coin"/>Moeda {p.profile.coinFrequency}%</span>
              <span><i className="preset-mix__boost"/>Boost {p.profile.boostFrequency}%</span>
            </div>
          </div>
          {canEdit&&<button className={`button ${activePreset===p.key?'secondary':'primary'}`} disabled={activePreset===p.key} onClick={()=>applyPreset(p)}>{activePreset===p.key?'Nível ativo':`Aplicar ${p.name}`}</button>}
        </article>)}
      </div>
    </section>
    <section className="panel">
      <div className="panel-heading"><h2>Ajuste manual</h2><p>Versão atual: {setting.preset}. Atualizado em {dateFmt(setting.updatedAt)}.</p></div>
      <form className="form-grid settings-grid" onSubmit={save}>
        <label>Pedras (%)<input type="number" name="rockFrequency" min="5" max="90" disabled={!canEdit} defaultValue={setting.rockFrequency}/><small>Chance de cada objeto que cai ser uma pedra. Bater numa pedra sem boost ativo encerra o voo na hora, sem prêmio.</small></label>
        <label>Moedas (%)<input type="number" name="coinFrequency" min="5" max="90" disabled={!canEdit} defaultValue={setting.coinFrequency}/><small>Chance de cada objeto ser uma moeda. Cada moeda coletada aumenta o multiplicador do prêmio.</small></label>
        <label>Boosts (%)<input type="number" name="boostFrequency" min="0" max="50" disabled={!canEdit} defaultValue={setting.boostFrequency}/><small>Chance de cada objeto ser um boost, que deixa a nave invencível a pedras por alguns segundos. Pedras + Moedas + Boosts devem somar exatamente 100%.</small></label>
        <label>Janela de aceleração (s)<input type="number" name="rampWindowMs" min="5" max="300" disabled={!canEdit} defaultValue={Math.round(setting.rampWindowMs/1000)}/><small>Tempo de voo até a queda atingir a velocidade máxima. Menor = acelera mais rápido.</small></label>
        <label>Queda mínima (s)<input type="number" name="minFallMs" min="0.3" max="6" step="0.05" disabled={!canEdit} defaultValue={(setting.minFallMs/1000).toFixed(2)}/><small>Quanto tempo um objeto leva para cair do topo até a nave depois que a janela de aceleração termina — a velocidade máxima do voo.</small></label>
        <label>Queda máxima (s)<input type="number" name="maxFallMs" min="0.3" max="6" step="0.05" disabled={!canEdit} defaultValue={(setting.maxFallMs/1000).toFixed(2)}/><small>Quanto tempo um objeto leva para cair do topo até a nave logo no início do voo, antes de qualquer aceleração.</small></label>
        <label>Intervalo entre objetos (s)<input type="number" name="spawnGapMs" min="0.15" max="3" step="0.05" disabled={!canEdit} defaultValue={(setting.spawnGapMs/1000).toFixed(2)}/><small>Tempo médio entre o surgimento de um objeto e o próximo no topo da tela. Menor = tela mais cheia e voo mais difícil.</small></label>
        <label>Duração do boost (s)<input type="number" name="boostDurationMs" min="0.5" max="10" step="0.1" disabled={!canEdit} defaultValue={(setting.boostDurationMs/1000).toFixed(1)}/><small>Por quanto tempo a nave fica invencível a pedras depois de pegar um boost.</small></label>
        <label>Pontuação máxima<input type="number" name="maximumScore" min="100" disabled={!canEdit} defaultValue={setting.maximumScore}/><small>Teto da pontuação interna da rodada (placar/ranking). Não afeta o valor do prêmio em dinheiro.</small></label>
        <label>Raio de contato X (%)<input type="number" name="hitRadius" min="2" max="30" step="0.5" disabled={!canEdit} defaultValue={(setting.hitRadius*100).toFixed(1)}/><small>Distância horizontal, em % da largura da tela, que a nave pode estar de um objeto e ainda assim tocar nele. Maior = mais fácil de acertar/desviar.</small></label>
        <label>Raio de contato Y (%)<input type="number" name="hitRadiusY" min="2" max="30" step="0.5" disabled={!canEdit} defaultValue={(setting.hitRadiusY*100).toFixed(1)}/><small>Distância vertical, em % da altura da tela, que a nave pode estar de um objeto e ainda assim tocar nele. Maior = mais fácil de acertar/desviar.</small></label>
        {canEdit&&<div className="wide form-actions"><button className="button primary">Salvar ajuste manual</button>{message&&<span className="save-message">{message}</span>}</div>}
      </form>
    </section>
    <section className="panel">
      <div className="panel-heading"><h2>RTP e parâmetros do voo grátis / influenciador</h2><p>Controla o funil de conversão do modo demo (sem valor real) — "veja quanto você teria ganho" — e o ritmo geral do voo. Independente do RTP das rodadas com valor real, que fica em Gateway/RTP.</p></div>
      <form className="form-grid settings-grid" onSubmit={saveFreeRtp}>
        <label>RTP do voo grátis (%)<input type="number" name="freeRtpPercentage" min="0" max="100" step="1" disabled={!canEdit} defaultValue={setting.freeRtpPercentage}/><small>Maior valor = voos de teste terminam com multiplicadores mais altos, com mais frequência.</small></label>
        <label>Velocidade do astronauta<input type="number" name="shipSpeed" min="0.3" max="4" step="0.05" disabled={!canEdit} defaultValue={setting.shipSpeed}/><small>Quão rápido a nave se move pelos controles do teclado. Maior = mais ágil para desviar.</small></label>
        <label>Multiplicador por moeda (%)<input type="number" name="multiplierPerFloor" min="1" max="100" step="0.5" disabled={!canEdit} defaultValue={(setting.multiplierPerFloor*100).toFixed(1)}/><small>Quanto o multiplicador de prêmio cresce a cada moeda coletada. Afeta também as rodadas com valor real.</small></label>
        <label>Pedras perto de boost (%)<input type="number" name="boostRockFrequency" min="0" max="100" step="1" disabled={!canEdit} defaultValue={setting.boostRockFrequency}/><small>Frequência de pedras logo depois que um boost aparece na tela — mais alto deixa o momento do boost mais arriscado.</small></label>
        {canEdit&&<div className="wide form-actions"><button className="button primary">Salvar parâmetros</button></div>}
      </form>
    </section>
  </>
}

// ---------- Gateway Zypher (inalterado) ----------
type Gateway={provider:string;enabled:boolean;baseUrl:string;clientId:string;hasClientSecret:boolean;updatedAt:string|null}
function GatewayPage({canEdit}:{canEdit:boolean}){
 const [gateway,setGateway]=useState<Gateway|null>(null),[secret,setSecret]=useState(''),[message,setMessage]=useState(''),[testing,setTesting]=useState(false)
 useEffect(()=>{api<{gateway:Gateway}>('/payment-gateway').then(data=>setGateway(data.gateway)).catch(error=>setMessage(error.message))},[])
 const save=async()=>{if(!gateway)return;setMessage('Salvando…');try{const data=await api<{gateway:Gateway}>('/payment-gateway',{method:'PUT',body:JSON.stringify({enabled:gateway.enabled,baseUrl:gateway.baseUrl,clientId:gateway.clientId,...(secret?{clientSecret:secret}:{})})});setGateway(data.gateway);setSecret('');setMessage('Configuração salva com segurança.');notify('Gateway Zypher atualizado.')}catch(error){setMessage(error instanceof Error?error.message:'Falha ao salvar.')}}
 const test=async()=>{setTesting(true);setMessage('Testando conexão…');try{const data=await api<{message:string}>('/payment-gateway/test',{method:'POST'});setMessage(data.message)}catch(error){setMessage(error instanceof Error?error.message:'Falha no teste.')}finally{setTesting(false)}}
 if(!gateway)return <div className="empty">Carregando gateway…</div>
 return <><Header title="Gateway & RTP" subtitle="Credenciais de pagamento e RTP das rodadas com valor real."/><div className="gateway-intro"><span>◇</span><div><b>Zypher Pay</b><p>A API autentica cada requisição pelos headers X-Client-Id e X-Client-Secret. O Secret ID é criptografado e nunca volta para o navegador.</p></div><em className={gateway.enabled?'connected':'disabled'}>{gateway.enabled?'Habilitado':'Desabilitado'}</em></div><section className="panel gateway-form"><div className="config-heading"><h2>Credenciais da API</h2><p>Você encontra essas informações no painel Zypher em Dashboard → API.</p></div><label className="explained-field"><span>URL da API</span><small>Endereço base da Zypher. Em produção, use https://api.zypher.global.</small><input type="url" value={gateway.baseUrl} disabled={!canEdit} onChange={e=>setGateway({...gateway,baseUrl:e.target.value})}/></label><label className="explained-field"><span>Client ID</span><small>Identifica a chave utilizada pela sua aplicação.</small><input value={gateway.clientId} disabled={!canEdit} autoComplete="off" onChange={e=>setGateway({...gateway,clientId:e.target.value})}/></label><label className="explained-field"><span>Secret ID</span><small>{gateway.hasClientSecret?'Já existe um segredo salvo. Deixe vazio para mantê-lo ou digite outro para substituir.':'Informe o segredo da chave no primeiro cadastro.'}</small><input type="password" value={secret} disabled={!canEdit} autoComplete="new-password" placeholder={gateway.hasClientSecret?'••••••••••••••••':'Cole o Secret ID'} onChange={e=>setSecret(e.target.value)}/></label><label className="switch-field"><input type="checkbox" checked={gateway.enabled} disabled={!canEdit} onChange={e=>setGateway({...gateway,enabled:e.target.checked})}/><span><b>Habilitar Zypher</b><small>Ativa o gateway para novas operações. Salve e teste antes de usar em produção.</small></span></label><div className="gateway-security"><b>Proteção das credenciais</b><p>O Secret ID é armazenado com AES-256-GCM. Trocas de configuração ficam registradas nos logs de auditoria sem gravar o segredo.</p></div><div className="config-actions">{canEdit&&<button className="save-button" onClick={save}>Salvar credenciais</button>}<button className="test-button" disabled={testing||!gateway.hasClientSecret} onClick={test}>{testing?'Testando…':'Testar conexão'}</button>{message&&<span className="save-message">{message}</span>}</div></section>
  <RtpPanel canEdit={canEdit}/>
 </>
}

// ---------- RTP das rodadas com valor real ----------
type RtpSetting={percentage:number;enabled:boolean;reason:string;updatedAt:string|null}
function RtpPanel({canEdit}:{canEdit:boolean}){
  const [rtp,setRtp]=useState<RtpSetting|null>(null),[message,setMessage]=useState('')
  const reload=()=>api<{setting:RtpSetting}>('/rtp-setting').then(d=>setRtp(d.setting)).catch(e=>setMessage(e instanceof Error?e.message:'Erro ao carregar RTP.'))
  useEffect(()=>{reload()},[])
  if(!rtp)return <section className="panel"><div className="empty">Carregando RTP…</div></section>
  const save=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget)
    const payload={percentage:Number(f.get('percentage')),enabled:f.get('enabled')==='on',reason:String(f.get('reason'))}
    setMessage('Salvando…')
    try{const data=await api<{setting:RtpSetting}>('/rtp-setting',{method:'PUT',body:JSON.stringify(payload)});setRtp(data.setting);setMessage('RTP atualizado.');notify('RTP das rodadas com valor real atualizado.')}
    catch(err){setMessage(err instanceof Error?err.message:'Erro ao salvar.')}
  }
  return <section className="panel">
    <div className="panel-heading"><h2>RTP — rodadas com valor real</h2><p>Percentual médio devolvido aos jogadores nas rodadas pagas com saldo real. Independente do RTP do voo grátis, ajustado em Dificuldade — Space.</p></div>
    <form className="form-grid settings-grid" onSubmit={save}>
      <label>RTP (%)<input type="number" name="percentage" min="0" max="100" step="0.1" disabled={!canEdit} defaultValue={rtp.percentage}/><small>Maior valor = jogadores recebem de volta, em média, uma fatia maior do que apostam.</small></label>
      <label className="switch-row wide"><input type="checkbox" name="enabled" disabled={!canEdit} defaultChecked={rtp.enabled}/><span><strong>RTP customizado habilitado</strong><small>Quando desligado, o sistema usa o valor padrão interno em vez do percentual acima.</small></span></label>
      <label className="wide">Motivo da alteração<input name="reason" minLength={5} maxLength={300} disabled={!canEdit} placeholder="Obrigatório — fica registrado no log de auditoria"/></label>
      {canEdit&&<div className="wide form-actions"><button className="button primary">Salvar RTP</button>{message&&<span className="save-message">{message}</span>}</div>}
    </form>
    {rtp.reason&&<p>Último motivo registrado: <em>{rtp.reason}</em>{rtp.updatedAt?` — ${dateFmt(rtp.updatedAt)}`:''}</p>}
  </section>
}

// ---------- Configurações gerais ----------
type Settings={minimumBet:number;maximumBet:number;suggestedBets:number[];minimumDeposit:number;maximumDeposit:number;minimumWithdrawal:number;maximumWithdrawal:number;withdrawalFeePercentage:number;signupBonusEnabled:boolean;signupBonusAmount:number;registrationsEnabled:boolean;depositsEnabled:boolean;withdrawalsEnabled:boolean;maintenanceMode:boolean;affiliateDefaultCpaAmount:number;affiliateCpaRetentionEnabled:boolean;affiliateCpaCycleSize:number;affiliateCpaRetainedPositions:number[];updatedAt:string}

// Chip-based editor for the quick-bet values shown on the game's home screen — replaces the old
// bare "comma-separated values" text box with tap-to-remove chips plus an add field, values in
// cents internally, entered/displayed in R$.
function SuggestedBetsEditor({values,disabled,onChange}:{values:number[];disabled:boolean;onChange:(values:number[])=>void}){
  const [draft,setDraft]=useState('')
  const addValue=()=>{
    const cents=Math.round(Number(draft.replace(',','.'))*100)
    if(cents>0&&!values.includes(cents))onChange([...values,cents].sort((a,b)=>a-b))
    setDraft('')
  }
  return <div className="chip-editor">
    <div className="chip-editor__chips">
      {values.map(v=><span key={v} className="chip">
        R$ {(v/100).toFixed(2).replace('.',',')}
        {!disabled&&<button type="button" onClick={()=>onChange(values.filter(x=>x!==v))} aria-label={`Remover R$ ${(v/100).toFixed(2)}`}><Icon name="close" size={10}/></button>}
      </span>)}
      {!values.length&&<span className="chip-editor__empty">Nenhum valor sugerido ainda.</span>}
    </div>
    {!disabled&&<div className="chip-editor__add">
      <input inputMode="decimal" placeholder="Adicionar valor (R$)" value={draft} onChange={e=>setDraft(e.target.value.replace(/[^0-9,.]/g,''))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addValue()}}}/>
      <button type="button" className="button tiny secondary" onClick={addValue}>Adicionar</button>
    </div>}
  </div>
}
function SettingsPage({canEdit}:{canEdit:boolean}){
  const [settings,setSettings]=useState<Settings|null>(null),[message,setMessage]=useState('')
  useEffect(()=>{api<{settings:Settings}>('/settings').then(d=>setSettings(d.settings))},[])
  if(!settings)return <div className="empty">Carregando configurações…</div>
  const set=<K extends keyof Settings>(key:K,value:Settings[K])=>setSettings(old=>old?{...old,[key]:value}:old)
  const save=async()=>{
    setMessage('Salvando…')
    try{
      const payload={...settings,reason:'Atualização administrativa das configurações gerais'}
      const data=await api<{settings:Settings}>('/settings',{method:'PUT',body:JSON.stringify(payload)})
      setSettings(data.settings)
      setMessage('Configurações salvas com sucesso.')
      notify('Configurações gerais atualizadas.')
    }catch(e){setMessage(e instanceof Error?e.message:'Erro ao salvar.')}
  }
  return <><Header title="Configurações gerais" subtitle={`Atualizado em ${dateFmt(settings.updatedAt)}`}/>
    <section className="panel">
      <div className="panel-heading"><h2>Limites financeiros</h2><p>Valores em reais aplicados pela API do Space Adventure.</p></div>
      <div className="form-grid settings-grid">
        <label>Aposta mínima (R$)<input type="number" min="0.01" step="0.01" disabled={!canEdit} value={settings.minimumBet/100} onChange={e=>set('minimumBet',Math.round(Number(e.target.value)*100))}/></label>
        <label>Aposta máxima (R$)<input type="number" min="0.01" step="0.01" disabled={!canEdit} value={settings.maximumBet/100} onChange={e=>set('maximumBet',Math.round(Number(e.target.value)*100))}/></label>
        <label className="wide">Valores sugeridos
          <SuggestedBetsEditor values={settings.suggestedBets} disabled={!canEdit} onChange={v=>set('suggestedBets',v)}/>
          <small>Aparecem como botões de aposta rápida na tela inicial do jogo, do menor para o maior.</small>
        </label>
        <label>Depósito mínimo (R$)<input type="number" min="0.01" step="0.01" disabled={!canEdit} value={settings.minimumDeposit/100} onChange={e=>set('minimumDeposit',Math.round(Number(e.target.value)*100))}/></label>
        <label>Depósito máximo (R$)<input type="number" min="0.01" step="0.01" disabled={!canEdit} value={settings.maximumDeposit/100} onChange={e=>set('maximumDeposit',Math.round(Number(e.target.value)*100))}/></label>
        <label>Saque mínimo (R$)<input type="number" min="0.01" step="0.01" disabled={!canEdit} value={settings.minimumWithdrawal/100} onChange={e=>set('minimumWithdrawal',Math.round(Number(e.target.value)*100))}/></label>
        <label>Saque máximo (R$)<input type="number" min="0.01" step="0.01" disabled={!canEdit} value={settings.maximumWithdrawal/100} onChange={e=>set('maximumWithdrawal',Math.round(Number(e.target.value)*100))}/></label>
      </div>
    </section>
    <section className="panel">
      <div className="panel-heading"><h2>Disponibilidade</h2><p>Controle os recursos acessíveis aos jogadores.</p></div>
      <div className="toggle-grid">
        <label className="switch-row"><input type="checkbox" checked={settings.registrationsEnabled} disabled={!canEdit} onChange={e=>set('registrationsEnabled',e.target.checked)}/><span><strong>Novos cadastros</strong><small>Permitir criação de contas.</small></span></label>
        <label className="switch-row"><input type="checkbox" checked={settings.depositsEnabled} disabled={!canEdit} onChange={e=>set('depositsEnabled',e.target.checked)}/><span><strong>Depósitos</strong><small>Permitir novas cobranças PIX.</small></span></label>
        <label className="switch-row"><input type="checkbox" checked={settings.withdrawalsEnabled} disabled={!canEdit} onChange={e=>set('withdrawalsEnabled',e.target.checked)}/><span><strong>Saques</strong><small>Permitir solicitações de saque.</small></span></label>
        <label className="switch-row danger-switch"><input type="checkbox" checked={settings.maintenanceMode} disabled={!canEdit} onChange={e=>set('maintenanceMode',e.target.checked)}/><span><strong>Modo manutenção</strong><small>Bloqueia cadastros, depósitos e saques temporariamente.</small></span></label>
      </div>
    </section>
    {canEdit&&<section className="panel save-panel save-panel-simple"><button className="save-button" onClick={save}>Salvar todas as configurações</button>{message&&<span className="save-message">{message}</span>}</section>}
  </>
}

// ---------- Bônus e taxas ----------
function BonusPage({canEdit}:{canEdit:boolean}){
  const [settings,setSettings]=useState<Settings|null>(null),[message,setMessage]=useState('')
  useEffect(()=>{api<{settings:Settings}>('/settings').then(d=>setSettings(d.settings))},[])
  if(!settings)return <div className="empty">Carregando…</div>
  const set=<K extends keyof Settings>(key:K,value:Settings[K])=>setSettings(old=>old?{...old,[key]:value}:old)
  const save=async()=>{
    setMessage('Salvando…')
    try{
      const data=await api<{settings:Settings}>('/settings',{method:'PUT',body:JSON.stringify({...settings,reason:'Atualização administrativa de bônus e taxas'})})
      setSettings(data.settings);setMessage('Salvo com sucesso.');notify('Bônus e taxas atualizados.')
    }catch(e){setMessage(e instanceof Error?e.message:'Erro ao salvar.')}
  }
  return <><Header title="Bônus e taxas" subtitle="Promoções de aquisição e taxa aplicada sobre saques."/>
    <section className="panel">
      <div className="panel-heading"><h2>Bônus de cadastro</h2><p>Credita saldo automaticamente para todo novo usuário.</p></div>
      <div className="form-grid settings-grid">
        <label className="switch-row wide"><input type="checkbox" checked={settings.signupBonusEnabled} disabled={!canEdit} onChange={e=>set('signupBonusEnabled',e.target.checked)}/><span><strong>Bônus de cadastro habilitado</strong><small>Quando ligado, todo novo cadastro recebe o valor abaixo em saldo.</small></span></label>
        <label>Valor do bônus (R$)<input type="number" min="0" step="0.01" disabled={!canEdit} value={settings.signupBonusAmount/100} onChange={e=>set('signupBonusAmount',Math.round(Number(e.target.value)*100))}/></label>
      </div>
    </section>
    <section className="panel">
      <div className="panel-heading"><h2>Taxa de saque</h2><p>Percentual descontado diretamente do valor sacado — o jogador nunca paga nada antes de receber.</p></div>
      <div className="form-grid settings-grid">
        <label>Taxa de saque (%)<input type="number" min="0" max="50" step="0.1" disabled={!canEdit} value={settings.withdrawalFeePercentage} onChange={e=>set('withdrawalFeePercentage',Number(e.target.value))}/></label>
      </div>
    </section>
    {canEdit&&<section className="panel save-panel save-panel-simple"><button className="save-button" onClick={save}>Salvar bônus e taxas</button>{message&&<span className="save-message">{message}</span>}</section>}
  </>
}

// ---------- Afiliados ----------
type AffiliateRow={id:string;code:string;status:string;cpaAmount:number;cpaRtpMode:string;cpaRetentionEnabled:boolean;cpaCycleSize:number;cpaRetainedPositions:string;availableBalance:number;withdrawnBalance:number;createdAt:string;user:{name:string;email:string|null};_count:{referrals:number;commissions:number}}
type AffiliateDetail=AffiliateRow&{referrals:{id:string;name:string;email:string|null;createdAt:string;deposits:{amount:number}[]}[];commissions:{id:string;userId:string;amount:number;position:number;status:string;createdAt:string}[]}
function parsePositions(json:string){try{const v=JSON.parse(json);return Array.isArray(v)?v.map(Number):[9,10]}catch{return [9,10]}}
function readCpaFields(f:FormData){
  return {
    cpaRtpMode:String(f.get('cpaRtpMode')||'GLOBAL'),
    cpaRetentionEnabled:f.get('cpaRetentionEnabled')==='on',
    cpaCycleSize:Number(f.get('cpaCycleSize')||10),
    cpaRetainedPositions:String(f.get('cpaRetainedPositionsText')||'').split(/[\s,;]+/).filter(Boolean).map(Number).filter(n=>Number.isFinite(n)&&n>0),
  }
}
function CpaRuleFields({defaultMode,defaultEnabled,defaultCycle,defaultPositions}:{defaultMode:string;defaultEnabled:boolean;defaultCycle:number;defaultPositions:number[]}){
  return <>
    <label>Regra de RTP/CPA<select name="cpaRtpMode" defaultValue={defaultMode}><option value="GLOBAL">Usar configuração global</option><option value="CUSTOM">Regra individual exclusiva</option></select><small>GLOBAL acompanha a página Afiliados. CUSTOM usa só os campos abaixo, mesmo que a regra global mude depois.</small></label>
    <label>Tamanho do ciclo<input type="number" name="cpaCycleSize" min="2" max="100" defaultValue={defaultCycle}/></label>
    <label>Posições retidas<input name="cpaRetainedPositionsText" defaultValue={defaultPositions.join(', ')}/><small>Só usado quando a regra acima for CUSTOM.</small></label>
    <label className="switch-row wide"><input type="checkbox" name="cpaRetentionEnabled" defaultChecked={defaultEnabled}/><span><strong>Retenção individual habilitada</strong><small>Só é aplicada quando a regra acima for CUSTOM.</small></span></label>
  </>
}
// ---------- Métricas gerais de afiliados ----------
type AffiliateMetricsData={
  totalAffiliates:number;activeAffiliates:number;totalReferrals:number;totalCommissionsCount:number;
  availableCommissions:number;retainedCommissions:number;totalAvailableBalance:number;totalWithdrawnBalance:number;
  charts:{activity:ChartRow[]};
  topAffiliates:{code:string;name:string;availableBalance:number;withdrawnBalance:number;referrals:number}[];
}
function AffiliateMetrics(){
  const [data,setData]=useState<AffiliateMetricsData|null>(null),[period,setPeriod]=useState('30d')
  useEffect(()=>{api<AffiliateMetricsData>(`/affiliates/metrics?period=${period}`).then(setData)},[period])
  const bucketLabel=(iso:string)=>period==='today'?new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit'}):new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})
  const count=(v:number)=>v.toLocaleString('pt-BR')
  const cards=data?[
    ['Total de afiliados',count(data.totalAffiliates),'affiliate'],
    ['Afiliados ativos',count(data.activeAffiliates),'check-circle'],
    ['Total de indicados',count(data.totalReferrals),'users'],
    ['Comissões geradas',count(data.totalCommissionsCount),'gift'],
    ['Saldo disponível (afiliados)',money(data.totalAvailableBalance),'deposit'],
    ['Já sacado por afiliados',money(data.totalWithdrawnBalance),'withdrawal'],
  ] as [string,string,IconName][]:[]
  const totalCommissions=data?data.availableCommissions+data.retainedCommissions:0
  const availablePct=totalCommissions>0?Math.round((data!.availableCommissions/totalCommissions)*100):50
  return <>
    <section className="panel">
      <div className="panel-heading users-panel-heading"><div><h2>Métricas gerais</h2><p>Visão consolidada do programa de afiliados.</p></div>
        <select value={period} onChange={e=>setPeriod(e.target.value)}><option value="today">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option></select>
      </div>
      <div className="cards">{cards.map(([l,v,i])=><article key={l}><i><Icon name={i} size={17}/></i><small>{l}</small><strong>{data?v:'—'}</strong></article>)}</div>
    </section>
    {data&&<section className="chart-grid">
      <article className="panel chart-panel"><div className="panel-heading"><h2>Crescimento do programa</h2><p>Novos indicados e novos afiliados cadastrados no período.</p></div>
        <div className="legend"><span><i className="deposit-dot"/>Indicados</span><span><i className="withdrawal-dot"/>Novos afiliados</span></div>
        {data.charts.activity.length
          ?<CurveChart rows={data.charts.activity} aKey="referrals" bKey="newAffiliates" aLabel="Indicados" bLabel="Novos afiliados" labelFn={bucketLabel} aFormat={count} bFormat={count}/>
          :<p className="chart-empty">Sem atividade neste período.</p>}
      </article>
      <article className="panel chart-panel"><div className="panel-heading"><h2>Comissões CPA</h2><p>Quanto do valor gerado está disponível para saque x retido pela plataforma.</p></div>
        <div className="preset-mix">
          <div className="preset-mix__bar">
            <i style={{width:`${availablePct}%`}} className="preset-mix__coin" title={`Disponível ${money(data.availableCommissions)}`}/>
            <i style={{width:`${100-availablePct}%`}} className="preset-mix__rock" title={`Retido ${money(data.retainedCommissions)}`}/>
          </div>
          <div className="preset-mix__legend">
            <span><i className="preset-mix__coin"/>Disponível: {money(data.availableCommissions)}</span>
            <span><i className="preset-mix__rock"/>Retido: {money(data.retainedCommissions)}</span>
          </div>
        </div>
      </article>
    </section>}
    {data&&data.topAffiliates.length>0&&<section className="panel">
      <div className="panel-heading"><h2>Top afiliados por saldo disponível</h2></div>
      <div className="table-wrap"><table><thead><tr><th>Parceiro</th><th>Código</th><th>Indicados</th><th>Saldo disponível</th><th>Já sacado</th></tr></thead><tbody>
        {data.topAffiliates.map(a=><tr key={a.code}><td>{a.name}</td><td><code>{a.code}</code></td><td>{a.referrals}</td><td>{money(a.availableBalance)}</td><td>{money(a.withdrawnBalance)}</td></tr>)}
      </tbody></table></div>
    </section>}
  </>
}
function AffiliatesPage({canEdit}:{canEdit:boolean}){
  const [items,setItems]=useState<AffiliateRow[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1)
  const [searchInput,setSearchInput]=useState(''),[search,setSearch]=useState('')
  const [openId,setOpenId]=useState<string|null>(null)
  const [settings,setSettings]=useState<Settings|null>(null),[cpaMessage,setCpaMessage]=useState('')
  const reload=()=>{const q=new URLSearchParams({page:String(page),...(search?{search}:{})});api<{items:AffiliateRow[];total:number}>(`/affiliates?${q}`).then(d=>{setItems(d.items);setTotal(d.total)})}
  useEffect(()=>{reload()},[page,search])
  useEffect(()=>{api<{settings:Settings}>('/settings').then(d=>setSettings(d.settings))},[])
  const pages=Math.max(1,Math.ceil(total/20))
  const saveCpaGlobal=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); if(!settings)return
    const f=new FormData(e.currentTarget)
    const payload={...settings,
      affiliateDefaultCpaAmount:Math.round(Number(f.get('affiliateDefaultCpaAmount'))*100),
      affiliateCpaRetentionEnabled:f.get('affiliateCpaRetentionEnabled')==='on',
      affiliateCpaCycleSize:Number(f.get('affiliateCpaCycleSize')||10),
      affiliateCpaRetainedPositions:String(f.get('affiliateCpaRetainedPositionsText')||'').split(/[\s,;]+/).filter(Boolean).map(Number).filter(n=>Number.isFinite(n)&&n>0),
      reason:'Atualização da configuração global de CPA de afiliados',
    }
    try{const data=await api<{settings:Settings}>('/settings',{method:'PUT',body:JSON.stringify(payload)});setSettings(data.settings);setCpaMessage('Configuração de CPA salva.');notify('Configuração global de CPA atualizada.')}
    catch(err){setCpaMessage(err instanceof Error?err.message:'Erro ao salvar.')}
  }
  return <><Header title="Afiliados" subtitle="Parceiros, comissões e indicações."/>
    <AffiliateMetrics/>
    {settings&&<section className="panel">
      <div className="panel-heading"><h2>CPA global</h2><p>Regra padrão aplicada a todo afiliado configurado como GLOBAL. Ex.: ciclo 10 com posições 9,10 retidas credita os 8 primeiros CPAs de cada 10 e retém o 9º e o 10º.</p></div>
      <form className="form-grid settings-grid" onSubmit={saveCpaGlobal}>
        <label>CPA padrão sugerido (R$)<input type="number" name="affiliateDefaultCpaAmount" min="0" step="0.01" disabled={!canEdit} defaultValue={settings.affiliateDefaultCpaAmount/100}/></label>
        <label>Tamanho do ciclo<input type="number" name="affiliateCpaCycleSize" min="2" max="100" disabled={!canEdit} defaultValue={settings.affiliateCpaCycleSize}/></label>
        <label className="wide">Posições retidas<input name="affiliateCpaRetainedPositionsText" disabled={!canEdit} defaultValue={settings.affiliateCpaRetainedPositions.join(', ')}/><small>Essas posições ficam com a plataforma e não geram saldo de CPA.</small></label>
        <label className="switch-row wide"><input type="checkbox" name="affiliateCpaRetentionEnabled" disabled={!canEdit} defaultChecked={settings.affiliateCpaRetentionEnabled}/><span><strong>Retenção global ativada</strong><small>Quando desativada, todos os CPAs elegíveis (regra GLOBAL) são creditados.</small></span></label>
        {canEdit&&<div className="wide form-actions"><button className="button primary">Salvar CPA global</button>{cpaMessage&&<span className="save-message">{cpaMessage}</span>}</div>}
      </form>
    </section>}
    <section className="panel filters"><form onSubmit={e=>{e.preventDefault();setPage(1);setSearch(searchInput)}}>
      <input placeholder="Nome, e-mail ou código" value={searchInput} onChange={e=>setSearchInput(e.target.value)}/>
      <button className="button secondary">Filtrar</button>
    </form></section>
    <section className="panel">
      <div className="panel-heading"><h2>{total} afiliados</h2></div>
      <div className="table-wrap"><table><thead><tr><th>Parceiro</th><th>Código</th><th>CPA</th><th>Saldo disponível</th><th>Indicados</th><th>Status</th><th></th></tr></thead><tbody>
        {items.map(item=><tr key={item.id}>
          <td><strong>{item.user.name}</strong><small>{item.user.email}</small></td>
          <td><code>{item.code}</code></td>
          <td>{money(item.cpaAmount)}</td>
          <td>{money(item.availableBalance)}</td>
          <td>{item._count.referrals}</td>
          <td><Status value={item.status}/></td>
          <td><button className="button tiny secondary" onClick={()=>setOpenId(item.id)}>Detalhes</button></td>
        </tr>)}
        {!items.length&&<tr><td colSpan={7} className="empty">Nenhum afiliado encontrado.</td></tr>}
      </tbody></table></div>
      {pages>1&&<div className="pagination">{Array.from({length:pages},(_,i)=>i+1).map(p=><button key={p} className={p===page?'active':''} onClick={()=>setPage(p)}>{p}</button>)}</div>}
    </section>
    {openId&&<AffiliateDetailModal id={openId} canEdit={canEdit} onClose={()=>{setOpenId(null);reload()}}/>}
  </>
}
function AffiliateDetailModal({id,canEdit,onClose}:{id:string;canEdit:boolean;onClose:()=>void}){
  const [affiliate,setAffiliate]=useState<AffiliateDetail|null>(null),[message,setMessage]=useState('')
  const reload=()=>api<{affiliate:AffiliateDetail}>(`/affiliates/${id}`).then(d=>setAffiliate(d.affiliate))
  useEffect(()=>{reload()},[id])
  if(!affiliate)return <div className="admin-modal-backdrop"><section className="admin-modal"><div className="empty">Carregando…</div></section></div>
  const save=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget)
    try{
      await api(`/affiliates/${id}`,{method:'PATCH',body:JSON.stringify({code:String(f.get('code')),status:String(f.get('status')),cpaAmount:Math.round(Number(f.get('cpaAmount'))*100),...readCpaFields(f),reason:'Atualização administrativa do afiliado'})})
      setMessage('Afiliado atualizado.');notify('Afiliado atualizado.');reload()
    }catch(err){setMessage(err instanceof Error?err.message:'Erro ao salvar.')}
  }
  return <div className="admin-modal-backdrop"><section className="admin-modal" role="dialog" aria-modal="true">
    <header className="modal-heading"><div><p className="eyebrow">AFILIADO</p><h2>{affiliate.user.name}</h2><small>{affiliate.user.email}</small></div><button className="modal-close" onClick={onClose} aria-label="Fechar"><Icon name="close" size={18}/></button></header>
    <div className="modal-body">
    {message&&<div className="save-message modal-message">{message}</div>}
    <div className="user-summary">
      <article><small>Saldo disponível</small><strong>{money(affiliate.availableBalance)}</strong></article>
      <article><small>Total sacado</small><strong>{money(affiliate.withdrawnBalance)}</strong></article>
      <article><small>Indicados</small><strong>{affiliate._count.referrals}</strong></article>
      <article><small>Comissões</small><strong>{affiliate._count.commissions}</strong></article>
    </div>
    {canEdit&&<article className="modal-card wide"><div className="panel-heading"><h3>Editar afiliado</h3></div>
      <form className="form-grid compact-form" onSubmit={save}>
        <label>Código<input name="code" required defaultValue={affiliate.code}/></label>
        <label>Status<select name="status" defaultValue={affiliate.status}><option value="ACTIVE">Ativo</option><option value="BLOCKED">Bloqueado</option><option value="INACTIVE">Inativo</option></select></label>
        <label>Comissão CPA (R$)<input type="number" name="cpaAmount" min="0" step="0.01" defaultValue={(affiliate.cpaAmount/100).toFixed(2)}/></label>
        <CpaRuleFields defaultMode={affiliate.cpaRtpMode} defaultEnabled={affiliate.cpaRetentionEnabled} defaultCycle={affiliate.cpaCycleSize} defaultPositions={parsePositions(affiliate.cpaRetainedPositions)}/>
        <div className="wide form-actions"><button className="button primary">Salvar afiliado</button></div>
      </form>
    </article>}
    <div className="activity-grid">
      <article className="modal-card"><div className="panel-heading"><h3>Indicados</h3></div><div className="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Depositado</th><th>Cadastro</th></tr></thead><tbody>
        {affiliate.referrals.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.email}</td><td>{money(r.deposits.reduce((s,d)=>s+d.amount,0))}</td><td>{dateFmt(r.createdAt)}</td></tr>)}
        {!affiliate.referrals.length&&<tr><td colSpan={4} className="empty">Nenhum indicado ainda.</td></tr>}
      </tbody></table></div></article>
      <article className="modal-card"><div className="panel-heading"><h3>Comissões</h3></div><div className="table-wrap"><table><thead><tr><th>Valor</th><th>Posição no ciclo</th><th>Status</th><th>Data</th></tr></thead><tbody>
        {affiliate.commissions.map(c=><tr key={c.id}><td>{money(c.amount)}</td><td>{c.position}</td><td><Status value={c.status}/></td><td>{dateFmt(c.createdAt)}</td></tr>)}
        {!affiliate.commissions.length&&<tr><td colSpan={4} className="empty">Nenhuma comissão ainda.</td></tr>}
      </tbody></table></div></article>
    </div>
    </div>
  </section></div>
}

// ---------- Depósitos / Saques ----------
type FinanceItem={id:string;amount:number;feeAmount?:number;status:string;provider:string;reference:string;endToEndId?:string|null;destinationType?:string|null;destinationLast4?:string|null;createdAt:string;user?:{name:string;email:string|null}}
function StatusEditor({id,current,statuses,endpoint,onSaved}:{id:string;current:string;statuses:string[];endpoint:string;onSaved:()=>void}){
  const [value,setValue]=useState(current),[saving,setSaving]=useState(false)
  const save=async()=>{setSaving(true);try{await api(`${endpoint}/${id}`,{method:'PATCH',body:JSON.stringify({status:value,reason:'Atualização administrativa de status'})});notify(`Status atualizado para ${value}.`);onSaved()}finally{setSaving(false)}}
  return <div className="inline-form"><select value={value} onChange={e=>setValue(e.target.value)}>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select><button className="button tiny" disabled={saving||value===current} onClick={save}>Salvar</button></div>
}
function FinancePage({title,endpoint,statuses,isWithdrawal}:{title:string;endpoint:string;statuses:string[];isWithdrawal:boolean}){
  const [items,setItems]=useState<FinanceItem[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1)
  const [searchInput,setSearchInput]=useState(''),[search,setSearch]=useState(''),[status,setStatus]=useState('')
  const reload=()=>{const q=new URLSearchParams({page:String(page),...(search?{search}:{}),...(status?{status}:{})});api<{items:FinanceItem[];total:number}>(`${endpoint}?${q}`).then(d=>{setItems(d.items);setTotal(d.total)})}
  useEffect(()=>{reload()},[endpoint,page,search,status])
  const pages=Math.max(1,Math.ceil(total/20))
  return <><Header title={title} subtitle={`${total} registros encontrados.`}/>
    <section className="panel filters"><form onSubmit={e=>{e.preventDefault();setPage(1);setSearch(searchInput)}}>
      <input placeholder="Usuário, referência ou E2E" value={searchInput} onChange={e=>setSearchInput(e.target.value)}/>
      <select value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="">Todos os status</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select>
      <button className="button secondary">Filtrar</button>
    </form></section>
    <section className="panel table-wrap"><table><thead><tr><th>Usuário</th><th>Valor</th>{isWithdrawal&&<th>Taxa / Líquido</th>}<th>Referência</th><th>Status</th><th>Data</th><th>Revisar</th></tr></thead><tbody>
      {items.map(item=><tr key={item.id}><td><b>{item.user?.name||'—'}</b><small>{item.user?.email||''}</small></td><td>{money(item.amount)}</td>
        {isWithdrawal&&<td>{money(item.feeAmount||0)}<small>líquido {money(item.amount-(item.feeAmount||0))}</small></td>}
        <td><code title={item.endToEndId||''}>{item.reference.slice(0,18)}</code></td>
        <td><span className="status">{item.status}</span></td><td>{dateFmt(item.createdAt)}</td>
        <td><StatusEditor id={item.id} current={item.status} statuses={statuses} endpoint={endpoint} onSaved={reload}/></td>
      </tr>)}
      {!items.length&&<tr><td colSpan={isWithdrawal?7:6} className="empty">Nenhum registro encontrado.</td></tr>}
    </tbody></table></section>
    {pages>1&&<div className="pagination">{Array.from({length:pages},(_,i)=>i+1).map(p=><button key={p} className={p===page?'active':''} onClick={()=>setPage(p)}>{p}</button>)}</div>}
  </>
}

// ---------- Notificações ----------
type NotificationItem={id:string;type:string;title:string;message:string;read:boolean;createdAt:string}
function NotificationsPage({onChange}:{onChange:(unread:number)=>void}){
  const [items,setItems]=useState<NotificationItem[]>([])
  const reload=()=>api<{items:NotificationItem[];unread:number}>('/notifications').then(d=>{setItems(d.items);onChange(d.unread)})
  useEffect(()=>{reload()},[])
  const markRead=async(id:string)=>{await api(`/notifications/${id}/read`,{method:'PATCH'});reload()}
  const markAll=async()=>{await api('/notifications/read-all',{method:'PATCH'});reload()}
  return <><Header title="Notificações" subtitle="Eventos operacionais que merecem atenção."><button className="button secondary" onClick={markAll}>Marcar todas como lidas</button></Header>
    <section className="notification-list">
      {items.map(item=><article key={item.id} className={`panel notification ${item.read?'':'unread'}`}><div><small>{item.type} · {dateFmt(item.createdAt)}</small><h2>{item.title}</h2><p>{item.message}</p></div>{!item.read&&<button className="button tiny" onClick={()=>markRead(item.id)}>Marcar como lida</button>}</article>)}
      {!items.length&&<div className="panel empty">Nenhuma notificação encontrada.</div>}
    </section>
  </>
}

// ---------- Usuários ----------
type UserRow={id:string;name:string;username:string|null;email:string|null;phone:string|null;coinBalance:number;isActive:boolean;isBlocked:boolean;isInfluencer:boolean;excludedFromRanking:boolean;receivedSignupBonus:boolean;createdAt:string;_count?:{games:number}}
type UserDetail=UserRow&{games:{id:string;score:number;stakeAmount:number;coinsRewarded:number;status:string;startedAt:string}[];transactions:{id:string;type:string;amount:number;reason:string;createdAt:string}[];notes:{id:string;content:string;createdAt:string;admin:{name:string}}[];alerts:{id:string;type:string;description:string;riskLevel:string;status:string;createdAt:string}[];ownedAffiliate:{id:string;code:string;status:string;cpaAmount:number;cpaRtpMode:string;cpaRetentionEnabled:boolean;cpaCycleSize:number;cpaRetainedPositions:string;availableBalance:number}|null}
function UsersPage(){
  const [items,setItems]=useState<UserRow[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1)
  const [searchInput,setSearchInput]=useState(''),[search,setSearch]=useState('')
  const [editId,setEditId]=useState<string|null>(null)
  const reload=()=>{const q=new URLSearchParams({page:String(page),...(search?{search}:{})});api<{items:UserRow[];total:number}>(`/users?${q}`).then(d=>{setItems(d.items);setTotal(d.total)})}
  useEffect(()=>{reload()},[page,search])
  const pages=Math.max(1,Math.ceil(total/20))
  const exportCsv=()=>{
    const header=['ID','Nome','Usuário','Telefone','E-mail','Saldo','Status','Influenciador','Bônus de cadastro','Cadastro']
    const rows=items.map(u=>[u.id,u.name,u.username||'',u.phone||'',u.email||'',String(u.coinBalance/100),u.isBlocked?'Bloqueado':'Ativo',u.isInfluencer?'Sim':'Não',u.receivedSignupBonus?'Sim':'Não',dateFmt(u.createdAt)])
    const csv=[header,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n')
    const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'})
    const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=`usuarios-${new Date().toISOString().slice(0,10)}.csv`; link.click()
  }
  return <><Header title="Usuários" subtitle="Consulta, segurança e carteira dos jogadores."/>
    <section className="panel filters"><form onSubmit={e=>{e.preventDefault();setPage(1);setSearch(searchInput)}}>
      <input placeholder="Nome, usuário, telefone, e-mail ou ID" value={searchInput} onChange={e=>setSearchInput(e.target.value)}/>
      <button className="button secondary">Filtrar</button>
    </form></section>
    <section className="panel">
      <div className="panel-heading users-panel-heading"><h2>{total} usuários</h2><button className="button secondary icon-button" onClick={exportCsv}><Icon name="download" size={15}/>Exportar CSV</button></div>
      <div className="table-wrap"><table className="users-table"><thead><tr><th>Conta</th><th>Tipo</th><th>Telefone</th><th>Saldo</th><th>Bônus</th><th>Ativo</th><th>Editar</th></tr></thead><tbody>
        {items.map(item=><tr key={item.id}>
          <td><strong>{item.username||item.name}</strong><small>{item.email}</small></td>
          <td>{item.isInfluencer?<span className="pill pill-influencer"><Icon name="star" size={11}/>INFLUENCIADOR</span>:<span className="muted">Jogador</span>}</td>
          <td><strong>{item.phone||'—'}</strong></td>
          <td><strong>{money(item.coinBalance)}</strong></td>
          <td>{item.receivedSignupBonus?<span className="pill pill-bonus"><Icon name="gift" size={11}/>BÔNUS</span>:<span className="muted">—</span>}</td>
          <td><Status value={item.isBlocked?'Não':'Sim'}/></td>
          <td><button className="button tiny secondary" onClick={()=>setEditId(item.id)}>Editar</button></td>
        </tr>)}
        {!items.length&&<tr><td colSpan={7} className="empty">Nenhum usuário encontrado.</td></tr>}
      </tbody></table></div>
      {pages>1&&<div className="pagination">{Array.from({length:pages},(_,i)=>i+1).map(p=><button key={p} className={p===page?'active':''} onClick={()=>setPage(p)}>{p}</button>)}</div>}
    </section>
    {editId&&<UserEditor id={editId} onClose={()=>{setEditId(null);reload()}}/>}
  </>
}
function UserEditor({id,onClose}:{id:string;onClose:()=>void}){
  const [user,setUser]=useState<UserDetail|null>(null),[message,setMessage]=useState(''),[noteDraft,setNoteDraft]=useState('')
  const reload=()=>api<{user:UserDetail}>(`/users/${id}`).then(d=>setUser(d.user))
  useEffect(()=>{reload()},[id])
  const addNote=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); if(!noteDraft.trim())return
    try{await api(`/users/${id}/notes`,{method:'POST',body:JSON.stringify({content:noteDraft})});setNoteDraft('');notify('Nota adicionada.');reload()}
    catch(err){setMessage(err instanceof Error?err.message:'Erro ao salvar nota.')}
  }
  if(!user)return <div className="admin-modal-backdrop"><section className="admin-modal user-editor"><div className="empty">Carregando…</div></section></div>
  const saveAccount=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget)
    try{
      await api(`/users/${id}/account`,{method:'PATCH',body:JSON.stringify({
        name:String(f.get('name')),username:String(f.get('username')||''),phone:String(f.get('phone')||''),email:String(f.get('email')),
        isInfluencer:f.get('isInfluencer')==='on',password:String(f.get('password')||''),reason:'Atualização administrativa da conta',
      })})
      setMessage('Conta atualizada.');notify('Conta do usuário atualizada.');reload()
    }catch(err){setMessage(err instanceof Error?err.message:'Erro ao salvar.')}
  }
  const saveStatus=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget)
    try{
      await api(`/users/${id}/status`,{method:'PATCH',body:JSON.stringify({isBlocked:f.get('isBlocked')==='on',excludedFromRanking:f.get('excludedFromRanking')==='on',reason:'Atualização administrativa de status'})})
      setMessage('Status atualizado.');notify('Status do usuário atualizado.');reload()
    }catch(err){setMessage(err instanceof Error?err.message:'Erro ao salvar.')}
  }
  const saveBalance=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget)
    const target=Math.round(Number(f.get('balance'))*100), delta=target-user.coinBalance
    if(!delta){setMessage('Informe um valor diferente do saldo atual.');return}
    try{
      await api(`/users/${id}/coins`,{method:'POST',body:JSON.stringify({amount:delta,reason:'Ajuste administrativo de saldo',confirmed:true})})
      setMessage('Saldo atualizado.');notify('Saldo do usuário atualizado.');reload()
    }catch(err){setMessage(err instanceof Error?err.message:'Erro ao salvar.')}
  }
  const suggestedCode=(user.username||user.name).toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'')||'afiliado'
  const createAffiliate=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget)
    try{
      await api('/affiliates',{method:'POST',body:JSON.stringify({userId:id,code:String(f.get('code')),cpaAmount:Math.round(Number(f.get('cpaAmount'))*100),...readCpaFields(f),reason:'Ativação administrativa do programa de afiliados'})})
      setMessage('Usuário ativado como afiliado.');notify('Usuário ativado como afiliado.');reload()
    }catch(err){setMessage(err instanceof Error?err.message:'Erro ao salvar.')}
  }
  const saveAffiliate=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); const f=new FormData(e.currentTarget)
    if(!user.ownedAffiliate)return
    try{
      await api(`/affiliates/${user.ownedAffiliate.id}`,{method:'PATCH',body:JSON.stringify({code:String(f.get('code')),status:String(f.get('status')),cpaAmount:Math.round(Number(f.get('cpaAmount'))*100),...readCpaFields(f),reason:'Atualização administrativa do afiliado'})})
      setMessage('Afiliado atualizado.');notify('Afiliado atualizado.');reload()
    }catch(err){setMessage(err instanceof Error?err.message:'Erro ao salvar.')}
  }
  return <div className="admin-modal-backdrop"><section className="admin-modal user-editor" role="dialog" aria-modal="true">
    <header className="modal-heading"><div><p className="eyebrow">EDIÇÃO INDIVIDUAL</p><h2>{user.username||user.name}</h2></div><button className="modal-close" onClick={onClose} aria-label="Fechar"><Icon name="close" size={18}/></button></header>
    <div className="modal-body">
    {message&&<div className="save-message modal-message">{message}</div>}
    <div className="user-summary">
      <article><small>Saldo disponível</small><strong>{money(user.coinBalance)}</strong></article>
      <article><small>Jogadas</small><strong>{user._count?.games??user.games?.length??0}</strong></article>
      <article><small>Status</small><strong>{user.isBlocked?'Bloqueado':'Ativo'}{user.isInfluencer?' · Influenciador':''}</strong></article>
      <article><small>Bônus de cadastro</small><strong>{user.receivedSignupBonus?'Recebido':'—'}</strong></article>
    </div>
    <div className="editor-grid">
      <article className="modal-card wide"><div className="panel-heading"><h3>Dados da conta</h3><p>Senha em branco mantém a senha atual.</p></div>
        <form className="form-grid compact-form" onSubmit={saveAccount}>
          <label>Nome<input name="name" required maxLength={160} defaultValue={user.name}/></label>
          <label>Usuário<input name="username" maxLength={32} defaultValue={user.username||''}/></label>
          <label>Telefone<input name="phone" maxLength={15} defaultValue={user.phone||''} placeholder="Somente números"/></label>
          <label className="wide">E-mail<input type="email" name="email" maxLength={254} defaultValue={user.email||''}/></label>
          <label>Nova senha<input type="password" name="password" minLength={10} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 10 caracteres"/></label>
          <label className="switch-row wide"><input type="checkbox" name="isInfluencer" defaultChecked={user.isInfluencer}/><span><strong>Tornar influenciador</strong><small>As rodadas desta conta passam a usar RTP e mistura de itens mais generosos automaticamente.</small></span></label>
          <div className="wide form-actions"><button className="button primary">Salvar conta</button></div>
        </form>
      </article>
      <article className="modal-card"><div className="panel-heading"><h3>Status</h3><p>Bloqueio de acesso e exclusão do ranking.</p></div>
        <form className="stack" onSubmit={saveStatus}>
          <label className="switch-row"><input type="checkbox" name="isBlocked" defaultChecked={user.isBlocked}/><span><strong>Bloqueado</strong><small>Impede login e novas partidas.</small></span></label>
          <label className="switch-row"><input type="checkbox" name="excludedFromRanking" defaultChecked={user.excludedFromRanking}/><span><strong>Excluído do ranking</strong></span></label>
          <button className="button primary">Salvar status</button>
        </form>
      </article>
      <article className="modal-card"><div className="panel-heading"><h3>Ajustar saldo</h3><p>Gera lançamento auditável no histórico da carteira.</p></div>
        <form className="stack" onSubmit={saveBalance}>
          <label>Novo saldo disponível (R$)<input type="number" name="balance" min="0" step="0.01" required defaultValue={(user.coinBalance/100).toFixed(2)}/></label>
          <button className="button primary">Atualizar saldo</button>
        </form>
      </article>
    </div>
    <article className="modal-card affiliate-card">
      <div className="panel-heading"><h3>Afiliado</h3><p>Link de indicação e comissão CPA por depósito confirmado.</p></div>
      {user.ownedAffiliate?<>
        <div className="user-summary">
          <article><small>Código</small><strong>{user.ownedAffiliate.code}</strong></article>
          <article><small>Saldo disponível</small><strong>{money(user.ownedAffiliate.availableBalance)}</strong></article>
          <article><small>Comissão CPA</small><strong>{money(user.ownedAffiliate.cpaAmount)}</strong></article>
          <article><small>Status</small><strong>{user.ownedAffiliate.status}</strong></article>
        </div>
        <form className="form-grid compact-form" onSubmit={saveAffiliate}>
          <label>Código<input name="code" required defaultValue={user.ownedAffiliate.code}/></label>
          <label>Status<select name="status" defaultValue={user.ownedAffiliate.status}><option value="ACTIVE">Ativo</option><option value="BLOCKED">Bloqueado</option><option value="INACTIVE">Inativo</option></select></label>
          <label>Comissão CPA (R$)<input type="number" name="cpaAmount" min="0" step="0.01" defaultValue={(user.ownedAffiliate.cpaAmount/100).toFixed(2)}/></label>
          <CpaRuleFields defaultMode={user.ownedAffiliate.cpaRtpMode} defaultEnabled={user.ownedAffiliate.cpaRetentionEnabled} defaultCycle={user.ownedAffiliate.cpaCycleSize} defaultPositions={parsePositions(user.ownedAffiliate.cpaRetainedPositions)}/>
          <div className="wide form-actions"><button className="button primary">Salvar afiliado</button></div>
        </form>
      </>:<form className="form-grid compact-form" onSubmit={createAffiliate}>
        <label>Código do afiliado<input name="code" required minLength={3} defaultValue={suggestedCode}/></label>
        <label>Comissão CPA (R$)<input type="number" name="cpaAmount" min="0" step="0.01" defaultValue="20.00"/></label>
        <CpaRuleFields defaultMode="GLOBAL" defaultEnabled defaultCycle={10} defaultPositions={[9,10]}/>
        <div className="wide form-actions"><button className="button primary">Ativar como afiliado</button></div>
      </form>}
    </article>
    <div className="activity-grid">
      <article className="modal-card"><div className="panel-heading"><h3>Jogadas recentes</h3></div><div className="table-wrap"><table><thead><tr><th>Aposta</th><th>Prêmio</th><th>Status</th><th>Data</th></tr></thead><tbody>
        {(user.games||[]).map(g=><tr key={g.id}><td>{money(g.stakeAmount)}</td><td>{money(g.coinsRewarded)}</td><td><Status value={g.status}/></td><td>{dateFmt(g.startedAt)}</td></tr>)}
        {!user.games?.length&&<tr><td colSpan={4} className="empty">Nenhuma jogada.</td></tr>}
      </tbody></table></div></article>
      <article className="modal-card"><div className="panel-heading"><h3>Transações</h3></div><div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Valor</th><th>Motivo</th><th>Data</th></tr></thead><tbody>
        {(user.transactions||[]).map(t=><tr key={t.id}><td>{t.type}</td><td>{money(t.amount)}</td><td>{t.reason}</td><td>{dateFmt(t.createdAt)}</td></tr>)}
        {!user.transactions?.length&&<tr><td colSpan={4} className="empty">Nenhuma transação.</td></tr>}
      </tbody></table></div></article>
      <article className="modal-card"><div className="panel-heading"><h3>Notas administrativas</h3></div><div className="table-wrap"><table><thead><tr><th>Nota</th><th>Admin</th><th>Data</th></tr></thead><tbody>
        {(user.notes||[]).map(n=><tr key={n.id}><td>{n.content}</td><td>{n.admin.name}</td><td>{dateFmt(n.createdAt)}</td></tr>)}
        {!user.notes?.length&&<tr><td colSpan={3} className="empty">Nenhuma nota ainda.</td></tr>}
      </tbody></table></div>
        <form className="inline-form" onSubmit={addNote}>
          <input placeholder="Adicionar nota…" value={noteDraft} onChange={e=>setNoteDraft(e.target.value)} minLength={2} required/>
          <button className="button tiny primary">Adicionar</button>
        </form>
      </article>
      <article className="modal-card"><div className="panel-heading"><h3>Alertas de fraude</h3></div><div className="table-wrap"><table><thead><tr><th>Tipo</th><th>Risco</th><th>Status</th><th>Data</th></tr></thead><tbody>
        {(user.alerts||[]).map(a=><tr key={a.id}><td>{a.type}</td><td><Status value={a.riskLevel}/></td><td><Status value={a.status}/></td><td>{dateFmt(a.createdAt)}</td></tr>)}
        {!user.alerts?.length&&<tr><td colSpan={4} className="empty">Nenhum alerta.</td></tr>}
      </tbody></table></div></article>
    </div>
    </div>
  </section></div>
}

// ---------- Antifraude ----------
const FRAUD_STATUSES=['OPEN','REVIEWING','CONFIRMED','DISMISSED']
type FraudAlertRow={id:string;userId:string;user:{name:string;email:string|null};gameId:string|null;type:string;description:string;evidence:string|null;riskLevel:string;status:string;reviewedByAdminId:string|null;reviewedAt:string|null;createdAt:string}
type FraudAlertDetail=Omit<FraudAlertRow,'user'>&{
  user:{id:string;name:string;email:string|null;coinBalance:number;isBlocked:boolean}
  game:{id:string;score:number;stakeAmount:number;coinsRewarded:number;status:string;startedAt:string}|null
  reviewedBy:{name:string}|null
}
function FraudPage({canEdit}:{canEdit:boolean}){
  const [items,setItems]=useState<FraudAlertRow[]>([]),[search,setSearch]=useState(''),[status,setStatus]=useState(''),[openId,setOpenId]=useState<string|null>(null),[error,setError]=useState('')
  const reload=()=>api<{items:FraudAlertRow[]}>('/fraud-alerts').then(d=>setItems(d.items)).catch(e=>setError(e instanceof Error?e.message:'Erro ao carregar.'))
  useEffect(()=>{reload()},[])
  const shown=items.filter(x=>(!status||x.status===status)&&(!search||JSON.stringify(x).toLowerCase().includes(search.toLowerCase())))
  return <><Header title="Antifraude" subtitle={`${items.length} alertas registrados (últimos 200).`}/>
    <section className="panel filters">
      <input placeholder="Buscar por jogador, tipo ou descrição" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Todos os status</option>{FRAUD_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select>
    </section>
    {error&&<div className="error">{error}</div>}
    <section className="panel table-wrap"><table><thead><tr><th>Jogador</th><th>Tipo</th><th>Descrição</th><th>Risco</th><th>Status</th><th>Data</th><th></th></tr></thead><tbody>
      {shown.map(a=><tr key={a.id}>
        <td><b>{a.user.name}</b><small>{a.user.email}</small></td>
        <td>{a.type}</td>
        <td>{a.description}</td>
        <td><Status value={a.riskLevel}/></td>
        <td><Status value={a.status}/></td>
        <td>{dateFmt(a.createdAt)}</td>
        <td><button className="button tiny secondary" onClick={()=>setOpenId(a.id)}>Detalhes</button></td>
      </tr>)}
      {!shown.length&&<tr><td colSpan={7} className="empty">Nenhum alerta encontrado.</td></tr>}
    </tbody></table></section>
    {openId&&<FraudAlertModal id={openId} canEdit={canEdit} onClose={()=>{setOpenId(null);reload()}}/>}
  </>
}
function FraudAlertModal({id,canEdit,onClose}:{id:string;canEdit:boolean;onClose:()=>void}){
  const [alert,setAlert]=useState<FraudAlertDetail|null>(null),[status,setStatusValue]=useState(''),[message,setMessage]=useState('')
  const reload=()=>api<{alert:FraudAlertDetail}>(`/fraud-alerts/${id}`).then(d=>{setAlert(d.alert);setStatusValue(d.alert.status)})
  useEffect(()=>{reload()},[id])
  if(!alert)return <div className="admin-modal-backdrop"><section className="admin-modal"><div className="empty">Carregando…</div></section></div>
  const save=async()=>{
    setMessage('Salvando…')
    try{await api(`/fraud-alerts/${id}/status`,{method:'PATCH',body:JSON.stringify({status})});setMessage('Status atualizado.');notify('Status do alerta atualizado.');reload()}
    catch(err){setMessage(err instanceof Error?err.message:'Erro ao salvar.')}
  }
  return <div className="admin-modal-backdrop"><section className="admin-modal" role="dialog" aria-modal="true">
    <header className="modal-heading"><div><p className="eyebrow">ALERTA DE FRAUDE</p><h2>{alert.type}</h2><small>{alert.user.name} · {alert.user.email}</small></div><button className="modal-close" onClick={onClose} aria-label="Fechar"><Icon name="close" size={18}/></button></header>
    <div className="modal-body">
      {message&&<div className="save-message modal-message">{message}</div>}
      <div className="user-summary">
        <article><small>Risco</small><strong><Status value={alert.riskLevel}/></strong></article>
        <article><small>Status</small><strong><Status value={alert.status}/></strong></article>
        <article><small>Saldo do jogador</small><strong>{money(alert.user.coinBalance)}</strong></article>
        <article><small>Jogador bloqueado</small><strong>{alert.user.isBlocked?'Sim':'Não'}</strong></article>
      </div>
      <article className="modal-card wide"><div className="panel-heading"><h3>Descrição</h3></div><p>{alert.description}</p></article>
      {alert.evidence&&<article className="modal-card wide"><div className="panel-heading"><h3>Evidência</h3></div><pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{alert.evidence}</pre></article>}
      {alert.game&&<article className="modal-card wide"><div className="panel-heading"><h3>Jogada relacionada</h3></div>
        <div className="user-summary">
          <article><small>Aposta</small><strong>{money(alert.game.stakeAmount)}</strong></article>
          <article><small>Prêmio</small><strong>{money(alert.game.coinsRewarded)}</strong></article>
          <article><small>Pontuação</small><strong>{alert.game.score}</strong></article>
          <article><small>Status</small><strong><Status value={alert.game.status}/></strong></article>
        </div>
      </article>}
      {alert.reviewedBy&&<p>Revisado por <b>{alert.reviewedBy.name}</b> em {dateFmt(alert.reviewedAt)}.</p>}
      {canEdit&&<article className="modal-card wide"><div className="panel-heading"><h3>Alterar status</h3></div>
        <div className="inline-form"><select value={status} onChange={e=>setStatusValue(e.target.value)}>{FRAUD_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select><button className="button primary" disabled={status===alert.status} onClick={save}>Salvar status</button></div>
      </article>}
    </div>
  </section></div>
}

// ---------- Log de auditoria ----------
type AuditLogItem={id:string;adminId:string|null;admin:{name:string}|null;action:string;resource:string;resourceId:string|null;previousData:string|null;newData:string|null;reason:string|null;ip:string|null;userAgent:string|null;createdAt:string}
function prettyJson(v:string|null){if(!v)return null;try{return JSON.stringify(JSON.parse(v),null,2)}catch{return v}}
function AuditLogPage(){
  const [items,setItems]=useState<AuditLogItem[]>([]),[search,setSearch]=useState(''),[error,setError]=useState('')
  useEffect(()=>{api<{items:AuditLogItem[]}>('/audit-logs').then(d=>setItems(d.items)).catch(e=>setError(e instanceof Error?e.message:'Erro ao carregar.'))},[])
  const shown=items.filter(x=>!search||JSON.stringify(x).toLowerCase().includes(search.toLowerCase()))
  return <><Header title="Log de auditoria" subtitle={`${items.length} eventos registrados (últimos 300). Visível apenas para Super Admin.`}/>
    <section className="panel filters"><input placeholder="Buscar por admin, ação ou recurso" value={search} onChange={e=>setSearch(e.target.value)}/></section>
    {error?<div className="error">{error}</div>:<section className="panel table-wrap"><table><thead><tr><th>Admin</th><th>Ação</th><th>Recurso</th><th>Motivo</th><th>Data</th><th>Detalhes</th></tr></thead><tbody>
      {shown.map(x=><tr key={x.id}>
        <td>{x.admin?.name||'Sistema'}</td>
        <td><code>{x.action}</code></td>
        <td>{x.resource}{x.resourceId?<small> · {x.resourceId.slice(0,8)}</small>:null}</td>
        <td>{x.reason||'—'}</td>
        <td>{dateFmt(x.createdAt)}</td>
        <td>{(x.previousData||x.newData)?<details><summary>Ver</summary>
          {x.previousData&&<pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{prettyJson(x.previousData)}</pre>}
          {x.newData&&<pre style={{whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{prettyJson(x.newData)}</pre>}
        </details>:'—'}</td>
      </tr>)}
      {!shown.length&&<tr><td colSpan={6} className="empty">Nenhum evento encontrado.</td></tr>}
    </tbody></table></section>}
  </>
}

// ---------- Economia ----------
type CoinTransactionItem={id:string;userId:string;user:{name:string}|null;gameId:string|null;adminId:string|null;admin:{name:string}|null;type:string;amount:number;balanceBefore:number;balanceAfter:number;reason:string;createdAt:string}
type EconomySummaryRow={type:string;_sum:{amount:number|null};_count:number}
function EconomyPage(){
  const [items,setItems]=useState<CoinTransactionItem[]>([]),[totals,setTotals]=useState<EconomySummaryRow[]>([]),[search,setSearch]=useState('')
  useEffect(()=>{
    api<{items:CoinTransactionItem[]}>('/coin-transactions').then(d=>setItems(d.items))
    api<{totals:EconomySummaryRow[]}>('/economy/summary').then(d=>setTotals(d.totals))
  },[])
  const shown=items.filter(x=>!search||JSON.stringify(x).toLowerCase().includes(search.toLowerCase()))
  return <><Header title="Economia" subtitle="Ledger de moedas: origem e destino de cada crédito e débito."/>
    <div className="cards">{totals.map(t=><article key={t.type}><i><Icon name="coins" size={17}/></i><small>{t.type}</small><strong className={(t._sum.amount||0)>=0?'amount-positive':'amount-negative'}>{money(t._sum.amount||0)}</strong></article>)}</div>
    <section className="panel filters"><input placeholder="Buscar por jogador, admin, tipo ou motivo" value={search} onChange={e=>setSearch(e.target.value)}/></section>
    <section className="panel table-wrap"><table><thead><tr><th>Jogador</th><th>Tipo</th><th>Valor</th><th>Saldo (antes → depois)</th><th>Motivo</th><th>Admin</th><th>Data</th></tr></thead><tbody>
      {shown.map(t=><tr key={t.id}>
        <td>{t.user?.name||'—'}</td>
        <td><code>{t.type}</code></td>
        <td className={t.amount>=0?'amount-positive':'amount-negative'}>{money(t.amount)}</td>
        <td>{money(t.balanceBefore)} → {money(t.balanceAfter)}</td>
        <td>{t.reason}</td>
        <td>{t.admin?.name||'—'}</td>
        <td>{dateFmt(t.createdAt)}</td>
      </tr>)}
      {!shown.length&&<tr><td colSpan={7} className="empty">Nenhuma transação encontrada.</td></tr>}
    </tbody></table></section>
  </>
}
export default function App(){
 const [admin,setAdmin]=useState<Admin|null>(null),[loading,setLoading]=useState(Boolean(session.get()));const nav=useNavigate()
 useEffect(()=>{if(session.get())api<{admin:Admin}>('/auth/me').then(d=>setAdmin(d.admin)).catch(session.clear).finally(()=>setLoading(false))},[])
 if(loading)return <div className="splash">🚀</div>;if(!admin)return <Login onLogin={setAdmin}/>
 return <Layout admin={admin} onLogout={()=>{api('/auth/logout',{method:'POST'}).catch(()=>{});session.clear();setAdmin(null);nav('/')}}/>
}
