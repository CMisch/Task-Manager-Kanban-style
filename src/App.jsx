import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'

// ─── Constants ───────────────────────────────────────────────────────────────
const COLUMNS   = ['Backlog', 'In Progress', 'Review/QA', 'Completed']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']
const CATEGORIES = [
  'Pen Testing', 'Client Work', 'Compliance', 'Internal',
  'Incident Response', 'Vulnerability Assessment', 'Other'
]
const PRIORITY_COLORS  = { Critical:'#ef4444', High:'#f97316', Medium:'#eab308', Low:'#22c55e' }
const PRIORITY_LABELS  = { Critical:'🔴 Critical', High:'🟠 High', Medium:'🟡 Medium', Low:'🟢 Low' }
const COL_COLORS = {
  'Backlog':'#3b82f6', 'In Progress':'#f97316',
  'Review/QA':'#a855f7', 'Completed':'#22c55e'
}
const MAX_TITLE = 100
const MAX_NOTES = 2000
const DEFAULT_TASK = { title:'', priority:'Medium', category:'Internal', due:'', notes:'', stage:'Backlog' }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2)

function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDate(str) {
  if (!str) return ''
  const d = parseLocalDate(str)
  return d ? d.toLocaleDateString() : ''
}

function isOverdue(due, stage) {
  if (!due || stage === 'Completed') return false
  const dueDate = parseLocalDate(due)
  if (!dueDate) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return dueDate < today
}

function getDaysLeft(due) {
  if (!due) return null
  const dueDate = parseLocalDate(due)
  if (!dueDate) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24))
}

// ─── Shared Styles ────────────────────────────────────────────────────────────
const inputStyle = {
  background: '#161b2e', border: '1px solid #1e3a2f', color: '#e2e8f0',
  padding: '8px 12px', borderRadius: 6, fontSize: 13,
  width: '100%', boxSizing: 'border-box', fontFamily: "'Courier New', monospace"
}
const btnStyle = (bg, color) => ({
  background: bg, color, border: `1px solid ${color}44`,
  padding: '5px 11px', borderRadius: 5, cursor: 'pointer',
  fontSize: 11, fontFamily: "'Courier New', monospace", transition: 'opacity 0.15s'
})

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t) }, [onDone])
  return (
    <div role="alert" aria-live="assertive" style={{
      position:'fixed', bottom:24, right:24, background:'#1e3a2f',
      border:'1px solid #00ff88', color:'#00ff88', padding:'10px 18px',
      borderRadius:8, fontSize:13, zIndex:999, boxShadow:'0 4px 20px #00000088'
    }}>
      {msg}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ children, onClose, label }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-label={label}
      style={{ position:'fixed', inset:0, background:'#000000bb', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'#0d1117', border:'1px solid #1e3a2f', borderRadius:12, padding:24, width:'100%', maxWidth:460, maxHeight:'90vh', overflowY:'auto' }}>
        {children}
      </div>
    </div>
  )
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, htmlFor, children, hint }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={htmlFor} style={{ display:'block', fontSize:11, color:'#64748b', marginBottom:5, letterSpacing:1 }}>
        {label.toUpperCase()}
        {hint && <span style={{ color:'#475569', fontWeight:'normal', marginLeft:6 }}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tasks,      setTasks]      = useState([])
  const [loaded,     setLoaded]     = useState(false)
  const [showForm,   setShowForm]   = useState(false)
  const [formData,   setFormData]   = useState(DEFAULT_TASK)
  const [formErrors, setFormErrors] = useState({})
  const [editId,     setEditId]     = useState(null)
  const [activeNote, setActiveNote] = useState(null)
  const [noteText,   setNoteText]   = useState('')
  const [exportMenu, setExportMenu] = useState(false)
  const [search,     setSearch]     = useState('')
  const [dragging,   setDragging]   = useState(null)
  const [dragOver,   setDragOver]   = useState(null)
  const [toast,      setToast]      = useState(null)

  const exportRef = useRef()
  const titleRef  = useRef()

  const showToast = useCallback((msg) => setToast(msg), [])

  // Load from localStorage once on mount
  useEffect(() => {
    try {
      const s = localStorage.getItem('cybertasks')
      if (s) setTasks(JSON.parse(s))
    } catch {
      showToast('⚠ Could not load saved tasks.')
    }
    setLoaded(true)
  }, [showToast])

  // Persist to localStorage on every tasks change
  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem('cybertasks', JSON.stringify(tasks)) }
    catch { showToast('⚠ Could not save. Storage may be full.') }
  }, [tasks, loaded, showToast])

  // Close export menu on outside click — registered once
  useEffect(() => {
    const h = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportMenu(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Auto-focus title when form opens
  useEffect(() => { if (showForm && titleRef.current) titleRef.current.focus() }, [showForm])

  // Memoized filtered list
  const filtered = useMemo(() =>
    tasks.filter(x =>
      x.title.toLowerCase().includes(search.toLowerCase()) ||
      x.category.toLowerCase().includes(search.toLowerCase())
    ), [tasks, search])

  // Memoized progress stats
  const { pct } = useMemo(() => {
    const c = tasks.filter(x => x.stage === 'Completed').length
    return { completed: c, pct: tasks.length ? Math.round((c / tasks.length) * 100) : 0 }
  }, [tasks])

  // ── Form helpers ──
  function validateForm(data) {
    const errs = {}
    if (!data.title.trim())         errs.title = 'Title is required.'
    if (data.title.length > MAX_TITLE) errs.title = `Max ${MAX_TITLE} characters.`
    if (data.notes.length > MAX_NOTES) errs.notes = `Max ${MAX_NOTES} characters.`
    return errs
  }

  function openForm(task = null) {
    setFormData(task
      ? { title:task.title, priority:task.priority, category:task.category, due:task.due, notes:task.notes, stage:task.stage }
      : { ...DEFAULT_TASK }
    )
    setEditId(task ? task.id : null)
    setFormErrors({})
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setFormErrors({}) }

  function saveTask() {
    const errs = validateForm(formData)
    if (Object.keys(errs).length) { setFormErrors(errs); return }
    if (editId) {
      setTasks(t => t.map(x => x.id === editId ? { ...x, ...formData } : x))
      showToast('✅ Task updated.')
    } else {
      setTasks(t => [...t, { ...formData, id:genId(), createdAt:new Date().toISOString(), completedAt:null }])
      showToast('✅ Task created.')
    }
    closeForm()
  }

  function deleteTask(id) { setTasks(t => t.filter(x => x.id !== id)); showToast('🗑 Task deleted.') }

  function moveTask(id, dir) {
    setTasks(t => t.map(x => {
      if (x.id !== id) return x
      const next = COLUMNS[COLUMNS.indexOf(x.stage) + dir]
      if (!next) return x
      return { ...x, stage:next, completedAt: next === 'Completed' ? new Date().toISOString() : null }
    }))
  }

  function openNote(task) { setActiveNote(task.id); setNoteText(task.notes || '') }

  function saveNote() {
    if (noteText.length > MAX_NOTES) { showToast(`⚠ Notes exceed ${MAX_NOTES} chars.`); return }
    setTasks(t => t.map(x => x.id === activeNote ? { ...x, notes:noteText } : x))
    setActiveNote(null)
    showToast('📝 Notes saved.')
  }

  function exportToExcel(filter) {
    try {
      const data = filter === 'completed' ? tasks.filter(x => x.stage === 'Completed') : tasks
      if (!data.length) { showToast('⚠ No tasks to export.'); setExportMenu(false); return }
      const rows = data.map(x => ({
        'Task Name': x.title, 'Category': x.category, 'Priority': x.priority,
        'Stage': x.stage, 'Due Date': formatDate(x.due), 'Notes': x.notes || '',
        'Created': formatDate(x.createdAt), 'Completed': formatDate(x.completedAt)
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length, ...rows.map(r => String(r[k] || '').length)) + 2 }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Tasks')
      XLSX.writeFile(wb, `cybersec-tasks-${new Date().toISOString().slice(0,10)}.xlsx`)
      showToast('⬇ Export successful!')
    } catch { showToast('⚠ Export failed. Please try again.') }
    setExportMenu(false)
  }

  // ── Drag & Drop ──
  const onDragStart = (e, id) => { setDragging(id); e.dataTransfer.effectAllowed = 'move' }
  const onDragOver  = (e, col) => { e.preventDefault(); setDragOver(col) }
  const onDragEnd   = () => { setDragging(null); setDragOver(null) }
  const onDrop      = (e, col) => {
    e.preventDefault()
    if (dragging) {
      const task = tasks.find(x => x.id === dragging)
      if (task && task.stage !== col) {
        setTasks(t => t.map(x => x.id === dragging
          ? { ...x, stage:col, completedAt: col === 'Completed' ? new Date().toISOString() : null }
          : x))
        showToast(`↔ Moved to ${col}`)
      }
    }
    setDragging(null); setDragOver(null)
  }

  const noteTask = activeNote ? tasks.find(x => x.id === activeNote) : null

  // ── Render ──
  return (
    <div style={{ minHeight:'100vh', background:'#0a0e1a', color:'#e2e8f0' }}>

      {/* ── Header ── */}
      <header role="banner" style={{ background:'#0d1117', borderBottom:'1px solid #1e3a2f', padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span aria-hidden="true" style={{ fontSize:24, color:'#00ff88' }}>⬡</span>
          <div>
            <div style={{ fontSize:18, fontWeight:'bold', color:'#00ff88', letterSpacing:2 }}>CYBERSEC TASK MANAGER</div>
            <div style={{ fontSize:11, color:'#4ade80', opacity:0.7 }}>SECURE OPERATIONS BOARD</div>
          </div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <label htmlFor="search" style={{ position:'absolute', width:1, height:1, overflow:'hidden', clip:'rect(0,0,0,0)' }}>Search tasks</label>
          <input id="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..." aria-label="Search tasks"
            style={{ background:'#161b2e', border:'1px solid #1e3a2f', color:'#e2e8f0', padding:'6px 12px', borderRadius:6, fontSize:13, width:180 }} />

          <div ref={exportRef} style={{ position:'relative' }}>
            <button onClick={() => setExportMenu(v => !v)} aria-haspopup="true" aria-expanded={exportMenu}
              style={{ background:'#1a2744', border:'1px solid #3b82f6', color:'#93c5fd', padding:'7px 14px', borderRadius:6, cursor:'pointer', fontSize:13 }}>
              ⬇ Export Excel
            </button>
            {exportMenu && (
              <div role="menu" style={{ position:'absolute', right:0, top:36, background:'#161b2e', border:'1px solid #1e3a2f', borderRadius:8, zIndex:100, minWidth:180 }}>
                <button role="menuitem" onClick={() => exportToExcel('all')}
                  style={{ display:'block', width:'100%', textAlign:'left', background:'none', border:'none', borderBottom:'1px solid #1e3a2f', color:'#e2e8f0', padding:'10px 16px', cursor:'pointer', fontSize:13 }}>
                  📋 All Tasks
                </button>
                <button role="menuitem" onClick={() => exportToExcel('completed')}
                  style={{ display:'block', width:'100%', textAlign:'left', background:'none', border:'none', color:'#e2e8f0', padding:'10px 16px', cursor:'pointer', fontSize:13 }}>
                  ✅ Completed Only
                </button>
              </div>
            )}
          </div>

          <button onClick={() => openForm()} aria-label="Create new task"
            style={{ background:'#00ff88', color:'#0a0e1a', border:'none', padding:'7px 16px', borderRadius:6, cursor:'pointer', fontWeight:'bold', fontSize:13, fontFamily:'inherit' }}>
            + New Task
          </button>
        </div>
      </header>

      {/* ── Stats Bar ── */}
      <div role="region" aria-label="Task statistics" style={{ background:'#0d1117', padding:'12px 24px', borderBottom:'1px solid #1e3a2f', display:'flex', gap:24, alignItems:'center', flexWrap:'wrap' }}>
        {COLUMNS.map(col => (
          <div key={col} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span aria-hidden="true" style={{ width:8, height:8, borderRadius:'50%', background:COL_COLORS[col], display:'inline-block' }}></span>
            <span style={{ fontSize:12, color:'#94a3b8' }}>{col}: <strong style={{ color:'#e2e8f0' }}>{tasks.filter(x => x.stage === col).length}</strong></span>
          </div>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:12, color:'#94a3b8' }}>Overall Progress</span>
          <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% complete`}
            style={{ width:120, height:8, background:'#1e293b', borderRadius:4, overflow:'hidden' }}>
            <div style={{ width:`${pct}%`, height:'100%', background:'#00ff88', borderRadius:4, transition:'width 0.4s' }}></div>
          </div>
          <span style={{ fontSize:12, color:'#00ff88', fontWeight:'bold' }}>{pct}%</span>
        </div>
      </div>

      {/* ── Board ── */}
      <main role="main" style={{ display:'flex', gap:16, padding:'20px 16px', overflowX:'auto', minHeight:'calc(100vh - 170px)' }}>
        {COLUMNS.map(col => {
          const colTasks = filtered.filter(x => x.stage === col)
          const isTarget = dragOver === col
          return (
            <div key={col} role="region" aria-label={`${col} column`}
              onDragOver={e => onDragOver(e, col)} onDrop={e => onDrop(e, col)}
              style={{ flex:'0 0 280px', background:isTarget?'#1a2744':'#0d1117', border:`1px solid ${isTarget?COL_COLORS[col]:'#1e3a2f'}`, borderRadius:12, display:'flex', flexDirection:'column', transition:'background 0.2s, border 0.2s' }}>

              <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e3a2f', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span aria-hidden="true" style={{ width:10, height:10, borderRadius:'50%', background:COL_COLORS[col], display:'inline-block' }}></span>
                  <span style={{ fontWeight:'bold', fontSize:13, letterSpacing:1, color:COL_COLORS[col] }}>{col.toUpperCase()}</span>
                </div>
                <span aria-label={`${colTasks.length} tasks`} style={{ background:'#1e293b', color:'#94a3b8', fontSize:11, padding:'2px 8px', borderRadius:10 }}>{colTasks.length}</span>
              </div>

              <div style={{ padding:10, display:'flex', flexDirection:'column', gap:10, flex:1, overflowY:'auto' }}>
                {colTasks.map(task => {
                  const overdue  = isOverdue(task.due, task.stage)
                  const daysLeft = getDaysLeft(task.due)
                  const colIdx   = COLUMNS.indexOf(task.stage)
                  let dueLabelText = ''
                  if (task.due) {
                    if (overdue)        dueLabelText = 'OVERDUE'
                    else if (daysLeft === 0) dueLabelText = 'Due today'
                    else if (daysLeft === 1) dueLabelText = 'Due tomorrow'
                    else                dueLabelText = `${daysLeft}d left`
                  }
                  return (
                    <article key={task.id} className="task-card" draggable
                      onDragStart={e => onDragStart(e, task.id)} onDragEnd={onDragEnd}
                      aria-label={`Task: ${task.title}, Priority: ${task.priority}, Stage: ${task.stage}`}
                      style={{ background:'#161b2e', border:`1px solid ${overdue?'#ef4444':'#1e3a2f'}`, borderRadius:8, padding:12, cursor:'grab' }}>

                      <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
                        <span aria-label={`Priority: ${task.priority}`}
                          style={{ background:PRIORITY_COLORS[task.priority]+'22', color:PRIORITY_COLORS[task.priority], border:`1px solid ${PRIORITY_COLORS[task.priority]}44`, fontSize:10, padding:'2px 7px', borderRadius:10, fontWeight:'bold' }}>
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                        <span style={{ background:'#1e293b', color:'#94a3b8', fontSize:10, padding:'2px 7px', borderRadius:10 }}>{task.category}</span>
                      </div>

                      <div style={{ fontSize:14, fontWeight:'bold', color:'#e2e8f0', marginBottom:6, lineHeight:1.4, wordBreak:'break-word' }}>{task.title}</div>

                      {task.due && (
                        <div style={{ fontSize:11, color:overdue?'#ef4444':daysLeft<=1?'#f97316':'#64748b', marginBottom:8 }}>
                          {overdue ? '⚠ ' : daysLeft <= 1 ? '⏰ ' : '⏱ '}{dueLabelText} · {formatDate(task.due)}
                        </div>
                      )}

                      {task.notes && (
                        <div style={{ fontSize:11, color:'#64748b', marginBottom:8, borderLeft:'2px solid #1e3a2f', paddingLeft:8, fontStyle:'italic', wordBreak:'break-word' }}>
                          {task.notes.slice(0, 80)}{task.notes.length > 80 ? '…' : ''}
                        </div>
                      )}

                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
                        {colIdx > 0 && <button onClick={() => moveTask(task.id, -1)} aria-label={`Move to ${COLUMNS[colIdx-1]}`} style={btnStyle('#1e293b','#94a3b8')}>◀ Back</button>}
                        {colIdx < COLUMNS.length - 1 && <button onClick={() => moveTask(task.id, 1)} aria-label={`Move to ${COLUMNS[colIdx+1]}`} style={btnStyle(COL_COLORS[COLUMNS[colIdx+1]]+'22', COL_COLORS[COLUMNS[colIdx+1]])}>▶ {COLUMNS[colIdx+1].split('/')[0]}</button>}
                        <button onClick={() => openNote(task)}  aria-label="Edit notes"  style={btnStyle('#1e2a1e','#4ade80')}>📝 Notes</button>
                        <button onClick={() => openForm(task)}  aria-label="Edit task"   style={btnStyle('#1e293b','#93c5fd')}>✏ Edit</button>
                        <button onClick={() => deleteTask(task.id)} aria-label="Delete task" style={btnStyle('#2a1e1e','#f87171')}>🗑</button>
                      </div>
                    </article>
                  )
                })}
                {colTasks.length === 0 && <div style={{ color:'#1e3a2f', fontSize:12, textAlign:'center', marginTop:20, userSelect:'none' }}>— empty —</div>}
              </div>
            </div>
          )
        })}
      </main>

      {/* ── Task Form Modal ── */}
      {showForm && (
        <Modal onClose={closeForm} label={editId ? 'Edit task' : 'Create new task'}>
          <div style={{ fontSize:16, fontWeight:'bold', color:'#00ff88', marginBottom:16 }}>{editId ? '✏ EDIT TASK' : '+ NEW TASK'}</div>

          <Field label="Task Title" htmlFor="f-title" hint={`(max ${MAX_TITLE})`}>
            <input id="f-title" ref={titleRef} value={formData.title} maxLength={MAX_TITLE}
              onChange={e => setFormData(f => ({ ...f, title:e.target.value }))}
              aria-invalid={!!formErrors.title} aria-describedby={formErrors.title ? 'f-title-err' : undefined}
              style={{ ...inputStyle, borderColor:formErrors.title ? '#ef4444' : '#1e3a2f' }} placeholder="Enter task name..." />
            {formErrors.title && <div id="f-title-err" role="alert" style={{ color:'#ef4444', fontSize:11, marginTop:4 }}>{formErrors.title}</div>}
          </Field>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Priority" htmlFor="f-priority">
              <select id="f-priority" value={formData.priority} onChange={e => setFormData(f => ({ ...f, priority:e.target.value }))} style={inputStyle}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Stage" htmlFor="f-stage">
              <select id="f-stage" value={formData.stage} onChange={e => setFormData(f => ({ ...f, stage:e.target.value }))} style={inputStyle}>
                {COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Category" htmlFor="f-category">
            <select id="f-category" value={formData.category} onChange={e => setFormData(f => ({ ...f, category:e.target.value }))} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          <Field label="Due Date" htmlFor="f-due" hint="(leave blank if none)">
            <input id="f-due" type="date" value={formData.due} onChange={e => setFormData(f => ({ ...f, due:e.target.value }))} style={inputStyle} />
            {formData.due && isOverdue(formData.due, '') && <div style={{ color:'#f97316', fontSize:11, marginTop:4 }}>⚠ This date is in the past — task will be marked overdue.</div>}
          </Field>

          <Field label="Notes" htmlFor="f-notes" hint={`(max ${MAX_NOTES})`}>
            <textarea id="f-notes" value={formData.notes} maxLength={MAX_NOTES} rows={3}
              onChange={e => setFormData(f => ({ ...f, notes:e.target.value }))}
              aria-invalid={!!formErrors.notes}
              style={{ ...inputStyle, resize:'vertical' }} placeholder="Add notes..." />
            <div style={{ fontSize:10, color:'#475569', textAlign:'right', marginTop:2 }}>{formData.notes.length}/{MAX_NOTES}</div>
            {formErrors.notes && <div role="alert" style={{ color:'#ef4444', fontSize:11 }}>{formErrors.notes}</div>}
          </Field>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16 }}>
            <button onClick={closeForm} style={btnStyle('#1e293b','#94a3b8')}>Cancel</button>
            <button onClick={saveTask} style={{ background:'#00ff88', color:'#0a0e1a', border:'none', padding:'8px 20px', borderRadius:6, cursor:'pointer', fontWeight:'bold', fontFamily:'inherit', fontSize:13 }}>
              {editId ? 'Update Task' : 'Save Task'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Notes Modal ── */}
      {activeNote && noteTask && (
        <Modal onClose={() => setActiveNote(null)} label="Edit task notes">
          <div style={{ fontSize:16, fontWeight:'bold', color:'#00ff88', marginBottom:4 }}>📝 TASK NOTES</div>
          <div style={{ fontSize:12, color:'#64748b', marginBottom:14, wordBreak:'break-word' }}>{noteTask.title}</div>
          <label htmlFor="note-area" style={{ position:'absolute', width:1, height:1, overflow:'hidden' }}>Notes</label>
          <textarea id="note-area" value={noteText} maxLength={MAX_NOTES} rows={8}
            onChange={e => setNoteText(e.target.value)}
            style={{ ...inputStyle, resize:'vertical', width:'100%' }} placeholder="Add detailed notes, findings, observations..." />
          <div style={{ fontSize:10, color:'#475569', textAlign:'right', marginTop:2 }}>{noteText.length}/{MAX_NOTES}</div>
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:12 }}>
            <button onClick={() => setActiveNote(null)} style={btnStyle('#1e293b','#94a3b8')}>Cancel</button>
            <button onClick={saveNote} style={{ background:'#00ff88', color:'#0a0e1a', border:'none', padding:'8px 20px', borderRadius:6, cursor:'pointer', fontWeight:'bold', fontFamily:'inherit', fontSize:13 }}>Save Notes</button>
          </div>
        </Modal>
      )}

      {/* ── Toast ── */}
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
