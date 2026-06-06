// 本地轻量数据库：IndexedDB（浏览器内置，零依赖）。5 个对象库 + meta（同步时间/水位）。
const DB_NAME = 'blacklake', DB_VER = 1
const STORES = ['sale_orders', 'customers', 'products', 'materials', 'stock']

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          const os = db.createObjectStore(s, { keyPath: 'id' })
          if (s !== 'customers') os.createIndex('product_code', 'product_code', { unique: false })
        }
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
const tx = (db, store, mode) => db.transaction(store, mode).objectStore(store)
const done = (t) => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error) })

export async function putAll(store, rows) {
  const db = await open(); const t = db.transaction(store, 'readwrite'); const os = t.objectStore(store)
  for (const r of rows) os.put(r)
  await done(t); db.close()
}
export async function clearStore(store) {
  const db = await open(); const t = db.transaction(store, 'readwrite'); t.objectStore(store).clear(); await done(t); db.close()
}
export async function getAll(store) {
  const db = await open()
  const rows = await new Promise((res, rej) => { const r = tx(db, store, 'readonly').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  db.close(); return rows
}
export async function count(store) {
  const db = await open()
  const n = await new Promise((res, rej) => { const r = tx(db, store, 'readonly').count(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  db.close(); return n
}
export async function setMeta(key, value) {
  const db = await open(); const t = db.transaction('meta', 'readwrite'); t.objectStore('meta').put({ key, value }); await done(t); db.close()
}
export async function getMeta(key) {
  const db = await open()
  const v = await new Promise((res, rej) => { const r = tx(db, 'meta', 'readonly').get(key); r.onsuccess = () => res(r.result?.value ?? null); r.onerror = () => rej(r.error) })
  db.close(); return v
}
export { STORES }
